import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { toToolError } from "./errors.js";

const MAX_TEXT_ROWS = 25;

/** Build the text serialization, truncating a large `rows` array for readability. */
function textForStructured(structured: Record<string, unknown>): string {
  const rows = structured["rows"];
  if (Array.isArray(rows) && rows.length > MAX_TEXT_ROWS) {
    const preview = { ...structured, rows: rows.slice(0, MAX_TEXT_ROWS) };
    return (
      JSON.stringify(preview, null, 2) +
      `\n... (${rows.length - MAX_TEXT_ROWS} more rows omitted from text; full set in structuredContent)`
    );
  }
  return JSON.stringify(structured, null, 2);
}

/** Successful tool result: structured content + a text serialization. */
export function ok(structured: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: textForStructured(structured) }],
    structuredContent: structured,
  };
}

/**
 * Error tool result. Deliberately omits `structuredContent`: MCP clients validate
 * any present structuredContent against the success outputSchema even for error
 * results, so an error payload would be rejected. The normalized error is encoded
 * in the readable text (category/status + SAP code + hint) instead.
 */
export function fail(err: unknown): CallToolResult {
  const e = toToolError(err);
  const parts = [`[${e.category}/${e.status}] ${e.message}`];
  if (e.sapCode) parts.push(`(SAP ${e.sapCode})`);
  if (e.retryAfterSeconds !== undefined) parts.push(`(retry after ${e.retryAfterSeconds}s)`);
  const text = parts.join(" ") + (e.hint ? `\nHint: ${e.hint}` : "");
  return {
    content: [{ type: "text", text }],
    isError: true,
  };
}
