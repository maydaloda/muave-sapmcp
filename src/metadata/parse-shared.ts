/**
 * Shared helpers + normalized types used by both the v2 and v4 OData `$metadata`
 * parsers. Ported from the reference implementation; extended with optional
 * draft / bound-action fields (backward compatible — absent on v2 / non-draft).
 */
import type { ODataVersion } from "../types.js";

export interface ParsedProperty {
  name: string;
  edmType: string;
  label: string | null;
  maxLength: number | null;
  isKey: boolean;
  isNullable: boolean;
  filterable: boolean;
  sortable: boolean;
  navigationTarget: string | null;
  navigationIsCollection: boolean;
}

/** A bound OData action/function (used to drive draft lifecycle on V4 RAP services). */
export interface BoundAction {
  /** Leaf name, e.g. "Edit" | "Prepare" | "Activate" | "Discard" | "Resume". */
  name: string;
  /** Fully-qualified name, e.g. `com.sap.gateway.srvd_a2x.<srv>.v0001.Edit`. */
  fqn: string;
  isFunction: boolean;
}

export interface ParsedEntity {
  /** EntitySet name (e.g. "A_Product") — used as the addressable URL segment. */
  entitySetName: string;
  /** EntityType name (e.g. "ProductType") — used by NavigationProperty refs. */
  entityTypeName: string;
  keyFields: string[];
  labelFieldGuess: string | null;
  searchable: boolean;
  properties: ParsedProperty[];

  // --- Optional draft fields (V4 RAP/Fiori; absent otherwise) ---
  /** True when the entity is draft-enabled (IsActiveEntity key / DraftAdministrativeData / DraftRoot|Node). */
  isDraftEnabled?: boolean;
  /** The draft discriminator key field (typically "IsActiveEntity"). */
  draftKeyField?: string;
  isDraftRoot?: boolean;
  isDraftNode?: boolean;
  /** Bound actions/functions on this entity type (e.g. draft Edit/Prepare/Activate). */
  boundActions?: BoundAction[];
}

export interface ParsedMetadata {
  entities: ParsedEntity[];
  /** Set by the parseMetadata() facade. */
  version?: ODataVersion;
  /** The flattened parser output, retained for debug/raw storage + draft extension. */
  raw: unknown;
}

/**
 * Heuristic best-guess "name" field for an entity (used as the default
 * label/text field).
 */
export function guessLabelField(props: ParsedProperty[]): string | null {
  const stringy = props.filter(
    (p) => p.edmType.startsWith("Edm.String") && !p.isKey && !p.navigationTarget
  );
  const candidates = ["Description", "Name", "Title", "Text", "Label"];
  for (const c of candidates) {
    const hit = stringy.find((p) => p.name === c || p.name.endsWith(c));
    if (hit) return hit.name;
  }
  return stringy[0]?.name ?? null;
}

/** Read `sap:label` attribute (used by v2 and as a v4 fallback). */
export function extractSapLabel(node: any): string | null {
  return node["@_sap:label"] || null;
}

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
