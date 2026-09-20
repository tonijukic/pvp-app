import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchRadar } from "../lib/api";
import { AREA_LABELS } from "../lib/format";
import { PRACTICE_AREAS, type PracticeArea, type RadarItem } from "@shared/schema";

export function Radar() {
  const [area, setArea] = useState<PracticeArea | "">("");
  const { data: items, isLoading } = useQuery({
    queryKey: ["radar", area],
    queryFn: () => fetchRadar(area || undefined),
  });

  const groups = PRACTICE_AREAS.map((a) => ({
    area: a,
    label: AREA_LABELS[a],
    items: (items ?? []).filter((i) => i.area === a),
  })).filter((g) => g.items.length);

  const Item = (i: RadarItem) => (
    <div key={i.id} className="px-4 py-3">
      <div className="font-medium text-[#0D332B]">
        {i.url ? (
          <a href={i.url} target="_blank" rel="noreferrer" className="hover:underline">
            {i.title}
          </a>
        ) : (
          i.title
        )}
      </div>
      <div className="mt-0.5 text-xs text-neutral-500">
        {i.source}
        {i.publishedAt ? ` · ${i.publishedAt}` : ""}
      </div>
      {i.summary && <div className="mt-1 text-sm text-neutral-600">{i.summary}</div>}
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[#0D332B]">Zakonodajni radar</h1>
        <select
          value={area}
          onChange={(e) => setArea(e.target.value as PracticeArea | "")}
          className="rounded border border-neutral-300 px-2 py-1 text-sm"
        >
          <option value="">Vsa področja</option>
          {PRACTICE_AREAS.map((a) => (
            <option key={a} value={a}>
              {AREA_LABELS[a]}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-neutral-500">Nalagam…</p>}
      {!isLoading && !groups.length && (
        <p className="text-neutral-500">Ni novih relevantnih sprememb.</p>
      )}

      {groups.map((g) => (
        <section key={g.area} className="mb-5">
          <h2 className="mb-1 text-sm font-semibold text-[#0D332B]">{g.label}</h2>
          <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            {g.items.map(Item)}
          </div>
        </section>
      ))}
    </div>
  );
}
