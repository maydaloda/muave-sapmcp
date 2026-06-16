/**
 * Deploy-time database migration (production / Vercel build step).
 *
 * The runtime node-postgres path in lib/db.ts does NOT apply migrations (only the
 * local PGlite fallback does), so a fresh column in drizzle/migrations would never
 * reach Neon — and better-auth's session query, which selects every user column,
 * 500s with `column ... does not exist`. Running this in the build (where
 * DATABASE_URL is present) keeps the live schema in lockstep with the code.
 *
 * - No DATABASE_URL (CI, local build, PGlite dev) → no-op, exit 0.
 * - Applies any pending Drizzle migrations via the official migrator.
 * - Safety net: if the migrator can't run cleanly (e.g. the DB was provisioned
 *   without migration tracking), ensure the specific columns the app needs exist
 *   with idempotent `ADD COLUMN IF NOT EXISTS`, so the deploy still recovers.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[predeploy-migrate] DATABASE_URL not set — skipping (local/PGlite applies its own migrations).");
  process.exit(0);
}

const migrationsFolder = fileURLToPath(new URL("../drizzle/migrations", import.meta.url));
const pool = new pg.Pool({ connectionString: url, max: 1 });

/** Idempotent guarantee that the columns the running code reads/writes exist. */
async function ensureRequiredColumns() {
  await pool.query(
    'ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer DEFAULT 0 NOT NULL'
  );
  await pool.query('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "locked_until" timestamp');
}

try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.log("[predeploy-migrate] Drizzle migrations applied (or already up to date).");
} catch (err) {
  console.error(
    "[predeploy-migrate] migrator did not run cleanly — applying idempotent safety net:",
    err?.message ?? err
  );
  try {
    await ensureRequiredColumns();
    console.log("[predeploy-migrate] required columns ensured via safety net.");
  } catch (e2) {
    console.error("[predeploy-migrate] FATAL: could not reconcile schema:", e2?.message ?? e2);
    await pool.end();
    process.exit(1);
  }
}

await pool.end();
process.exit(0);
