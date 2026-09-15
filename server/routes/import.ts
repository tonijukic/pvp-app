import { Router, type Response } from "express";
import { storage } from "../storage";
import { config } from "../config";
import { requireAdmin } from "../middleware/requireRole";
import {
  insertMatterSchema,
  insertDeadlineSchema,
  PRACTICE_AREAS,
  BILLING_TYPES,
  MATTER_STATUSES,
  DEADLINE_KINDS,
  DEADLINE_RECURRENCE,
  type InsertMatter,
  type InsertDeadline,
} from "@shared/schema";
import {
  AREA_LABELS,
  STATUS_LABELS,
  BILLING_LABELS,
  DEADLINE_KIND_LABELS,
  DEADLINE_RECURRENCE_LABELS,
} from "@shared/labels";

export const importRouter = Router();

// ---------------------------------------------------------------------------
// One-time bulk import ("Uvoz") — cutover popis of current clients/matters/
// deadlines. Accepts either the internal code or the Slovenian label for enum
// columns, so the team can fill a friendly spreadsheet. Atomic: if any row
// fails validation, nothing is written (fix, then re-run).
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

/** Parse a number allowing Slovenian comma decimals and stray spaces. */
function num(v: string | undefined): number | undefined {
  if (v === undefined || String(v).trim() === "") return undefined;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}
const str = (v: string | undefined) => (v ?? "").trim();

type Row = Record<string, string>;
interface ImportBody {
  dryRun?: boolean;
  zadeve?: Row[];
  roki?: Row[];
}
interface ImportError {
  sheet: "zadeve" | "roki";
  row: number;
  message: string;
}

importRouter.post("/", requireAdmin, async (req, res: Response) => {
  const body = (req.body ?? {}) as ImportBody;
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

  // --- validate matters ---
  const matters: { code: string; data: InsertMatter }[] = [];
  const codes = new Set<string>();
  zadeve.forEach((r, i) => {
    const line = i + 2; // header is row 1
    const code = str(r.koda);
    if (!code) errors.push({ sheet: "zadeve", row: line, message: "manjka 'koda'" });
    else if (codes.has(code.toLowerCase())) errors.push({ sheet: "zadeve", row: line, message: `podvojena koda '${code}'` });
    codes.add(code.toLowerCase());

    let assignedTo: string | undefined;
    const nosilec = str(r.nosilec);
    if (nosilec) {
      const resolved = people.get(nosilec.toLowerCase());
      if (!resolved) errors.push({ sheet: "zadeve", row: line, message: `nosilec '${nosilec}' ni med člani ekipe — najprej ga dodaj v Nastavitve` });
      assignedTo = resolved;
    }

    const candidate = {
      client: str(r.stranka),
      title: str(r.naziv_zadeve),
      area: resolveArea(r.podrocje),
      billingType: resolveBilling(r.obracun),
      status: resolveStatus(r.status),
      openedAt: str(r.odprto) || undefined,
      hourlyRate: num(r.urna_postavka),
      flatFee: num(r.pavsal),
      assignedTo,
      notes: str(r.opombe) || undefined,
    };
    const parsed = insertMatterSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ sheet: "zadeve", row: line, message: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
    } else if (code) {
      matters.push({ code: code.toLowerCase(), data: parsed.data });
    }
  });

  // --- validate deadlines (linked by koda_zadeve) ---
  // Parsed with a placeholder matterId; the real id is set at creation time.
  const deadlines: { code: string; data: InsertDeadline }[] = [];
  roki.forEach((r, i) => {
    const line = i + 2;
    const code = str(r.koda_zadeve).toLowerCase();
    if (!code) { errors.push({ sheet: "roki", row: line, message: "manjka 'koda_zadeve'" }); return; }
    if (!codes.has(code)) { errors.push({ sheet: "roki", row: line, message: `koda_zadeve '${r.koda_zadeve}' se ne ujema z nobeno zadevo` }); return; }
    const candidate = {
      matterId: "x", // placeholder for validation only
      title: str(r.naziv_roka),
      dueDate: str(r.datum) || undefined,
      severity: num(r.resnost) ?? 2,
      remindDaysBefore: num(r.opomni_dni_prej) ?? 3,
      kind: resolveKind(r.vrsta) ?? "interni",
      recurrence: resolveRecurrence(r.ponavljanje) ?? "enkraten",
      status: "odprt",
    };
    const parsed = insertDeadlineSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push({ sheet: "roki", row: line, message: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ") });
    } else {
      deadlines.push({ code, data: parsed.data });
    }
  });

  const summary = {
    dryRun,
    willCreate: { zadeve: matters.length, roki: deadlines.length },
    created: { zadeve: 0, roki: 0 },
    errors,
  };

  // Atomic: never write when there are errors, or on a dry-run. Always return
  // success:true so the client can render the summary + error list (business
  // errors live in the payload, not the HTTP/envelope status).
  if (dryRun || errors.length) {
    return res.json({ success: true, data: summary, error: null });
  }

  const codeToId = new Map<string, string>();
  for (const m of matters) {
    const created = await storage.createMatter(m.data);
    codeToId.set(m.code, created.id);
  }
  for (const d of deadlines) {
    const matterId = codeToId.get(d.code);
    if (!matterId) continue;
    await storage.createDeadline({ ...d.data, matterId });
  }
  summary.created = { zadeve: matters.length, roki: deadlines.length };
  res.json({ success: true, data: summary, error: null });
});
