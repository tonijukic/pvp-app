import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { computeOverview } from "../overview";
import { requireAdmin } from "../middleware/requireRole";
import {
  insertMatterSchema,
  updateMatterSchema,
  insertTimeEntrySchema,
  insertDeadlineSchema,
  updateDeadlineSchema,
  insertCostSchema,
} from "@shared/schema";

export const trackerRouter = Router();

// --- helpers ---------------------------------------------------------------

const ok = (res: Response, data: unknown) => res.json({ success: true, data, error: null });
const fail = (res: Response, status: number, error: string) =>
  res.status(status).json({ success: false, data: null, error });

function sess(req: Request) {
  return { role: req.session.role, username: req.session.username ?? "" };
}
function isAdmin(req: Request) {
  return req.session.role === "admin";
}
/** Members are scoped to matters assigned to them. */
function matterFilter(req: Request) {
  return isAdmin(req) ? undefined : { assignedTo: sess(req).username };
}

function parse<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | null {
  const r = schema.safeParse(body);
  if (!r.success) {
    fail(res, 400, r.error.issues.map((i) => i.message).join("; "));
    return null;
  }
  return r.data;
}

async function loadAccessibleMatter(req: Request, id: string) {
  const m = await storage.getMatter(id);
  if (!m) return { m: null, allowed: false };
  const allowed = isAdmin(req) || m.assignedTo === sess(req).username;
  return { m, allowed };
}

// --- Overview --------------------------------------------------------------

trackerRouter.get("/overview", async (req, res) => {
  ok(res, await computeOverview(storage, matterFilter(req)));
});

// --- Matters ---------------------------------------------------------------

trackerRouter.get("/matters", async (req, res) => {
  ok(res, await storage.listMatters(matterFilter(req)));
});

trackerRouter.post("/matters", requireAdmin, async (req, res) => {
  const data = parse(insertMatterSchema, req.body, res);
  if (!data) return;
  ok(res, await storage.createMatter(data));
});

trackerRouter.get("/matters/:id", async (req, res) => {
  const { m, allowed } = await loadAccessibleMatter(req, req.params.id);
  if (!m) return fail(res, 404, "Zadeva ne obstaja");
  if (!allowed) return fail(res, 403, "Ni pravice");
  ok(res, m);
});

trackerRouter.patch("/matters/:id", requireAdmin, async (req, res) => {
  const data = parse(updateMatterSchema, req.body, res);
  if (!data) return;
  const row = await storage.updateMatter(req.params.id, data);
  if (!row) return fail(res, 404, "Zadeva ne obstaja");
  ok(res, row);
});

trackerRouter.delete("/matters/:id", requireAdmin, async (req, res) => {
  ok(res, { deleted: await storage.deleteMatter(req.params.id) });
});

// --- Time (nested under a matter) ------------------------------------------

trackerRouter.get("/matters/:id/time", async (req, res) => {
  const { m, allowed } = await loadAccessibleMatter(req, req.params.id);
  if (!m) return fail(res, 404, "Zadeva ne obstaja");
  if (!allowed) return fail(res, 403, "Ni pravice");
  // members see only their own entries
  const userId = isAdmin(req) ? undefined : sess(req).username;
  ok(res, await storage.listTimeEntries({ matterId: m.id, userId }));
});

trackerRouter.post("/matters/:id/time", async (req, res) => {
  const { m, allowed } = await loadAccessibleMatter(req, req.params.id);
  if (!m) return fail(res, 404, "Zadeva ne obstaja");
  if (!allowed) return fail(res, 403, "Ni pravice");
  const data = parse(
    insertTimeEntrySchema,
    { ...req.body, matterId: m.id, userId: sess(req).username },
    res,
  );
  if (!data) return;
  ok(res, await storage.createTimeEntry(data));
});

trackerRouter.delete("/time/:id", async (req, res) => {
  // admin may delete any; members can't delete via this MVP endpoint
  if (!isAdmin(req)) return fail(res, 403, "Ni pravice");
  ok(res, { deleted: await storage.deleteTimeEntry(req.params.id) });
});

// --- Deadlines -------------------------------------------------------------

trackerRouter.get("/deadlines", async (req, res) => {
  const all = await storage.listDeadlines();
  if (isAdmin(req)) return ok(res, all);
  const mine = new Set((await storage.listMatters(matterFilter(req))).map((m) => m.id));
  ok(res, all.filter((d) => mine.has(d.matterId)));
});

trackerRouter.get("/matters/:id/deadlines", async (req, res) => {
  const { m, allowed } = await loadAccessibleMatter(req, req.params.id);
  if (!m) return fail(res, 404, "Zadeva ne obstaja");
  if (!allowed) return fail(res, 403, "Ni pravice");
  ok(res, await storage.listDeadlines({ matterId: m.id }));
});

trackerRouter.post("/matters/:id/deadlines", async (req, res) => {
  const { m, allowed } = await loadAccessibleMatter(req, req.params.id);
  if (!m) return fail(res, 404, "Zadeva ne obstaja");
  if (!allowed) return fail(res, 403, "Ni pravice");
  const data = parse(insertDeadlineSchema, { ...req.body, matterId: m.id }, res);
  if (!data) return;
  ok(res, await storage.createDeadline(data));
});

/** Add one calendar year to an ISO date (YYYY-MM-DD), clamping 29 Feb → 28 Feb. */
function nextYearIso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const day = m === 2 && d === 29 ? 28 : d;
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

trackerRouter.patch("/deadlines/:id", async (req, res) => {
  const data = parse(updateDeadlineSchema, req.body, res);
  if (!data) return;
  const row = await storage.updateDeadline(req.params.id, data);
  if (!row) return fail(res, 404, "Rok ne obstaja");
  // Yearly obligations (e.g. KPK annual report) roll forward automatically:
  // when one is marked done, seed next year's occurrence so it is never lost.
  if (data.status === "opravljen" && row.recurrence === "letni") {
    await storage.createDeadline({
      matterId: row.matterId,
      title: row.title,
      dueDate: new Date(`${nextYearIso(row.dueDate)}T00:00:00Z`),
      severity: row.severity,
      remindDaysBefore: row.remindDaysBefore,
      status: "odprt",
      kind: row.kind,
      recurrence: "letni",
    });
  }
  ok(res, row);
});

trackerRouter.delete("/deadlines/:id", requireAdmin, async (req, res) => {
  ok(res, { deleted: await storage.deleteDeadline(req.params.id) });
});

// --- Costs -----------------------------------------------------------------

trackerRouter.get("/matters/:id/costs", async (req, res) => {
  const { m, allowed } = await loadAccessibleMatter(req, req.params.id);
  if (!m) return fail(res, 404, "Zadeva ne obstaja");
  if (!allowed) return fail(res, 403, "Ni pravice");
  ok(res, await storage.listCosts({ matterId: m.id }));
});

trackerRouter.post("/matters/:id/costs", async (req, res) => {
  const { m, allowed } = await loadAccessibleMatter(req, req.params.id);
  if (!m) return fail(res, 404, "Zadeva ne obstaja");
  if (!allowed) return fail(res, 403, "Ni pravice");
  const data = parse(insertCostSchema, { ...req.body, matterId: m.id }, res);
  if (!data) return;
  ok(res, await storage.createCost(data));
});

trackerRouter.delete("/costs/:id", requireAdmin, async (req, res) => {
  ok(res, { deleted: await storage.deleteCost(req.params.id) });
});
