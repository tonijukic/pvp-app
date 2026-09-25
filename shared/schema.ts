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
export const BILLING_TYPES = ["pausal", "po_urah", "pausal_ure", "projekt"] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

/** Matter lifecycle phase (incl. Nina's final-check gate before closing). */
export const MATTER_STATUSES = [
  "odprta",
  "v_teku",
  "caka",
  "za_pregled",
  "posredovano",
  "zakljucena",
] as const;
export type MatterStatus = (typeof MATTER_STATUSES)[number];

/** Structured reason a matter is in status "caka" (who/what it waits on). */
export const WAITING_REASONS = [
  "stranka_odgovor",
  "stranka_gradivo",
  "stranka_placilo",
  "nasprotna_stranka",
  "organ_odlocba",
  "sodisce",
  "tretja_oseba",
  "potek_roka",
  "interni_pregled",
  "drugo",
] as const;
export type WaitingReason = (typeof WAITING_REASONS)[number];

/** How an engagement was agreed, recorded per matter (with history). */
export const AGREEMENT_TYPES = ["narocilnica", "pogodba", "ustno", "mail"] as const;
export type AgreementType = (typeof AGREEMENT_TYPES)[number];

/** Cenik units. */
export const SERVICE_UNITS = ["ura", "mesec", "kos", "min", "paket", "dan", "projekt", "km", "odstotek"] as const;
export type ServiceUnit = (typeof SERVICE_UNITS)[number];

/** Deadline severity, 1 (low) .. 3 (critical). */
export const DEADLINE_STATUSES = ["odprt", "opravljen"] as const;
export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number];

/** Deadline kind: internal task deadline vs. a client's statutory obligation. */
export const DEADLINE_KINDS = ["interni", "obveznost_stranke"] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

/** Recurrence: one-off vs. yearly (e.g. KPK annual report). */
export const DEADLINE_RECURRENCE = ["enkraten", "letni"] as const;
export type DeadlineRecurrence = (typeof DEADLINE_RECURRENCE)[number];

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
  payRate: numeric("pay_rate", { precision: 10, scale: 2 }), // urna postavka za plačilo člana (obračun ekipe)
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const createUserSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(6).max(200),
  role: z.enum(APP_ROLE_VALUES).default("member"),
  email: z.string().email().optional(),
  displayName: z.string().max(120).nullable().optional(),
  payRate: z.coerce.number().min(0).max(100000).nullable().optional(),
});

/** Admin edits an existing team member: rename, change e-mail, reassign
 * rights (role), or reset password. All fields optional (partial update). */
export const updateUserSchema = z.object({
  password: z.string().min(6, "Geslo mora imeti vsaj 6 znakov").max(200).optional(),
  role: z.enum(APP_ROLE_VALUES).optional(),
  email: z.string().email().nullable().optional(),
  displayName: z.string().max(120).nullable().optional(),
  payRate: z.coerce.number().min(0).max(100000).nullable().optional(),
});
export type UpdateUser = z.infer<typeof updateUserSchema>;

export type AppUserRow = typeof appUsers.$inferSelect;
export type SafeUser = Omit<AppUserRow, "passwordHash">;

// ---------------------------------------------------------------------------
// Matters (Zadeve)
// ---------------------------------------------------------------------------

export const matters = pgTable("matters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  client: text("client").notNull(), // denormaliziran naziv stranke (za prikaz)
  clientId: varchar("client_id"), // vez na stranko (CRM), ko je izbrana iz baze
  title: text("title").notNull(),
  area: text("area").$type<PracticeArea>().notNull().default("drugo"),
  serviceCode: text("service_code"), // kratica storitve iz cenika (npr. PS, NPA)
  billingType: text("billing_type").$type<BillingType>().notNull().default("po_urah"),
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  flatFee: numeric("flat_fee", { precision: 10, scale: 2 }),
  status: text("status").$type<MatterStatus>().notNull().default("odprta"),
  waitingReason: text("waiting_reason").$type<WaitingReason>(), // zakaj/na koga se čaka (ko je status "caka")
  waitingNote: text("waiting_note"), // prosti opis, ko je razlog "drugo"
  // Pavšal-ure snapshot (kopira se ob nastavitvi, kasnejši uredniki paketa ne vplivajo na obstoječe naloge)
  pausalPackageCode: text("pausal_package_code"),
  includedHours: numeric("included_hours", { precision: 6, scale: 2 }),
  reducedRate: numeric("reduced_rate", { precision: 10, scale: 2 }),
  openedAt: date("opened_at"),
  assignedTo: varchar("assigned_to"),
  notes: text("notes"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMatterSchema = createInsertSchema(matters, {
  client: (s) => s.min(1, "Stranka je obvezna").max(200),
  clientId: (s) => s.optional(),
  serviceCode: (s) => s.max(40).optional(),
  title: (s) => s.min(1, "Opis naloge je obvezen").max(300),
  area: () => z.enum(PRACTICE_AREAS),
  billingType: () => z.enum(BILLING_TYPES),
  status: () => z.enum(MATTER_STATUSES),
  waitingReason: () => z.enum(WAITING_REASONS).optional(),
  waitingNote: (s) => s.max(500).optional(),
  pausalPackageCode: (s) => s.max(40).optional(),
  includedHours: () => z.coerce.number().min(0).max(1000).optional(),
  reducedRate: () => z.coerce.number().min(0).max(100000).optional(),
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
  kind: text("kind").$type<DeadlineKind>().notNull().default("interni"),
  recurrence: text("recurrence").$type<DeadlineRecurrence>().notNull().default("enkraten"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertDeadlineSchema = createInsertSchema(deadlines, {
  matterId: (s) => s.min(1),
  title: (s) => s.min(1, "Opis roka je obvezen").max(300),
  dueDate: () => z.coerce.date(),
  severity: () => z.coerce.number().int().min(1).max(3),
  remindDaysBefore: () => z.coerce.number().int().min(0).max(60),
  status: () => z.enum(DEADLINE_STATUSES),
  kind: () => z.enum(DEADLINE_KINDS).default("interni"),
  recurrence: () => z.enum(DEADLINE_RECURRENCE).default("enkraten"),
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

// ---------------------------------------------------------------------------
// Clients (Stranke / CRM)
// ---------------------------------------------------------------------------

/** Legal entity (PO) vs natural person (FO) — drives cenik pricing later. */
export const CLIENT_KINDS = ["pravna", "fizicna"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

/** Active client vs potential (lead). */
export const CLIENT_STATUSES = ["aktivna", "potencialna"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/** Engagement basis. */
export const CONTRACT_TYPES = ["pogodba", "narocilnica", "brez"] as const;
export type ContractType = (typeof CONTRACT_TYPES)[number];

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // kratica, ki jo določi Nina
  name: text("name").notNull(),
  kind: text("kind").$type<ClientKind>().notNull().default("pravna"),
  status: text("status").$type<ClientStatus>().notNull().default("aktivna"),
  area: text("area").$type<PracticeArea>(), // pretežno področje
  contractType: text("contract_type").$type<ContractType>().notNull().default("brez"),
  documentNumber: text("document_number"), // št. pogodbe/naročilnice
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  subject: text("subject"), // opis predmeta (cene/specifike)
  notes: text("notes"), // opombe: želje / nujne potrebe
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertClientSchema = createInsertSchema(clients, {
  code: (s) => s.min(1, "Kratica je obvezna").max(40),
  name: (s) => s.min(1, "Naziv je obvezen").max(300),
  kind: () => z.enum(CLIENT_KINDS).default("pravna"),
  status: () => z.enum(CLIENT_STATUSES).default("aktivna"),
  area: () => z.enum(PRACTICE_AREAS).optional(),
  contractType: () => z.enum(CONTRACT_TYPES).default("brez"),
  documentNumber: (s) => s.max(120).optional(),
  validFrom: () => z.coerce.date().optional(),
  validTo: () => z.coerce.date().optional(),
  subject: (s) => s.max(2000).optional(),
  notes: (s) => s.max(2000).optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateClientSchema = insertClientSchema.partial();

export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type UpdateClient = z.infer<typeof updateClientSchema>;

// ---------------------------------------------------------------------------
// Services (Cenik) — Nina's price list; PO = pravna oseba, FO = fizična oseba
// ---------------------------------------------------------------------------

export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // kratica (PS, PM, NPA…)
  name: text("name").notNull(),
  unit: text("unit").$type<ServiceUnit>().notNull().default("ura"),
  pricePO: numeric("price_po", { precision: 10, scale: 2 }), // pravna oseba
  priceFO: numeric("price_fo", { precision: 10, scale: 2 }), // fizična oseba
  pricePOForeign: numeric("price_po_foreign", { precision: 10, scale: 2 }), // Vrednost PO - tujina
  priceNote: text("price_note"), // prosti opis nenumerične cene (npr. "po dogovoru", "od 3 do 7 %")
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertServiceSchema = createInsertSchema(services, {
  code: (s) => s.min(1, "Kratica je obvezna").max(40),
  name: (s) => s.min(1, "Naziv je obvezen").max(300),
  unit: () => z.enum(SERVICE_UNITS).default("ura"),
  pricePO: () => z.coerce.number().min(0).max(1000000).nullable().optional(),
  priceFO: () => z.coerce.number().min(0).max(1000000).nullable().optional(),
  pricePOForeign: () => z.coerce.number().min(0).max(1000000).nullable().optional(),
  priceNote: (s) => s.max(200).nullable().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updateServiceSchema = insertServiceSchema.partial();

export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type UpdateService = z.infer<typeof updateServiceSchema>;

// ---------------------------------------------------------------------------
// Matter agreements (Način dogovora) — per-matter engagement basis WITH history
// ---------------------------------------------------------------------------

export const matterAgreements = pgTable("matter_agreements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matterId: varchar("matter_id").notNull(),
  agreementType: text("agreement_type").$type<AgreementType>().notNull(),
  documentNumber: text("document_number"), // št. naročilnice/pogodbe
  validFrom: date("valid_from"),
  validTo: date("valid_to"),
  note: text("note"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertMatterAgreementSchema = createInsertSchema(matterAgreements, {
  matterId: (s) => s.min(1),
  agreementType: () => z.enum(AGREEMENT_TYPES),
  documentNumber: (s) => s.max(120).optional(),
  validFrom: () => z.coerce.date().optional(),
  validTo: () => z.coerce.date().optional(),
  note: (s) => s.max(1000).optional(),
}).omit({ id: true, createdAt: true });

export type MatterAgreement = typeof matterAgreements.$inferSelect;
export type InsertMatterAgreement = z.infer<typeof insertMatterAgreementSchema>;

// ---------------------------------------------------------------------------
// Pavšal packages — configurable (included hours + reduced over-quota rate)
// ---------------------------------------------------------------------------

export const pausalPackages = pgTable("pausal_packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  includedHours: numeric("included_hours", { precision: 6, scale: 2 }).notNull(),
  reducedRate: numeric("reduced_rate", { precision: 10, scale: 2 }), // absolutna €/h nad kvoto
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertPausalPackageSchema = createInsertSchema(pausalPackages, {
  code: (s) => s.min(1, "Kratica je obvezna").max(40),
  name: (s) => s.min(1, "Naziv je obvezen").max(300),
  includedHours: () => z.coerce.number().min(0).max(1000),
  reducedRate: () => z.coerce.number().min(0).max(100000).nullable().optional(),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const updatePausalPackageSchema = insertPausalPackageSchema.partial();

export type PausalPackage = typeof pausalPackages.$inferSelect;
export type InsertPausalPackage = z.infer<typeof insertPausalPackageSchema>;
export type UpdatePausalPackage = z.infer<typeof updatePausalPackageSchema>;

// ---------------------------------------------------------------------------
// Radar items (Zakonodajni radar) — newly published/upcoming SI legislation
// relevant to Nina's practice areas, gathered by the radar job.
// ---------------------------------------------------------------------------

export const radarItems = pgTable("radar_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Stable key for dedup across runs, e.g. `${source}:${externalId or url}`.
  dedupKey: text("dedup_key").notNull().unique(),
  area: text("area").$type<PracticeArea>().notNull(),
  title: text("title").notNull(),
  source: text("source").notNull(), // "PISRS", "PISRS-API", "IP-RS", …
  url: text("url"),
  summary: text("summary"),
  publishedAt: date("published_at"),
  // On-demand AI insight (generated + cached on first open of the detail page).
  summaryTeam: text("summary_team"), // "Povzetek za ekipo" — business-tuned brief
  newsletterText: text("newsletter_text"), // "Za obvestilnik" — publish-ready paragraph
  aiGeneratedAt: timestamp("ai_generated_at"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertRadarItemSchema = createInsertSchema(radarItems, {
  dedupKey: (s) => s.min(1).max(500),
  area: () => z.enum(PRACTICE_AREAS),
  title: (s) => s.min(1).max(500),
  source: (s) => s.min(1).max(60),
  url: (s) => s.max(1000).optional(),
  summary: (s) => s.max(4000).optional(),
  publishedAt: () => z.coerce.date().optional(),
}).omit({ id: true, createdAt: true, summaryTeam: true, newsletterText: true, aiGeneratedAt: true });

export type RadarItem = typeof radarItems.$inferSelect;
export type InsertRadarItem = z.infer<typeof insertRadarItemSchema>;
