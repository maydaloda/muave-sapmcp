import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { entityAllowed } from "../governance/allowlist.js";
import { writesEnabled } from "../governance/read-only.js";
import { errorShape, odataVersionField, serviceIdField, systemKeyField, entitySetField } from "../lib/schemas.js";
import { fail, ok } from "../lib/tool-result.js";
import type { ToolContext } from "./context.js";
import { draftActionMap, requireEntity, requireService } from "./helpers.js";

export function registerDescribeTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "describe_service",
    {
      title: "Describe a service",
      description: "List a registered service's entity sets with key fields, draft flag, and writability.",
      inputSchema: { system: systemKeyField, serviceId: serviceIdField },
      outputSchema: {
        serviceId: z.string(),
        version: odataVersionField,
        title: z.string().nullable(),
        entitySets: z.array(
          z.object({
            name: z.string(),
            entityType: z.string(),
            keyFields: z.array(z.string()),
            labelFieldGuess: z.string().nullable(),
            isDraftEnabled: z.boolean(),
            writable: z.boolean(),
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
        const { systemKey, service } = requireService(ctx, args.system, args.serviceId);
        const system = ctx.config.resolveSystem(systemKey);
        const canWrite = writesEnabled(system);
        return ok({
          serviceId: service.serviceId,
          version: service.version,
          title: service.title ?? null,
          entitySets: service.entities.map((e) => ({
            name: e.entitySetName,
            entityType: e.entityTypeName,
            keyFields: e.keyFields,
            labelFieldGuess: e.labelFieldGuess,
            isDraftEnabled: Boolean(e.isDraftEnabled),
            writable: canWrite && entityAllowed(system, e.entitySetName),
          })),
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "describe_entity",
    {
      title: "Describe an entity",
      description:
        "Full property + navigation detail for one entity set (the contract for building $filter, " +
        "keys, and request bodies), including draft action FQNs when draft-enabled.",
      inputSchema: { system: systemKeyField, serviceId: serviceIdField, entitySet: entitySetField },
      outputSchema: {
        entitySet: z.string(),
        entityType: z.string(),
        version: odataVersionField,
        keyFields: z.array(z.string()),
        labelFieldGuess: z.string().nullable(),
        isDraftEnabled: z.boolean(),
        draftActions: z
          .object({
            edit: z.string().nullable(),
            prepare: z.string().nullable(),
            activate: z.string().nullable(),
            discard: z.string().nullable(),
          })
          .optional(),
        properties: z.array(
          z.object({
            name: z.string(),
            edmType: z.string(),
            label: z.string().nullable(),
            isKey: z.boolean(),
            isNullable: z.boolean(),
            filterable: z.boolean(),
            sortable: z.boolean(),
            maxLength: z.number().int().nullable(),
            navigationTarget: z.string().nullable(),
            navigationIsCollection: z.boolean(),
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
        const { service } = requireService(ctx, args.system, args.serviceId);
        const entity = requireEntity(service, args.entitySet);
        const result: Record<string, unknown> = {
          entitySet: entity.entitySetName,
          entityType: entity.entityTypeName,
          version: service.version,
          keyFields: entity.keyFields,
          labelFieldGuess: entity.labelFieldGuess,
          isDraftEnabled: Boolean(entity.isDraftEnabled),
          properties: entity.properties.map((p) => ({
            name: p.name,
            edmType: p.edmType,
            label: p.label,
            isKey: p.isKey,
            isNullable: p.isNullable,
            filterable: p.filterable,
            sortable: p.sortable,
            maxLength: p.maxLength,
            navigationTarget: p.navigationTarget,
            navigationIsCollection: p.navigationIsCollection,
          })),
        };
        if (entity.isDraftEnabled) result.draftActions = draftActionMap(entity);
        return ok(result);
      } catch (err) {
        return fail(err);
      }
    }
  );
}
