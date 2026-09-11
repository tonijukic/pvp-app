import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchMatters, addTime } from "../lib/api";
import { todayIso } from "../lib/format";

/** Mobile-first quick time entry for the team. */
export function TimeQuick() {
  const qc = useQueryClient();
  const { data: matters } = useQuery({ queryKey: ["matters"], queryFn: fetchMatters });
  const [matterId, setMatterId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [hours, setHours] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: () => addTime(matterId, { date, description, hours: Number(hours) }),
    onSuccess: () => {
      setMsg("Zabeleženo ✓");
      setHours("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["overview"] });
      setTimeout(() => setMsg(null), 2500);
    },
    onError: (e) => setErr((e as Error).message),
  });

  const input = "w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base";

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-xl font-semibold text-[#0D332B]">Vpiši ure</h1>
      <form
        onSubmit={(e) => { e.preventDefault(); setErr(null); if (matterId && hours) mut.mutate(); }}
        className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4"
      >
        <label className="text-sm">Zadeva
          <select className={input} value={matterId} onChange={(e) => setMatterId(e.target.value)}>
            <option value="">— izberi —</option>
            {matters?.map((m) => <option key={m.id} value={m.id}>{m.client} — {m.title}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Datum<input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="text-sm">Ure<input type="number" inputMode="decimal" step="0.25" className={input} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="npr. 1.5" /></label>
        </div>
        <label className="text-sm">Opis dela<textarea className={input} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        {err && <div className="text-sm text-red-600">{err}</div>}
        {msg && <div className="text-sm text-green-700">{msg}</div>}
        <button disabled={!matterId || !hours || mut.isPending} className="rounded-lg bg-[#C9A34A] px-4 py-3 font-semibold text-[#0D332B] disabled:opacity-50">
          {mut.isPending ? "Shranjujem…" : "Zabeleži"}
        </button>
      </form>
    </div>
  );
}
