import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchClients, createClient, updateClient, deleteClient, fetchMatters } from "../lib/api";
import type { Client } from "@shared/schema";
import { CLIENT_KINDS, CLIENT_STATUSES, CONTRACT_TYPES, PRACTICE_AREAS } from "@shared/schema";
import { AREA_LABELS, CLIENT_KIND_LABELS, CLIENT_STATUS_LABELS, CONTRACT_TYPE_LABELS } from "../lib/format";

const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

type Filter = "vse" | "aktivna" | "potencialna";

export function Stranke() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("vse");
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const { data: clients, isLoading } = useQuery({ queryKey: ["clients"], queryFn: () => fetchClients() });
  const { data: matters } = useQuery({ queryKey: ["matters"], queryFn: fetchMatters });
  const nalogCount = (id: string) => (matters ?? []).filter((m) => m.clientId === id).length;

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["clients"] }); };
  const rows = (clients ?? []).filter((c) => filter === "vse" || c.status === filter);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#0D332B]">Stranke</h1>
        <button onClick={() => { setCreating((v) => !v); setEditId(null); }} className="rounded-lg bg-[#0D332B] px-3 py-1.5 text-sm font-medium text-white">
          {creating ? "Prekliči" : "+ Nova stranka"}
        </button>
      </div>
      <p className="mb-3 text-sm text-neutral-500">Baza strank in potencialnih strank. Kratice določiš sama - te se pri storitvah izbirajo iz spustnega seznama.</p>

      <div className="mb-3 flex gap-1 text-sm">
        {(["vse", "aktivna", "potencialna"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 ${filter === f ? "bg-[#0D332B] text-white" : "bg-neutral-100 text-neutral-600"}`}>
            {f === "vse" ? "Vse" : f === "aktivna" ? "Aktivne" : "Potencialne"}
          </button>
        ))}
      </div>

      {creating && <ClientForm onDone={() => { setCreating(false); invalidate(); }} />}

      {isLoading ? (
        <p className="text-neutral-500">Nalagam…</p>
      ) : !rows.length ? (
        <p className="text-neutral-500">Ni strank.</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((c) =>
            editId === c.id ? (
              <ClientForm key={c.id} client={c} onDone={() => { setEditId(null); invalidate(); }} />
            ) : (
              <ClientCard key={c.id} client={c} nalog={nalogCount(c.id)} onEdit={() => { setEditId(c.id); setCreating(false); }} onDeleted={invalidate} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ClientCard({ client: c, nalog, onEdit, onDeleted }: { client: Client; nalog: number; onEdit: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const del = useMutation({ mutationFn: () => deleteClient(c.id), onSuccess: () => { onDeleted(); qc.invalidateQueries({ queryKey: ["clients"] }); } });
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold">
            <span className="mr-2 rounded bg-[#0D332B]/5 px-1.5 py-0.5 font-mono text-xs text-[#0D332B]">{c.code}</span>
            {c.name}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-neutral-500">
            <span>{CLIENT_KIND_LABELS[c.kind]}</span>
            {c.area && <span>{AREA_LABELS[c.area]}</span>}
            <span>{CONTRACT_TYPE_LABELS[c.contractType]}{c.documentNumber ? ` ${c.documentNumber}` : ""}</span>
            {(c.validFrom || c.validTo) && <span>velja {c.validFrom ?? "…"} - {c.validTo ?? "…"}</span>}
            <span>{nalog} nalog</span>
          </div>
          {c.subject && <div className="mt-1 text-sm text-neutral-600">{c.subject}</div>}
          {c.notes && <div className="mt-1 text-sm text-amber-800">Opombe: {c.notes}</div>}
        </div>
        <div className="flex flex-col items-end gap-1 whitespace-nowrap">
          <span className={`rounded-full px-2 py-0.5 text-xs ${c.status === "aktivna" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
            {CLIENT_STATUS_LABELS[c.status]}
          </span>
          <div className="flex gap-2 text-xs">
            <button onClick={onEdit} className="text-[#0D332B] underline">uredi</button>
            <button onClick={() => del.mutate()} className="text-red-600">izbriši</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClientForm({ client, onDone }: { client?: Client; onDone: () => void }) {
  const isEdit = !!client;
  const [f, setF] = useState({
    code: client?.code ?? "",
    name: client?.name ?? "",
    kind: client?.kind ?? "pravna",
    status: client?.status ?? "aktivna",
    area: client?.area ?? "",
    contractType: client?.contractType ?? "brez",
    documentNumber: client?.documentNumber ?? "",
    validFrom: client?.validFrom ?? "",
    validTo: client?.validTo ?? "",
    subject: client?.subject ?? "",
    notes: client?.notes ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const body = () => ({
    code: f.code,
    name: f.name,
    kind: f.kind as never,
    status: f.status as never,
    area: (f.area || undefined) as never,
    contractType: f.contractType as never,
    documentNumber: f.documentNumber || undefined,
    validFrom: f.validFrom || undefined,
    validTo: f.validTo || undefined,
    subject: f.subject || undefined,
    notes: f.notes || undefined,
  });
  const mut = useMutation({
    mutationFn: () => (isEdit ? updateClient(client!.id, body() as never) : createClient(body() as never)),
    onSuccess: onDone,
    onError: (e) => setErr((e as Error).message),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); setErr(null); if (f.code && f.name) mut.mutate(); }} className="mb-3 grid gap-3 rounded-xl border border-[#C9A34A] bg-white p-4 sm:grid-cols-2">
      <label className="text-sm">Kratica<input className={input} value={f.code} onChange={(e) => set("code", e.target.value)} placeholder="npr. TELO" /></label>
      <label className="text-sm">Naziv stranke<input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
      <label className="text-sm">Vrsta
        <select className={input} value={f.kind} onChange={(e) => set("kind", e.target.value)}>
          {CLIENT_KINDS.map((k) => <option key={k} value={k}>{CLIENT_KIND_LABELS[k]}</option>)}
        </select>
      </label>
      <label className="text-sm">Status
        <select className={input} value={f.status} onChange={(e) => set("status", e.target.value)}>
          {CLIENT_STATUSES.map((s) => <option key={s} value={s}>{CLIENT_STATUS_LABELS[s]}</option>)}
        </select>
      </label>
      <label className="text-sm">Področje
        <select className={input} value={f.area} onChange={(e) => set("area", e.target.value)}>
          <option value="">—</option>
          {PRACTICE_AREAS.map((a) => <option key={a} value={a}>{AREA_LABELS[a]}</option>)}
        </select>
      </label>
      <label className="text-sm">Podlaga
        <select className={input} value={f.contractType} onChange={(e) => set("contractType", e.target.value)}>
          {CONTRACT_TYPES.map((t) => <option key={t} value={t}>{CONTRACT_TYPE_LABELS[t]}</option>)}
        </select>
      </label>
      <label className="text-sm">Št. dokumenta<input className={input} value={f.documentNumber} onChange={(e) => set("documentNumber", e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">Velja od<input type="date" className={input} value={f.validFrom} onChange={(e) => set("validFrom", e.target.value)} /></label>
        <label className="text-sm">Velja do<input type="date" className={input} value={f.validTo} onChange={(e) => set("validTo", e.target.value)} /></label>
      </div>
      <label className="text-sm sm:col-span-2">Opis predmeta (cene / specifike)<textarea className={input} rows={2} value={f.subject} onChange={(e) => set("subject", e.target.value)} /></label>
      <label className="text-sm sm:col-span-2">Opombe (želje / nujne potrebe)<textarea className={input} rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      {err && <div className="text-sm text-red-600 sm:col-span-2">{err}</div>}
      <div className="sm:col-span-2">
        <button disabled={mut.isPending} className="rounded-lg bg-[#C9A34A] px-4 py-2 text-sm font-semibold text-[#0D332B]">
          {mut.isPending ? "Shranjujem…" : isEdit ? "Shrani spremembe" : "Shrani stranko"}
        </button>
      </div>
    </form>
  );
}
