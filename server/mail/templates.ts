import { AREA_LABELS, SEVERITY_LABELS } from "@shared/labels";
import type { Cost, Deadline, Matter, TimeEntry } from "@shared/schema";
import { PRACTICE_AREAS, type PracticeArea } from "@shared/schema";

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

// --- Client matter mail (osnutek maila stranki) ----------------------------
// A draft TO THE CLIENT, composed of clearly-labelled, individually removable
// blocks (`<!-- SKLOP: ... -->` markers). Nina trims what doesn't fit.

export interface ClientMailInput {
  matter: Matter;
  time: TimeEntry[];
  costs: Cost[];
}

export function renderClientMatterMail(input: ClientMailInput) {
  const { matter, time, costs } = input;
  const hoursTotal = time.reduce((s, t) => s + Number(t.hours), 0);
  const costsTotal = costs.reduce((s, c) => s + Number(c.amount), 0);
  const included = matter.includedHours != null ? Number(matter.includedHours) : null;
  const overQuota = included != null ? Math.max(0, hoursTotal - included) : null;

  // Each block is a self-contained <div> wrapped in comment markers so Nina can
  // delete any one cleanly (from the SKLOP start comment to its end comment).
  const block = (name: string, inner: string) =>
    `<!-- SKLOP: ${name} -->\n<div style="margin:0 0 16px;">${inner}</div>\n<!-- /SKLOP: ${name} -->\n`;

  const h = (t: string) => `<div style="color:${GREEN};font-weight:600;font-size:15px;margin:0 0 6px;">${t}</div>`;

  // (1) Pozdrav
  const pozdrav = block("Pozdrav", `<p style="margin:0;">Spoštovani,</p>`);

  // (2) Povzetek naloge
  const povzetek = block(
    "Povzetek naloge",
    `${h("Povzetek")}<p style="margin:0;">Zadeva: <b>${escape(matter.title)}</b><br>Področje: ${AREA_LABELS[matter.area]}<br>Stranka: ${escape(matter.client)}</p>`,
  );

  // (3) Opravljeno delo
  const opravljenoRows = time.length
    ? `<ul style="margin:0;padding-left:18px;">${time
        .map((t) => `<li>${t.date} — ${escape(t.description)} (${Number(t.hours).toFixed(2)} h)</li>`)
        .join("")}</ul>`
    : `<p style="margin:0;color:#7a8580;">(ni vpisanih ur)</p>`;
  const opravljeno = block("Opravljeno delo", `${h("Opravljeno delo")}${opravljenoRows}`);

  // (4) Specifikacija ur
  const ureInner =
    matter.billingType === "pausal_ure" && included != null
      ? `<p style="margin:0;">Vključene ure (pavšal): <b>${included.toFixed(2)} h</b><br>Skupaj opravljeno: <b>${hoursTotal.toFixed(2)} h</b><br>Nad kvoto: <b>${(overQuota ?? 0).toFixed(2)} h</b>${
          matter.reducedRate != null ? ` × ${euro(Number(matter.reducedRate))}/h` : ""
        }</p>`
      : `<p style="margin:0;">Skupaj opravljeno: <b>${hoursTotal.toFixed(2)} h</b></p>`;
  const specifikacija = block("Specifikacija ur", `${h("Specifikacija ur")}${ureInner}`);

  // (5) Stroški
  const stroski = costs.length
    ? block(
        "Stroški",
        `${h("Stroški")}<ul style="margin:0;padding-left:18px;">${costs
          .map((c) => `<li>${c.date} — ${escape(c.description)}: ${euro(Number(c.amount))}</li>`)
          .join("")}</ul><p style="margin:6px 0 0;">Skupaj stroški: <b>${euro(costsTotal)}</b></p>`,
      )
    : "";

  // (6) Naslednji koraki
  const koraki = block(
    "Naslednji koraki",
    `${h("Naslednji koraki")}<p style="margin:0;color:#7a8580;">[Vpiši naslednje korake / kaj potrebujemo od stranke.]</p>`,
  );

  // (7) Zaključni pozdrav
  const zakljucek = block(
    "Zaključni pozdrav",
    `<p style="margin:0;">Lep pozdrav,<br><b>Nina Volgemut</b><br>Pravo v praksi</p>`,
  );

  const inner = pozdrav + povzetek + opravljeno + specifikacija + stroski + koraki + zakljucek;
  const html = layout("Osnutek maila stranki", inner);

  const plainLines = [
    "Spoštovani,",
    "",
    "POVZETEK",
    `Zadeva: ${matter.title}`,
    `Področje: ${AREA_LABELS[matter.area]}`,
    `Stranka: ${matter.client}`,
    "",
    "OPRAVLJENO DELO",
    ...(time.length
      ? time.map((t) => `- ${t.date} — ${t.description} (${Number(t.hours).toFixed(2)} h)`)
      : ["(ni vpisanih ur)"]),
    "",
    "SPECIFIKACIJA UR",
    ...(matter.billingType === "pausal_ure" && included != null
      ? [
          `Vključene ure (pavšal): ${included.toFixed(2)} h`,
          `Skupaj opravljeno: ${hoursTotal.toFixed(2)} h`,
          `Nad kvoto: ${(overQuota ?? 0).toFixed(2)} h`,
        ]
      : [`Skupaj opravljeno: ${hoursTotal.toFixed(2)} h`]),
    ...(costs.length
      ? ["", "STROŠKI", ...costs.map((c) => `- ${c.date} — ${c.description}: ${euro(Number(c.amount))}`), `Skupaj stroški: ${euro(costsTotal)}`]
      : []),
    "",
    "NASLEDNJI KORAKI",
    "[Vpiši naslednje korake / kaj potrebujemo od stranke.]",
    "",
    "Lep pozdrav,",
    "Nina Volgemut",
    "Pravo v praksi",
  ];

  return {
    subject: `${matter.client} — ${matter.title}`,
    html,
    plain: plainLines.join("\n"),
  };
}

// --- Legislation radar digest (Zakonodajni radar) --------------------------

/** Accepts stored radar items or freshly-gathered ones (only these fields used). */
export interface RadarDigestItem {
  area: PracticeArea;
  title: string;
  source: string;
  url?: string | null;
  summary?: string | null;
  publishedAt?: string | null;
}

export function renderRadarDigest(input: { items: RadarDigestItem[]; toDate: string }) {
  const { items, toDate } = input;

  const groups = PRACTICE_AREAS.map((area) => ({
    area,
    label: AREA_LABELS[area],
    items: items.filter((i) => i.area === area),
  })).filter((g) => g.items.length);

  const itemHtml = (i: RadarDigestItem) => {
    const titleHtml = i.url
      ? `<a href="${escape(i.url)}" style="color:${GREEN};font-weight:600;text-decoration:none;">${escape(i.title)}</a>`
      : `<span style="color:${GREEN};font-weight:600;">${escape(i.title)}</span>`;
    const meta = [i.source, i.publishedAt ?? ""].filter(Boolean).map(escape).join(" · ");
    return `
      <div style="padding:8px 0;border-bottom:1px solid #eee;">
        <div>${titleHtml}</div>
        <div style="color:#7a8580;font-size:12px;margin-top:2px;">${meta}</div>
        ${i.summary ? `<div style="color:#3a463f;font-size:13px;margin-top:4px;">${escape(i.summary)}</div>` : ""}
      </div>`;
  };

  const inner = groups.length
    ? groups
        .map(
          (g) => `
      <h3 style="color:${GREEN};font-size:15px;margin:18px 0 4px;">${escape(g.label)}</h3>
      ${g.items.map(itemHtml).join("")}`,
        )
        .join("")
    : `<p style="margin:0;color:#7a8580;">Ni novih relevantnih sprememb.</p>`;

  const html = layout("Zakonodajni radar", inner);

  const plain = groups.length
    ? [
        "ZAKONODAJNI RADAR",
        `Teden do ${toDate}`,
        "",
        ...groups.flatMap((g) => [
          g.label.toUpperCase(),
          ...g.items.map(
            (i) =>
              `- ${i.title}${i.publishedAt ? ` (${i.publishedAt})` : ""} — ${i.source}${i.url ? `\n    ${i.url}` : ""}${i.summary ? `\n    ${i.summary}` : ""}`,
          ),
          "",
        ]),
      ].join("\n")
    : ["ZAKONODAJNI RADAR", `Teden do ${toDate}`, "", "Ni novih relevantnih sprememb."].join("\n");

  return { subject: `Zakonodajni radar — teden do ${toDate}`, html, plain };
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
