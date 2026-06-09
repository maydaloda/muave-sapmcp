import type { ODataVersion } from "../types.js";
import type { ParsedProperty } from "../metadata/parse-shared.js";

export type KeyScalar = string | number | boolean;
export type KeyValue = KeyScalar | Record<string, KeyScalar>;

/**
 * Build an OData key predicate, e.g. `('1')`, `(42)`, or `(K1='a',K2=2)`.
 *
 * Quoting is driven by the property's EDM type when available: strings are
 * single-quoted with `''` escaping, numerics/booleans are bare, and GUIDs use
 * `guid'...'` on V2 (bare on V4).
 */
export function buildKeyPredicate(
  keyFields: string[],
  key: KeyValue,
  version: ODataVersion,
  propsByName?: Map<string, ParsedProperty>
): string {
  if (keyFields.length === 0) {
    throw new Error("Cannot build a key predicate: the entity has no key fields.");
  }

  if (typeof key === "object") {
    const missing = keyFields.filter((f) => !(f in key));
    if (missing.length > 0) {
      throw new Error(`Key map is missing required key field(s): ${missing.join(", ")}.`);
    }
    const parts = keyFields.map(
      (f) => `${f}=${formatKeyValue(key[f] as KeyScalar, propsByName?.get(f), version)}`
    );
    return `(${parts.join(",")})`;
  }

  if (keyFields.length > 1) {
    throw new Error(
      `Entity has a composite key (${keyFields.join(", ")}); pass a {field: value} map, not a single value.`
    );
  }
  const only = keyFields[0] as string;
  return `(${formatKeyValue(key, propsByName?.get(only), version)})`;
}

function formatKeyValue(
  value: KeyScalar,
  prop: ParsedProperty | undefined,
  version: ODataVersion
): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  const edm = prop?.edmType ?? "";
  if (/Edm\.Guid/i.test(edm)) {
    return version === "v2" ? `guid'${value}'` : `${value}`;
  }
  if (/Edm\.(Int16|Int32|Int64|Decimal|Double|Single|Byte|SByte)/i.test(edm)) {
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}
