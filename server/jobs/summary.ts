import { storage } from "../storage";
import { config } from "../config";
import { deliver, type DeliverResult } from "../mail/gmail";
import { renderSummary, type SummaryRow } from "../mail/templates";

function prevMonth(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7); // YYYY-MM
}

/**
 * Monthly per-matter roll-up (hours × rate, or flat fee, + costs) — the basis
 * for invoicing. `month` defaults to the previous calendar month.
 */
export async function runSummary(opts: { month?: string; dryRun?: boolean } = {}) {
  const month = opts.month ?? prevMonth();
  const [my, mm] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(my, mm, 0)).getUTCDate(); // valid last day (30/31/28/29)
  const from = `${month}-01`;
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;

  // Resolve a time entry's userId (= username) to a human name for the
  // per-collaborator breakdown Nina asked for (each person's hours must be
  // visible so she can pay them; her own review time shows as her own line).
  const users = await storage.listUsers();
  const nameOf = (userId: string | null): string => {
    if (!userId) return "Nerazporejeno";
    return users.find((u) => u.username === userId)?.displayName ?? userId;
  };
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const matters = await storage.listMatters();
  const rows: SummaryRow[] = [];
  for (const matter of matters) {
    const [time, costs] = await Promise.all([
      storage.listTimeEntries({ matterId: matter.id, from, to }),
      storage.listCosts({ matterId: matter.id, from, to }),
    ]);
    const hours = time.reduce((s, t) => s + Number(t.hours), 0);
    const costsTotal = costs.reduce((s, c) => s + Number(c.amount), 0);
    if (hours === 0 && costsTotal === 0 && matter.billingType !== "pausal") continue;

    // Hours broken down per collaborator.
    const perUser = new Map<string, number>();
    for (const t of time) {
      const name = nameOf(t.userId);
      perUser.set(name, (perUser.get(name) ?? 0) + Number(t.hours));
    }
    const byUser = [...perUser.entries()]
      .map(([name, h]) => ({ name, hours: round2(h) }))
      .sort((a, b) => b.hours - a.hours);

    let billable: number | null = null;
    if (matter.billingType === "pausal") billable = matter.flatFee !== null ? Number(matter.flatFee) : null;
    else if (matter.hourlyRate !== null) billable = hours * Number(matter.hourlyRate);

    rows.push({
      matter,
      hours: round2(hours),
      byUser,
      billable: billable === null ? null : round2(billable),
      costs: round2(costsTotal),
    });
  }

  const mail = renderSummary(month, rows);
  const autosend = config.autosend.reminders && !opts.dryRun;
  const delivery: DeliverResult = await deliver(
    { ...mail, to: [config.mail.digestTo], cc: config.mail.digestCc ? [config.mail.digestCc] : undefined },
    { autosend, account: config.mail.account, previewName: `summary-${month}` },
  );

  return { month, matters: rows.length, autosend, delivery, subject: mail.subject };
}
