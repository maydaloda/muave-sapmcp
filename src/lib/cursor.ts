import type { QueryParams } from "../odata/types.js";
import type { ODataVersion } from "../types.js";

/**
 * Opaque, self-contained pagination cursor for query_entities. Encodes either a
 * server-driven continuation link or a client-driven `$skip` offset, plus the
 * request identity so a cursor cannot be replayed against a different entity set.
 */
export interface CursorState {
  system: string | undefined;
  serviceId: string;
  entitySet: string;
  version: ODataVersion;
  top: number;
  count: boolean;
  /** Server-driven continuation (absolute or service-relative). */
  nextLink?: string;
  /** Client-driven paging offset for the next page. */
  skip?: number;
  /** Echoed query so client-driven paging stays consistent across pages. */
  query?: QueryParams;
}

export function encodeCursor(state: CursorState): string {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeCursor(token: string): CursorState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid pagination cursor (not decodable).");
  }
  const s = parsed as Partial<CursorState>;
  if (
    typeof s !== "object" ||
    s === null ||
    typeof s.serviceId !== "string" ||
    typeof s.entitySet !== "string" ||
    (s.version !== "v2" && s.version !== "v4") ||
    typeof s.top !== "number"
  ) {
    throw new Error("Invalid pagination cursor (unexpected shape).");
  }
  return s as CursorState;
}
