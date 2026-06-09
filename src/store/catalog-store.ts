import type { ParsedEntity } from "../metadata/parse-shared.js";
import type { ODataVersion } from "../types.js";

export const CATALOG_SCHEMA_VERSION = 1;

/** A registered OData service with its parsed (draft-aware) metadata. */
export interface RegisteredService {
  systemKey: string;
  serviceId: string;
  servicePath: string;
  version: ODataVersion;
  title?: string;
  /** ISO timestamp of the last metadata fetch. */
  fetchedAt: string;
  entities: ParsedEntity[];
}

export interface CatalogFile {
  schemaVersion: number;
  /** Keyed by `${systemKey}:${serviceId}`. */
  services: Record<string, RegisteredService>;
}

export interface CatalogStore {
  /** Load the cache from disk (call once at startup). */
  load(): Promise<void>;
  listServices(systemKey?: string): RegisteredService[];
  getService(systemKey: string, serviceId: string): RegisteredService | undefined;
  putService(service: RegisteredService): Promise<void>;
  /** Returns true if a service was removed. */
  deleteService(systemKey: string, serviceId: string): Promise<boolean>;
}

export function serviceCacheKey(systemKey: string, serviceId: string): string {
  return `${systemKey}:${serviceId}`;
}
