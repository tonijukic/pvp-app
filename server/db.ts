import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "@shared/schema";
import { config } from "./config";

// Singleton pg Pool + Drizzle instance. Lazily created so in-memory storage
// and unit tests (which use MemStorage) never require a live database.
let pool: Pool | undefined;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | undefined;

// Managed Postgres (Neon, Render, RDS, Supabase) requires TLS. On some hosts the
// container CA bundle can't verify the provider chain, so we encrypt without
// strict verification. Plain local Postgres (no sslmode in the URL) stays off.
function needsSsl(url: string): boolean {
  return /sslmode=|neon\.tech|render\.com|amazonaws\.com|\.supabase\./.test(url);
}

export function getDb() {
  if (!dbInstance) {
    if (!config.databaseUrl) {
      throw new Error("DATABASE_URL is not set — required for the Drizzle storage");
    }
    pool = new Pool({
      connectionString: config.databaseUrl,
      ...(needsSsl(config.databaseUrl) ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    dbInstance = drizzle(pool, { schema });
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  dbInstance = undefined;
}

// Apply committed migrations at boot. No-op when running in-memory (no DATABASE_URL).
// Neon (free tier) scales to zero when idle; the first connection wakes it and can
// transiently fail, so we retry with backoff instead of crashing the whole boot.
export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  const attempts = 6;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await migrate(db, { migrationsFolder: "./drizzle" });
      return;
    } catch (err) {
      if (i === attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000 * i)); // 2s,4s,…,10s
    }
  }
}
