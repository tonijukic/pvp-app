import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { fetchOverview } from "../lib/api";
import { euro, hoursFmt, daysLeft, AREA_LABELS, STATUS_LABELS } from "../lib/format";

export function Overview() {
  const { data, isLoading, error } = useQuery({ queryKey: ["overview"], queryFn: fetchOverview });

  if (isLoading) return <p className="text-neutral-500">Nalagam…</p>;
  if (error) return <p className="text-red-600">{(error as Error).message}</p>;
  if (!data?.length) return <Empty />;

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-[#0D332B]">Pregled po zadevah</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.map((o) => (
          <Link
            key={o.matter.id}
            href={`/zadeve/${o.matter.id}`}
            className="block rounded-xl border border-neutral-200 bg-white p-4 hover:border-[#C9A34A]"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{o.matter.client}</div>
                <div className="text-sm text-neutral-500">{o.matter.title}</div>
              </div>
              <span className="rounded-full bg-[#0D332B]/5 px-2 py-0.5 text-xs text-[#0D332B]">
                {STATUS_LABELS[o.matter.status]}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span className="text-neutral-500">{AREA_LABELS[o.matter.area]}</span>
              <span>{hoursFmt(o.hoursTotal)}</span>
              <span className="font-medium">{euro(o.billableValue)}</span>
              {o.costsTotal > 0 && <span className="text-neutral-500">stroški {euro(o.costsTotal)}</span>}
            </div>
            {o.nextDeadline ? (
              <div className="mt-2 text-sm">
                <NextBadge dueDate={o.nextDeadline.dueDate} /> {o.nextDeadline.title}
              </div>
            ) : (
              <div className="mt-2 text-sm text-neutral-400">ni odprtih rokov</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function NextBadge({ dueDate }: { dueDate: string }) {
  const d = daysLeft(dueDate);
  const overdue = d < 0;
  const soon = d >= 0 && d <= 3;
  const cls = overdue ? "bg-red-100 text-red-700" : soon ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600";
  const txt = overdue ? `zamuda ${-d}d` : `čez ${d}d`;
  return <span className={`mr-1 rounded px-1.5 py-0.5 text-xs ${cls}`}>{txt}</span>;
}

function Empty() {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-neutral-500">
      Ni zadev.{" "}
      <Link href="/zadeve" className="text-[#0D332B] underline">
        Dodaj prvo zadevo
      </Link>
      .
    </div>
  );
}
