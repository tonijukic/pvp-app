import { AREA_LABELS, SEVERITY_LABELS } from "@shared/labels";
import type { Deadline, Matter } from "@shared/schema";

const GREEN = "#0D332B";
const GOLD = "#C9A34A";

function layout(title: string, inner: string): string {
  return `<!doctype html><html lang="sl"><body style="margin:0;background:#f4f6f4;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1e2825;">
  <div style="max-width:620px;margin:0 auto;">
    <div style="background:${GREEN};padding:22px 26px;">
      <div style="letter-spacing:.28em;color:${GOLD};font-size:13px;">PRAVO V PRAKSI</div>
      <div style="color:#fff;font-size:20px;font-weight:600;margin-top:6px;">${title}</div>
    </div>
    <div style="height:3px;background:${GOLD};"></div>
    <div style="padding:22px 26px;background:#fff;">${inner}</div>
    <div style="padding:16px 26px;color:#7a8580;font-size:12px;">
      PVP Ops · osnutek za pregled · nina@pravovpraksi.si
    </div>
  </div></body></html>`;
}

const euro = (n: number) => `${n.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// --- Deadline reminders ----------------------------------------------------

export interface ReminderItem {
  deadline: Deadline;
  matter: Matter;
  daysLeft: number;
}

export function renderReminders(upcoming: ReminderItem[], overdue: ReminderItem[]) {
  const obligationTag = (it: ReminderItem) =>
    it.deadline.kind === "obveznost_stranke"
      ? ` <span style="background:${GOLD};color:${GREEN};font-size:11px;font-weight:600;border-radius:4px;padding:1px 6px;">obveznost stranke</span>`
      : "";

  const row = (it: ReminderItem) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;">
        <div style="font-weight:600;">${escape(it.deadline.title)}${obligationTag(it)}</div>
        <div style="color:#7a8580;font-size:13px;">${escape(it.matter.client)} — ${escape(it.matter.title)}</div>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
        <div style="font-weight:600;">${it.deadline.dueDate}</div>
        <div style="color:#7a8580;font-size:13px;">${
          it.daysLeft < 0 ? `zamuda ${-it.daysLeft} dni` : `čez ${it.daysLeft} dni`
        } · ${SEVERITY_LABELS[it.deadline.severity] ?? ""}</div>
      </td>
    </tr>`;

  const section = (label: string, items: ReminderItem[]) =>
    items.length
      ? `<h3 style="color:${GREEN};font-size:15px;margin:18px 0 4px;">${label}</h3>
         <table style="width:100%;border-collapse:collapse;">${items.map(row).join("")}</table>`
      : "";

  const inner =
    (overdue.length || upcoming.length
      ? section("Zamujeni roki", overdue) + section("Prihajajoči roki", upcoming)
      : `<p>Ni odprtih rokov v oknu opominjanja. 👍</p>`);

  const html = layout("Pregled rokov", inner);

  const plain = [
    "PREGLED ROKOV",
    "",
    ...(overdue.length ? ["ZAMUJENI:", ...overdue.map((i) => `- ${i.deadline.dueDate}  ${i.deadline.title} (${i.matter.client})`)] : []),
    ...(upcoming.length ? ["", "PRIHAJAJOČI:", ...upcoming.map((i) => `- ${i.deadline.dueDate}  ${i.deadline.title} (${i.matter.client}) — čez ${i.daysLeft} dni`)] : []),
    ...(!overdue.length && !upcoming.length ? ["Ni odprtih rokov v oknu opominjanja."] : []),
  ].join("\n");

  const subject = overdue.length
    ? `Roki: ${overdue.length} zamujenih, ${upcoming.length} prihajajočih`
    : `Prihajajoči roki: ${upcoming.length}`;

  return { subject, html, plain };
}

// --- Monthly summary -------------------------------------------------------

export interface SummaryRow {
  matter: Matter;
  hours: number;
  byUser: { name: string; hours: number }[];
  billable: number | null;
  costs: number;
}

export function renderSummary(month: string, rows: SummaryRow[]) {
  const perUserLine = (r: SummaryRow) =>
    r.byUser.length
      ? `<div style="color:#7a8580;font-size:13px;margin-top:2px;">${r.byUser
          .map((u) => `${escape(u.name)}: ${u.hours.toFixed(2)} h`)
          .join(" · ")}</div>`
      : "";

  const body = rows
    .map(
      (r) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #eee;">
        <div style="font-weight:600;">${escape(r.matter.client)}</div>
        <div style="color:#7a8580;font-size:13px;">${escape(r.matter.title)} · ${AREA_LABELS[r.matter.area]}</div>
        ${perUserLine(r)}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
        <div>${r.hours.toFixed(2)} h${r.matter.billingType === "pausal" ? " · pavšal" : ""}</div>
        <div style="font-weight:600;">${r.billable === null ? "—" : euro(r.billable)}</div>
        ${r.costs ? `<div style="color:#7a8580;font-size:13px;">+ stroški ${euro(r.costs)}</div>` : ""}
      </td>
    </tr>`,
    )
    .join("");

  const totalBillable = rows.reduce((s, r) => s + (r.billable ?? 0), 0);
  const totalCosts = rows.reduce((s, r) => s + r.costs, 0);

  // Grand total of hours per collaborator across all matters (basis for paying them).
  const perUserTotals = new Map<string, number>();
  for (const r of rows) for (const u of r.byUser) perUserTotals.set(u.name, (perUserTotals.get(u.name) ?? 0) + u.hours);
  const userTotals = [...perUserTotals.entries()].sort((a, b) => b[1] - a[1]);
  const userTotalsHtml = userTotals.length
    ? `<h3 style="color:${GREEN};font-size:15px;margin:18px 0 4px;">Ure po sodelavkah</h3>
       <table style="width:100%;border-collapse:collapse;">${userTotals
         .map(
           ([name, h]) =>
             `<tr><td style="padding:6px 0;border-bottom:1px solid #eee;">${escape(name)}</td>
              <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${h.toFixed(2)} h</td></tr>`,
         )
         .join("")}</table>`
    : "";

  const inner = `
    <p style="margin:0 0 10px;color:#7a8580;">Mesec: <b style="color:${GREEN};">${month}</b> · osnova za račun.</p>
    <table style="width:100%;border-collapse:collapse;">${body || `<tr><td>Ni zapisov za ta mesec.</td></tr>`}</table>
    ${userTotalsHtml}
    <div style="margin-top:14px;text-align:right;">
      <div>Skupaj obračunljivo: <b>${euro(totalBillable)}</b></div>
      ${totalCosts ? `<div style="color:#7a8580;">Stroški: ${euro(totalCosts)}</div>` : ""}
    </div>
    <p style="margin:14px 0 0;color:#7a8580;font-size:12px;">Ure sodelavk so osnova za njihovo plačilo; končni obračunski čas storitve vključuje še tvoj čas pregleda in dopolnitev.</p>`;

  const html = layout("Mesečni pregled ur in stroškov", inner);

  const plain = [
    `MESEČNI PREGLED — ${month}`,
    "",
    ...rows.map(
      (r) =>
        `- ${r.matter.client} / ${r.matter.title}: ${r.hours.toFixed(2)} h — ${
          r.billable === null ? "—" : euro(r.billable)
        }${r.costs ? ` (+ stroški ${euro(r.costs)})` : ""}${
          r.byUser.length ? `\n    (${r.byUser.map((u) => `${u.name}: ${u.hours.toFixed(2)} h`).join(", ")})` : ""
        }`,
    ),
    ...(userTotals.length ? ["", "URE PO SODELAVKAH:", ...userTotals.map(([n, h]) => `- ${n}: ${h.toFixed(2)} h`)] : []),
    "",
    `Skupaj obračunljivo: ${euro(totalBillable)}`,
  ].join("\n");

  return { subject: `Mesečni pregled ur in stroškov — ${month}`, html, plain };
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
