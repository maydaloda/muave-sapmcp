import type { HttpMethod } from "../types.js";

/**
 * Whether a method overwrites or removes existing data (used to set the MCP
 * destructive annotation and to require explicit confirmation). POST (create) is
 * non-destructive; PATCH/PUT/DELETE are.
 */
export function isDestructive(method: HttpMethod): boolean {
  return method === "PATCH" || method === "PUT" || method === "DELETE";
}
