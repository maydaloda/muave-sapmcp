import { z } from "zod";

/**
 * Envelope validation for the on-disk catalog cache. Entities are validated
 * loosely (passthrough objects) since they are produced by our own parser; the
 * schemaVersion gate is the primary corruption guard.
 */
const RegisteredServiceSchema = z.object({
  systemKey: z.string(),
  serviceId: z.string(),
  servicePath: z.string(),
  version: z.enum(["v2", "v4"]),
  title: z.string().optional(),
  fetchedAt: z.string(),
  entities: z.array(z.record(z.string(), z.unknown())),
});

export const CatalogFileSchema = z.object({
  schemaVersion: z.number(),
  services: z.record(z.string(), RegisteredServiceSchema),
});
