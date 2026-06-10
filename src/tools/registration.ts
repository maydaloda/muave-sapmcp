import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorShape, odataVersionField, serviceIdField, systemKeyField } from "../lib/schemas.js";
import { fail, ok } from "../lib/tool-result.js";
import { fetchODataMetadata, parseMetadata } from "../metadata/index.js";
import type { RegisteredService } from "../store/catalog-store.js";
import type { ToolContext } from "./context.js";
import { requireService, resolveServiceId } from "./helpers.js";

function normalizeServicePath(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\/?\$metadata\/?$/i, "").replace(/\/+$/, "");
}

const entitySummary = z.object({
  name: z.string(),
  keyFields: z.array(z.string()),
  isDraftEnabled: z.boolean(),
});

const registerOutput = {
  serviceId: z.string(),
  system: z.string(),
  version: odataVersionField,
  path: z.string(),
  title: z.string().nullable(),
  fetchedAt: z.string(),
  entitySetCount: z.number().int(),
  entitySets: z.array(entitySummary),
  ...errorShape,
};

export function registerRegistrationTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "register_service",
    {
      title: "Register an OData service",
      description:
        "Fetch and parse a service's $metadata by path, then cache it locally. This is the " +
        "reliable way to make a service available (catalog discovery is unreliable on Public Cloud).",
      inputSchema: {
        system: systemKeyField,
        path: z.string().min(1).describe("Service root, e.g. /sap/opu/odata/sap/API_BUSINESS_PARTNER"),
        version: odataVersionField,
        serviceId: z.string().max(200).optional().describe("Override id; defaults to the last path segment."),
      },
      outputSchema: registerOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const system = ctx.config.resolveSystem(args.system);
        const servicePath = normalizeServicePath(args.path);
        const serviceId = args.serviceId ?? resolveServiceId(servicePath);
        const authHeaders = await system.authProvider.getAuthHeaders();
        const { xml } = await fetchODataMetadata({ baseUrl: system.baseUrl, servicePath, authHeaders });
        const parsed = parseMetadata(xml, args.version);
        const fetchedAt = new Date().toISOString();
        const service: RegisteredService = {
          systemKey: system.key,
          serviceId,
          servicePath,
          version: args.version,
          fetchedAt,
          entities: parsed.entities,
        };
        await ctx.store.putService(service);
        return ok({
          serviceId,
          system: system.key,
          version: args.version,
          path: servicePath,
          title: null,
          fetchedAt,
          entitySetCount: parsed.entities.length,
          entitySets: parsed.entities.map((e) => ({
            name: e.entitySetName,
            keyFields: e.keyFields,
            isDraftEnabled: Boolean(e.isDraftEnabled),
          })),
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "list_services",
    {
      title: "List registered services",
      description: "List the OData services already registered in the local cache.",
      inputSchema: { system: systemKeyField },
      outputSchema: {
        services: z.array(
          z.object({
            serviceId: z.string(),
            system: z.string(),
            version: odataVersionField,
            path: z.string(),
            title: z.string().nullable(),
            entitySetCount: z.number().int(),
            fetchedAt: z.string(),
          })
        ),
        ...errorShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) => {
      try {
        const systemKey = args.system ? ctx.config.resolveSystem(args.system).key : undefined;
        const services = ctx.store.listServices(systemKey).map((s) => ({
          serviceId: s.serviceId,
          system: s.systemKey,
          version: s.version,
          path: s.servicePath,
          title: s.title ?? null,
          entitySetCount: s.entities.length,
          fetchedAt: s.fetchedAt,
        }));
        return ok({ services });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "refresh_metadata",
    {
      title: "Refresh service metadata",
      description: "Re-fetch and re-parse a registered service's $metadata, overwriting the cache.",
      inputSchema: { system: systemKeyField, serviceId: serviceIdField },
      outputSchema: {
        ...registerOutput,
        changed: z.boolean(),
        addedEntitySets: z.array(z.string()),
        removedEntitySets: z.array(z.string()),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const { systemKey, service } = requireService(ctx, args.system, args.serviceId);
        const system = ctx.config.resolveSystem(systemKey);
        const authHeaders = await system.authProvider.getAuthHeaders();
        const { xml } = await fetchODataMetadata({
          baseUrl: system.baseUrl,
          servicePath: service.servicePath,
          authHeaders,
        });
        const parsed = parseMetadata(xml, service.version);
        const before = new Set(service.entities.map((e) => e.entitySetName));
        const after = new Set(parsed.entities.map((e) => e.entitySetName));
        const addedEntitySets = [...after].filter((n) => !before.has(n));
        const removedEntitySets = [...before].filter((n) => !after.has(n));
        const fetchedAt = new Date().toISOString();
        const updated: RegisteredService = { ...service, entities: parsed.entities, fetchedAt };
        await ctx.store.putService(updated);
        return ok({
          serviceId: service.serviceId,
          system: systemKey,
          version: service.version,
          path: service.servicePath,
          title: service.title ?? null,
          fetchedAt,
          entitySetCount: parsed.entities.length,
          entitySets: parsed.entities.map((e) => ({
            name: e.entitySetName,
            keyFields: e.keyFields,
            isDraftEnabled: Boolean(e.isDraftEnabled),
          })),
          changed: addedEntitySets.length > 0 || removedEntitySets.length > 0,
          addedEntitySets,
          removedEntitySets,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );
}
