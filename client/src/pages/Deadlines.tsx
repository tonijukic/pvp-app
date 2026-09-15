import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAllDeadlines, fetchMatters, setDeadlineStatus } from "../lib/api";
import { daysLeft, SEVERITY_LABELS } from "../lib/format";
import { useTeam } from "../lib/team";
import { Assignee } from "../components/Assignee";
import type { Deadline } from "@shared/schema";

export function Deadlines() {
  const qc = useQueryClient();
  const { data: deadlines, isLoading } = useQuery({ queryKey: ["deadlines"], queryFn: fetchAllDeadlines });
  const { data: matters } = useQuery({ queryKey: ["matters"], queryFn: fetchMatters });
  const { nameOf } = useTeam();
  const matterOf = (id: string) => matters?.find((x) => x.id === id);
  const matterLabel = (id: string) => {
    const m = matterOf(id);
    return m ? `${m.client} — ${m.title}` : "";
  };

  const done = useMutation({
    mutationFn: (id: string) => setDeadlineStatus(id, "opravljen"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deadlines"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });

  if (isLoading) return <p className="text-neutral-500">Nalagam…</p>;
  const open = (deadlines ?? []).filter((d) => d.status === "odprt");
  const overdue = open.filter((d) => daysLeft(d.dueDate) < 0);
  const upcoming = open.filter((d) => daysLeft(d.dueDate) >= 0);

  const Row = (d: Deadline) => {
    const dl = daysLeft(d.dueDate);
    const m = matterOf(d.matterId);
    return (
      <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="font-medium">
            {d.title}
            {d.kind === "obveznost_stranke" && <span className="ml-2 rounded bg-[#C9A34A]/20 px-1.5 py-0.5 text-[11px] text-[#0D332B]">obveznost stranke</span>}
            {d.recurrence === "letni" && <span className="ml-1 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">letni</span>}
          </div>
          <div className="truncate text-sm text-neutral-500">{matterLabel(d.matterId)}</div>
          <div className="mt-1"><Assignee name={nameOf(m?.assignedTo)} size="xs" /></div>
        </div>
        <div className="flex items-center gap-3 text-right">
          <div className="text-sm">
            <div className="font-medium">{d.dueDate}</div>
            <div className={dl < 0 ? "text-red-600" : dl <= 3 ? "text-amber-700" : "text-neutral-400"}>
              {dl < 0 ? `zamuda ${-dl}d` : `čez ${dl}d`} · {SEVERITY_LABELS[d.severity]}
            </div>
          </div>
          <button onClick={() => done.mutate(d.id)} className="rounded border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50">
            ✓ opravljeno
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-[#0D332B]">Roki</h1>
      {!open.length && <p className="text-neutral-500">Ni odprtih rokov.</p>}
      {overdue.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-1 text-sm font-semibold text-red-700">Zamujeni</h2>
          <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-red-200 bg-white">{overdue.map(Row)}</div>
        </section>
      )}
      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-[#0D332B]">Prihajajoči</h2>
          <div className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">{upcoming.map(Row)}</div>
        </section>
      )}
    </div>
  );
}
