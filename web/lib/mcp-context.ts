import { eq } from "drizzle-orm";
import { createLogger, ODataClient, type ToolContext } from "muave-sapmcp";
import { db, dbReady, schema } from "./db";
import { FilteredSystemDirectory } from "./filtered-directory";
import { PostgresCatalogStore } from "./catalog-store";
import { getGlobalSap } from "./systems";

/** The group allowlist for a user; admins implicitly get all systems. */
export async function allowedSystemsFor(userId: string): Promise<string[]> {
  await dbReady;
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId)).limit(1);
  if (!u) return [];
  if (u.role === "admin") return ["*"];
  if (!u.groupId) return [];
  const [g] = await db.select().from(schema.groups).where(eq(schema.groups.id, u.groupId)).limit(1);
  return g?.allowedSystems ?? [];
}

/**
 * Build the per-request ToolContext for an authenticated user: group-filtered
 * system directory, group-scoped catalog store, an ODataClient whose resolver
 * enforces the same filter, and a logger bound to the user id.
 */
export async function buildToolContext(userId: string): Promise<ToolContext> {
  const sap = await getGlobalSap();
  const allowedSystems = await allowedSystemsFor(userId);

  const config = new FilteredSystemDirectory(sap.store, allowedSystems);
  const store = new PostgresCatalogStore(allowedSystems);
  await store.load();

  const logger = createLogger({ userId });
  const client = new ODataClient({ resolver: config, logger, limiter: sap.limiter });

  return { config, client, store, governance: sap.governance, logger };
}
