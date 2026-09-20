import type { RadarSourceItem } from "./sources";

/**
 * Pure, offline-testable radar computation helpers.
 *
 * Every source item already carries a practice `area` (assigned by the source
 * adapter's `classifyArea`). Items classified "drugo" are still kept — they may
 * be broadly relevant and are grouped under "Drugo" in the digest.
 */

/** Dedup a single batch by `dedupKey` (first occurrence wins). */
export function gatherAndFilter(items: RadarSourceItem[]): RadarSourceItem[] {
  const seen = new Set<string>();
  const out: RadarSourceItem[] = [];
  for (const it of items) {
    if (!it || !it.dedupKey) continue;
    if (seen.has(it.dedupKey)) continue;
    seen.add(it.dedupKey);
    out.push(it);
  }
  return out;
}

/** Keep only items whose `dedupKey` is not already stored. Pure. */
export function dedupeAgainst(
  items: RadarSourceItem[],
  existingKeys: Set<string>,
): RadarSourceItem[] {
  return items.filter((it) => !existingKeys.has(it.dedupKey));
}
