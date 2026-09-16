import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { requireAdmin } from "../middleware/requireRole";
import { insertClientSchema, updateClientSchema, type ClientStatus } from "@shared/schema";

export const clientsRouter = Router();

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

// Any authenticated user may read the client list (for the "Nosilec"/Stranka
// dropdown); writes are admin-only.
clientsRouter.get("/", async (req: Request, res) => {
  const status = req.query.status as ClientStatus | undefined;
  ok(res, await storage.listClients(status ? { status } : undefined));
});

clientsRouter.get("/:id", async (req, res) => {
  const c = await storage.getClient(req.params.id);
  if (!c) return fail(res, 404, "Stranka ne obstaja");
  ok(res, c);
});

clientsRouter.post("/", requireAdmin, async (req, res) => {
  const data = parse(insertClientSchema, req.body, res);
  if (!data) return;
  if (await storage.getClientByCode(data.code)) {
    return fail(res, 409, `Kratica '${data.code}' je že v uporabi`);
  }
  ok(res, await storage.createClient(data));
});

clientsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const data = parse(updateClientSchema, req.body, res);
  if (!data) return;
  if (data.code) {
    const clash = await storage.getClientByCode(data.code);
    if (clash && clash.id !== req.params.id) return fail(res, 409, `Kratica '${data.code}' je že v uporabi`);
  }
  const row = await storage.updateClient(req.params.id, data);
  if (!row) return fail(res, 404, "Stranka ne obstaja");
  ok(res, row);
});

clientsRouter.delete("/:id", requireAdmin, async (req, res) => {
  ok(res, { deleted: await storage.deleteClient(req.params.id) });
});
