import { Router, type Response } from "express";
import { storage } from "../storage";
import { config } from "../config";
import { requireAdmin } from "../middleware/requireRole";
import {
  insertMatterSchema,
  insertDeadlineSchema,
  insertClientSchema,
  PRACTICE_AREAS,
  BILLING_TYPES,
  MATTER_STATUSES,
  DEADLINE_KINDS,
  DEADLINE_RECURRENCE,
  CLIENT_KINDS,
  CLIENT_STATUSES,
  CONTRACT_TYPES,
  type InsertMatter,
  type InsertDeadline,
  type InsertClient,
} from "@shared/schema";
import {
  AREA_LABELS,
  STATUS_LABELS,
  BILLING_LABELS,
  DEADLINE_KIND_LABELS,
  DEADLINE_RECURRENCE_LABELS,
  CLIENT_KIND_LABELS,
  CLIENT_STATUS_LABELS,
  CONTRACT_TYPE_LABELS,
} from "@shared/labels";

export const importRouter = Router();

// ---------------------------------------------------------------------------
// One-time bulk import ("Uvoz") — cutover popis. Three linked sheets:
//   Stranke  → clients/CRM (incl. potential clients)
//   Zadeve   → matters, referencing a client by its kratica (code)
//   Roki     → deadlines, referencing a matter by its koda
// Accepts internal code OR Slovenian label for enum columns. Atomic: if any
// row fails validation, nothing is written (fix, then re-run).
// ---------------------------------------------------------------------------

/** Accept internal code OR human label (case-insensitive). */
function resolver<T extends string>(codes: readonly T[], labels: Record<T, string>) {
  const map = new Map<string, T>();
  for (const c of codes) {
    map.set(c.toLowerCase(), c);
    map.set(labels[c].toLowerCase(), c);
  }
  return (v: string | undefined): T | undefined => (v ? map.get(v.trim().toLowerCase()) : undefined);
}
const resolveArea = resolver(PRACTICE_AREAS, AREA_LABELS);
const resolveStatus = resolver(MATTER_STATUSES, STATUS_LABELS);
const resolveBilling = resolver(BILLING_TYPES, BILLING_LABELS);
const resolveKind = resolver(DEADLINE_KINDS, DEADLINE_KIND_LABELS);
const resolveRecurrence = resolver(DEADLINE_RECURRENCE, DEADLINE_RECURRENCE_LABELS);
const resolveClientKind = resolver(CLIENT_KINDS, CLIENT_KIND_LABELS);
const resolveClientStatus = resolver(CLIENT_STATUSES, CLIENT_STATUS_LABELS);
const resolveContract = resolver(CONTRACT_TYPES, CONTRACT_TYPE_LABELS);

/** Parse a number allowing Slovenian comma decimals and stray spaces. */
function num(v: string | undefined): number | undefined {
  if (v === undefined || String(v).trim() === "") return undefined;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}
const str = (v: string | undefined) => (v ?? "").trim();

type Row = Record<string, string>;
type Sheet = "stranke" | "zadeve" | "roki";
interface ImportBody {
  dryRun?: boolean;
  stranke?: Row[];
  zadeve?: Row[];
  roki?: Row[];
}
interface ImportError {
  sheet: Sheet;
  row: number;
  message: string;
}

importRouter.post("/", requireAdmin, async (req, res: Response) => {
  const body = (req.body ?? {}) as ImportBody;
  const stranke = Array.isArray(body.stranke) ? body.stranke : [];
  const zadeve = Array.isArray(body.zadeve) ? body.zadeve : [];
  const roki = Array.isArray(body.roki) ? body.roki : [];
  const dryRun = body.dryRun !== false; // default to safe dry-run

  const errors: ImportError[] = [];

  // Roster for nosilec resolution (username / email / display name → username).
  const users = await storage.listUsers();
  const people = new Map<string, string>();
  const addPerson = (username: string, email: string | null, name: string | null) => {
    people.set(username.toLowerCase(), username);
    if (email) people.set(email.toLowerCase(), username);
    if (name) people.set(name.toLowerCase(), username);
  };
  addPerson(config.auth.adminUser, config.auth.adminEmail, config.auth.adminName);
  for (const u of users) addPerson(u.username, u.email, u.displayName);

  // Existing clients (matters may reference a client already in the CRM).
  const existingClients = await storage.listClients();
  const existingByCode = new Map(existingClients.map((c) => [c.code.toLowerCase(), c]));

  // --- validate clients (Stranke) ---
  const clientsToCreate: { code: string; data: InsertClient }[] = [];
  const importClientNames = new Map<string, string>(); // code(lower) -> name
  stranke.forEach((r, i) => {
    const line = i + 2;
    const rowErrs: string[] = [];

    const code = str(r.koda);
    if (!code) rowErrs.push("manjka 'koda'");
    else if (importClientNames.has(code.toLowerCase())) rowErrs.push(`podvojena koda '${code}'`);
    else if (existingByCode.has(code.toLowerCase())) rowErrs.push(`kratica '${code}' že obstaja med strankami`);

    const kindRaw = str(r.vrsta);
    const kind = kindRaw ? resolveClientKind(kindRaw) : "pravna";
    if (kindRaw && !kind) rowErrs.push(`neveljavna vrsta '${kindRaw}'`);
    const statRaw = str(r.status);
    const status = statRaw ? resolveClientStatus(statRaw) : "aktivna";
    if (statRaw && !status) rowErrs.push(`neveljaven status '${statRaw}'`);
    const areaRaw = str(r.podrocje);
    const area = resolveArea(areaRaw);
    if (areaRaw && !area) rowErrs.push(`neveljavno področje '${areaRaw}'`);
    const contractRaw = str(r.podlaga);
    const contractType = contractRaw ? resolveContract(contractRaw) : "brez";
    if (contractRaw && !contractType) rowErrs.push(`neveljavna podlaga '${contractRaw}'`);

    const candidate = {
      code,
      name: str(r.naziv),
      kind: kind ?? "pravna",
      status: status ?? "aktivna",
      area,
      contractType: contractType ?? "brez",
      documentNumber: str(r.st_dokumenta) || undefined,
      validFrom: str(r.velja_od) || undefined,
      validTo: str(r.velja_do) || undefined,
      subject: str(r.opis_predmeta) || undefined,
      notes: str(r.opombe) || undefined,
    };
    const parsed = insertClientSchema.safeParse(candidate);
    if (!parsed.success) {
      rowErrs.push(parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
    }

    if (rowErrs.length) rowErrs.forEach((m) => errors.push({ sheet: "stranke", row: line, message: m }));
    else if (parsed.success && code) {
      clientsToCreate.push({ code: code.toLowerCase(), data: parsed.data });
      importClientNames.set(code.toLowerCase(), parsed.data.name);
    }
  });

  /** Resolve a matter's stranka (client kratica) → display name, or undefined. */
  const clientName = (code: string): string | undefined =>
    importClientNames.get(code) ?? existingByCode.get(code)?.name;

  // --- validate matters (Zadeve) — stranka = client kratica ---
  const matters: { code: string; clientCode: string; data: InsertMatter }[] = [];
  const codes = new Set<string>();
  zadeve.forEach((r, i) => {
    const line = i + 2; // header is row 1
    const rowErrs: string[] = [];

    const code = str(r.koda);
    if (!code) rowErrs.push("manjka 'koda'");
    else if (codes.has(code.toLowerCase())) rowErrs.push(`podvojena koda '${code}'`);
    if (code) codes.add(code.toLowerCase());

    const strankaCode = str(r.stranka).toLowerCase();
    const cname = strankaCode ? clientName(strankaCode) : undefined;
    if (!strankaCode) rowErrs.push("manjka 'stranka' (kratica)");
    else if (!cname) rowErrs.push(`stranka '${r.stranka}' ni med strankami — dodaj jo v list Stranke ali mora že obstajati`);

    const areaRaw = str(r.podrocje);
    const area = resolveArea(areaRaw);
    if (!areaRaw) rowErrs.push("manjka 'podrocje'");
    else if (!area) rowErrs.push(`neveljavno področje '${areaRaw}'`);
    const billRaw = str(r.obracun);
    const billingType = resolveBilling(billRaw);
    if (!billRaw) rowErrs.push("manjka 'obracun'");
    else if (!billingType) rowErrs.push(`neveljaven obračun '${billRaw}'`);
    const statRaw = str(r.status);
    const status = resolveStatus(statRaw);
    if (!statRaw) rowErrs.push("manjka 'status'");
    else if (!status) rowErrs.push(`neveljaven status '${statRaw}'`);

    let assignedTo: string | undefined;
    const nosilec = str(r.nosilec);
    if (!nosilec) rowErrs.push("manjka 'nosilec'");
    else {
      const resolved = people.get(nosilec.toLowerCase());
      if (!resolved) rowErrs.push(`nosilec '${nosilec}' ni med člani ekipe — najprej ga dodaj v Nastavitve`);
      assignedTo = resolved;
    }

    const candidate = {
      client: cname ?? "",
      title: str(r.naziv_zadeve),
      area,
      billingType,
      status,
      openedAt: str(r.odprto) || undefined,
      hourlyRate: num(r.urna_postavka),
      flatFee: num(r.pavsal),
      assignedTo,
      notes: str(r.opombe) || undefined,
    };
    const parsed = insertMatterSchema.safeParse(candidate);
    if (!parsed.success) {
      rowErrs.push(parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
    }

    if (rowErrs.length) rowErrs.forEach((m) => errors.push({ sheet: "zadeve", row: line, message: m }));
    else if (parsed.success && code) matters.push({ code: code.toLowerCase(), clientCode: strankaCode, data: parsed.data });
  });

  // --- validate deadlines (linked by koda_zadeve) ---
  const deadlines: { code: string; data: InsertDeadline }[] = [];
  roki.forEach((r, i) => {
    const line = i + 2;
    const rowErrs: string[] = [];
    const code = str(r.koda_zadeve).toLowerCase();
    if (!code) rowErrs.push("manjka 'koda_zadeve'");
    else if (!codes.has(code)) rowErrs.push(`koda_zadeve '${r.koda_zadeve}' se ne ujema z nobeno zadevo`);

    const vrstaRaw = str(r.vrsta);
    const kind = vrstaRaw ? resolveKind(vrstaRaw) : "interni";
    if (vrstaRaw && !kind) rowErrs.push(`neveljavna vrsta '${vrstaRaw}'`);
    const ponRaw = str(r.ponavljanje);
    const recurrence = ponRaw ? resolveRecurrence(ponRaw) : "enkraten";
    if (ponRaw && !recurrence) rowErrs.push(`neveljavno ponavljanje '${ponRaw}'`);

    const candidate = {
      matterId: "x", // placeholder for validation only
      title: str(r.naziv_roka),
      dueDate: str(r.datum) || undefined,
      severity: num(r.resnost) ?? 2,
      remindDaysBefore: num(r.opomni_dni_prej) ?? 3,
      kind: kind ?? "interni",
      recurrence: recurrence ?? "enkraten",
      status: "odprt",
    };
    const parsed = insertDeadlineSchema.safeParse(candidate);
    if (!parsed.success) {
      rowErrs.push(parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; "));
    }

    if (rowErrs.length) rowErrs.forEach((m) => errors.push({ sheet: "roki", row: line, message: m }));
    else if (parsed.success) deadlines.push({ code, data: parsed.data });
  });

  const summary = {
    dryRun,
    willCreate: { stranke: clientsToCreate.length, zadeve: matters.length, roki: deadlines.length },
    created: { stranke: 0, zadeve: 0, roki: 0 },
    errors,
  };

  // Atomic: never write when there are errors, or on a dry-run. Always return
  // success:true so the client can render the summary + error list.
  if (dryRun || errors.length) {
    return res.json({ success: true, data: summary, error: null });
  }

  // Clients first, so matters can link to them by code.
  const clientCodeToId = new Map<string, string>();
  for (const [code, c] of existingByCode) clientCodeToId.set(code, c.id);
  for (const c of clientsToCreate) {
    const created = await storage.createClient(c.data);
    clientCodeToId.set(c.code, created.id);
  }
  const matterCodeToId = new Map<string, string>();
  for (const m of matters) {
    const created = await storage.createMatter({ ...m.data, clientId: clientCodeToId.get(m.clientCode) });
    matterCodeToId.set(m.code, created.id);
  }
  for (const d of deadlines) {
    const matterId = matterCodeToId.get(d.code);
    if (!matterId) continue;
    await storage.createDeadline({ ...d.data, matterId });
  }
  summary.created = { stranke: clientsToCreate.length, zadeve: matters.length, roki: deadlines.length };
  res.json({ success: true, data: summary, error: null });
});
