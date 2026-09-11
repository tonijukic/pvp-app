import type { Request, Response, NextFunction } from "express";
import { ROLE_RANK } from "../config";
import type { AppRole } from "@shared/schema";

/** Require at least the given role rank (member < admin). */
export function requireRole(min: AppRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.session?.role as AppRole | undefined;
    if (role && ROLE_RANK[role] >= ROLE_RANK[min]) return next();
    res.status(403).json({ success: false, data: null, error: "Ni pravice" });
  };
}

export const requireAdmin = requireRole("admin");
