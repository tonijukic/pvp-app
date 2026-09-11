import type { Request, Response, NextFunction } from "express";

/** 401 unless the session is authenticated. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.authenticated === true) return next();
  res.status(401).json({ success: false, data: null, error: "Neprijavljen" });
}
