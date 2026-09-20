import { storage } from "../storage";
import { config } from "../config";
import { deliver, type DeliverResult } from "../mail/gmail";
import { renderRadarDigest } from "../mail/templates";
import { pisrsApi, pisrsDailyScrape, iprsScrape, type RadarSourceItem } from "./sources";
import { gatherAndFilter, dedupeAgainst } from "./compute";

/**
 * Legislation radar job. Pulls newly published/upcoming SI legislation relevant
 * to Nina's practice areas, persists NEW items, and delivers a weekly digest
 * (draft/preview when autosend is off). Fully offline-safe: every source falls
 * back to `[]` on any failure, so the job never throws on a dead source.
 */
export async function runRadar(opts: { dry?: boolean } = {}): Promise<{
  found: number;
  new: number;
  autosend: boolean;
  delivery: DeliverResult | null;
  subject: string;
  preview?: string;
}> {
  const today = new Date();
  const toISO = today.toISOString().slice(0, 10);
  const weekly = config.radar.cadence.toLowerCase() === "weekly";
  const windowDays = weekly ? 7 : 1;
  const fromISO = new Date(today.getTime() - windowDays * 86_400_000).toISOString().slice(0, 10);

  // Gather from all sources — each is individually offline-safe.
  const [apiItems, scrapeItems, iprsItems] = await Promise.all([
    pisrsApi(fromISO, toISO),
    pisrsDailyScrape(fromISO, toISO),
    iprsScrape(),
  ]);

  const merged: RadarSourceItem[] = gatherAndFilter([...apiItems, ...scrapeItems, ...iprsItems]);

  // Dedup against what we already stored.
  const existing = await storage.listRadarItems();
  const existingKeys = new Set(existing.map((r) => r.dedupKey));
  const fresh = dedupeAgainst(merged, existingKeys);

  // Persist new items (unless a pure dry run just wants a preview — still persist
  // so the in-app page is populated; the killswitch only gates the EMAIL).
  const created = [];
  for (const it of fresh) {
    // Guard against a race/dup within a single run's persistence.
    if (await storage.getRadarItemByDedupKey(it.dedupKey)) continue;
    created.push(
      await storage.createRadarItem({
        dedupKey: it.dedupKey,
        area: it.area,
        title: it.title,
        source: it.source,
        url: it.url,
        summary: it.summary,
        publishedAt: it.publishedAt ? new Date(it.publishedAt) : undefined,
      }),
    );
  }

  // Digest = the items found in THIS window (newly created ones).
  const mail = renderRadarDigest({ items: created, toDate: toISO });
  const autosend = config.autosend.radar && !opts.dry;

  const delivery: DeliverResult = await deliver(
    { ...mail, to: [config.mail.digestTo], cc: config.mail.digestCc ? [config.mail.digestCc] : undefined },
    { autosend, account: config.mail.account, previewName: `radar-${toISO}` },
  );

  return {
    found: merged.length,
    new: created.length,
    autosend,
    delivery,
    subject: mail.subject,
    preview: delivery.previewPath,
  };
}
