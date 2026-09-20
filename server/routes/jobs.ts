import { Router } from "express";
import { requireAdmin } from "../middleware/requireRole";
import { runReminders } from "../jobs/reminders";
import { runSummary } from "../jobs/summary";
import { runRadar } from "../radar/job";

/**
 * Admin-triggered job runs (also used by cron in production).
 * `?dry=1` forces preview/draft regardless of the autosend flag.
 */
export const jobsRouter = Router();

jobsRouter.post("/reminders/run", requireAdmin, async (req, res) => {
  const dryRun = req.query.dry === "1" || req.query.dry === "true";
  const result = await runReminders({ dryRun });
  res.json({ success: true, data: result, error: null });
});

jobsRouter.post("/summary/run", requireAdmin, async (req, res) => {
  const dryRun = req.query.dry === "1" || req.query.dry === "true";
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const result = await runSummary({ dryRun, month });
  res.json({ success: true, data: result, error: null });
});

jobsRouter.post("/radar/run", requireAdmin, async (req, res) => {
  const dry = req.query.dry === "1" || req.query.dry === "true";
  const result = await runRadar({ dry });
  res.json({ success: true, data: result, error: null });
});
