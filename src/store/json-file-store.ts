import { readFile } from "node:fs/promises";
import type { Logger } from "../observability/logger.js";
import { writeFileAtomic } from "./atomic-write.js";
import { CatalogFileSchema } from "./catalog-schema.js";
import {
  CATALOG_SCHEMA_VERSION,
  serviceCacheKey,
  type CatalogFile,
  type CatalogStore,
  type RegisteredService,
} from "./catalog-store.js";

/** Catalog cache persisted to a single JSON file with atomic writes. */
export class JsonFileCatalogStore implements CatalogStore {
  private data: CatalogFile = { schemaVersion: CATALOG_SCHEMA_VERSION, services: {} };

  constructor(
    private readonly filePath: string,
    private readonly logger: Logger
  ) {}

  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        this.logger.warn(
          { file: this.filePath, err: err instanceof Error ? err.message : String(err) },
          "could not read catalog cache — starting empty"
        );
      }
      this.reset();
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn({ file: this.filePath }, "catalog cache is not valid JSON — starting empty");
      this.reset();
      return;
    }

    const result = CatalogFileSchema.safeParse(parsed);
    if (!result.success || result.data.schemaVersion !== CATALOG_SCHEMA_VERSION) {
      this.logger.warn(
        { file: this.filePath, schemaVersion: (parsed as CatalogFile)?.schemaVersion },
        "catalog cache failed validation or has an unsupported schemaVersion — starting empty"
      );
      this.reset();
      return;
    }
    this.data = result.data as unknown as CatalogFile;
  }

  listServices(systemKey?: string): RegisteredService[] {
    const all = Object.values(this.data.services);
    return systemKey ? all.filter((s) => s.systemKey === systemKey) : all;
  }

  getService(systemKey: string, serviceId: string): RegisteredService | undefined {
    return this.data.services[serviceCacheKey(systemKey, serviceId)];
  }

  async putService(service: RegisteredService): Promise<void> {
    this.data.services[serviceCacheKey(service.systemKey, service.serviceId)] = service;
    await this.persist();
  }

  async deleteService(systemKey: string, serviceId: string): Promise<boolean> {
    const key = serviceCacheKey(systemKey, serviceId);
    const existed = key in this.data.services;
    if (existed) {
      delete this.data.services[key];
      await this.persist();
    }
    return existed;
  }

  private reset(): void {
    this.data = { schemaVersion: CATALOG_SCHEMA_VERSION, services: {} };
  }

  private async persist(): Promise<void> {
    await writeFileAtomic(this.filePath, JSON.stringify(this.data, null, 2));
  }
}
