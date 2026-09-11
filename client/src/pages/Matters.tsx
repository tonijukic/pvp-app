import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { fetchMatters, createMatter, fetchMe } from "../lib/api";
import { AREA_LABELS, BILLING_LABELS, STATUS_LABELS, todayIso } from "../lib/format";
import { PRACTICE_AREAS, BILLING_TYPES, MATTER_STATUSES } from "@shared/schema";

export function Matters() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const { data: matters, isLoading } = useQuery({ queryKey: ["matters"], queryFn: fetchMatters });
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#0D332B]">Zadeve</h1>
        {me?.role === "admin" && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg bg-[#0D332B] px-3 py-1.5 text-sm font-medium text-white"
          >
            {open ? "Prekliči" : "+ Nova zadeva"}
          </button>
        )}
      </div>

      {open && <CreateForm onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["matters"] }); qc.invalidateQueries({ queryKey: ["overview"] }); }} />}

      {isLoading ? (
        <p className="text-neutral-500">Nalagam…</p>
      ) : !matters?.length ? (
        <p className="text-neutral-500">Ni zadev.</p>
      ) : (
        <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {matters.map((m) => (
            <Link key={m.id} href={`/zadeve/${m.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50">
              <div>
                <div className="font-medium">{m.client}</div>
                <div className="text-sm text-neutral-500">{m.title} · {AREA_LABELS[m.area]}</div>
              </div>
              <div className="text-right text-sm">
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
  const [f, setF] = useState({
    client: "",
    title: "",
    area: "delovno_pravo",
    billingType: "po_urah",
    hourlyRate: "",
    flatFee: "",
    status: "odprta",
    openedAt: todayIso(),
    assignedTo: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: () =>
      createMatter({
        client: f.client,
        title: f.title,
        area: f.area as never,
        billingType: f.billingType as never,
        status: f.status as never,
        openedAt: f.openedAt as never,
        hourlyRate: f.billingType === "po_urah" && f.hourlyRate ? Number(f.hourlyRate) : undefined,
        flatFee: f.billingType === "pausal" && f.flatFee ? Number(f.flatFee) : undefined,
        assignedTo: f.assignedTo || undefined,
      }),
    onSuccess: onDone,
    onError: (e) => setErr((e as Error).message),
  });

  const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); setErr(null); mut.mutate(); }}
      className="mb-4 grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2"
    >
      <label className="text-sm">Stranka<input className={input} value={f.client} onChange={(e) => set("client", e.target.value)} /></label>
      <label className="text-sm">Naziv zadeve<input className={input} value={f.title} onChange={(e) => set("title", e.target.value)} /></label>
      <label className="text-sm">Področje
        <select className={input} value={f.area} onChange={(e) => set("area", e.target.value)}>
          {PRACTICE_AREAS.map((a) => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}
        </select>
      </label>
      <label className="text-sm">Obračun
        <select className={input} value={f.billingType} onChange={(e) => set("billingType", e.target.value)}>
          {BILLING_TYPES.map((b) => <option key={b} value={b}>{BILLING_LABELS[b]}</option>)}
        </select>
      </label>
      {f.billingType === "po_urah" ? (
        <label className="text-sm">Urna postavka (€)<input type="number" step="0.01" className={input} value={f.hourlyRate} onChange={(e) => set("hourlyRate", e.target.value)} /></label>
      ) : (
        <label className="text-sm">Pavšal (€)<input type="number" step="0.01" className={input} value={f.flatFee} onChange={(e) => set("flatFee", e.target.value)} /></label>
      )}
      <label className="text-sm">Status
        <select className={input} value={f.status} onChange={(e) => set("status", e.target.value)}>
          {MATTER_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </label>
      <label className="text-sm">Odprto<input type="date" className={input} value={f.openedAt} onChange={(e) => set("openedAt", e.target.value)} /></label>
      <label className="text-sm">Dodeljeno (e-pošta/uporabnik)<input className={input} value={f.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} placeholder="npr. nina" /></label>
      {err && <div className="text-sm text-red-600 sm:col-span-2">{err}</div>}
      <div className="sm:col-span-2">
        <button disabled={mut.isPending} className="rounded-lg bg-[#C9A34A] px-4 py-2 text-sm font-semibold text-[#0D332B]">
          {mut.isPending ? "Shranjujem…" : "Shrani zadevo"}
        </button>
      </div>
    </form>
  );
}
