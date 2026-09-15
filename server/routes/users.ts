import { Router } from "express";
import { storage, type NewUser } from "../storage";
import { requireAdmin } from "../middleware/requireRole";
import { hashPassword } from "../auth/passwords";
import { createUserSchema, updateUserSchema, type SafeUser } from "@shared/schema";

export const usersRouter = Router();

const safe = (u: { passwordHash: string } & Record<string, unknown>): SafeUser => {
  const rest = { ...u } as Record<string, unknown>;
  delete rest.passwordHash;
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

usersRouter.patch("/:id", requireAdmin, async (req, res) => {
  const r = updateUserSchema.safeParse(req.body);
  if (!r.success) {
    return res
      .status(400)
      .json({ success: false, data: null, error: r.error.issues.map((i) => i.message).join("; ") });
  }
  const target = await storage.getUserById(req.params.id);
  if (!target) {
    return res.status(404).json({ success: false, data: null, error: "Uporabnik ne obstaja" });
  }
  // If the e-mail changes, it must stay unique (it is also the login identifier).
  if (r.data.email && r.data.email.toLowerCase() !== (target.email ?? "").toLowerCase()) {
    const clash = await storage.getUserByEmail(r.data.email);
    if (clash && clash.id !== target.id) {
      return res.status(409).json({ success: false, data: null, error: "E-pošta je že v uporabi" });
    }
  }
  const patch: Partial<NewUser> = {};
  if (r.data.displayName !== undefined) patch.displayName = r.data.displayName;
  if (r.data.email !== undefined) patch.email = r.data.email;
  if (r.data.role !== undefined) patch.role = r.data.role;
  if (r.data.password) patch.passwordHash = hashPassword(r.data.password);
  const user = await storage.updateUser(req.params.id, patch);
  res.json({ success: true, data: user ? safe(user) : null, error: null });
});

usersRouter.delete("/:id", requireAdmin, async (req, res) => {
  const deleted = await storage.deleteUser(req.params.id);
  res.json({ success: true, data: { deleted }, error: null });
});
