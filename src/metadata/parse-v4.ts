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
 * Parses an OData v4 EDMX `$metadata` XML document into a normalized shape.
 *
 * Handles the common SAP shape (EntityType/Key/Property/NavigationProperty in a
 * Schema, EntitySets in an EntityContainer), inline `<Annotation>` children, and
 * external `<Annotations Target="ns.Type/Prop">` blocks. Property labels come
 * from `@Common.Label`, falling back to `sap:label`.
 */
export function parseV4Metadata(xml: string): ParsedMetadata {
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
        "Annotation",
        "Annotations",
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
    throw new Error("Unrecognized $metadata: no <edmx:Edmx> root");
  }
  const dataServices = (edmx as any)["edmx:DataServices"] ?? (edmx as any).DataServices;
  if (!dataServices) {
    throw new Error("Unrecognized $metadata: no <edmx:DataServices>");
  }

  const schemas: any[] = Array.isArray(dataServices.Schema)
    ? dataServices.Schema
    : dataServices.Schema
      ? [dataServices.Schema]
      : [];
  if (schemas.length === 0) {
    throw new Error("Unrecognized $metadata: no <Schema> elements");
  }

  // Collect EntityType nodes (keyed by "namespace.TypeName" for nav resolution).
  const entityTypeByQName = new Map<string, { schema: any; node: any }>();
  for (const schema of schemas) {
    const ns: string = schema["@_Namespace"] || "";
    const types: any[] = Array.isArray(schema.EntityType) ? schema.EntityType : [];
    for (const t of types) {
      const qname = ns ? `${ns}.${t["@_Name"]}` : t["@_Name"];
      entityTypeByQName.set(qname, { schema, node: t });
    }
  }

  // Map EntitySets → EntityType qname so we know which sets to expose.
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

  // External Annotations: <Annotations Target="ns.Type/Prop"> ... </Annotations>
  // collected into a lookup keyed by Target so per-property labels override.
  const externalAnnotations = new Map<string, any[]>();
  for (const schema of schemas) {
    const annoBlocks: any[] = Array.isArray(schema.Annotations) ? schema.Annotations : [];
    for (const block of annoBlocks) {
      const target: string = block["@_Target"];
      const annos: any[] = Array.isArray(block.Annotation) ? block.Annotation : [];
      if (target) externalAnnotations.set(target, annos);
    }
  }

  const entities: ParsedEntity[] = [];
  for (const [setName, typeQName] of entitySetToType.entries()) {
    const ref = entityTypeByQName.get(typeQName);
    if (!ref) continue;
    const node = ref.node;
    const typeName: string = node["@_Name"];
    const namespace: string = ref.schema["@_Namespace"] || "";

    // Keys
    const keyContainer = node.Key;
    const keyRefs: any[] = keyContainer?.PropertyRef
      ? Array.isArray(keyContainer.PropertyRef)
        ? keyContainer.PropertyRef
        : [keyContainer.PropertyRef]
      : [];
    const keyFields = keyRefs.map((k) => k["@_Name"]).filter(Boolean);

    // Properties
    const propNodes: any[] = Array.isArray(node.Property) ? node.Property : [];
    const navNodes: any[] = Array.isArray(node.NavigationProperty) ? node.NavigationProperty : [];

    const properties: ParsedProperty[] = [];

    for (const p of propNodes) {
      const name: string = p["@_Name"];
      if (!name) continue;
      const inlineAnnos: any[] = Array.isArray(p.Annotation) ? p.Annotation : [];
      const extKey = `${namespace}.${typeName}/${name}`;
      const externalAnnos = externalAnnotations.get(extKey) || [];
      const allAnnos = [...inlineAnnos, ...externalAnnos];

      properties.push({
        name,
        edmType: p["@_Type"] || "Edm.String",
        label: extractAnnotationString(allAnnos, "Common.Label") || extractSapLabel(p),
        maxLength: p["@_MaxLength"] ? Number(p["@_MaxLength"]) : null,
        isKey: keyFields.includes(name),
        isNullable: p["@_Nullable"] !== "false",
        filterable: true,
        sortable: true,
        navigationTarget: null,
        navigationIsCollection: false,
      });
    }

    for (const n of navNodes) {
      const name: string = n["@_Name"];
      if (!name) continue;
      const rawType: string = n["@_Type"] || "";
      // Type is either "namespace.Foo" or "Collection(namespace.Foo)"
      const isCollection = /^Collection\(/.test(rawType);
      const targetQName = isCollection
        ? rawType.replace(/^Collection\(/, "").replace(/\)$/, "")
        : rawType;
      const targetTypeName = targetQName.split(".").pop() || null;

      const inlineAnnos: any[] = Array.isArray(n.Annotation) ? n.Annotation : [];
      const extKey = `${namespace}.${typeName}/${name}`;
      const externalAnnos = externalAnnotations.get(extKey) || [];
      const allAnnos = [...inlineAnnos, ...externalAnnos];

      properties.push({
        name,
        edmType: rawType,
        label: extractAnnotationString(allAnnos, "Common.Label") || extractSapLabel(n),
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

function extractAnnotationString(annos: any[], term: string): string | null {
  for (const a of annos) {
    const t: string = a["@_Term"] || "";
    if (t === term || t.endsWith("." + term)) {
      return a["@_String"] || a.String || null;
    }
  }
  return null;
}
