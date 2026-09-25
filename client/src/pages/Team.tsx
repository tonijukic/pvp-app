import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { fetchOverview, type MatterOverview } from "../lib/api";
import { hoursFmt, daysLeft } from "../lib/format";
import { useTeam } from "../lib/team";
import { Assignee } from "../components/Assignee";

/** Team view: work grouped by owner, so Nina sees at a glance who is on what,
 * their open/overdue deadlines and logged hours. Unassigned matters surface
 * as their own group so nothing falls through the cracks. */
export function Team() {
  const { data, isLoading } = useQuery({ queryKey: ["overview"], queryFn: fetchOverview });
  const { members, nameOf } = useTeam();

  if (isLoading) return <p className="text-neutral-500">Nalagam…</p>;
  const rows = data ?? [];

  // Buckets keyed by assignee username; "" = unassigned.
  const groups = new Map<string, MatterOverview[]>();
  for (const o of rows) {
    const key = o.matter.assignedTo ?? "";
    const arr = groups.get(key) ?? [];
    if (!groups.has(key)) groups.set(key, arr);
    arr.push(o);
  }
  // Order: every known team member (even with 0 matters), then unassigned.
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const m of members) if (!seen.has(m.username)) { seen.add(m.username); ordered.push(m.username); }
  if (groups.has("")) ordered.push("");

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-[#0D332B]">Ekipa</h1>
      <p className="mb-4 text-sm text-neutral-500">Pregled dela po osebah - kdo dela na čem, koliko ur in odprti/zamujeni roki.</p>
      <div className="grid gap-3">
        {ordered.map((key) => {
          const items = groups.get(key) ?? [];
          const hours = items.reduce((s, o) => s + o.hoursTotal, 0);
          const openDl = items.reduce((s, o) => s + o.openDeadlines, 0);
          const overdue = items.filter((o) => o.nextDeadline && daysLeft(o.nextDeadline.dueDate) < 0).length;
          const name = key === "" ? "Nedodeljeno" : nameOf(key);
          return (
            <section key={key || "unassigned"} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <Assignee name={name} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-sm text-neutral-500">
                  <span>{items.length} storitev</span>
                  <span>{hoursFmt(hours)}</span>
                  <span>{openDl} odprtih rokov</span>
                  {overdue > 0 && <span className="font-medium text-red-600">{overdue} zamujenih</span>}
                </div>
              </div>
              {items.length > 0 && (
                <div className="mt-3 divide-y divide-neutral-100 border-t border-neutral-100">
                  {items.map((o) => (
                    <Link key={o.matter.id} href={`/zadeve/${o.matter.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-[#0D332B]">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{o.matter.client}</span>
                        <span className="text-neutral-500"> · {o.matter.title}</span>
                      </span>
                      {o.nextDeadline ? (
                        <NextBadge dueDate={o.nextDeadline.dueDate} />
                      ) : (
                        <span className="whitespace-nowrap text-xs text-neutral-400">ni rokov</span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function NextBadge({ dueDate }: { dueDate: string }) {
  const d = daysLeft(dueDate);
  const overdue = d < 0;
  const soon = d >= 0 && d <= 3;
  const cls = overdue ? "bg-red-100 text-red-700" : soon ? "bg-amber-100 text-amber-800" : "bg-neutral-100 text-neutral-600";
  return <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs ${cls}`}>{overdue ? `zamuda ${-d}d` : `čez ${d}d`}</span>;
}
