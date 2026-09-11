import { Router } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { authenticate } from "../auth/users";
import type { AppRole } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
    username?: string;
    role?: AppRole;
    email?: string | null;
    displayName?: string | null;
  }
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRouter = Router();

async function doLogin(identifier: string, password: string, session: import("express-session").Session & Partial<import("express-session").SessionData>) {
  const user = await authenticate(storage, identifier, password);
  if (!user) return null;
  session.authenticated = true;
  session.username = user.username;
  session.role = user.role;
  session.email = user.email;
  session.displayName = user.displayName;
  return user;
}

// JSON login (SPA)
authRouter.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ success: false, data: null, error: "Manjka uporabniško ime ali geslo" });
  }
  const user = await doLogin(String(username), String(password), req.session);
  if (!user) return res.status(401).json({ success: false, data: null, error: "Napačni podatki" });
  res.json({ success: true, data: { username: user.username, role: user.role, displayName: user.displayName }, error: null });
});

// Native form login → 303 redirect, so mobile password managers offer to save.
authRouter.post("/login-form", loginLimiter, async (req, res) => {
  const { username, password } = req.body ?? {};
  const ok = username && password && (await doLogin(String(username), String(password), req.session));
  res.redirect(303, ok ? "/" : "/login?error=1");
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ success: true, data: null, error: null });
  });
});

authRouter.get("/me", (req, res) => {
  res.set("Cache-Control", "no-store");
  if (req.session?.authenticated) {
    res.json({
      success: true,
      data: {
        authenticated: true,
        username: req.session.username,
        role: req.session.role,
        displayName: req.session.displayName ?? null,
      },
      error: null,
    });
  } else {
    res.json({ success: true, data: { authenticated: false }, error: null });
  }
});
