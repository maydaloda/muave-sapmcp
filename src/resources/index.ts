import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext } from "../tools/context.js";

function jsonContents(uri: URL, payload: unknown): ReadResourceResult {
  return {
    contents: [
      { uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function first(value: string | string[]): string {
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

/**
 * Read-only browseable resources mirroring the describe tools, so Claude can pull
 * service/entity metadata into context without spending a tool call. Metadata
 * only — no governance concerns.
 */
export function registerResources(server: McpServer, ctx: ToolContext): void {
  server.registerResource(
    "services",
    "services://",
    {
      title: "Registered SAP services",
      description: "All OData services registered in the local cache, across systems.",
      mimeType: "application/json",
    },
    (uri) =>
      jsonContents(
        uri,
        ctx.store.listServices().map((s) => ({
          system: s.systemKey,
          serviceId: s.serviceId,
          version: s.version,
          path: s.servicePath,
          entitySetCount: s.entities.length,
          fetchedAt: s.fetchedAt,
        }))
      )
  );

  server.registerResource(
    "service-metadata",
    new ResourceTemplate("metadata://{system}/{serviceId}", { list: undefined }),
    {
      title: "Service metadata",
      description: "Entity sets of a registered service (system + serviceId).",
      mimeType: "application/json",
    },
    (uri, variables): ReadResourceResult => {
      const system = first(variables.system as string | string[]);
      const serviceId = first(variables.serviceId as string | string[]);
      const service = ctx.store.getService(system, serviceId);
      if (!service) return jsonContents(uri, { error: `Service ${system}:${serviceId} not registered.` });
      return jsonContents(uri, {
        serviceId: service.serviceId,
        version: service.version,
        entitySets: service.entities.map((e) => ({
          name: e.entitySetName,
          keyFields: e.keyFields,
          isDraftEnabled: Boolean(e.isDraftEnabled),
        })),
      });
    }
  );

  server.registerResource(
    "entity-metadata",
    new ResourceTemplate("metadata://{system}/{serviceId}/{entitySet}", { list: undefined }),
    {
      title: "Entity metadata",
      description: "Full property/navigation detail for one entity set.",
      mimeType: "application/json",
    },
    (uri, variables): ReadResourceResult => {
      const system = first(variables.system as string | string[]);
      const serviceId = first(variables.serviceId as string | string[]);
      const entitySet = first(variables.entitySet as string | string[]);
      const service = ctx.store.getService(system, serviceId);
      const entity = service?.entities.find((e) => e.entitySetName === entitySet);
      if (!entity) return jsonContents(uri, { error: `Entity ${system}:${serviceId}/${entitySet} not found.` });
      return jsonContents(uri, entity);
    }
  );
}
