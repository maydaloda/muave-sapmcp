/**
 * Database handle.
 *
 * - Production (Vercel): `DATABASE_URL` → node-postgres Pool (works with Neon's
 *   pooled connection string or any Postgres).
 * - Local dev / E2E without infrastructure: no `DATABASE_URL` → embedded PGlite
 *   (file-backed WASM Postgres under web/.data/), migrations applied on boot.
 */
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "../drizzle/schema";

export type Db = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __muaveDb: { db: Db; ready: Promise<void> } | undefined;
}

/**
 * Runtime connection string. This deployment is pinned to Supabase, so the
 * Vercel↔Supabase pooled URL (transaction pooler — the right choice for
 * serverless) wins first. It must take precedence over a stray DATABASE_URL,
 * because this project also has a legacy Neon integration that sets
 * DATABASE_URL/POSTGRES_URL. DATABASE_URL remains the local-dev override when
 * no Supabase var is present.
 */
function runtimeUrl(): string | undefined {
  return (
    process.env.SUPABASE_POSTGRES_POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL
  );
}

/**
 * Build a pg Pool that connects over TLS without verifying the cert chain for
 * remote hosts. Supabase's pooler presents a self-signed chain, and newer pg
 * treats `sslmode=require` as full verification (→ SELF_SIGNED_CERT_IN_CHAIN).
 * We strip any sslmode so it can't re-impose verify-full over this setting.
 * Local (localhost) connections stay plaintext.
 */
function pgPool(connectionString: string): Pool {
  const u = new URL(connectionString);
  const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  u.searchParams.delete("sslmode");
  return new Pool({
    connectionString: u.toString(),
    max: 5,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
}

function create(): { db: Db; ready: Promise<void> } {
  const url = runtimeUrl();
  if (url) {
    const pool = pgPool(url);
    const db = drizzlePg(pool, { schema });
    return { db, ready: Promise.resolve() };
  }

  // The embedded PGlite fallback is for LOCAL DEVELOPMENT only — serverless
  // filesystems are read-only/ephemeral. Fail fast at RUNTIME on Vercel with an
  // actionable message, but never during `next build` (NEXT_PHASE) or locally
  // (no VERCEL), so builds and the local PGlite test harness keep working.
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.VERCEL && !isBuildPhase) {
    throw new Error(
      "No Postgres connection string found. Attach a database (e.g. the Vercel↔Supabase " +
        "integration, which sets SUPABASE_POSTGRES_POSTGRES_URL) or set DATABASE_URL, then redeploy. " +
        "The embedded PGlite database only works for local development."
    );
  }

  // Embedded dev database. PGlite is imported lazily so production bundles
  // never touch it when DATABASE_URL is set.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  const dataDir = join(process.cwd(), ".data", "pglite");
  mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema });
  const ready = migratePglite(db, { migrationsFolder: join(process.cwd(), "drizzle", "migrations") });
  return { db, ready };
}

const instance = globalThis.__muaveDb ?? create();
globalThis.__muaveDb = instance;

export const db = instance.db;
/** Await before first use in dev (PGlite migrations); resolved immediately on Postgres. */
export const dbReady = instance.ready;
export { schema };
