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

function create(): { db: Db; ready: Promise<void> } {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url, max: 5 });
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
      "DATABASE_URL is not set. Attach a Postgres database (e.g. Neon) to this deployment, " +
        "set DATABASE_URL as an environment variable, and redeploy. " +
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
