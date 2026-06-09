import { randomUUID } from "node:crypto";

/**
 * Generate a correlation id used to tie together a single logical operation
 * across log lines (and forwarded to SAP as `x-correlation-id`).
 */
export function newCorrelationId(): string {
  return randomUUID();
}
