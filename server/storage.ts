import { randomUUID } from "node:crypto";
import { eq, and, gte, lte, desc, sql, type SQL } from "drizzle-orm";
import {
  appUsers,
  matters,
  timeEntries,
  deadlines,
  costs,
  type AppUserRow,
  type AppRole,
  type Matter,
  type InsertMatter,
  type UpdateMatter,
  type TimeEntry,
  type InsertTimeEntry,
  type Deadline,
  type InsertDeadline,
  type UpdateDeadline,
  type Cost,
  type InsertCost,
} from "@shared/schema";
import { config } from "./config";
import { getDb } from "./db";

// ---------------------------------------------------------------------------
// Helpers — numeric columns are strings in Drizzle; date columns are 'YYYY-MM-DD'.
// Zod coerces inputs to number/Date, so we normalize at the storage boundary.
// ---------------------------------------------------------------------------

const numStr = (n: number | null | undefined): string | null =>
  n === null || n === undefined ? null : String(n);

const dateStr = (d: Date | string | null | undefined): string | null => {
  if (d === null || d === undefined) return null;
  return d instanceof Date ? d.toISOString().slice(0, 10) : d;
};

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface NewUser {
  username: string;
  passwordHash: string;
  role: AppRole;
  email?: string | null;
  displayName?: string | null;
}

export interface TimeFilter {
  matterId?: string;
  userId?: string;
  from?: string; // ISO date
  to?: string;
}
export interface DeadlineFilter {
  matterId?: string;
  status?: "odprt" | "opravljen";
}
export interface CostFilter {
  matterId?: string;
  from?: string;
  to?: string;
}
export interface MatterFilter {
  assignedTo?: string; // username — members see only their own
}

export interface IStorage {
  // Users
  getUserById(id: string): Promise<AppUserRow | undefined>;
  getUserByUsername(username: string): Promise<AppUserRow | undefined>;
  getUserByEmail(email: string): Promise<AppUserRow | undefined>;
  listUsers(): Promise<AppUserRow[]>;
  createUser(u: NewUser): Promise<AppUserRow>;
  updateUser(id: string, patch: Partial<NewUser>): Promise<AppUserRow | undefined>;
  deleteUser(id: string): Promise<boolean>;

  // Matters
  listMatters(f?: MatterFilter): Promise<Matter[]>;
  getMatter(id: string): Promise<Matter | undefined>;
  createMatter(m: InsertMatter): Promise<Matter>;
  updateMatter(id: string, patch: UpdateMatter): Promise<Matter | undefined>;
  deleteMatter(id: string): Promise<boolean>;

  // Time entries
  listTimeEntries(f?: TimeFilter): Promise<TimeEntry[]>;
  createTimeEntry(t: InsertTimeEntry): Promise<TimeEntry>;
  deleteTimeEntry(id: string): Promise<boolean>;

  // Deadlines
  listDeadlines(f?: DeadlineFilter): Promise<Deadline[]>;
  createDeadline(d: InsertDeadline): Promise<Deadline>;
  updateDeadline(id: string, patch: UpdateDeadline): Promise<Deadline | undefined>;
  deleteDeadline(id: string): Promise<boolean>;

  // Costs
  listCosts(f?: CostFilter): Promise<Cost[]>;
  createCost(c: InsertCost): Promise<Cost>;
  deleteCost(id: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// In-memory
// ---------------------------------------------------------------------------

export class MemStorage implements IStorage {
  private users = new Map<string, AppUserRow>();
  private matters = new Map<string, Matter>();
  private time = new Map<string, TimeEntry>();
  private deadlines = new Map<string, Deadline>();
  private costs = new Map<string, Cost>();

  // --- Users ---
  async getUserById(id: string) {
    return this.users.get(id);
  }
  async getUserByUsername(username: string) {
    return [...this.users.values()].find((u) => u.username === username);
  }
  async getUserByEmail(email: string) {
    const lc = email.toLowerCase();
    return [...this.users.values()].find((u) => (u.email ?? "").toLowerCase() === lc);
  }
  async listUsers() {
    return [...this.users.values()];
  }
  async createUser(u: NewUser) {
    const now = new Date();
    const row: AppUserRow = {
      id: randomUUID(),
      username: u.username,
      passwordHash: u.passwordHash,
      role: u.role,
      email: u.email ?? null,
      displayName: u.displayName ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(row.id, row);
    return row;
  }
  async updateUser(id: string, patch: Partial<NewUser>) {
    const cur = this.users.get(id);
    if (!cur) return undefined;
    const next: AppUserRow = { ...cur, ...patch, updatedAt: new Date() };
    this.users.set(id, next);
    return next;
  }
  async deleteUser(id: string) {
    return this.users.delete(id);
  }

  // --- Matters ---
  async listMatters(f?: MatterFilter) {
    let rows = [...this.matters.values()];
    if (f?.assignedTo) rows = rows.filter((m) => m.assignedTo === f.assignedTo);
    return rows.sort((a, b) => +b.createdAt - +a.createdAt);
  }
  async getMatter(id: string) {
    return this.matters.get(id);
  }
  async createMatter(m: InsertMatter) {
    const now = new Date();
    const row: Matter = {
      id: randomUUID(),
      client: m.client,
      title: m.title,
      area: m.area,
      billingType: m.billingType,
      hourlyRate: numStr(m.hourlyRate),
      flatFee: numStr(m.flatFee),
      status: m.status,
      openedAt: dateStr(m.openedAt),
      assignedTo: m.assignedTo ?? null,
      notes: m.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.matters.set(row.id, row);
    return row;
  }
  async updateMatter(id: string, patch: UpdateMatter) {
    const cur = this.matters.get(id);
    if (!cur) return undefined;
    const next: Matter = {
      ...cur,
      ...("client" in patch && patch.client !== undefined ? { client: patch.client } : {}),
      ...("title" in patch && patch.title !== undefined ? { title: patch.title } : {}),
      ...("area" in patch && patch.area !== undefined ? { area: patch.area } : {}),
      ...("billingType" in patch && patch.billingType !== undefined ? { billingType: patch.billingType } : {}),
      ...("hourlyRate" in patch ? { hourlyRate: numStr(patch.hourlyRate) } : {}),
      ...("flatFee" in patch ? { flatFee: numStr(patch.flatFee) } : {}),
      ...("status" in patch && patch.status !== undefined ? { status: patch.status } : {}),
      ...("openedAt" in patch ? { openedAt: dateStr(patch.openedAt) } : {}),
      ...("assignedTo" in patch ? { assignedTo: patch.assignedTo ?? null } : {}),
      ...("notes" in patch ? { notes: patch.notes ?? null } : {}),
      updatedAt: new Date(),
    };
    this.matters.set(id, next);
    return next;
  }
  async deleteMatter(id: string) {
    // cascade
    for (const [tid, t] of this.time) if (t.matterId === id) this.time.delete(tid);
    for (const [did, d] of this.deadlines) if (d.matterId === id) this.deadlines.delete(did);
    for (const [cid, c] of this.costs) if (c.matterId === id) this.costs.delete(cid);
    return this.matters.delete(id);
  }

  // --- Time ---
  async listTimeEntries(f?: TimeFilter) {
    let rows = [...this.time.values()];
    if (f?.matterId) rows = rows.filter((t) => t.matterId === f.matterId);
    if (f?.userId) rows = rows.filter((t) => t.userId === f.userId);
    if (f?.from) rows = rows.filter((t) => t.date >= f.from!);
    if (f?.to) rows = rows.filter((t) => t.date <= f.to!);
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  async createTimeEntry(t: InsertTimeEntry) {
    const row: TimeEntry = {
      id: randomUUID(),
      matterId: t.matterId,
      userId: t.userId ?? null,
      date: dateStr(t.date)!,
      description: t.description,
      hours: numStr(t.hours)!,
      createdAt: new Date(),
    };
    this.time.set(row.id, row);
    return row;
  }
  async deleteTimeEntry(id: string) {
    return this.time.delete(id);
  }

  // --- Deadlines ---
  async listDeadlines(f?: DeadlineFilter) {
    let rows = [...this.deadlines.values()];
    if (f?.matterId) rows = rows.filter((d) => d.matterId === f.matterId);
    if (f?.status) rows = rows.filter((d) => d.status === f.status);
    return rows.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  }
  async createDeadline(d: InsertDeadline) {
    const row: Deadline = {
      id: randomUUID(),
      matterId: d.matterId,
      title: d.title,
      dueDate: dateStr(d.dueDate)!,
      severity: d.severity,
      remindDaysBefore: d.remindDaysBefore,
      status: d.status,
      kind: d.kind,
      recurrence: d.recurrence,
      createdAt: new Date(),
    };
    this.deadlines.set(row.id, row);
    return row;
  }
  async updateDeadline(id: string, patch: UpdateDeadline) {
    const cur = this.deadlines.get(id);
    if (!cur) return undefined;
    const next: Deadline = {
      ...cur,
      ...("title" in patch && patch.title !== undefined ? { title: patch.title } : {}),
      ...("dueDate" in patch ? { dueDate: dateStr(patch.dueDate)! } : {}),
      ...("severity" in patch && patch.severity !== undefined ? { severity: patch.severity } : {}),
      ...("remindDaysBefore" in patch && patch.remindDaysBefore !== undefined
        ? { remindDaysBefore: patch.remindDaysBefore }
        : {}),
      ...("status" in patch && patch.status !== undefined ? { status: patch.status } : {}),
      ...("kind" in patch && patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...("recurrence" in patch && patch.recurrence !== undefined ? { recurrence: patch.recurrence } : {}),
    };
    this.deadlines.set(id, next);
    return next;
  }
  async deleteDeadline(id: string) {
    return this.deadlines.delete(id);
  }

  // --- Costs ---
  async listCosts(f?: CostFilter) {
    let rows = [...this.costs.values()];
    if (f?.matterId) rows = rows.filter((c) => c.matterId === f.matterId);
    if (f?.from) rows = rows.filter((c) => c.date >= f.from!);
    if (f?.to) rows = rows.filter((c) => c.date <= f.to!);
    return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
  }
  async createCost(c: InsertCost) {
    const row: Cost = {
      id: randomUUID(),
      matterId: c.matterId,
      date: dateStr(c.date)!,
      description: c.description,
      amount: numStr(c.amount)!,
      createdAt: new Date(),
    };
    this.costs.set(row.id, row);
    return row;
  }
  async deleteCost(id: string) {
    return this.costs.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Drizzle / Postgres
// ---------------------------------------------------------------------------

export class DbStorage implements IStorage {
  constructor(private db: ReturnType<typeof getDb>) {}

  // Drizzle's chained select builder type is awkward to name here; it is both
  // awaitable and `.where()`-able. Keep it untyped at this single seam.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async rows<T>(base: any, conds: SQL[]): Promise<T[]> {
    return conds.length ? base.where(and(...conds)) : base;
  }

  // --- Users ---
  async getUserById(id: string) {
    const [row] = await this.db.select().from(appUsers).where(eq(appUsers.id, id));
    return row;
  }
  async getUserByUsername(username: string) {
    const [row] = await this.db.select().from(appUsers).where(eq(appUsers.username, username));
    return row;
  }
  async getUserByEmail(email: string) {
    const [row] = await this.db
      .select()
      .from(appUsers)
      .where(sql`lower(${appUsers.email}) = lower(${email})`);
    return row;
  }
  async listUsers() {
    return this.db.select().from(appUsers);
  }
  async createUser(u: NewUser) {
    const [row] = await this.db
      .insert(appUsers)
      .values({
        username: u.username,
        passwordHash: u.passwordHash,
        role: u.role,
        email: u.email ?? null,
        displayName: u.displayName ?? null,
      })
      .returning();
    return row;
  }
  async updateUser(id: string, patch: Partial<NewUser>) {
    const [row] = await this.db
      .update(appUsers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(appUsers.id, id))
      .returning();
    return row;
  }
  async deleteUser(id: string) {
    const res = await this.db.delete(appUsers).where(eq(appUsers.id, id)).returning();
    return res.length > 0;
  }

  // --- Matters ---
  async listMatters(f?: MatterFilter) {
    const conds: SQL[] = [];
    if (f?.assignedTo) conds.push(eq(matters.assignedTo, f.assignedTo));
    const base = this.db.select().from(matters).orderBy(desc(matters.createdAt));
    return this.rows<Matter>(base, conds);
  }
  async getMatter(id: string) {
    const [row] = await this.db.select().from(matters).where(eq(matters.id, id));
    return row;
  }
  async createMatter(m: InsertMatter) {
    const [row] = await this.db
      .insert(matters)
      .values({
        client: m.client,
        title: m.title,
        area: m.area,
        billingType: m.billingType,
        hourlyRate: numStr(m.hourlyRate),
        flatFee: numStr(m.flatFee),
        status: m.status,
        openedAt: dateStr(m.openedAt),
        assignedTo: m.assignedTo ?? null,
        notes: m.notes ?? null,
      })
      .returning();
    return row;
  }
  async updateMatter(id: string, patch: UpdateMatter) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.client !== undefined) set.client = patch.client;
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.area !== undefined) set.area = patch.area;
    if (patch.billingType !== undefined) set.billingType = patch.billingType;
    if ("hourlyRate" in patch) set.hourlyRate = numStr(patch.hourlyRate);
    if ("flatFee" in patch) set.flatFee = numStr(patch.flatFee);
    if (patch.status !== undefined) set.status = patch.status;
    if ("openedAt" in patch) set.openedAt = dateStr(patch.openedAt);
    if ("assignedTo" in patch) set.assignedTo = patch.assignedTo ?? null;
    if ("notes" in patch) set.notes = patch.notes ?? null;
    const [row] = await this.db.update(matters).set(set).where(eq(matters.id, id)).returning();
    return row;
  }
  async deleteMatter(id: string) {
    await this.db.delete(timeEntries).where(eq(timeEntries.matterId, id));
    await this.db.delete(deadlines).where(eq(deadlines.matterId, id));
    await this.db.delete(costs).where(eq(costs.matterId, id));
    const res = await this.db.delete(matters).where(eq(matters.id, id)).returning();
    return res.length > 0;
  }

  // --- Time ---
  async listTimeEntries(f?: TimeFilter) {
    const conds: SQL[] = [];
    if (f?.matterId) conds.push(eq(timeEntries.matterId, f.matterId));
    if (f?.userId) conds.push(eq(timeEntries.userId, f.userId));
    if (f?.from) conds.push(gte(timeEntries.date, f.from));
    if (f?.to) conds.push(lte(timeEntries.date, f.to));
    const base = this.db.select().from(timeEntries).orderBy(desc(timeEntries.date));
    return this.rows<TimeEntry>(base, conds);
  }
  async createTimeEntry(t: InsertTimeEntry) {
    const [row] = await this.db
      .insert(timeEntries)
      .values({
        matterId: t.matterId,
        userId: t.userId ?? null,
        date: dateStr(t.date)!,
        description: t.description,
        hours: numStr(t.hours)!,
      })
      .returning();
    return row;
  }
  async deleteTimeEntry(id: string) {
    const res = await this.db.delete(timeEntries).where(eq(timeEntries.id, id)).returning();
    return res.length > 0;
  }

  // --- Deadlines ---
  async listDeadlines(f?: DeadlineFilter) {
    const conds: SQL[] = [];
    if (f?.matterId) conds.push(eq(deadlines.matterId, f.matterId));
    if (f?.status) conds.push(eq(deadlines.status, f.status));
    const base = this.db.select().from(deadlines).orderBy(deadlines.dueDate);
    return this.rows<Deadline>(base, conds);
  }
  async createDeadline(d: InsertDeadline) {
    const [row] = await this.db
      .insert(deadlines)
      .values({
        matterId: d.matterId,
        title: d.title,
        dueDate: dateStr(d.dueDate)!,
        severity: d.severity,
        remindDaysBefore: d.remindDaysBefore,
        status: d.status,
        kind: d.kind,
        recurrence: d.recurrence,
      })
      .returning();
    return row;
  }
  async updateDeadline(id: string, patch: UpdateDeadline) {
    const set: Record<string, unknown> = {};
    if (patch.title !== undefined) set.title = patch.title;
    if ("dueDate" in patch) set.dueDate = dateStr(patch.dueDate)!;
    if (patch.severity !== undefined) set.severity = patch.severity;
    if (patch.remindDaysBefore !== undefined) set.remindDaysBefore = patch.remindDaysBefore;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.kind !== undefined) set.kind = patch.kind;
    if (patch.recurrence !== undefined) set.recurrence = patch.recurrence;
    const [row] = await this.db.update(deadlines).set(set).where(eq(deadlines.id, id)).returning();
    return row;
  }
  async deleteDeadline(id: string) {
    const res = await this.db.delete(deadlines).where(eq(deadlines.id, id)).returning();
    return res.length > 0;
  }

  // --- Costs ---
  async listCosts(f?: CostFilter) {
    const conds: SQL[] = [];
    if (f?.matterId) conds.push(eq(costs.matterId, f.matterId));
    if (f?.from) conds.push(gte(costs.date, f.from));
    if (f?.to) conds.push(lte(costs.date, f.to));
    const base = this.db.select().from(costs).orderBy(desc(costs.date));
    return this.rows<Cost>(base, conds);
  }
  async createCost(c: InsertCost) {
    const [row] = await this.db
      .insert(costs)
      .values({
        matterId: c.matterId,
        date: dateStr(c.date)!,
        description: c.description,
        amount: numStr(c.amount)!,
      })
      .returning();
    return row;
  }
  async deleteCost(id: string) {
    const res = await this.db.delete(costs).where(eq(costs.id, id)).returning();
    return res.length > 0;
  }
}

// ---------------------------------------------------------------------------
// Toggle — DATABASE_URL set → Postgres, else in-memory.
// ---------------------------------------------------------------------------

function createStorage(): IStorage {
  if (config.databaseUrl) return new DbStorage(getDb());
  return new MemStorage();
}

export const storage: IStorage = createStorage();
