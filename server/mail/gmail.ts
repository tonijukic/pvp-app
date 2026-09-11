import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config";

/**
 * Gmail sender/drafter for PVP. Multi-account (personal / bezigrad / nina),
 * multipart HTML+plain. `deliver()` respects the autosend killswitch:
 *   autosend=false → write an HTML preview + (best-effort) a Gmail draft
 *   autosend=true  → send the message
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const DRAFT_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";

const FROM: Record<string, string> = {
  personal: "Toni Jukić <toni.jukic@gmail.com>",
  bezigrad: "F45 Bežigrad <bezigrad@f45training.si>",
  nina: "Nina | Pravo v praksi <nina@pravovpraksi.si>",
};

function refreshTokenFor(account: string): string | undefined {
  return process.env[`GMAIL_REFRESH_TOKEN_${account.toUpperCase()}`];
}

export function hasCreds(account = config.mail.account): boolean {
  return Boolean(
    process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && refreshTokenFor(account),
  );
}

async function accessToken(account: string): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = refreshTokenFor(account);
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`Gmail creds missing for account '${account}'`);
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail token ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Gmail token: no access_token");
  return json.access_token;
}

function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

export function buildRawMessage(
  to: string[],
  subject: string,
  html: string,
  plain: string,
  from: string,
  cc?: string[],
): string {
  const boundary = "pvp_boundary_mixed";
  const ccClean = (cc ?? []).map((e) => e.trim()).filter(Boolean);
  const mime = [
    `From: ${from}`,
    `To: ${to.join(", ")}`,
    ...(ccClean.length ? [`Cc: ${ccClean.join(", ")}`] : []),
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(plain, "utf8").toString("base64"),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

export interface Mail {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  plain: string;
}

async function post(url: string, account: string, raw: string, wrap: "send" | "draft") {
  const token = await accessToken(account);
  const body = wrap === "send" ? { raw } : { message: { raw } };
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gmail ${wrap} ${res.status}: ${await res.text()}`);
}

export interface DeliverResult {
  mode: "sent" | "draft" | "preview";
  previewPath?: string;
  note?: string;
}

const PREVIEW_DIR = path.resolve(process.cwd(), ".previews");

/** Send or draft, per the autosend flag. Always writes a preview when not sending. */
export async function deliver(
  mail: Mail,
  opts: { autosend: boolean; account?: string; previewName: string },
): Promise<DeliverResult> {
  const account = opts.account ?? config.mail.account;
  const from = FROM[account] ?? FROM.personal;
  const raw = buildRawMessage(mail.to, mail.subject, mail.html, mail.plain, from, mail.cc);

  if (opts.autosend) {
    await post(SEND_URL, account, raw, "send");
    return { mode: "sent" };
  }

  // Not autosend → write a preview file, and best-effort create a Gmail draft.
  await mkdir(PREVIEW_DIR, { recursive: true });
  const previewPath = path.join(PREVIEW_DIR, `${opts.previewName}.html`);
  await writeFile(previewPath, mail.html, "utf8");

  if (hasCreds(account)) {
    try {
      await post(DRAFT_URL, account, raw, "draft");
      return { mode: "draft", previewPath };
    } catch (err) {
      return { mode: "preview", previewPath, note: `draft failed: ${(err as Error).message}` };
    }
  }
  return { mode: "preview", previewPath, note: "no Gmail creds — preview only" };
}
