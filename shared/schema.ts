import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums — modeled as `as const` string arrays + text() columns (not pg enums),
// so they are the single source of truth for both Drizzle and Zod.
// ---------------------------------------------------------------------------

/** Roles: Nina = admin (all matters + users + summaries); employees = member. */
export const APP_ROLE_VALUES = ["member", "admin"] as const;
export type AppRole = (typeof APP_ROLE_VALUES)[number];

/** Nina's practice areas (used to tag matters and later filter the radar). */
export const PRACTICE_AREAS = [
  "delovno_pravo",
  "javni_usluzbenci",
  "javna_narocila",
  "gdpr",
  "ijz",
  "obligacije",
  "drugo",
] as const;
export type PracticeArea = (typeof PRACTICE_AREAS)[number];

/** Billing model per matter. */
export const BILLING_TYPES = ["pausal", "po_urah"] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

/** Matter lifecycle phase. */
export const MATTER_STATUSES = ["odprta", "v_teku", "caka", "zakljucena"] as const;
export type MatterStatus = (typeof MATTER_STATUSES)[number];

/** Deadline severity, 1 (low) .. 3 (critical). */
export const DEADLINE_STATUSES = ["odprt", "opravljen"] as const;
export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number];

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const appUsers = pgTable("app_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<AppRole>().notNull().default("member"),
  email: text("email"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const createUserSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(6).max(200),
  role: z.enum(APP_ROLE_VALUES).default("member"),
  email: z.string().email().optional(),
  displayName: z.string().max(120).nullable().optional(),
});
export type AppUserRow = typeof appUsers.$inferSelect;
export type SafeUser = Omit<AppUserRow, "passwordHash">;

// ---------------------------------------------------------------------------
// Matters (Zadeve)
// ---------------------------------------------------------------------------

export const matters = pgTable("matters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  client: text("client").notNull(),
  title: text("title").notNull(),
  area: text("area").$type<PracticeArea>().notNull().default("drugo"),
  billingType: text("billing_type").$type<BillingType>().notNull().default("po_urah"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  flatFee: numeric("flat_fee", { precision: 10, scale: 2 }),
  status: text("status").$type<MatterStatus>().notNull().default("odprta"),
  openedAt: date("opened_at"),
  assignedTo: varchar("assigned_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMatterSchema = createInsertSchema(matters, {
  client: (s) => s.min(1, "Stranka je obvezna").max(200),
  title: (s) => s.min(1, "Naziv zadeve je obvezen").max(300),
  area: () => z.enum(PRACTICE_AREAS),
  billingType: () => z.enum(BILLING_TYPES),
  status: () => z.enum(MATTER_STATUSES),
  hourlyRate: () => z.coerce.number().min(0).max(100000).optional(),
  flatFee: () => z.coerce.number().min(0).max(1000000).optional(),
  openedAt: () => z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateMatterSchema = insertMatterSchema.partial();

export type Matter = typeof matters.$inferSelect;
export type InsertMatter = z.infer<typeof insertMatterSchema>;
export type UpdateMatter = z.infer<typeof updateMatterSchema>;

// ---------------------------------------------------------------------------
// Time entries (Ure)
// ---------------------------------------------------------------------------

export const timeEntries = pgTable("time_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matterId: varchar("matter_id").notNull(),
  userId: varchar("user_id"),
  date: date("date").notNull(),
  description: text("description").notNull(),
  hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTimeEntrySchema = createInsertSchema(timeEntries, {
  matterId: (s) => s.min(1),
  description: (s) => s.min(1, "Opis dela je obvezen").max(500),
  hours: () => z.coerce.number().min(0.05, "Ure morajo biti > 0").max(24),
  date: () => z.coerce.date(),
}).omit({ id: true, createdAt: true });

export type TimeEntry = typeof timeEntries.$inferSelect;
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;

// ---------------------------------------------------------------------------
// Deadlines (Roki)
// ---------------------------------------------------------------------------

export const deadlines = pgTable("deadlines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matterId: varchar("matter_id").notNull(),
  title: text("title").notNull(),
  dueDate: date("due_date").notNull(),
  severity: integer("severity").notNull().default(2),
  remindDaysBefore: integer("remind_days_before").notNull().default(3),
  status: text("status").$type<DeadlineStatus>().notNull().default("odprt"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertDeadlineSchema = createInsertSchema(deadlines, {
  matterId: (s) => s.min(1),
  title: (s) => s.min(1, "Opis roka je obvezen").max(300),
  dueDate: () => z.coerce.date(),
  severity: () => z.coerce.number().int().min(1).max(3),
  remindDaysBefore: () => z.coerce.number().int().min(0).max(60),
  status: () => z.enum(DEADLINE_STATUSES),
}).omit({ id: true, createdAt: true });

export const updateDeadlineSchema = insertDeadlineSchema.partial();

export type Deadline = typeof deadlines.$inferSelect;
export type InsertDeadline = z.infer<typeof insertDeadlineSchema>;
export type UpdateDeadline = z.infer<typeof updateDeadlineSchema>;

// ---------------------------------------------------------------------------
// Costs (Stroški)
// ---------------------------------------------------------------------------

export const costs = pgTable("costs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matterId: varchar("matter_id").notNull(),
  date: date("date").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCostSchema = createInsertSchema(costs, {
  matterId: (s) => s.min(1),
  description: (s) => s.min(1, "Opis stroška je obvezen").max(300),
  amount: () => z.coerce.number().min(0).max(1000000),
  date: () => z.coerce.date(),
}).omit({ id: true, createdAt: true });

export type Cost = typeof costs.$inferSelect;
export type InsertCost = z.infer<typeof insertCostSchema>;
