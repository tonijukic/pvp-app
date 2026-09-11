import { Router } from "express";
import { storage } from "../storage";
import { requireAdmin } from "../middleware/requireRole";
import { hashPassword } from "../auth/passwords";
import { createUserSchema, type SafeUser } from "@shared/schema";

export const usersRouter = Router();

const safe = (u: { passwordHash: string } & Record<string, unknown>): SafeUser => {
  const { passwordHash: _omit, ...rest } = u;
  return rest as unknown as SafeUser;
};

usersRouter.get("/", requireAdmin, async (_req, res) => {
  const users = await storage.listUsers();
  res.json({ success: true, data: users.map(safe), error: null });
});

usersRouter.post("/", requireAdmin, async (req, res) => {
  const r = createUserSchema.safeParse(req.body);
  if (!r.success) {
    return res
      .status(400)
      .json({ success: false, data: null, error: r.error.issues.map((i) => i.message).join("; ") });
  }
  const existing =
    (await storage.getUserByUsername(r.data.username)) ??
    (r.data.email ? await storage.getUserByEmail(r.data.email) : undefined);
  if (existing) {
    return res.status(409).json({ success: false, data: null, error: "Uporabnik že obstaja" });
  }
  const user = await storage.createUser({
    username: r.data.username,
    passwordHash: hashPassword(r.data.password),
    role: r.data.role,
    email: r.data.email ?? null,
    displayName: r.data.displayName ?? null,
  });
  res.json({ success: true, data: safe(user), error: null });
});

usersRouter.delete("/:id", requireAdmin, async (req, res) => {
  const deleted = await storage.deleteUser(req.params.id);
  res.json({ success: true, data: { deleted }, error: null });
});
