import { XMLParser } from "fast-xml-parser";
import {
  guessLabelField,
  extractSapLabel,
  isObj,
  type ParsedEntity,
  type ParsedMetadata,
  type ParsedProperty,
} from "./parse-shared.js";

/**
 * Parses an OData v2 EDMX 1.0 `$metadata` XML document into the same
 * normalized shape used by parse-v4.
 *
 * Notable v2 vs v4 differences this parser handles:
 *  - Different namespaces. fast-xml-parser strips prefixes when not requested,
 *    so walking is the same.
 *  - Inline `sap:label="..."` etc. attributes instead of `<Annotation Term=...>`.
 *  - NavigationProperty uses `Relationship`, `FromRole`, `ToRole`; the actual
 *    target type lives in a separate `<Association>` block, looked up by name.
 *  - Multiplicity on Association.End decides whether the nav prop is a
 *    collection ("*") or single ("1" / "0..1").
 */
export function parseV2Metadata(xml: string): ParsedMetadata {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    isArray: (name) =>
      [
        "Schema",
        "EntityType",
        "Property",
        "NavigationProperty",
        "PropertyRef",
        "EntityContainer",
        "EntitySet",
        "Association",
        "End",
      ].includes(name),
    parseAttributeValue: false,
    trimValues: true,
  });

  const tree = parser.parse(xml);
  const edmx =
    tree?.["edmx:Edmx"] ??
    tree?.Edmx ??
    Object.values(tree ?? {}).find((v): v is Record<string, unknown> => isObj(v));
  if (!edmx) {
    throw new Error("Unrecognized v2 $metadata: no <edmx:Edmx> root");
  }
  const dataServices = (edmx as any)["edmx:DataServices"] ?? (edmx as any).DataServices;
  if (!dataServices) {
    throw new Error("Unrecognized v2 $metadata: no <edmx:DataServices>");
  }

  const schemas: any[] = Array.isArray(dataServices.Schema)
    ? dataServices.Schema
    : dataServices.Schema
      ? [dataServices.Schema]
      : [];
  if (schemas.length === 0) {
    throw new Error("Unrecognized v2 $metadata: no <Schema> elements");
  }

  // Pass 1a: collect EntityTypes by qname for nav-target resolution later.
  const entityTypeByQName = new Map<string, { schema: any; node: any }>();
  for (const schema of schemas) {
    const ns: string = schema["@_Namespace"] || "";
    const types: any[] = Array.isArray(schema.EntityType) ? schema.EntityType : [];
    for (const t of types) {
      const qname = ns ? `${ns}.${t["@_Name"]}` : t["@_Name"];
      entityTypeByQName.set(qname, { schema, node: t });
    }
  }

  // Pass 1b: collect Associations by qname so NavigationProperty resolution
  // can find its target via `Relationship` + `ToRole`.
  interface AssocEnd {
    role: string;
    type: string; // qname of target EntityType
    multiplicity: string;
  }
  const associationByQName = new Map<string, AssocEnd[]>();
  for (const schema of schemas) {
    const ns: string = schema["@_Namespace"] || "";
    const assocs: any[] = Array.isArray(schema.Association) ? schema.Association : [];
    for (const a of assocs) {
      const qname = ns ? `${ns}.${a["@_Name"]}` : a["@_Name"];
      const ends: any[] = Array.isArray(a.End) ? a.End : [];
      associationByQName.set(
        qname,
        ends.map((e) => ({
          role: e["@_Role"] || "",
          type: e["@_Type"] || "",
          multiplicity: e["@_Multiplicity"] || "1",
        }))
      );
    }
  }

  // Pass 2: map EntitySets → EntityType qname so we know which sets to expose.
  const entitySetToType = new Map<string, string>();
  for (const schema of schemas) {
    const containers: any[] = Array.isArray(schema.EntityContainer) ? schema.EntityContainer : [];
    for (const container of containers) {
      const sets: any[] = Array.isArray(container.EntitySet) ? container.EntitySet : [];
      for (const set of sets) {
        const name = set["@_Name"];
        const typeQName: string = set["@_EntityType"] || "";
        if (name && typeQName) {
          entitySetToType.set(name, typeQName);
        }
      }
    }
  }

  // Pass 3: build entities + properties.
  const entities: ParsedEntity[] = [];
  for (const [setName, typeQName] of entitySetToType.entries()) {
    const ref = entityTypeByQName.get(typeQName);
    if (!ref) continue;
    const node = ref.node;
    const typeName: string = node["@_Name"];

    // Keys
    const keyContainer = node.Key;
    const keyRefs: any[] = keyContainer?.PropertyRef
      ? Array.isArray(keyContainer.PropertyRef)
        ? keyContainer.PropertyRef
        : [keyContainer.PropertyRef]
      : [];
    const keyFields = keyRefs.map((k) => k["@_Name"]).filter(Boolean);

    const propNodes: any[] = Array.isArray(node.Property) ? node.Property : [];
    const navNodes: any[] = Array.isArray(node.NavigationProperty) ? node.NavigationProperty : [];

    const properties: ParsedProperty[] = [];

    for (const p of propNodes) {
      const name: string = p["@_Name"];
      if (!name) continue;
      // sap:filterable / sap:sortable default to true when omitted (the v2 SAP
      // convention is "true unless specified false").
      const filterableRaw = p["@_sap:filterable"];
      const sortableRaw = p["@_sap:sortable"];
      properties.push({
        name,
        edmType: p["@_Type"] || "Edm.String",
        label: extractSapLabel(p),
        maxLength: p["@_MaxLength"] ? Number(p["@_MaxLength"]) : null,
        isKey: keyFields.includes(name),
        isNullable: p["@_Nullable"] !== "false",
        filterable: filterableRaw === undefined ? true : filterableRaw !== "false",
        sortable: sortableRaw === undefined ? true : sortableRaw !== "false",
        navigationTarget: null,
        navigationIsCollection: false,
      });
    }

    for (const n of navNodes) {
      const name: string = n["@_Name"];
      if (!name) continue;
      const relationship: string = n["@_Relationship"] || "";
      const toRole: string = n["@_ToRole"] || "";
      const assocEnds = associationByQName.get(relationship);
      let targetTypeName: string | null = null;
      let isCollection = false;
      if (assocEnds && toRole) {
        const targetEnd = assocEnds.find((e) => e.role === toRole);
        if (targetEnd) {
          targetTypeName = targetEnd.type.split(".").pop() || null;
          isCollection = targetEnd.multiplicity === "*";
        }
      }

      properties.push({
        name,
        edmType: relationship,
        label: extractSapLabel(n),
        maxLength: null,
        isKey: false,
        isNullable: true,
        filterable: false,
        sortable: false,
        navigationTarget: targetTypeName,
        navigationIsCollection: isCollection,
      });
    }

    const labelGuess = guessLabelField(properties);

    entities.push({
      entitySetName: setName,
      entityTypeName: typeName,
      keyFields,
      labelFieldGuess: labelGuess,
      searchable: false,
      properties,
    });
  }

  return { entities, raw: tree };
}
