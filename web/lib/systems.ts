/**
 * System configuration source: merges the operator's env config
 * (MUAVE_SYSTEMS_JSON) with admin-managed systems from the database.
 *
 * DB-system credentials are stored encrypted (lib/crypto.ts) and resolved at
 * call time through a CredentialResolver that understands `muavedb:` refs —
 * the core package neither knows nor cares that the "env var name" is a DB ref.
 *
 * Shared-for-the-process: token cache, concurrency limiter, governance, the env
 * config. Built per request: the merged ConfigStore (so admin additions apply
 * immediately, while SAP OAuth tokens still reuse the shared TokenCache).
 */
import { eq } from "drizzle-orm";
import {
  ConcurrencyLimiter,
  ConfigStore,
  ConfigError,
  EnvCredentialResolver,
  GovernancePolicy,
  loadSystemsFile,
  logger,
  SystemConfigSchema,
  TokenCache,
  type AuthDeps,
  type CredentialResolver,
  type SystemConfig,
  type SystemsFile,
} from "muave-sapmcp";
import { db, dbReady, schema } from "./db";
import { decryptSecret } from "./crypto";

const DB_REF_PREFIX = "muavedb:";

/** Resolves `muavedb:<systemKey>:<field>` refs from encrypted DB columns; else env. */
class CompositeCredentialResolver implements CredentialResolver {
  private readonly env = new EnvCredentialResolver();

  async get(ref: string): Promise<string | undefined> {
    if (!ref.startsWith(DB_REF_PREFIX)) return this.env.get(ref);
    const [, systemKey, field] = ref.split(":");
    if (!systemKey || !field) return undefined;
    await dbReady;
    const [row] = await db
      .select()
      .from(schema.sapSystems)
      .where(eq(schema.sapSystems.key, systemKey))
      .limit(1);
    if (!row) return undefined;
    const column = {
      user: row.encUser,
      password: row.encPassword,
      clientId: row.encClientId,
      clientSecret: row.encClientSecret,
    }[field];
    return column ? decryptSecret(column) : undefined;
  }

  async getRequired(ref: string): Promise<string> {
    const value = await this.get(ref);
    if (value === undefined) {
      throw new Error(`Credential not available for ref "${ref}".`);
    }
    return value;
  }
}

interface SharedSap {
  envFile: SystemsFile;
  authDeps: AuthDeps;
  limiter: ConcurrencyLimiter;
  governance: GovernancePolicy;
}

declare global {
  // eslint-disable-next-line no-var
  var __muaveSapShared: Promise<SharedSap> | undefined;
}

async function createShared(): Promise<SharedSap> {
  // Env config (MUAVE_SYSTEMS_JSON) is OPTIONAL on the web deployment — systems
  // can be managed entirely via /admin/systems. Missing config = empty list.
  let envFile: SystemsFile;
  try {
    envFile = await loadSystemsFile();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    logger.info("no MUAVE_SYSTEMS_JSON / systems.json — using admin-managed systems only");
    envFile = { schemaVersion: 1, systems: [] };
  }
  const authDeps: AuthDeps = {
    credentials: new CompositeCredentialResolver(),
    tokenCache: new TokenCache(),
    logger,
  };
  return { envFile, authDeps, limiter: new ConcurrencyLimiter(15), governance: new GovernancePolicy() };
}

export function getShared(): Promise<SharedSap> {
  globalThis.__muaveSapShared ??= createShared();
  return globalThis.__muaveSapShared;
}

/** Map a DB row to a SystemConfig whose credential refs point back at the row. */
function rowToSystemConfig(row: typeof schema.sapSystems.$inferSelect): unknown {
  const base = {
    key: row.key,
    name: row.name ?? row.key,
    baseUrl: row.baseUrl,
    ...(row.sapClient ? { sapClient: row.sapClient } : {}),
    readOnly: row.readOnly,
  };
  if (row.authType === "OAUTH2") {
    return {
      ...base,
      authType: "OAUTH2",
      tokenUrl: row.tokenUrl ?? "",
      clientIdEnvVar: `${DB_REF_PREFIX}${row.key}:clientId`,
      clientSecretEnvVar: `${DB_REF_PREFIX}${row.key}:clientSecret`,
    };
  }
  return {
    ...base,
    authType: "BASIC",
    userEnvVar: `${DB_REF_PREFIX}${row.key}:user`,
    passwordEnvVar: `${DB_REF_PREFIX}${row.key}:password`,
  };
}

export interface MergedSystems {
  store: ConfigStore;
  limiter: ConcurrencyLimiter;
  governance: GovernancePolicy;
  /** Keys whose definition came from the database (editable in /admin/systems). */
  dbKeys: Set<string>;
}

/**
 * Build the merged, validated system directory (env + DB). Env-defined systems
 * win on key collision (the operator outranks the admin UI).
 */
export async function getMergedSystems(): Promise<MergedSystems> {
  const shared = await getShared();
  await dbReady;
  const rows = await db.select().from(schema.sapSystems);

  const envKeys = new Set(shared.envFile.systems.map((s) => s.key));
  const dbConfigs: unknown[] = [];
  const dbKeys = new Set<string>();
  for (const row of rows) {
    if (envKeys.has(row.key)) {
      logger.warn({ system: row.key }, "DB system shadowed by env config — env wins");
      continue;
    }
    dbConfigs.push(rowToSystemConfig(row));
    dbKeys.add(row.key);
  }

  // Validate DB rows individually (applies schema defaults). The file-level
  // schema requires >=1 system, but an empty directory is legal here — the
  // admin simply hasn't added systems yet.
  const dbParsed = dbConfigs.map((c) => SystemConfigSchema.parse(c));
  const systems = [...shared.envFile.systems, ...dbParsed];
  const defaultSystem =
    shared.envFile.defaultSystem && systems.some((s) => s.key === shared.envFile.defaultSystem)
      ? shared.envFile.defaultSystem
      : undefined;
  const merged: SystemsFile = {
    schemaVersion: 1,
    systems,
    ...(defaultSystem ? { defaultSystem } : {}),
  };

  return {
    store: new ConfigStore(merged, shared.authDeps),
    limiter: shared.limiter,
    governance: shared.governance,
    dbKeys,
  };
}

/** All configured system keys with their source (for the admin UI). */
export async function allSystemKeys(): Promise<string[]> {
  const { store } = await getMergedSystems();
  return store.listSystems().map((s) => s.key);
}

export async function systemKeysWithSource(): Promise<Array<{ key: string; source: "env" | "db" }>> {
  const { store, dbKeys } = await getMergedSystems();
  return store.listSystems().map((s) => ({ key: s.key, source: dbKeys.has(s.key) ? "db" : "env" }));
}

export type { SystemConfig };
