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
  const from = `${month}-01`;
  const to = `${month}-31`;

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

    let billable: number | null = null;
    if (matter.billingType === "pausal") billable = matter.flatFee !== null ? Number(matter.flatFee) : null;
    else if (matter.hourlyRate !== null) billable = hours * Number(matter.hourlyRate);

    rows.push({
      matter,
      hours: Math.round(hours * 100) / 100,
      billable: billable === null ? null : Math.round(billable * 100) / 100,
      costs: Math.round(costsTotal * 100) / 100,
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
