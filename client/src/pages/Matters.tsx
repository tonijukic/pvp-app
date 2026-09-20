import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { fetchMatters, createMatter, fetchMe, fetchClients, fetchServices, fetchAllDeadlines } from "../lib/api";
import { AREA_LABELS, BILLING_LABELS, STATUS_LABELS, WAITING_REASON_LABELS, todayIso } from "../lib/format";
import { PRACTICE_AREAS, BILLING_TYPES, WAITING_REASONS, MATTER_STATUSES } from "@shared/schema";
import { fetchPackages } from "../lib/api";
import { useTeam } from "../lib/team";
import { Assignee } from "../components/Assignee";

const fsel = "rounded-lg border border-neutral-300 px-2 py-1 text-sm";

export function Matters() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const { data: matters, isLoading } = useQuery({ queryKey: ["matters"], queryFn: fetchMatters });
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: () => fetchClients() });
  const { data: deadlines } = useQuery({ queryKey: ["deadlines"], queryFn: fetchAllDeadlines });
  const { nameOf, members } = useTeam();
  const [open, setOpen] = useState(false);
  const [fArea, setFArea] = useState("");
  const [fNosilec, setFNosilec] = useState("");
  const [fClient, setFClient] = useState("");
  const [fRok, setFRok] = useState(false);

  const openRokMatterIds = new Set((deadlines ?? []).filter((d) => d.status === "odprt").map((d) => d.matterId));
  const filtered = (matters ?? []).filter(
    (m) =>
      (!fArea || m.area === fArea) &&
      (!fNosilec || (fNosilec === "__none__" ? !m.assignedTo : m.assignedTo === fNosilec)) &&
      (!fClient || m.clientId === fClient) &&
      (!fRok || openRokMatterIds.has(m.id)),
  );
  const hasFilter = fArea || fNosilec || fClient || fRok;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#0D332B]">Naloge</h1>
        {me?.role === "admin" && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg bg-[#0D332B] px-3 py-1.5 text-sm font-medium text-white"
          >
            {open ? "Prekliči" : "+ Nova naloga"}
          </button>
        )}
      </div>

      {open && <CreateForm onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["matters"] }); qc.invalidateQueries({ queryKey: ["overview"] }); }} />}

      {!!matters?.length && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className={fsel} value={fArea} onChange={(e) => setFArea(e.target.value)}>
            <option value="">vsa področja</option>
            {PRACTICE_AREAS.map((a) => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}
          </select>
          <select className={fsel} value={fNosilec} onChange={(e) => setFNosilec(e.target.value)}>
            <option value="">vsi nosilci</option>
            <option value="__none__">nedodeljeno</option>
            {members.map((mm) => <option key={mm.username} value={mm.username}>{mm.displayName}</option>)}
          </select>
          <select className={fsel} value={fClient} onChange={(e) => setFClient(e.target.value)}>
            <option value="">vse stranke</option>
            {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
          </select>
          <label className="flex items-center gap-1 text-sm text-neutral-600">
            <input type="checkbox" checked={fRok} onChange={(e) => setFRok(e.target.checked)} /> z odprtim rokom
          </label>
          {hasFilter && <button onClick={() => { setFArea(""); setFNosilec(""); setFClient(""); setFRok(false); }} className="text-xs text-[#0D332B] underline">počisti</button>}
        </div>
      )}

      {isLoading ? (
        <p className="text-neutral-500">Nalagam…</p>
      ) : !matters?.length ? (
        <p className="text-neutral-500">Ni nalog.</p>
      ) : !filtered.length ? (
        <p className="text-neutral-500">Ni nalog za izbrane filtre.</p>
      ) : (
        <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {filtered.map((m) => (
            <Link key={m.id} href={`/zadeve/${m.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50">
              <div className="min-w-0">
                <div className="font-medium">{m.client}</div>
                <div className="truncate text-sm text-neutral-500">{m.title} · {AREA_LABELS[m.area]}</div>
                {m.status === "caka" && m.waitingReason && (
                  <div className="mt-0.5 truncate text-xs text-amber-700">{WAITING_REASON_LABELS[m.waitingReason]}{m.waitingNote ? ` — ${m.waitingNote}` : ""}</div>
                )}
                <div className="mt-1"><Assignee name={nameOf(m.assignedTo)} size="xs" /></div>
              </div>
              <div className="whitespace-nowrap text-right text-sm">
                <div className="text-neutral-600">{STATUS_LABELS[m.status]}</div>
                <div className="text-neutral-400">{BILLING_LABELS[m.billingType]}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateForm({ onDone }: { onDone: () => void }) {
  const { members } = useTeam();
  const { data: clients } = useQuery({ queryKey: ["clients"], queryFn: () => fetchClients() });
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: fetchServices });
  const { data: packages } = useQuery({ queryKey: ["packages"], queryFn: fetchPackages });
  const [f, setF] = useState({
    clientId: "",
    title: "",
    area: "delovno_pravo",
    serviceCode: "",
    billingType: "po_urah",
    hourlyRate: "",
    flatFee: "",
    status: "odprta",
    waitingReason: "",
    waitingNote: "",
    pausalPackageCode: "",
    includedHours: "",
    reducedRate: "",
    openedAt: todayIso(),
    assignedTo: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Picking a pavšal package snapshots its included hours + reduced rate.
  const onPackage = (code: string) => {
    const pkg = packages?.find((p) => p.code === code);
    if (!pkg) { set("pausalPackageCode", code); return; }
    setF((prev) => ({
      ...prev,
      pausalPackageCode: code,
      includedHours: pkg.includedHours != null ? String(pkg.includedHours) : prev.includedHours,
      reducedRate: pkg.reducedRate != null ? String(pkg.reducedRate) : prev.reducedRate,
    }));
  };

  // Picking a service pulls its price from the cenik (PO/FO by client kind)
  // and pre-sets the billing type + rate. Everything stays editable.
  const onService = (code: string) => {
    const svc = services?.find((s) => s.code === code);
    if (!svc) { set("serviceCode", code); return; }
    const cl = clients?.find((c) => c.id === f.clientId);
    const price = cl?.kind === "fizicna" ? svc.priceFO : svc.pricePO;
    const p = price != null ? String(price) : "";
    setF((prev) =>
      svc.unit === "ura"
        ? { ...prev, serviceCode: code, billingType: "po_urah", hourlyRate: p || prev.hourlyRate }
        : { ...prev, serviceCode: code, billingType: "pausal", flatFee: p || prev.flatFee },
    );
  };

  const showHourly = f.billingType === "po_urah" || f.billingType === "pausal_ure";
  const showFlat = f.billingType === "pausal" || f.billingType === "pausal_ure";
  const showPausalUre = f.billingType === "pausal_ure";
  const showWaiting = f.status === "caka";

  const mut = useMutation({
    mutationFn: () => {
      const c = clients?.find((x) => x.id === f.clientId);
      return createMatter({
        client: c?.name ?? "",
        clientId: f.clientId || undefined,
        title: f.title,
        area: f.area as never,
        serviceCode: f.serviceCode || undefined,
        billingType: f.billingType as never,
        status: f.status as never,
        waitingReason: showWaiting && f.waitingReason ? (f.waitingReason as never) : undefined,
        waitingNote: showWaiting && f.waitingReason === "drugo" && f.waitingNote ? f.waitingNote : undefined,
        openedAt: f.openedAt as never,
        hourlyRate: showHourly && f.hourlyRate ? Number(f.hourlyRate) : undefined,
        flatFee: showFlat && f.flatFee ? Number(f.flatFee) : undefined,
        pausalPackageCode: showPausalUre && f.pausalPackageCode ? f.pausalPackageCode : undefined,
        includedHours: showPausalUre && f.includedHours ? Number(f.includedHours) : undefined,
        reducedRate: showPausalUre && f.reducedRate ? Number(f.reducedRate) : undefined,
        assignedTo: f.assignedTo || undefined,
      });
    },
    onSuccess: onDone,
    onError: (e) => setErr((e as Error).message),
  });

  const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); setErr(null); if (f.clientId && f.title) mut.mutate(); }}
      className="mb-4 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
    >
      <label className="text-sm">Stranka
        <select className={input} value={f.clientId} onChange={(e) => set("clientId", e.target.value)}>
          <option value="">— izberi stranko —</option>
          {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
        </select>
        {!clients?.length && <span className="mt-1 block text-xs text-amber-700">Najprej dodaj stranke v zavihku „Stranke“.</span>}
      </label>
      <label className="text-sm">Opis naloge<input className={input} value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
      <label className="text-sm">Področje
        <select className={input} value={f.area} onChange={(e) => set("area", e.target.value)}>
          {PRACTICE_AREAS.map((a) => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}
        </select>
      </label>
      <label className="text-sm">Storitev (iz cenika)
        <select className={input} value={f.serviceCode} onChange={(e) => onService(e.target.value)}>
          <option value="">— brez / ročno —</option>
          {(services ?? []).map((s) => <option key={s.id} value={s.code}>{s.code} - {s.name}</option>)}
        </select>
      </label>
      <label className="text-sm">Obračun
        <select className={input} value={f.billingType} onChange={(e) => set("billingType", e.target.value)}>
          {BILLING_TYPES.map((b) => <option key={b} value={b}>{BILLING_LABELS[b]}</option>)}
        </select>
      </label>
      <label className="text-sm">Status
        <select className={input} value={f.status} onChange={(e) => set("status", e.target.value)}>
          {MATTER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </label>
      {showWaiting && (
        <label className="text-sm">Razlog čakanja
          <select className={input} value={f.waitingReason} onChange={(e) => set("waitingReason", e.target.value)}>
            <option value="">— izberi razlog —</option>
            {WAITING_REASONS.map((r) => <option key={r} value={r}>{WAITING_REASON_LABELS[r]}</option>)}
          </select>
        </label>
      )}
      {showWaiting && f.waitingReason === "drugo" && (
        <label className="text-sm">Opis (drugo)<input className={input} value={f.waitingNote} onChange={(e) => set("waitingNote", e.target.value)} /></label>
      )}
      <label className="text-sm">Odprto<input type="date" className={input} value={f.openedAt} onChange={(e) => set("openedAt", e.target.value)} /></label>
      {showHourly && (
        <label className="text-sm">Urna postavka (€)<input type="number" step="0.01" className={input} value={f.hourlyRate} onChange={(e) => set("hourlyRate", e.target.value)} /></label>
      )}
      {showFlat && (
        <label className="text-sm">Pavšal (€)<input type="number" step="0.01" className={input} value={f.flatFee} onChange={(e) => set("flatFee", e.target.value)} /></label>
      )}
      {showPausalUre && (
        <label className="text-sm">Pavšal paket
          <select className={input} value={f.pausalPackageCode} onChange={(e) => onPackage(e.target.value)}>
            <option value="">— brez / ročno —</option>
            {(packages ?? []).map((p) => <option key={p.id} value={p.code}>{p.code} - {p.name}</option>)}
          </select>
        </label>
      )}
      {showPausalUre && (
        <label className="text-sm">Vključene ure<input type="number" step="0.01" className={input} value={f.includedHours} onChange={(e) => set("includedHours", e.target.value)} /></label>
      )}
      {showPausalUre && (
        <label className="text-sm">Znižana postavka nad kvoto (€/h)<input type="number" step="0.01" className={input} value={f.reducedRate} onChange={(e) => set("reducedRate", e.target.value)} /></label>
      )}
      <label className="text-sm">Nosilec (kdo dela na nalogi)
        <select className={input} value={f.assignedTo} onChange={(e) => set("assignedTo", e.target.value)}>
          <option value="">— nedodeljeno —</option>
          {members.map((mm) => <option key={mm.username} value={mm.username}>{mm.displayName}{mm.role === "admin" ? " (admin)" : ""}</option>)}
        </select>
      </label>
      {err && <div className="text-sm text-red-600 sm:col-span-2">{err}</div>}
      <div className="sm:col-span-2">
        <button disabled={mut.isPending} className="rounded-lg bg-[#C9A34A] px-4 py-2 text-sm font-semibold text-[#0D332B]">
          {mut.isPending ? "Shranjujem…" : "Shrani nalogo"}
        </button>
      </div>
    </form>
  );
}
