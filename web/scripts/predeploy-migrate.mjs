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

// Migrations need a DIRECT (non-pooled) connection — the transaction pooler
// rejects the migrator's prepared statements. This deployment is pinned to
// Supabase, so its non-pooling URL wins first (ahead of the legacy Neon
// DATABASE_URL/POSTGRES_URL this project also carries).
const url =
  process.env.SUPABASE_POSTGRES_POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_POSTGRES_POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;
if (!url) {
  console.log("[predeploy-migrate] no Postgres URL set — skipping (local/PGlite applies its own migrations).");
  process.exit(0);
}

const migrationsFolder = fileURLToPath(new URL("../drizzle/migrations", import.meta.url));

// Connect over TLS without verifying the cert chain for remote hosts. Supabase's
// pooler presents a self-signed chain, and newer pg treats sslmode=require as
// full verification (→ SELF_SIGNED_CERT_IN_CHAIN). Strip sslmode so it can't
// re-impose verify-full over this explicit setting; keep localhost plaintext.
const u = new URL(url);
const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
u.searchParams.delete("sslmode");
const pool = new pg.Pool({
  connectionString: u.toString(),
  max: 1,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

// Connectivity failures (e.g. the direct/non-pooling host is IPv6-only and
// unreachable from the build sandbox) must NOT block a deploy — the schema is
// managed and migrations can be applied out-of-band. Real SQL/migration errors
// still fail the build.
const NET_CODES = new Set(["ENOTFOUND", "ENOENT", "EAI_AGAIN", "ETIMEDOUT", "ECONNREFUSED", "ENETUNREACH"]);
const isNetErr = (e) =>
  !!e && (NET_CODES.has(e.code) || (Array.isArray(e.errors) && e.errors.some((x) => NET_CODES.has(x?.code))));

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
    if (isNetErr(err) || isNetErr(e2)) {
      console.warn(
        "[predeploy-migrate] database unreachable at build time — skipping (apply migrations out-of-band). Deploy continues."
      );
      await pool.end().catch(() => {});
      process.exit(0);
    }
    console.error("[predeploy-migrate] FATAL: could not reconcile schema:", e2?.message ?? e2);
    await pool.end();
    process.exit(1);
  }
}

await pool.end();
process.exit(0);
