import type { ODataVersion } from "../types.js";
import type { QueryParams } from "./types.js";
import { VERSION_BEHAVIOR } from "./version-behavior.js";

/**
 * Build a `?$...`-prefixed query string from {@link QueryParams}.
 *
 * V2 always gets `$format=json`. `$filter` values are passed through verbatim
 * (callers compose version-correct V2/V4 filter syntax) but URL-encoded. The
 * count param is version-specific (`$inlinecount=allpages` vs `$count=true`).
 */
export function buildQueryString(
  query: QueryParams | undefined,
  version: ODataVersion,
  includeFormat = true
): string {
  const behavior = VERSION_BEHAVIOR[version];
  const parts: string[] = [];

  // SAP V2 rejects $-system query options (incl. $format) on writes — only emit on reads.
  if (includeFormat && behavior.forceJsonQuery) parts.push("$format=json");

  if (query) {
    if (query.filter) parts.push(`$filter=${encodeURIComponent(query.filter)}`);
    if (query.select?.length) parts.push(`$select=${encodeURIComponent(query.select.join(","))}`);
    if (query.expand?.length) parts.push(`$expand=${encodeURIComponent(query.expand.join(","))}`);
    if (query.orderby?.length)
      parts.push(`$orderby=${encodeURIComponent(query.orderby.join(","))}`);
    if (typeof query.top === "number") parts.push(`$top=${query.top}`);
    if (typeof query.skip === "number") parts.push(`$skip=${query.skip}`);
    if (query.count) parts.push(behavior.countParam);
    if (query.raw) {
      for (const [k, v] of Object.entries(query.raw)) {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
      }
    }
  }

  return parts.length ? `?${parts.join("&")}` : "";
}
