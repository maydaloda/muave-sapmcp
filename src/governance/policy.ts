import type { ResolvedSystem } from "../config/resolve.js";
import type { HttpMethod } from "../types.js";
import { entityAllowed } from "./allowlist.js";
import { annotationsFor, type ToolAnnotationHints } from "./annotations.js";
import { isDestructive } from "./confirmation.js";
import { writesEnabled } from "./read-only.js";

export class GovernanceError extends Error {
  readonly category = "governance";
  constructor(message: string) {
    super(message);
    this.name = "GovernanceError";
  }
}

/**
 * Enforces write governance (defense in depth alongside the client's read-only
 * gate): read-only systems and entity allowlists. Also classifies destructive
 * operations and derives MCP annotation hints.
 */
export class GovernancePolicy {
  /** Throw {@link GovernanceError} if `method` may not target `entitySet` on `system`. */
  assertWriteAllowed(system: ResolvedSystem, method: HttpMethod, entitySet: string): void {
    if (method === "GET" || method === "HEAD") return;

    if (!writesEnabled(system)) {
      throw new GovernanceError(
        `System "${system.key}" is read-only. Set "readOnly": false for it in systems.json to enable writes.`
      );
    }
    if (!entityAllowed(system, entitySet)) {
      throw new GovernanceError(
        `Entity "${entitySet}" is not in the write allowlist for system "${system.key}" ` +
          `(allowed: ${(system.allowedEntities ?? []).join(", ") || "(none)"}).`
      );
    }
  }

  isDestructive(method: HttpMethod): boolean {
    return isDestructive(method);
  }

  annotationsFor(method: HttpMethod): ToolAnnotationHints {
    return annotationsFor(method);
  }
}
