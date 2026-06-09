import type { ResolvedSystem } from "../config/resolve.js";

/**
 * True if `entitySet` may be written on this system. An undefined allowlist means
 * "all entities" (only meaningful once writes are enabled). Matching is exact on
 * the entity-set name.
 */
export function entityAllowed(system: ResolvedSystem, entitySet: string): boolean {
  if (!system.allowedEntities) return true;
  return system.allowedEntities.includes(entitySet);
}
