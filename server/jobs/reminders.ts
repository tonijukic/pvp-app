import { storage } from "../storage";
import { config } from "../config";
import { deliver, type DeliverResult } from "../mail/gmail";
import { renderReminders, type ReminderItem } from "../mail/templates";

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso + "T00:00:00Z");
  const b = Date.parse(toIso + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

/**
 * Deadline reminders: open deadlines that are overdue, or due within their
 * `remindDaysBefore` window. Delivered per the autosend flag.
 */
export async function runReminders(opts: { dryRun?: boolean } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const [openDeadlines, matters] = await Promise.all([
    storage.listDeadlines({ status: "odprt" }),
    storage.listMatters(),
  ]);
  const matterById = new Map(matters.map((m) => [m.id, m]));

  const overdue: ReminderItem[] = [];
  const upcoming: ReminderItem[] = [];
  for (const d of openDeadlines) {
    const matter = matterById.get(d.matterId);
    if (!matter) continue;
    const daysLeft = daysBetween(today, d.dueDate);
    if (daysLeft < 0) overdue.push({ deadline: d, matter, daysLeft });
    else if (daysLeft <= d.remindDaysBefore) upcoming.push({ deadline: d, matter, daysLeft });
  }
  overdue.sort((a, b) => (a.deadline.dueDate < b.deadline.dueDate ? -1 : 1));
  upcoming.sort((a, b) => (a.deadline.dueDate < b.deadline.dueDate ? -1 : 1));

  const mail = renderReminders(upcoming, overdue);
  const autosend = config.autosend.reminders && !opts.dryRun;

  let delivery: DeliverResult | null = null;
  if (overdue.length || upcoming.length) {
    delivery = await deliver(
      { ...mail, to: [config.mail.digestTo], cc: config.mail.digestCc ? [config.mail.digestCc] : undefined },
      { autosend, account: config.mail.account, previewName: `reminders-${today}` },
    );
  }

  return {
    date: today,
    counts: { overdue: overdue.length, upcoming: upcoming.length },
    autosend,
    delivery,
    subject: mail.subject,
  };
}
