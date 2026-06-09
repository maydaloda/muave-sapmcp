import type { ODataVersion } from "../types.js";

export interface NormalizedBody {
  /** Array for a collection, object for a single entity, or null. */
  data: unknown;
  count: number | undefined;
  nextLink: string | undefined;
}

/**
 * Normalize a parsed JSON response body across V2/V4 shapes.
 * V2 collection: `d.results` (+ `d.__count`, `d.__next`); single: `d`.
 * V4 collection: `value` (+ `@odata.count`, `@odata.nextLink`); single: top-level.
 */
export function normalizeBody(body: unknown, version: ODataVersion): NormalizedBody {
  if (body === null || body === undefined) {
    return { data: null, count: undefined, nextLink: undefined };
  }
  const b = body as Record<string, any>;

  if (version === "v2") {
    const d = b.d;
    if (d && Array.isArray(d.results)) {
      return {
        data: d.results,
        count: toNumber(d.__count),
        nextLink: typeof d.__next === "string" ? d.__next : undefined,
      };
    }
    return { data: d ?? body, count: undefined, nextLink: undefined };
  }

  // v4
  if (Array.isArray(b.value)) {
    return {
      data: b.value,
      count: toNumber(b["@odata.count"]),
      nextLink: typeof b["@odata.nextLink"] === "string" ? b["@odata.nextLink"] : undefined,
    };
  }
  return { data: body, count: undefined, nextLink: undefined };
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}
