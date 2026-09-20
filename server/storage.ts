import { randomUUID } from "node:crypto";
import { eq, and, gte, lte, desc, sql, type SQL } from "drizzle-orm";
import {
  appUsers,
  matters,
  timeEntries,
  deadlines,
  costs,
  clients,
  services,
  matterAgreements,
  pausalPackages,
  radarItems,
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
  type Client,
  type InsertClient,
  type UpdateClient,
  type ClientStatus,
  type Service,
  type InsertService,
  type UpdateService,
  type MatterAgreement,
  type InsertMatterAgreement,
  type PausalPackage,
  type InsertPausalPackage,
  type UpdatePausalPackage,
  type PracticeArea,
  type RadarItem,
  type InsertRadarItem,
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
  payRate?: number | null;
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
export interface ClientFilter {
  status?: ClientStatus;
}
export interface RadarFilter {
  area?: PracticeArea;
  sinceDays?: number;
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

  // Clients (CRM)
  listClients(f?: ClientFilter): Promise<Client[]>;
  getClient(id: string): Promise<Client | undefined>;
  getClientByCode(code: string): Promise<Client | undefined>;
  createClient(c: InsertClient): Promise<Client>;
  updateClient(id: string, patch: UpdateClient): Promise<Client | undefined>;
  deleteClient(id: string): Promise<boolean>;

  // Services (Cenik)
  listServices(): Promise<Service[]>;
  getServiceByCode(code: string): Promise<Service | undefined>;
  createService(s: InsertService): Promise<Service>;
  updateService(id: string, patch: UpdateService): Promise<Service | undefined>;
  deleteService(id: string): Promise<boolean>;

  // Matter agreements (Način dogovora — history)
  listMatterAgreements(matterId: string): Promise<MatterAgreement[]>;
  createMatterAgreement(a: InsertMatterAgreement): Promise<MatterAgreement>;
  deleteMatterAgreement(id: string): Promise<boolean>;

  // Pavšal packages (Nastavitve)
  listPausalPackages(): Promise<PausalPackage[]>;
  getPausalPackageByCode(code: string): Promise<PausalPackage | undefined>;
  createPausalPackage(p: InsertPausalPackage): Promise<PausalPackage>;
  updatePausalPackage(id: string, patch: UpdatePausalPackage): Promise<PausalPackage | undefined>;
  deletePausalPackage(id: string): Promise<boolean>;

  // Radar items (Zakonodajni radar)
  listRadarItems(opts?: RadarFilter): Promise<RadarItem[]>;
  getRadarItemByDedupKey(key: string): Promise<RadarItem | undefined>;
  createRadarItem(i: InsertRadarItem): Promise<RadarItem>;
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
  private clients = new Map<string, Client>();
  private services = new Map<string, Service>();
  private agreements = new Map<string, MatterAgreement>();
  private pausalPackages = new Map<string, PausalPackage>();
  private radar = new Map<string, RadarItem>();

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
      payRate: numStr(u.payRate),
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(row.id, row);
    return row;
  }
  async updateUser(id: string, patch: Partial<NewUser>) {
    const cur = this.users.get(id);
    if (!cur) return undefined;
    const next: AppUserRow = {
      ...cur,
      ...("username" in patch && patch.username !== undefined ? { username: patch.username } : {}),
      ...("passwordHash" in patch && patch.passwordHash !== undefined ? { passwordHash: patch.passwordHash } : {}),
      ...("role" in patch && patch.role !== undefined ? { role: patch.role } : {}),
      ...("email" in patch ? { email: patch.email ?? null } : {}),
      ...("displayName" in patch ? { displayName: patch.displayName ?? null } : {}),
      ...("payRate" in patch ? { payRate: numStr(patch.payRate) } : {}),
      updatedAt: new Date(),
    };
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
      clientId: m.clientId ?? null,
      title: m.title,
      area: m.area,
      serviceCode: m.serviceCode ?? null,
      billingType: m.billingType,
      hourlyRate: numStr(m.hourlyRate),
      flatFee: numStr(m.flatFee),
      status: m.status,
      waitingReason: m.waitingReason ?? null,
      waitingNote: m.waitingNote ?? null,
      pausalPackageCode: m.pausalPackageCode ?? null,
      includedHours: numStr(m.includedHours),
      reducedRate: numStr(m.reducedRate),
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
      ...("clientId" in patch ? { clientId: patch.clientId ?? null } : {}),
      ...("title" in patch && patch.title !== undefined ? { title: patch.title } : {}),
      ...("area" in patch && patch.area !== undefined ? { area: patch.area } : {}),
      ...("serviceCode" in patch ? { serviceCode: patch.serviceCode ?? null } : {}),
      ...("billingType" in patch && patch.billingType !== undefined ? { billingType: patch.billingType } : {}),
      ...("hourlyRate" in patch ? { hourlyRate: numStr(patch.hourlyRate) } : {}),
      ...("flatFee" in patch ? { flatFee: numStr(patch.flatFee) } : {}),
      ...("status" in patch && patch.status !== undefined ? { status: patch.status } : {}),
      ...("waitingReason" in patch ? { waitingReason: patch.waitingReason ?? null } : {}),
      ...("waitingNote" in patch ? { waitingNote: patch.waitingNote ?? null } : {}),
      ...("pausalPackageCode" in patch ? { pausalPackageCode: patch.pausalPackageCode ?? null } : {}),
      ...("includedHours" in patch ? { includedHours: numStr(patch.includedHours) } : {}),
      ...("reducedRate" in patch ? { reducedRate: numStr(patch.reducedRate) } : {}),
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
    for (const [aid, a] of this.agreements) if (a.matterId === id) this.agreements.delete(aid);
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

  // --- Clients ---
  async listClients(f?: ClientFilter) {
    let rows = [...this.clients.values()];
    if (f?.status) rows = rows.filter((c) => c.status === f.status);
    return rows.sort((a, b) => a.name.localeCompare(b.name, "sl"));
  }
  async getClient(id: string) {
    return this.clients.get(id);
  }
  async getClientByCode(code: string) {
    const lc = code.toLowerCase();
    return [...this.clients.values()].find((c) => c.code.toLowerCase() === lc);
  }
  async createClient(c: InsertClient) {
    const now = new Date();
    const row: Client = {
      id: randomUUID(),
      code: c.code,
      name: c.name,
      kind: c.kind,
      status: c.status,
      area: c.area ?? null,
      contractType: c.contractType,
      documentNumber: c.documentNumber ?? null,
      validFrom: dateStr(c.validFrom),
      validTo: dateStr(c.validTo),
      subject: c.subject ?? null,
      notes: c.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.clients.set(row.id, row);
    return row;
  }
  async updateClient(id: string, patch: UpdateClient) {
    const cur = this.clients.get(id);
    if (!cur) return undefined;
    const next: Client = {
      ...cur,
      ...("code" in patch && patch.code !== undefined ? { code: patch.code } : {}),
      ...("name" in patch && patch.name !== undefined ? { name: patch.name } : {}),
      ...("kind" in patch && patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...("status" in patch && patch.status !== undefined ? { status: patch.status } : {}),
      ...("area" in patch ? { area: patch.area ?? null } : {}),
      ...("contractType" in patch && patch.contractType !== undefined ? { contractType: patch.contractType } : {}),
      ...("documentNumber" in patch ? { documentNumber: patch.documentNumber ?? null } : {}),
      ...("validFrom" in patch ? { validFrom: dateStr(patch.validFrom) } : {}),
      ...("validTo" in patch ? { validTo: dateStr(patch.validTo) } : {}),
      ...("subject" in patch ? { subject: patch.subject ?? null } : {}),
      ...("notes" in patch ? { notes: patch.notes ?? null } : {}),
      updatedAt: new Date(),
    };
    this.clients.set(id, next);
    return next;
  }
  async deleteClient(id: string) {
    return this.clients.delete(id);
  }

  // --- Services (Cenik) ---
  async listServices() {
    return [...this.services.values()].sort((a, b) => a.code.localeCompare(b.code, "sl"));
  }
  async getServiceByCode(code: string) {
    const lc = code.toLowerCase();
    return [...this.services.values()].find((s) => s.code.toLowerCase() === lc);
  }
  async createService(s: InsertService) {
    const now = new Date();
    const row: Service = {
      id: randomUUID(),
      code: s.code,
      name: s.name,
      unit: s.unit,
      pricePO: numStr(s.pricePO),
      priceFO: numStr(s.priceFO),
      createdAt: now,
      updatedAt: now,
    };
    this.services.set(row.id, row);
    return row;
  }
  async updateService(id: string, patch: UpdateService) {
    const cur = this.services.get(id);
    if (!cur) return undefined;
    const next: Service = {
      ...cur,
      ...("code" in patch && patch.code !== undefined ? { code: patch.code } : {}),
      ...("name" in patch && patch.name !== undefined ? { name: patch.name } : {}),
      ...("unit" in patch && patch.unit !== undefined ? { unit: patch.unit } : {}),
      ...("pricePO" in patch ? { pricePO: numStr(patch.pricePO) } : {}),
      ...("priceFO" in patch ? { priceFO: numStr(patch.priceFO) } : {}),
      updatedAt: new Date(),
    };
    this.services.set(id, next);
    return next;
  }
  async deleteService(id: string) {
    return this.services.delete(id);
  }

  // --- Matter agreements (Način dogovora) ---
  async listMatterAgreements(matterId: string) {
    return [...this.agreements.values()]
      .filter((a) => a.matterId === matterId)
      .sort((a, b) => +b.createdAt - +a.createdAt);
  }
  async createMatterAgreement(a: InsertMatterAgreement) {
    const row: MatterAgreement = {
      id: randomUUID(),
      matterId: a.matterId,
      agreementType: a.agreementType,
      documentNumber: a.documentNumber ?? null,
      validFrom: dateStr(a.validFrom),
      validTo: dateStr(a.validTo),
      note: a.note ?? null,
      createdAt: new Date(),
    };
    this.agreements.set(row.id, row);
    return row;
  }
  async deleteMatterAgreement(id: string) {
    return this.agreements.delete(id);
  }

  // --- Pavšal packages ---
  async listPausalPackages() {
    return [...this.pausalPackages.values()].sort((a, b) => a.code.localeCompare(b.code, "sl"));
  }
  async getPausalPackageByCode(code: string) {
    const lc = code.toLowerCase();
    return [...this.pausalPackages.values()].find((p) => p.code.toLowerCase() === lc);
  }
  async createPausalPackage(p: InsertPausalPackage) {
    const now = new Date();
    const row: PausalPackage = {
      id: randomUUID(),
      code: p.code,
      name: p.name,
      includedHours: numStr(p.includedHours)!,
      reducedRate: numStr(p.reducedRate),
      createdAt: now,
      updatedAt: now,
    };
    this.pausalPackages.set(row.id, row);
    return row;
  }
  async updatePausalPackage(id: string, patch: UpdatePausalPackage) {
    const cur = this.pausalPackages.get(id);
    if (!cur) return undefined;
    const next: PausalPackage = {
      ...cur,
      ...("code" in patch && patch.code !== undefined ? { code: patch.code } : {}),
      ...("name" in patch && patch.name !== undefined ? { name: patch.name } : {}),
      ...("includedHours" in patch && patch.includedHours !== undefined ? { includedHours: numStr(patch.includedHours)! } : {}),
      ...("reducedRate" in patch ? { reducedRate: numStr(patch.reducedRate) } : {}),
      updatedAt: new Date(),
    };
    this.pausalPackages.set(id, next);
    return next;
  }
  async deletePausalPackage(id: string) {
    return this.pausalPackages.delete(id);
  }

  // --- Radar items ---
  async listRadarItems(opts?: RadarFilter) {
    let rows = [...this.radar.values()];
    if (opts?.area) rows = rows.filter((r) => r.area === opts.area);
    if (opts?.sinceDays !== undefined) {
      const cutoff = new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString().slice(0, 10);
      rows = rows.filter((r) => (r.publishedAt ?? dateStr(r.createdAt)!) >= cutoff);
    }
    const key = (r: RadarItem) => r.publishedAt ?? dateStr(r.createdAt)!;
    return rows.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : +b.createdAt - +a.createdAt));
  }
  async getRadarItemByDedupKey(key: string) {
    return [...this.radar.values()].find((r) => r.dedupKey === key);
  }
  async createRadarItem(i: InsertRadarItem) {
    const row: RadarItem = {
      id: randomUUID(),
      dedupKey: i.dedupKey,
      area: i.area,
      title: i.title,
      source: i.source,
      url: i.url ?? null,
      summary: i.summary ?? null,
      publishedAt: dateStr(i.publishedAt),
      createdAt: new Date(),
    };
    this.radar.set(row.id, row);
    return row;
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
        payRate: numStr(u.payRate),
      })
      .returning();
    return row;
  }
  async updateUser(id: string, patch: Partial<NewUser>) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.username !== undefined) set.username = patch.username;
    if (patch.passwordHash !== undefined) set.passwordHash = patch.passwordHash;
    if (patch.role !== undefined) set.role = patch.role;
    if ("email" in patch) set.email = patch.email ?? null;
    if ("displayName" in patch) set.displayName = patch.displayName ?? null;
    if ("payRate" in patch) set.payRate = numStr(patch.payRate);
    const [row] = await this.db.update(appUsers).set(set).where(eq(appUsers.id, id)).returning();
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
        clientId: m.clientId ?? null,
        title: m.title,
        area: m.area,
        serviceCode: m.serviceCode ?? null,
        billingType: m.billingType,
        hourlyRate: numStr(m.hourlyRate),
        flatFee: numStr(m.flatFee),
        status: m.status,
        waitingReason: m.waitingReason ?? null,
        waitingNote: m.waitingNote ?? null,
        pausalPackageCode: m.pausalPackageCode ?? null,
        includedHours: numStr(m.includedHours),
        reducedRate: numStr(m.reducedRate),
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
    if ("clientId" in patch) set.clientId = patch.clientId ?? null;
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.area !== undefined) set.area = patch.area;
    if ("serviceCode" in patch) set.serviceCode = patch.serviceCode ?? null;
    if (patch.billingType !== undefined) set.billingType = patch.billingType;
    if ("hourlyRate" in patch) set.hourlyRate = numStr(patch.hourlyRate);
    if ("flatFee" in patch) set.flatFee = numStr(patch.flatFee);
    if (patch.status !== undefined) set.status = patch.status;
    if ("waitingReason" in patch) set.waitingReason = patch.waitingReason ?? null;
    if ("waitingNote" in patch) set.waitingNote = patch.waitingNote ?? null;
    if ("pausalPackageCode" in patch) set.pausalPackageCode = patch.pausalPackageCode ?? null;
    if ("includedHours" in patch) set.includedHours = numStr(patch.includedHours);
    if ("reducedRate" in patch) set.reducedRate = numStr(patch.reducedRate);
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
    await this.db.delete(matterAgreements).where(eq(matterAgreements.matterId, id));
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

  // --- Clients ---
  async listClients(f?: ClientFilter) {
    const conds: SQL[] = [];
    if (f?.status) conds.push(eq(clients.status, f.status));
    const base = this.db.select().from(clients).orderBy(clients.name);
    return this.rows<Client>(base, conds);
  }
  async getClient(id: string) {
    const [row] = await this.db.select().from(clients).where(eq(clients.id, id));
    return row;
  }
  async getClientByCode(code: string) {
    const [row] = await this.db
      .select()
      .from(clients)
      .where(sql`lower(${clients.code}) = lower(${code})`);
    return row;
  }
  async createClient(c: InsertClient) {
    const [row] = await this.db
      .insert(clients)
      .values({
        code: c.code,
        name: c.name,
        kind: c.kind,
        status: c.status,
        area: c.area ?? null,
        contractType: c.contractType,
        documentNumber: c.documentNumber ?? null,
        validFrom: dateStr(c.validFrom),
        validTo: dateStr(c.validTo),
        subject: c.subject ?? null,
        notes: c.notes ?? null,
      })
      .returning();
    return row;
  }
  async updateClient(id: string, patch: UpdateClient) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.code !== undefined) set.code = patch.code;
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.kind !== undefined) set.kind = patch.kind;
    if (patch.status !== undefined) set.status = patch.status;
    if ("area" in patch) set.area = patch.area ?? null;
    if (patch.contractType !== undefined) set.contractType = patch.contractType;
    if ("documentNumber" in patch) set.documentNumber = patch.documentNumber ?? null;
    if ("validFrom" in patch) set.validFrom = dateStr(patch.validFrom);
    if ("validTo" in patch) set.validTo = dateStr(patch.validTo);
    if ("subject" in patch) set.subject = patch.subject ?? null;
    if ("notes" in patch) set.notes = patch.notes ?? null;
    const [row] = await this.db.update(clients).set(set).where(eq(clients.id, id)).returning();
    return row;
  }
  async deleteClient(id: string) {
    const res = await this.db.delete(clients).where(eq(clients.id, id)).returning();
    return res.length > 0;
  }

  // --- Services (Cenik) ---
  async listServices() {
    return this.db.select().from(services).orderBy(services.code);
  }
  async getServiceByCode(code: string) {
    const [row] = await this.db
      .select()
      .from(services)
      .where(sql`lower(${services.code}) = lower(${code})`);
    return row;
  }
  async createService(s: InsertService) {
    const [row] = await this.db
      .insert(services)
      .values({
        code: s.code,
        name: s.name,
        unit: s.unit,
        pricePO: numStr(s.pricePO),
        priceFO: numStr(s.priceFO),
      })
      .returning();
    return row;
  }
  async updateService(id: string, patch: UpdateService) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.code !== undefined) set.code = patch.code;
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.unit !== undefined) set.unit = patch.unit;
    if ("pricePO" in patch) set.pricePO = numStr(patch.pricePO);
    if ("priceFO" in patch) set.priceFO = numStr(patch.priceFO);
    const [row] = await this.db.update(services).set(set).where(eq(services.id, id)).returning();
    return row;
  }
  async deleteService(id: string) {
    const res = await this.db.delete(services).where(eq(services.id, id)).returning();
    return res.length > 0;
  }

  // --- Matter agreements (Način dogovora) ---
  async listMatterAgreements(matterId: string) {
    return this.db
      .select()
      .from(matterAgreements)
      .where(eq(matterAgreements.matterId, matterId))
      .orderBy(desc(matterAgreements.createdAt));
  }
  async createMatterAgreement(a: InsertMatterAgreement) {
    const [row] = await this.db
      .insert(matterAgreements)
      .values({
        matterId: a.matterId,
        agreementType: a.agreementType,
        documentNumber: a.documentNumber ?? null,
        validFrom: dateStr(a.validFrom),
        validTo: dateStr(a.validTo),
        note: a.note ?? null,
      })
      .returning();
    return row;
  }
  async deleteMatterAgreement(id: string) {
    const res = await this.db.delete(matterAgreements).where(eq(matterAgreements.id, id)).returning();
    return res.length > 0;
  }

  // --- Pavšal packages ---
  async listPausalPackages() {
    return this.db.select().from(pausalPackages).orderBy(pausalPackages.code);
  }
  async getPausalPackageByCode(code: string) {
    const [row] = await this.db
      .select()
      .from(pausalPackages)
      .where(sql`lower(${pausalPackages.code}) = lower(${code})`);
    return row;
  }
  async createPausalPackage(p: InsertPausalPackage) {
    const [row] = await this.db
      .insert(pausalPackages)
      .values({
        code: p.code,
        name: p.name,
        includedHours: numStr(p.includedHours)!,
        reducedRate: numStr(p.reducedRate),
      })
      .returning();
    return row;
  }
  async updatePausalPackage(id: string, patch: UpdatePausalPackage) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.code !== undefined) set.code = patch.code;
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.includedHours !== undefined) set.includedHours = numStr(patch.includedHours);
    if ("reducedRate" in patch) set.reducedRate = numStr(patch.reducedRate);
    const [row] = await this.db.update(pausalPackages).set(set).where(eq(pausalPackages.id, id)).returning();
    return row;
  }
  async deletePausalPackage(id: string) {
    const res = await this.db.delete(pausalPackages).where(eq(pausalPackages.id, id)).returning();
    return res.length > 0;
  }

  // --- Radar items ---
  async listRadarItems(opts?: RadarFilter) {
    const conds: SQL[] = [];
    if (opts?.area) conds.push(eq(radarItems.area, opts.area));
    if (opts?.sinceDays !== undefined) {
      const cutoff = new Date(Date.now() - opts.sinceDays * 86_400_000).toISOString().slice(0, 10);
      // Fall back to created_at when published_at is null.
      conds.push(sql`COALESCE(${radarItems.publishedAt}, ${radarItems.createdAt}::date) >= ${cutoff}`);
    }
    const base = this.db
      .select()
      .from(radarItems)
      .orderBy(sql`COALESCE(${radarItems.publishedAt}, ${radarItems.createdAt}::date) DESC`, desc(radarItems.createdAt));
    return this.rows<RadarItem>(base, conds);
  }
  async getRadarItemByDedupKey(key: string) {
    const [row] = await this.db.select().from(radarItems).where(eq(radarItems.dedupKey, key));
    return row;
  }
  async createRadarItem(i: InsertRadarItem) {
    const [row] = await this.db
      .insert(radarItems)
      .values({
        dedupKey: i.dedupKey,
        area: i.area,
        title: i.title,
        source: i.source,
        url: i.url ?? null,
        summary: i.summary ?? null,
        publishedAt: dateStr(i.publishedAt),
      })
      .returning();
    return row;
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
