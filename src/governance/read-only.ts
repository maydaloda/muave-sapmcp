import type { ResolvedSystem } from "../config/resolve.js";

/** True if the system permits write operations. */
export function writesEnabled(system: ResolvedSystem): boolean {
  return !system.readOnly;
}
