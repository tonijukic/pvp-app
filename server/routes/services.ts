import { Router, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAdmin } from "../middleware/requireRole";
import { insertServiceSchema, updateServiceSchema } from "@shared/schema";

export const servicesRouter = Router();

const ok = (res: Response, data: unknown) => res.json({ success: true, data, error: null });
const fail = (res: Response, status: number, error: string) =>
  res.status(status).json({ success: false, data: null, error });

function parse<S extends z.ZodTypeAny>(schema: S, body: unknown, res: Response): z.output<S> | null {
  const r = schema.safeParse(body);
  if (!r.success) {
    fail(res, 400, r.error.issues.map((i) => i.message).join("; "));
    return null;
  }
  return r.data;
}

// Read for any authenticated user (naloga rate lookup); writes admin-only.
servicesRouter.get("/", async (_req, res) => {
  ok(res, await storage.listServices());
});

servicesRouter.post("/", requireAdmin, async (req, res) => {
  const data = parse(insertServiceSchema, req.body, res);
  if (!data) return;
  if (await storage.getServiceByCode(data.code)) return fail(res, 409, `Kratica '${data.code}' je že v uporabi`);
  ok(res, await storage.createService(data));
});

servicesRouter.patch("/:id", requireAdmin, async (req, res) => {
  const data = parse(updateServiceSchema, req.body, res);
  if (!data) return;
  if (data.code) {
    const clash = await storage.getServiceByCode(data.code);
    if (clash && clash.id !== req.params.id) return fail(res, 409, `Kratica '${data.code}' je že v uporabi`);
  }
  const row = await storage.updateService(req.params.id, data);
  if (!row) return fail(res, 404, "Storitev ne obstaja");
  ok(res, row);
});

servicesRouter.delete("/:id", requireAdmin, async (req, res) => {
  ok(res, { deleted: await storage.deleteService(req.params.id) });
});
