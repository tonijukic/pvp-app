import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  fetchMatter, fetchTime, addTime, fetchDeadlines, addDeadline, setDeadlineStatus,
  fetchCosts, addCost, updateMatter,
} from "../lib/api";
import type { Me } from "../lib/api";
import { euro, hoursFmt, todayIso, AREA_LABELS, BILLING_LABELS, STATUS_LABELS, SEVERITY_LABELS, DEADLINE_KIND_LABELS, DEADLINE_RECURRENCE_LABELS, daysLeft } from "../lib/format";
import { DEADLINE_KINDS, DEADLINE_RECURRENCE } from "@shared/schema";
import { useTeam } from "../lib/team";
import { Assignee } from "../components/Assignee";

type Tab = "ure" | "roki" | "stroski";
const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

export function MatterDetail({ id, me }: { id: string; me: Me }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("ure");
  const { data: matter, isLoading, error } = useQuery({ queryKey: ["matter", id], queryFn: () => fetchMatter(id) });
  const { members, nameOf } = useTeam();
  const reassign = useMutation({
    mutationFn: (username: string) => updateMatter(id, { assignedTo: username || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["matter", id] });
      qc.invalidateQueries({ queryKey: ["matters"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  if (isLoading) return <p className="text-neutral-500">Nalagam…</p>;
  if (error) return <p className="text-red-600">{(error as Error).message}</p>;
  if (!matter) return null;

  return (
    <div>
      <Link href="/zadeve" className="text-sm text-neutral-500">← Zadeve</Link>
      <div className="mt-1 mb-4">
        <h1 className="text-xl font-semibold text-[#0D332B]">{matter.client}</h1>
        <div className="text-sm text-neutral-500">
          {matter.title} · {AREA_LABELS[matter.area]} · {BILLING_LABELS[matter.billingType]}
          {matter.billingType === "po_urah" && matter.hourlyRate ? ` (${euro(Number(matter.hourlyRate))}/h)` : ""}
          {matter.billingType === "pausal" && matter.flatFee ? ` (${euro(Number(matter.flatFee))})` : ""}
          {" · "}{STATUS_LABELS[matter.status]}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-neutral-500">Nosilec:</span>
          <Assignee name={nameOf(matter.assignedTo)} size="xs" />
          {me.role === "admin" && (
            <select
              className="ml-auto rounded-lg border border-neutral-300 px-2 py-1 text-sm"
              value={matter.assignedTo ?? ""}
              onChange={(e) => reassign.mutate(e.target.value)}
              title="Prerazporedi nosilca"
            >
              <option value="">— nedodeljeno —</option>
              {members.map((mm) => <option key={mm.username} value={mm.username}>{mm.displayName}{mm.role === "admin" ? " (admin)" : ""}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-1 border-b border-neutral-200">
        {(["ure", "roki", "stroski"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm ${tab === t ? "border-b-2 border-[#C9A34A] font-semibold text-[#0D332B]" : "text-neutral-500"}`}
          >
            {t === "ure" ? "Ure" : t === "roki" ? "Roki" : "Stroški"}
          </button>
        ))}
      </div>

      {tab === "ure" && <TimeTab id={id} />}
      {tab === "roki" && <DeadlineTab id={id} />}
      {tab === "stroski" && <CostTab id={id} />}
    </div>
  );
}

function TimeTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["time", id], queryFn: () => fetchTime(id) });
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("");
  const mut = useMutation({
    mutationFn: () => addTime(id, { date, description, hours: Number(hours) }),
    onSuccess: () => { setDescription(""); setHours(""); qc.invalidateQueries({ queryKey: ["time", id] }); qc.invalidateQueries({ queryKey: ["overview"] }); },
  });
  const total = (data ?? []).reduce((s, t) => s + Number(t.hours), 0);
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); if (hours) mut.mutate(); }} className="mb-4 grid gap-2 rounded-xl border border-neutral-200 bg-white p-3 sm:grid-cols-[130px_1fr_90px_auto]">
        <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
        <input className={input} placeholder="Opis dela" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input type="number" step="0.25" className={input} placeholder="ure" value={hours} onChange={(e) => setHours(e.target.value)} />
        <button className="rounded-lg bg-[#C9A34A] px-3 py-2 text-sm font-semibold text-[#0D332B]">Dodaj</button>
      </form>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {(data ?? []).map((t) => (
          <div key={t.id} className="flex justify-between border-b border-neutral-100 px-4 py-2 text-sm last:border-0">
            <span>{t.date} · {t.description}</span><span className="font-medium">{hoursFmt(Number(t.hours))}</span>
          </div>
        ))}
        {!data?.length && <div className="px-4 py-3 text-sm text-neutral-400">Ni vpisanih ur.</div>}
      </div>
      <div className="mt-2 text-right text-sm">Skupaj: <b>{hoursFmt(total)}</b></div>
    </div>
  );
}

function DeadlineTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["deadlines", id], queryFn: () => fetchDeadlines(id) });
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(todayIso());
  const [severity, setSeverity] = useState("2");
  const [remind, setRemind] = useState("3");
  const [kind, setKind] = useState("interni");
  const [recurrence, setRecurrence] = useState("enkraten");
  const inval = () => { qc.invalidateQueries({ queryKey: ["deadlines", id] }); qc.invalidateQueries({ queryKey: ["deadlines"] }); qc.invalidateQueries({ queryKey: ["overview"] }); };
  const add = useMutation({
    mutationFn: () => addDeadline(id, { title, dueDate, severity: Number(severity), remindDaysBefore: Number(remind), status: "odprt", kind, recurrence }),
    onSuccess: () => { setTitle(""); setKind("interni"); setRecurrence("enkraten"); inval(); },
  });
  const done = useMutation({ mutationFn: (did: string) => setDeadlineStatus(did, "opravljen"), onSuccess: inval });
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); if (title) add.mutate(); }} className="mb-4 grid gap-2 rounded-xl border border-neutral-200 bg-white p-3 sm:grid-cols-[1fr_130px_110px_90px_auto]">
        <input className={input} placeholder="Opis roka" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" className={input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <select className={input} value={severity} onChange={(e) => setSeverity(e.target.value)}>
          {[1, 2, 3].map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
        </select>
        <input type="number" className={input} title="opomni X dni prej" value={remind} onChange={(e) => setRemind(e.target.value)} />
        <select className={input} title="vrsta roka" value={kind} onChange={(e) => setKind(e.target.value)}>
          {DEADLINE_KINDS.map((k) => <option key={k} value={k}>{DEADLINE_KIND_LABELS[k]}</option>)}
        </select>
        <select className={input} title="ponavljanje" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
          {DEADLINE_RECURRENCE.map((r) => <option key={r} value={r}>{DEADLINE_RECURRENCE_LABELS[r]}</option>)}
        </select>
        <button className="rounded-lg bg-[#C9A34A] px-3 py-2 text-sm font-semibold text-[#0D332B]">Dodaj</button>
      </form>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {(data ?? []).map((d) => {
          const dl = daysLeft(d.dueDate);
          return (
            <div key={d.id} className="flex items-center justify-between border-b border-neutral-100 px-4 py-2 text-sm last:border-0">
              <span className={d.status === "opravljen" ? "text-neutral-400 line-through" : ""}>
                {d.dueDate} · {d.title}
                {d.kind === "obveznost_stranke" && <span className="ml-2 rounded bg-[#C9A34A]/20 px-1.5 py-0.5 text-[11px] text-[#0D332B]">obveznost stranke</span>}
                {d.recurrence === "letni" && <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">letni</span>}
              </span>
              <span className="flex items-center gap-3">
                {d.status === "odprt"
                  ? <span className={dl < 0 ? "text-red-600" : dl <= 3 ? "text-amber-700" : "text-neutral-400"}>{dl < 0 ? `zamuda ${-dl}d` : `čez ${dl}d`}</span>
                  : <span className="text-green-700">opravljeno</span>}
                {d.status === "odprt" && <button onClick={() => done.mutate(d.id)} className="rounded border border-neutral-300 px-2 py-0.5 text-xs">✓</button>}
              </span>
            </div>
          );
        })}
        {!data?.length && <div className="px-4 py-3 text-sm text-neutral-400">Ni rokov.</div>}
      </div>
    </div>
  );
}

function CostTab({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["costs", id], queryFn: () => fetchCosts(id) });
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const mut = useMutation({
    mutationFn: () => addCost(id, { date, description, amount: Number(amount) }),
    onSuccess: () => { setDescription(""); setAmount(""); qc.invalidateQueries({ queryKey: ["costs", id] }); qc.invalidateQueries({ queryKey: ["overview"] }); },
  });
  const total = (data ?? []).reduce((s, c) => s + Number(c.amount), 0);
  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); if (amount) mut.mutate(); }} className="mb-4 grid gap-2 rounded-xl border border-neutral-200 bg-white p-3 sm:grid-cols-[130px_1fr_110px_auto]">
        <input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} />
        <input className={input} placeholder="Opis stroška" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input type="number" step="0.01" className={input} placeholder="€" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="rounded-lg bg-[#C9A34A] px-3 py-2 text-sm font-semibold text-[#0D332B]">Dodaj</button>
      </form>
      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {(data ?? []).map((c) => (
          <div key={c.id} className="flex justify-between border-b border-neutral-100 px-4 py-2 text-sm last:border-0">
            <span>{c.date} · {c.description}</span><span className="font-medium">{euro(Number(c.amount))}</span>
          </div>
        ))}
        {!data?.length && <div className="px-4 py-3 text-sm text-neutral-400">Ni stroškov.</div>}
      </div>
      <div className="mt-2 text-right text-sm">Skupaj: <b>{euro(total)}</b></div>
    </div>
  );
}
