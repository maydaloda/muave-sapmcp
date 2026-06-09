import type { ODataVersion } from "../types.js";

export interface VersionBehavior {
  accept: string;
  /** v2 needs `$format=json`; v4 returns JSON by default. */
  forceJsonQuery: boolean;
  /** Query param that requests an inline total count. */
  countParam: string;
  /** Method used to fetch a CSRF token. */
  csrfMethod: "GET" | "HEAD";
}

export const VERSION_BEHAVIOR: Record<ODataVersion, VersionBehavior> = {
  v2: {
    accept: "application/json",
    forceJsonQuery: true,
    countParam: "$inlinecount=allpages",
    csrfMethod: "GET",
  },
  v4: {
    accept: "application/json",
    forceJsonQuery: false,
    countParam: "$count=true",
    csrfMethod: "HEAD",
  },
};

/** Recursively stringify numbers (OData V2 JSON requires Edm.Decimal/Int64 as strings). */
export function stringifyNumbersDeep(value: unknown): unknown {
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(stringifyNumbersDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = stringifyNumbersDeep(v);
    return out;
  }
  return value;
}

/**
 * Serialize a request body for the given version. V2 coerces numbers to strings;
 * V4 sends JSON as-is. Date/time fields should be provided pre-formatted by the
 * caller (V2 `/Date(ms)/`, V4 ISO-8601); use `odata_request` for exotic shapes.
 */
export function serializeRequestBody(body: unknown, version: ODataVersion): string {
  return version === "v2" ? JSON.stringify(stringifyNumbersDeep(body)) : JSON.stringify(body);
}
