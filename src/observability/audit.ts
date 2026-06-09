import type { Logger } from "./logger.js";

/** A single auditable write event against an SAP system. */
export interface AuditWriteEvent {
  system: string;
  operation: "create" | "update" | "delete" | "activate_draft" | "raw_write";
  serviceId?: string;
  entitySet?: string;
  /** Stringified key predicate or key map (never includes secrets). */
  key?: string;
  method: string;
  outcome: "executed" | "dry-run" | "blocked" | "failed";
  status?: number;
  correlationId: string;
  reason?: string;
}

/**
 * Emit a structured audit record for a write attempt. Audit lines are tagged
 * `audit: true` so they can be filtered/shipped separately. Never include
 * credentials, tokens, or full payloads here.
 */
export function auditWrite(log: Logger, event: AuditWriteEvent): void {
  log.info({ audit: true, ...event }, `audit ${event.operation} ${event.outcome}`);
}
