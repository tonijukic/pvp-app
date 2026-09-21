import type { AppRole } from "@shared/schema";

/**
 * Central runtime config. Values are read lazily from the environment so that
 * unit tests and in-memory local runs need no external services.
 *
 * Env is loaded by the `dev` script via `tsx --env-file=.env` (Node native),
 * or injected by the host (Render/Docker) in production. No dotenv package.
 */

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function bool(name: string): boolean {
  return env(name).toLowerCase() === "true";
}

export const config = {
  nodeEnv: env("NODE_ENV", "development"),
  databaseUrl: env("DATABASE_URL") || env("PVP_DATABASE_URL"),
  cookieSecure: bool("COOKIE_SECURE"),

  auth: {
    sessionSecret: env("SESSION_SECRET", "pvp-dev-secret-change-me"),
    // Break-glass admin (Nina). Not in the DB — can never be locked out.
    adminUser: env("PVP_ADMIN_USER", "nina"),
    adminPassword: env("PVP_ADMIN_PASS", "changeme"),
    adminEmail: env("PVP_ADMIN_EMAIL", "nina@pravovpraksi.si"),
    adminName: env("PVP_ADMIN_NAME", "Nina"),
  },

  mail: {
    // Which Gmail refresh token to send/draft from. Prototype: Toni's personal
    // account (drafts only). Go-live: Nina's own token.
    account: env("PVP_MAIL_ACCOUNT", "personal"),
    digestTo: env("PVP_DIGEST_TO", "nina@pravovpraksi.si"),
    digestCc: env("PVP_DIGEST_CC", "toni.jukic@gmail.com"),
  },

  // Killswitches — OFF by default (mirror NURTURE_AUTOSEND / REMINDERS_AUTOSEND).
  // When false, jobs produce Gmail drafts + HTML previews instead of sending.
  autosend: {
    reminders: bool("PVP_REMINDERS_AUTOSEND"),
    radar: bool("PVP_RADAR_AUTOSEND"),
  },

  radar: {
    cadence: env("PVP_RADAR_CADENCE", "weekly"),
    pisrsApiKey: env("PISRS_API_KEY"),
  },

  // Claude API for on-demand radar insights (Povzetek za ekipo + Za obvestilnik).
  // PoC reuses F45's Anthropic key; production = Nina's own account later.
  // Empty key → generation is "not configured" and the UI shows a placeholder.
  ai: {
    apiKey: env("PVP_ANTHROPIC_KEY") || env("ANTHROPIC_API_KEY"),
    model: env("PVP_AI_MODEL", "claude-sonnet-4-6"),
  },

  port: parseInt(env("PORT", "5173"), 10),
};

/** Role ranking for `requireRole`. */
export const ROLE_RANK: Record<AppRole, number> = { member: 1, admin: 2 };
