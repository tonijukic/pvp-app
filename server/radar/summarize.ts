import { config } from "../config";
import { safeFetchText } from "./sources";
import { AREA_LABELS } from "@shared/labels";
import type { RadarItem } from "@shared/schema";

/**
 * On-demand radar insight generator. For a single radar item it produces two
 * Slovenian texts for Nina Volgemut's practice "Pravo v praksi":
 *   - summaryTeam    — "Povzetek za ekipo": a business-tuned brief that pins the
 *                       parts relevant to her practice (obligations, deadlines,
 *                       risks, changes) and points to the source for the rest.
 *   - newsletterText — "Za obvestilnik": a publish-ready paragraph in Nina's
 *                       voice for her newsletter / LinkedIn.
 *
 * Raw HTTP to the Anthropic Messages API (no SDK), mirroring matej-app's reader.
 * OFFLINE-SAFE: when no API key is set it throws AiNotConfiguredError (the route
 * turns it into a friendly 503); any network error throws a typed error too.
 * The process is never crashed.
 */

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_ARTICLE_CHARS = 8000;

/** Thrown when config.ai.apiKey is empty — the route answers 503 (not a crash). */
export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI ni nastavljen (manjka PVP_ANTHROPIC_KEY oz. ANTHROPIC_API_KEY).");
    this.name = "AiNotConfiguredError";
  }
}

/** Thrown on any generation failure (network, non-OK, empty reply). */
export class AiGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiGenerationError";
  }
}

export function aiConfigured(): boolean {
  return Boolean(config.ai.apiKey);
}

export interface RadarInsight {
  summaryTeam: string;
  newsletterText: string;
  publishedAt: string | null;
}

interface AnthropicTextBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content?: AnthropicTextBlock[];
  stop_reason?: string;
}

/** Strip HTML → plain text, collapse whitespace, cap length. Best-effort. */
function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ARTICLE_CHARS);
}

/**
 * Extract the first complete JSON object from the model's reply (brace-balanced,
 * string/escape aware). Ignores prose the model may append. Mirrors matej reader.
 */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  if (start === -1) throw new Error("Odgovor ne vsebuje JSON-a");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return body.slice(start, i + 1);
  }
  throw new Error("Odgovor ne vsebuje veljavnega JSON objekta");
}

const SYSTEM = [
  "Si pravni vsebinski analitik za slovensko pravno-svetovalno prakso 'Pravo v praksi', ki jo vodi Nina Volgemut.",
  "POMEMBNO: Nina NI vpisana odvetnica. Vedno jo naslavljaj kot 'pravnica' oz. 'pravna svetovalka' — NIKOLI 'odvetnica'.",
  "Področja prakse: javna naročila, varstvo osebnih podatkov / zunanji DPO, delovno in kadrovsko pravo,",
  "javnouslužbenski sistem, skladnost poslovanja / interni akti, civilno (obligacijsko) pravo.",
  "Blagovna znamka: temno smrekovo zelena in zlata, slogan 'Zaupanja vredni'. Ton: strokoven, jasen, brez marketinške vate.",
  "Obvestilnik je Ninin newsletter/bilten (e-pošta + LinkedIn), s katerim strankam in sledilcem sporoča pravne novosti,",
  "gradi zaupanje in pridobiva stranke.",
  "",
  "Za priloženo zakonodajno/pravno novico vrni IZKLJUČNO en JSON objekt, brez razlage, brez markdown ograje, s polji:",
  "  summaryTeam (string): 'Povzetek za ekipo' — v slovenščini natančno razloži dele, ki so pomembni za Ninino prakso",
  "    (konkretne obveznosti, roki, tveganja, spremembe, ki vplivajo na svetovanje strankam na zgornjih področjih).",
  "    Ostalo le na kratko omeni, da obstaja v izvirniku, in povabi k odprtju povezave za podrobnosti. Brez vate.",
  "  newsletterText (string): 'Za obvestilnik' — en kratek odstavek, pripravljen za objavo, v Nininem glasu (pravnica /",
  "    pravna svetovalka, nikoli odvetnica), praktičen, gradi zaupanje, jasno pove zakaj je to pomembno za stranke.",
  "  publishedAt (string 'YYYY-MM-DD' ali null): datum objave/uveljavitve, če je razviden iz besedila; sicer null.",
  "Če je besedila malo, naredi krajši, a še vedno uporaben povzetek na podlagi naslova in področja.",
].join("\n");

/** Generate the two insight texts for a radar item. Throws typed errors. */
export async function generateInsight(item: RadarItem): Promise<RadarInsight> {
  if (!config.ai.apiKey) throw new AiNotConfiguredError();

  // Best-effort article fetch (offline-safe). If it yields little, we proceed
  // with just the title + area — the summary will simply be shorter.
  let articleText = "";
  if (item.url) {
    const html = await safeFetchText(item.url);
    if (html) articleText = htmlToText(html);
  }

  const areaLabel = AREA_LABELS[item.area] ?? item.area;
  const userText = [
    `Naslov: ${item.title}`,
    `Področje: ${areaLabel}`,
    `Vir: ${item.source}`,
    item.url ? `Povezava: ${item.url}` : "",
    item.publishedAt ? `Datum objave (znano): ${item.publishedAt}` : "",
    item.summary ? `Kratek povzetek vira: ${item.summary}` : "",
    articleText ? `\nBesedilo članka (skrajšano):\n${articleText}` : "\n(Besedila članka ni bilo mogoče pridobiti.)",
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    model: config.ai.model,
    max_tokens: 1200,
    system: SYSTEM,
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
  };

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.ai.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AiGenerationError(`Klic na Anthropic ni uspel: ${(e as Error).message}`);
  }

  if (!res.ok) {
    throw new AiGenerationError(`Anthropic ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const json = (await res.json().catch(() => ({}))) as AnthropicResponse;
  const text = (json.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
  if (!text) throw new AiGenerationError("AI ni vrnil besedila.");

  // Parse defensively — on failure, fall back to the whole text in summaryTeam.
  try {
    const parsed = JSON.parse(extractJson(text)) as {
      summaryTeam?: unknown;
      newsletterText?: unknown;
      publishedAt?: unknown;
    };
    const publishedAt =
      typeof parsed.publishedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.publishedAt)
        ? parsed.publishedAt
        : null;
    return {
      summaryTeam: typeof parsed.summaryTeam === "string" ? parsed.summaryTeam.trim() : text.trim(),
      newsletterText: typeof parsed.newsletterText === "string" ? parsed.newsletterText.trim() : "",
      publishedAt,
    };
  } catch {
    return { summaryTeam: text.trim(), newsletterText: "", publishedAt: null };
  }
}
