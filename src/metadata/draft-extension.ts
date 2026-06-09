import { parseBoundActions } from "./actions.js";
import type { ParsedMetadata } from "./parse-shared.js";

function asArray(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (v === undefined || v === null) return [];
  return [v];
}

/** True if any annotation's Term leaf matches `leaf` (e.g. "DraftRoot") and isn't `false`. */
function hasAnnotationLeaf(annos: any[], leaf: string): boolean {
  for (const a of annos) {
    const term: string = a["@_Term"] || "";
    if (term.endsWith(leaf)) {
      // Term present; treat absence of explicit Bool="false" as enabled.
      return a["@_Bool"] !== "false";
    }
  }
  return false;
}

/**
 * Augment parsed entities with draft + bound-action info from the raw EDMX tree.
 *
 * Draft detection requires the trio of signals (any one is sufficient, but the
 * combination guards against false positives): an `IsActiveEntity` key field, a
 * `DraftAdministrativeData` navigation property, or a `Common.DraftRoot` /
 * `Common.DraftNode` annotation on the entity type.
 *
 * No-op for v2 (no bound actions / drafts on classic Gateway services).
 */
export function applyDraftAndActionInfo(parsed: ParsedMetadata): void {
  if (parsed.version === "v2") return;

  const tree = parsed.raw as any;
  const edmx = tree?.["edmx:Edmx"] ?? tree?.Edmx;
  const ds = edmx?.["edmx:DataServices"] ?? edmx?.DataServices;
  if (!ds) return;

  const actionsByType = parseBoundActions(tree);

  // Draft annotations keyed by short entity-type name.
  const draftRoot = new Set<string>();
  const draftNode = new Set<string>();
  for (const schema of asArray(ds.Schema)) {
    for (const t of asArray(schema.EntityType)) {
      const annos = asArray(t.Annotation);
      if (hasAnnotationLeaf(annos, "DraftRoot")) draftRoot.add(t["@_Name"]);
      if (hasAnnotationLeaf(annos, "DraftNode")) draftNode.add(t["@_Name"]);
    }
    for (const block of asArray(schema.Annotations)) {
      const target: string = block["@_Target"] || "";
      if (!target || target.includes("/")) continue; // type-level targets only
      const shortType = target.split(".").pop();
      if (!shortType) continue;
      const annos = asArray(block.Annotation);
      if (hasAnnotationLeaf(annos, "DraftRoot")) draftRoot.add(shortType);
      if (hasAnnotationLeaf(annos, "DraftNode")) draftNode.add(shortType);
    }
  }

  for (const entity of parsed.entities) {
    const type = entity.entityTypeName;

    const boundActions = actionsByType.get(type);
    if (boundActions && boundActions.length > 0) {
      entity.boundActions = boundActions;
    }

    const hasIsActiveKey = entity.keyFields.includes("IsActiveEntity");
    const hasDraftAdmin = entity.properties.some(
      (p) => p.name === "DraftAdministrativeData" && p.navigationTarget !== null
    );
    const isRoot = draftRoot.has(type);
    const isNode = draftNode.has(type);

    if (hasIsActiveKey || hasDraftAdmin || isRoot || isNode) {
      entity.isDraftEnabled = true;
      if (hasIsActiveKey) entity.draftKeyField = "IsActiveEntity";
      if (isRoot) entity.isDraftRoot = true;
      if (isNode) entity.isDraftNode = true;
    }
  }
}
