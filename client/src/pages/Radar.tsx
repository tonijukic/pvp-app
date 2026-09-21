import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { fetchRadar } from "../lib/api";
import { AREA_LABELS, dateFmt } from "../lib/format";
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

  const Item = (i: RadarItem) => {
    const published = dateFmt(i.publishedAt);
    return (
      <Link key={i.id} href={`/radar/${i.id}`} className="block px-4 py-3 transition-colors hover:bg-[#0D332B]/5">
        <div className="font-medium text-[#0D332B]">{i.title}</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-neutral-500">
          <span className="rounded-full bg-[#0D332B]/5 px-2 py-0.5 font-medium text-[#0D332B]">{i.source}</span>
          <span>{published || "datum ni na voljo"}</span>
          {i.summaryTeam && (
            <span className="rounded-full bg-[#C9A34A]/15 px-2 py-0.5 font-medium text-[#8a6d1f]">Povzetek pripravljen</span>
          )}
        </div>
        {i.summary && <div className="mt-1 text-sm text-neutral-600">{i.summary}</div>}
      </Link>
    );
  };

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
