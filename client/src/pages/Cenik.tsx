import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchServices, createService, updateService, deleteService } from "../lib/api";
import type { Service } from "@shared/schema";
import { SERVICE_UNITS } from "@shared/schema";
import { euro, SERVICE_UNIT_LABELS } from "../lib/format";

const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

export function Cenik() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const { data: services, isLoading } = useQuery({ queryKey: ["services"], queryFn: fetchServices });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["services"] });

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#0D332B]">Cenik</h1>
        <button onClick={() => { setCreating((v) => !v); setEditId(null); }} className="rounded-lg bg-[#0D332B] px-3 py-1.5 text-sm font-medium text-white">
          {creating ? "Prekliči" : "+ Nova storitev"}
        </button>
      </div>
      <p className="mb-3 text-sm text-neutral-500">Storitve in cene. PO = pravna oseba, FO = fizična oseba. Cene se pri nalogi ponudijo glede na vrsto stranke.</p>

      {creating && <ServiceForm onDone={() => { setCreating(false); invalidate(); }} />}

      {isLoading ? (
        <p className="text-neutral-500">Nalagam…</p>
      ) : !services?.length ? (
        <p className="text-neutral-500">Cenik je prazen.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="grid grid-cols-[80px_1fr_60px_80px_80px_80px_120px_auto] gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-semibold text-neutral-500">
            <span>Kratica</span><span>Storitev</span><span>EM</span><span className="text-right">PO</span><span className="text-right">FO</span><span className="text-right">PO tujina</span><span>Opomba</span><span></span>
          </div>
          {services.map((s) =>
            editId === s.id ? (
              <div key={s.id} className="p-3"><ServiceForm service={s} onDone={() => { setEditId(null); invalidate(); }} /></div>
            ) : (
              <Row key={s.id} s={s} onEdit={() => { setEditId(s.id); setCreating(false); }} onDeleted={invalidate} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function Row({ s, onEdit, onDeleted }: { s: Service; onEdit: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const del = useMutation({ mutationFn: () => deleteService(s.id), onSuccess: () => { onDeleted(); qc.invalidateQueries({ queryKey: ["services"] }); } });
  return (
    <div className="grid grid-cols-[80px_1fr_60px_80px_80px_80px_120px_auto] items-center gap-2 border-b border-neutral-100 px-4 py-2 text-sm last:border-0">
      <span className="font-mono text-xs text-[#0D332B]">{s.code}</span>
      <span className="truncate">{s.name}</span>
      <span className="text-neutral-500">{SERVICE_UNIT_LABELS[s.unit]}</span>
      <span className="text-right">{s.pricePO != null ? euro(Number(s.pricePO)) : "—"}</span>
      <span className="text-right">{s.priceFO != null ? euro(Number(s.priceFO)) : "—"}</span>
      <span className="text-right">{s.pricePOForeign != null ? euro(Number(s.pricePOForeign)) : "—"}</span>
      <span className="truncate text-neutral-500">{s.priceNote || "—"}</span>
      <span className="flex justify-end gap-2 text-xs">
        <button onClick={onEdit} className="text-[#0D332B] underline">uredi</button>
        <button onClick={() => del.mutate()} className="text-red-600">izbriši</button>
      </span>
    </div>
  );
}

function ServiceForm({ service, onDone }: { service?: Service; onDone: () => void }) {
  const isEdit = !!service;
  const [f, setF] = useState({
    code: service?.code ?? "",
    name: service?.name ?? "",
    unit: service?.unit ?? "ura",
    pricePO: service?.pricePO ?? "",
    priceFO: service?.priceFO ?? "",
    pricePOForeign: service?.pricePOForeign ?? "",
    priceNote: service?.priceNote ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const body = () => ({
    code: f.code,
    name: f.name,
    unit: f.unit as never,
    pricePO: f.pricePO === "" ? null : Number(f.pricePO),
    priceFO: f.priceFO === "" ? null : Number(f.priceFO),
    pricePOForeign: f.pricePOForeign === "" ? null : Number(f.pricePOForeign),
    priceNote: f.priceNote === "" ? null : f.priceNote,
  });
  const mut = useMutation({
    mutationFn: () => (isEdit ? updateService(service!.id, body() as never) : createService(body() as never)),
    onSuccess: onDone,
    onError: (e) => setErr((e as Error).message),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); setErr(null); if (f.code && f.name) mut.mutate(); }} className="grid gap-2 rounded-xl border border-[#C9A34A] bg-white p-3 sm:grid-cols-[90px_1fr_90px_90px_90px_90px_140px_auto]">
      <input className={input} placeholder="Kratica" value={f.code} onChange={(e) => set("code", e.target.value)} />
      <input className={input} placeholder="Naziv storitve" value={f.name} onChange={(e) => set("name", e.target.value)} />
      <select className={input} value={f.unit} onChange={(e) => set("unit", e.target.value)}>
        {SERVICE_UNITS.map((u) => <option key={u} value={u}>{SERVICE_UNIT_LABELS[u]}</option>)}
      </select>
      <input type="number" step="0.01" className={input} placeholder="PO €" value={f.pricePO} onChange={(e) => set("pricePO", e.target.value)} />
      <input type="number" step="0.01" className={input} placeholder="FO €" value={f.priceFO} onChange={(e) => set("priceFO", e.target.value)} />
      <input type="number" step="0.01" className={input} placeholder="PO tujina €" value={f.pricePOForeign} onChange={(e) => set("pricePOForeign", e.target.value)} />
      <input className={input} placeholder="Opomba cene" value={f.priceNote} onChange={(e) => set("priceNote", e.target.value)} />
      <button disabled={mut.isPending} className="rounded-lg bg-[#C9A34A] px-3 py-2 text-sm font-semibold text-[#0D332B]">{isEdit ? "Shrani" : "Dodaj"}</button>
      {err && <div className="text-sm text-red-600 sm:col-span-8">{err}</div>}
    </form>
  );
}
