import type { IStorage } from "../storage";
import { config } from "../config";
import { verifyPassword } from "./passwords";
import type { AppRole } from "@shared/schema";

export interface AuthedUser {
  username: string;
  role: AppRole;
  email: string | null;
  displayName: string | null;
}

/**
 * Authenticate by username-or-email + password.
 * 1. Break-glass admin (Nina) from env — never in the DB.
 * 2. DB accounts — match by username, then fall back to email (case-insensitive),
 *    so people can log in with their email address.
 */
export async function authenticate(
  storage: IStorage,
  identifier: string,
  password: string,
): Promise<AuthedUser | null> {
  const { adminUser, adminPassword, adminEmail, adminName } = config.auth;
  if (identifier === adminUser && password === adminPassword) {
    return { username: adminUser, role: "admin", email: adminEmail, displayName: adminName };
  }

  const user =
    (await storage.getUserByUsername(identifier)) ??
    (await storage.getUserByEmail(identifier));
  if (!user || !verifyPassword(password, user.passwordHash)) return null;

  return {
    username: user.username,
    role: user.role,
    email: user.email,
    displayName: user.displayName,
  };
}
