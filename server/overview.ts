import type { IStorage, MatterFilter } from "./storage";
import type { Matter } from "@shared/schema";

export interface MatterOverview {
  matter: Matter;
  hoursTotal: number;
  billableValue: number | null; // po_urah: hours×rate; pausal: flatFee
  costsTotal: number;
  openDeadlines: number;
  nextDeadline: { id: string; title: string; dueDate: string; severity: number } | null;
}

/** Per-matter roll-up: hours, billable value, costs, open/next deadline. */
export async function computeOverview(
  storage: IStorage,
  filter?: MatterFilter,
): Promise<MatterOverview[]> {
  const matters = await storage.listMatters(filter);
  const today = new Date().toISOString().slice(0, 10);

  const out: MatterOverview[] = [];
  for (const matter of matters) {
    const [time, deadlines] = await Promise.all([
      storage.listTimeEntries({ matterId: matter.id }),
      storage.listDeadlines({ matterId: matter.id }),
    ]);
    const costs = await storage.listCosts({ matterId: matter.id });

    const hoursTotal = time.reduce((s, t) => s + Number(t.hours), 0);
    const costsTotal = costs.reduce((s, c) => s + Number(c.amount), 0);

    let billableValue: number | null = null;
    if (matter.billingType === "pausal") {
      billableValue = matter.flatFee !== null ? Number(matter.flatFee) : null;
    } else if (matter.billingType === "pausal_ure") {
      // pavšal osnova (flatFee) + ure nad kvoto × znižana postavka
      const base = matter.flatFee !== null ? Number(matter.flatFee) : 0;
      const included = matter.includedHours !== null ? Number(matter.includedHours) : 0;
      const reduced = matter.reducedRate !== null ? Number(matter.reducedRate) : 0;
      billableValue = base + Math.max(0, hoursTotal - included) * reduced;
    } else if (matter.hourlyRate !== null) {
      billableValue = hoursTotal * Number(matter.hourlyRate);
    }

    const open = deadlines.filter((d) => d.status === "odprt");
    const upcoming = open
      .filter((d) => d.dueDate >= today)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    const next = upcoming[0] ?? null;

    out.push({
      matter,
      hoursTotal: Math.round(hoursTotal * 100) / 100,
      billableValue: billableValue === null ? null : Math.round(billableValue * 100) / 100,
      costsTotal: Math.round(costsTotal * 100) / 100,
      openDeadlines: open.length,
      nextDeadline: next
        ? { id: next.id, title: next.title, dueDate: next.dueDate, severity: next.severity }
        : null,
    });
  }
  return out;
}
