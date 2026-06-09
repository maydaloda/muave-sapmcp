import type { HttpMethod } from "../types.js";

/** MCP tool annotation hints. */
export interface ToolAnnotationHints {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** Derive MCP annotation hints for a tool that issues `method` against SAP. */
export function annotationsFor(method: HttpMethod): ToolAnnotationHints {
  switch (method) {
    case "GET":
    case "HEAD":
      return { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
    case "POST":
      return { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
    case "PATCH":
    case "PUT":
    case "DELETE":
      return { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true };
  }
}
