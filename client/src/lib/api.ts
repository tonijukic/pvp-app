import type { ApiResponse } from "@shared/api";
import type {
  Matter,
  InsertMatter,
  UpdateMatter,
  TimeEntry,
  Deadline,
  Cost,
} from "@shared/schema";

export interface Me {
  authenticated: boolean;
  username?: string;
  role?: "member" | "admin";
  displayName?: string | null;
}

export interface MatterOverview {
  matter: Matter;
  hoursTotal: number;
  billableValue: number | null;
  costsTotal: number;
  openDeadlines: number;
  nextDeadline: { id: string; title: string; dueDate: string; severity: number } | null;
}

export interface SafeUser {
  id: string;
  username: string;
  role: "member" | "admin";
  email: string | null;
  displayName: string | null;
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok || !json.success || json.data === null) {
    throw new Error(json.error ?? `Napaka (${res.status})`);
  }
  return json.data;
}

// --- auth ---
export const fetchMe = () => req<Me>("GET", "/api/auth/me");
export const login = (username: string, password: string) =>
  req<unknown>("POST", "/api/auth/login", { username, password });
export const logout = () => fetch("/api/auth/logout", { method: "POST", credentials: "include" });

// --- overview ---
export const fetchOverview = () => req<MatterOverview[]>("GET", "/api/overview");

// --- team (roster for assignee display + dropdown) ---
export interface TeamMember {
  username: string;
  displayName: string;
  role: "member" | "admin";
}
export const fetchTeam = () => req<TeamMember[]>("GET", "/api/team");

// --- matters ---
export const fetchMatters = () => req<Matter[]>("GET", "/api/matters");
export const fetchMatter = (id: string) => req<Matter>("GET", `/api/matters/${id}`);
export const createMatter = (m: Partial<InsertMatter>) => req<Matter>("POST", "/api/matters", m);
export const updateMatter = (id: string, m: UpdateMatter) =>
  req<Matter>("PATCH", `/api/matters/${id}`, m);
export const deleteMatter = (id: string) => req<{ deleted: boolean }>("DELETE", `/api/matters/${id}`);

// --- time ---
export const fetchTime = (matterId: string) =>
  req<TimeEntry[]>("GET", `/api/matters/${matterId}/time`);
export const addTime = (matterId: string, body: { date: string; description: string; hours: number }) =>
  req<TimeEntry>("POST", `/api/matters/${matterId}/time`, body);

// --- deadlines ---
export const fetchAllDeadlines = () => req<Deadline[]>("GET", "/api/deadlines");
export const fetchDeadlines = (matterId: string) =>
  req<Deadline[]>("GET", `/api/matters/${matterId}/deadlines`);
export const addDeadline = (
  matterId: string,
  body: {
    title: string;
    dueDate: string;
    severity: number;
    remindDaysBefore: number;
    status: string;
    kind?: string;
    recurrence?: string;
  },
) => req<Deadline>("POST", `/api/matters/${matterId}/deadlines`, body);
export const setDeadlineStatus = (id: string, status: "odprt" | "opravljen") =>
  req<Deadline>("PATCH", `/api/deadlines/${id}`, { status });

// --- costs ---
export const fetchCosts = (matterId: string) => req<Cost[]>("GET", `/api/matters/${matterId}/costs`);
export const addCost = (matterId: string, body: { date: string; description: string; amount: number }) =>
  req<Cost>("POST", `/api/matters/${matterId}/costs`, body);

// --- admin: users ---
export const fetchUsers = () => req<SafeUser[]>("GET", "/api/users");
export const createUser = (body: {
  username: string;
  password: string;
  role: string;
  email?: string;
  displayName?: string;
}) => req<SafeUser>("POST", "/api/users", body);
export const updateUser = (
  id: string,
  body: { displayName?: string | null; email?: string | null; role?: string; password?: string },
) => req<SafeUser>("PATCH", `/api/users/${id}`, body);
export const deleteUser = (id: string) => req<{ deleted: boolean }>("DELETE", `/api/users/${id}`);

// --- admin: one-time import (Uvoz) ---
export interface ImportResult {
  dryRun: boolean;
  willCreate: { zadeve: number; roki: number };
  created: { zadeve: number; roki: number };
  errors: { sheet: "zadeve" | "roki"; row: number; message: string }[];
}
export const runImport = (body: {
  dryRun: boolean;
  zadeve: Record<string, string>[];
  roki: Record<string, string>[];
}) => req<ImportResult>("POST", "/api/import", body);

// --- admin: jobs ---
export const runJob = (which: "reminders" | "summary", dry = true, month?: string) =>
  req<Record<string, unknown>>(
    "POST",
    `/api/jobs/${which}/run?dry=${dry ? 1 : 0}${month ? `&month=${month}` : ""}`,
  );
