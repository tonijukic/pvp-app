import { config } from "../config";
import type { PracticeArea } from "@shared/schema";

/**
 * Radar sources — pluggable, OFFLINE-SAFE adapters. Each adapter is wrapped so
 * that ANY network/parse error resolves to `[]`. A dead or unreachable source
 * must never throw and never break the job (or `pnpm check`/tests).
 *
 * Normalized item shape shared by every adapter:
 */
export interface RadarSourceItem {
  dedupKey: string;
  area: PracticeArea;
  title: string;
  source: string;
  url?: string;
  summary?: string;
  publishedAt?: string; // ISO date (YYYY-MM-DD)
}

// ---------------------------------------------------------------------------
// Keyword classifier — maps a title (+summary) to one of Nina's practice areas.
// First matching group wins; falls back to "drugo".
// ---------------------------------------------------------------------------

const AREA_KEYWORDS: { area: PracticeArea; needles: string[] }[] = [
  { area: "delovno_pravo", needles: ["zdr-1", "delovn", "zaposlit"] },
  { area: "javni_usluzbenci", needles: ["zju", "javni uslužben", "javni usluzben", "plačni razred", "placni razred", "napredovanj"] },
  { area: "javna_narocila", needles: ["zjn-3", "javno naročil", "javno narocil", "dkom", "razpis"] },
  { area: "gdpr", needles: ["zvop-2", "varstvo osebnih podatkov", "gdpr", "pooblaščen", "pooblascen"] },
  { area: "ijz", needles: ["zdijz", "dostop do informacij", "informacij javnega"] },
  { area: "obligacije", needles: ["oz", "pogodb", "obligacij", "odškodnin", "odskodnin"] },
];

export function classifyArea(text: string): PracticeArea {
  const t = (text ?? "").toLowerCase();
  for (const { area, needles } of AREA_KEYWORDS) {
    for (const n of needles) {
      // "oz" and "zju" etc. are short — match as whole-ish tokens to avoid noise.
      if (n.length <= 3) {
        if (new RegExp(`(^|[^a-zčšž])${n}([^a-zčšž]|$)`, "i").test(t)) return area;
      } else if (t.includes(n)) {
        return area;
      }
    }
  }
  return "drugo";
}

// ---------------------------------------------------------------------------
// Small fetch helper — bounded timeout, returns undefined on any failure.
// ---------------------------------------------------------------------------

async function safeFetchText(
  url: string,
  init?: RequestInit,
  timeoutMs = 12_000,
): Promise<string | undefined> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      if (!res.ok) return undefined;
      return await res.text();
    } finally {
      clearTimeout(t);
    }
  } catch {
    return undefined;
  }
}

async function safeFetchJson<T>(url: string, init?: RequestInit): Promise<T | undefined> {
  const text = await safeFetchText(url, init);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function eachDay(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const start = Date.parse(fromISO + "T00:00:00Z");
  const end = Date.parse(toISO + "T00:00:00Z");
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return out;
  for (let d = start; d <= end; d += 86_400_000) {
    out.push(new Date(d).toISOString().slice(0, 10));
    if (out.length > 400) break; // hard guard against pathological ranges
  }
  return out;
}

// ---------------------------------------------------------------------------
// (1) PISRS official API — PRIMARY source once a key exists.
//     Only runs when config.radar.pisrsApiKey is set.
// ---------------------------------------------------------------------------

interface PisrsApiRecord {
  id?: string | number;
  idPredpisa?: string | number;
  naslov?: string;
  kratica?: string;
  povzetek?: string;
  datumObjave?: string;
  url?: string;
  [k: string]: unknown;
}
interface PisrsApiPage {
  data?: PisrsApiRecord[];
  vsebina?: PisrsApiRecord[];
  content?: PisrsApiRecord[];
  totalPages?: number;
  [k: string]: unknown;
}

const PISRS_API_BASE = "https://pisrs.si/extapi";

function mapPisrsRecord(rec: PisrsApiRecord, source: string): RadarSourceItem | undefined {
  const title = (rec.naslov ?? rec.kratica ?? "").toString().trim();
  if (!title) return undefined;
  const externalId = (rec.idPredpisa ?? rec.id ?? rec.url ?? title).toString();
  const summary = rec.povzetek ? String(rec.povzetek) : undefined;
  const publishedAt =
    typeof rec.datumObjave === "string" && /^\d{4}-\d{2}-\d{2}/.test(rec.datumObjave)
      ? rec.datumObjave.slice(0, 10)
      : undefined;
  return {
    dedupKey: `${source}:${externalId}`,
    area: classifyArea(`${title} ${summary ?? ""}`),
    title,
    source,
    url: typeof rec.url === "string" ? rec.url : undefined,
    summary,
    publishedAt,
  };
}

async function pisrsApiEndpoint(
  endpoint: string,
  source: string,
  fromISO: string,
  toISO: string,
): Promise<RadarSourceItem[]> {
  const key = config.radar.pisrsApiKey;
  if (!key) return [];
  const items: RadarSourceItem[] = [];
  const pageSize = 1000;
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({
      datumObjaveOd: fromISO,
      datumObjaveDo: toISO,
      page: String(page),
      pageSize: String(pageSize),
    });
    const json = await safeFetchJson<PisrsApiPage>(`${PISRS_API_BASE}${endpoint}?${qs.toString()}`, {
      headers: { "X-API-Key": key, Accept: "application/json" },
    });
    if (!json) break;
    const records = json.data ?? json.vsebina ?? json.content ?? [];
    if (!Array.isArray(records) || records.length === 0) break;
    for (const rec of records) {
      const it = mapPisrsRecord(rec, source);
      if (it) items.push(it);
    }
    const totalPages = typeof json.totalPages === "number" ? json.totalPages : undefined;
    if (records.length < pageSize) break;
    if (totalPages !== undefined && page + 1 >= totalPages) break;
  }
  return items;
}

/** PISRS official API: register of regulations + regulations in preparation. */
export async function pisrsApi(fromISO: string, toISO: string): Promise<RadarSourceItem[]> {
  try {
    if (!config.radar.pisrsApiKey) return [];
    const [register, priprava] = await Promise.all([
      pisrsApiEndpoint("/predpis/register-predpisov", "PISRS-API", fromISO, toISO),
      pisrsApiEndpoint("/predpis/predpisi-v-pripravi", "PISRS-API", fromISO, toISO),
    ]);
    return [...register, ...priprava];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// (2) PISRS daily public view — no-key interim scrape.
//     Best-effort parse of the daily "Uradni list" issue page per day.
// ---------------------------------------------------------------------------

const PISRS_DAILY_BASE = "https://pisrs.si/dnevni-prikaz-izdaj-uradnega-lista";

function parseDailyAnchors(html: string, day: string): RadarSourceItem[] {
  const items: RadarSourceItem[] = [];
  const seen = new Set<string>();
  // Grab anchors; keep only ones whose text looks like a regulation title.
  const anchorRe = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    const title = m[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (title.length < 8) continue;
    // Heuristic: a regulation title usually starts with a capitalized legal noun.
    if (!/^(Zakon|Uredba|Pravilnik|Odlok|Sklep|Odločba|Odredba|Navodilo|Kolektivna)/i.test(title)) continue;
    if (seen.has(title)) continue;
    seen.add(title);
    const url = href.startsWith("http") ? href : `https://pisrs.si${href.startsWith("/") ? "" : "/"}${href}`;
    items.push({
      dedupKey: `PISRS:${day}:${title}`,
      area: classifyArea(title),
      title,
      source: "PISRS",
      url,
      publishedAt: day,
    });
  }
  return items;
}

/** No-key interim: fetch the public daily view for each day in the range. */
export async function pisrsDailyScrape(fromISO: string, toISO: string): Promise<RadarSourceItem[]> {
  try {
    const days = eachDay(fromISO, toISO);
    const out: RadarSourceItem[] = [];
    for (const day of days) {
      const html = await safeFetchText(`${PISRS_DAILY_BASE}?datumObjave=${day}`);
      if (!html) continue;
      out.push(...parseDailyAnchors(html, day));
    }
    return out;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// (3) IP-RS — Information Commissioner GDPR/IJZ opinions listing (best-effort).
// ---------------------------------------------------------------------------

const IPRS_URL = "https://www.ip-rs.si/mnenja-gdpr";

/** Best-effort scrape of the Information Commissioner opinions listing. */
export async function iprsScrape(): Promise<RadarSourceItem[]> {
  try {
    const html = await safeFetchText(IPRS_URL);
    if (!html) return [];
    const items: RadarSourceItem[] = [];
    const seen = new Set<string>();
    const anchorRe = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = anchorRe.exec(html)) !== null) {
      const href = m[1];
      const title = m[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (title.length < 12) continue;
      // Opinion links on IP-RS point at mnenje/mnenja detail pages.
      if (!/mnenj/i.test(href) && !/mnenj/i.test(title)) continue;
      if (seen.has(title)) continue;
      seen.add(title);
      const url = href.startsWith("http") ? href : `https://www.ip-rs.si${href.startsWith("/") ? "" : "/"}${href}`;
      items.push({
        dedupKey: `IP-RS:${url}`,
        // IP-RS opinions cover GDPR and IJZ; classify from the title, default gdpr.
        area: (() => {
          const a = classifyArea(title);
          return a === "drugo" ? "gdpr" : a;
        })(),
        title,
        source: "IP-RS",
        url,
      });
    }
    return items;
  } catch {
    return [];
  }
}
