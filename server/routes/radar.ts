import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { PRACTICE_AREAS, type PracticeArea } from "@shared/schema";
import { generateInsight, AiNotConfiguredError } from "../radar/summarize";

export const radarRouter = Router();

const ok = (res: Response, data: unknown) => res.json({ success: true, data, error: null });
const fail = (res: Response, status: number, error: string) =>
  res.status(status).json({ success: false, data: null, error });

// Any authenticated user may read the radar feed. Optional `?area=` filter.
radarRouter.get("/", async (req: Request, res) => {
  const raw = typeof req.query.area === "string" ? req.query.area : undefined;
  const area = raw && (PRACTICE_AREAS as readonly string[]).includes(raw) ? (raw as PracticeArea) : undefined;
  ok(res, await storage.listRadarItems({ area, sinceDays: 120 }));
});

// Single item incl. cached AI fields (for the detail page).
radarRouter.get("/:id", async (req: Request, res) => {
  const item = await storage.getRadarItem(req.params.id);
  if (!item) return fail(res, 404, "Zapis ne obstaja.");
  ok(res, item);
});

// Generate the AI insight on demand and cache it. If already generated, return
// the cached item. AI-not-configured or failure → friendly error, never a crash.
radarRouter.post("/:id/generate", async (req: Request, res) => {
  const item = await storage.getRadarItem(req.params.id);
  if (!item) return fail(res, 404, "Zapis ne obstaja.");

  // Cache hit — nothing to do.
  if (item.summaryTeam) return ok(res, item);

  try {
    const insight = await generateInsight(item);
    const updated = await storage.setRadarItemAi(item.id, {
      summaryTeam: insight.summaryTeam,
      newsletterText: insight.newsletterText,
      publishedAt: insight.publishedAt,
      aiGeneratedAt: new Date(),
    });
    ok(res, updated ?? item);
  } catch (e) {
    if (e instanceof AiNotConfiguredError) return fail(res, 503, e.message);
    return fail(res, 502, `Priprava AI povzetka ni uspela: ${(e as Error).message}`);
  }
});
