import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { PRACTICE_AREAS, type PracticeArea } from "@shared/schema";

export const radarRouter = Router();

const ok = (res: Response, data: unknown) => res.json({ success: true, data, error: null });

// Any authenticated user may read the radar feed. Optional `?area=` filter.
radarRouter.get("/", async (req: Request, res) => {
  const raw = typeof req.query.area === "string" ? req.query.area : undefined;
  const area = raw && (PRACTICE_AREAS as readonly string[]).includes(raw) ? (raw as PracticeArea) : undefined;
  ok(res, await storage.listRadarItems({ area, sinceDays: 120 }));
});
