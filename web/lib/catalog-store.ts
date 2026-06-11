import { eq } from "drizzle-orm";
import { serviceCacheKey, type CatalogStore, type RegisteredService } from "muave-sapmcp";
import { db, schema } from "./db";

/**
 * Postgres-backed CatalogStore (replaces the stdio build's catalog.json).
 * `load()` pulls all rows into memory for the request (the interface's reads
 * are synchronous); writes go to the DB and the in-memory map.
 *
 * An `allowedSystems` filter scopes reads server-side so users never see
 * services registered on systems their group cannot access ("*" = all).
 */
export class PostgresCatalogStore implements CatalogStore {
  private services = new Map<string, RegisteredService>();
  private readonly allowAll: boolean;
  private readonly allowed: Set<string>;

  constructor(allowedSystems: string[]) {
    this.allowAll = allowedSystems.includes("*");
    this.allowed = new Set(allowedSystems);
  }

  private isAllowed(systemKey: string): boolean {
    return this.allowAll || this.allowed.has(systemKey);
  }

  async load(): Promise<void> {
    const rows = await db.select().from(schema.catalogServices);
    this.services = new Map(rows.map((r) => [r.key, r.data as RegisteredService]));
  }

  listServices(systemKey?: string): RegisteredService[] {
    const all = [...this.services.values()].filter((s) => this.isAllowed(s.systemKey));
    return systemKey ? all.filter((s) => s.systemKey === systemKey) : all;
  }

  getService(systemKey: string, serviceId: string): RegisteredService | undefined {
    if (!this.isAllowed(systemKey)) return undefined;
    return this.services.get(serviceCacheKey(systemKey, serviceId));
  }

  async putService(service: RegisteredService): Promise<void> {
    const key = serviceCacheKey(service.systemKey, service.serviceId);
    await db
      .insert(schema.catalogServices)
      .values({ key, data: service, fetchedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.catalogServices.key,
        set: { data: service, fetchedAt: new Date() },
      });
    this.services.set(key, service);
  }

  async deleteService(systemKey: string, serviceId: string): Promise<boolean> {
    const key = serviceCacheKey(systemKey, serviceId);
    const existed = this.services.delete(key);
    await db.delete(schema.catalogServices).where(eq(schema.catalogServices.key, key));
    return existed;
  }
}
