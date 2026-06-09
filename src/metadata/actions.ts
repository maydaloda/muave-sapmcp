import type { BoundAction } from "./parse-shared.js";

/** Coerce a fast-xml-parser node value into an array. */
function asArray(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null) return [];
  return [v];
}

/** Strip a `Collection(...)` wrapper from an EDM type reference. */
export function stripCollection(type: string): string {
  return type.replace(/^Collection\(/, "").replace(/\)$/, "");
}

/**
 * Parse bound actions/functions from a v4 EDMX tree, keyed by the SHORT name of
 * their binding entity type (the type of the first/binding parameter).
 *
 * In SAP RAP A2X services the draft lifecycle is exposed as bound actions named
 * Edit / Prepare / Activate / Discard / Resume; the bound-action FQN is
 * `<schemaNamespace>.<ActionName>` (e.g. `com.sap.gateway.srvd_a2x.<srv>.v0001.Edit`).
 */
export function parseBoundActions(tree: unknown): Map<string, BoundAction[]> {
  const byType = new Map<string, BoundAction[]>();
  const root = tree as any;
  const edmx = root?.["edmx:Edmx"] ?? root?.Edmx;
  const ds = edmx?.["edmx:DataServices"] ?? edmx?.DataServices;
  if (!ds) return byType;

  for (const schema of asArray(ds.Schema)) {
    const ns: string = schema["@_Namespace"] || "";
    for (const kind of ["Action", "Function"] as const) {
      for (const item of asArray(schema[kind])) {
        if (item["@_IsBound"] !== "true") continue;
        const params = asArray(item.Parameter);
        const binding = params[0];
        if (!binding) continue;
        const bindType = stripCollection(binding["@_Type"] || "");
        const shortType = bindType.split(".").pop();
        const name: string = item["@_Name"];
        if (!shortType || !name) continue;
        const fqn = ns ? `${ns}.${name}` : name;
        const list = byType.get(shortType) ?? [];
        list.push({ name, fqn, isFunction: kind === "Function" });
        byType.set(shortType, list);
      }
    }
  }
  return byType;
}
