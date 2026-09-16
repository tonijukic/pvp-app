import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTeamBilling } from "../lib/api";
import { euro, hoursFmt } from "../lib/format";

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function Obracun() {
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading } = useQuery({ queryKey: ["team-billing", month], queryFn: () => fetchTeamBilling(month) });

  const rows = data?.rows ?? [];
  const total = rows.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-[#0D332B]">Obračun ekipe</h1>
      <p className="mb-4 text-sm text-neutral-500">Ure članov ekipe × njihova urna postavka za plačilo. Vidiš samo ti. Postavko nastaviš pri članu v Nastavitvah.</p>

      <div className="mb-3">
        <label className="text-sm text-neutral-600">Mesec <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="ml-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm" /></label>
      </div>

      {isLoading ? (
        <p className="text-neutral-500">Nalagam…</p>
      ) : !rows.length ? (
        <p className="text-neutral-500">Ni vpisanih ur za ta mesec.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="grid grid-cols-[1fr_90px_100px_110px] gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs font-semibold text-neutral-500">
            <span>Član</span><span className="text-right">Ure</span><span className="text-right">Postavka</span><span className="text-right">Za plačilo</span>
          </div>
          {rows.map((r) => (
            <div key={r.username} className="grid grid-cols-[1fr_90px_100px_110px] items-center gap-2 border-b border-neutral-100 px-4 py-2 text-sm last:border-0">
              <span>{r.name}</span>
              <span className="text-right">{hoursFmt(r.hours)}</span>
              <span className="text-right text-neutral-500">{r.payRate != null ? `${euro(r.payRate)}/h` : "—"}</span>
              <span className="text-right font-medium">{r.amount != null ? euro(r.amount) : <span className="text-amber-700">ni postavke</span>}</span>
            </div>
          ))}
          <div className="flex justify-end gap-6 px-4 py-3 text-sm">
            <span className="text-neutral-500">Skupaj za plačilo</span>
            <span className="font-semibold">{euro(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
