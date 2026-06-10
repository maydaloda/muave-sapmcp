import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { auditWrite } from "../observability/audit.js";
import { ToolValidationError } from "../lib/errors.js";
import { entitySetField, errorShape, keyValueField, serviceIdField, systemKeyField } from "../lib/schemas.js";
import { fail, ok } from "../lib/tool-result.js";
import { ODataError } from "../odata/errors.js";
import { buildKeyPredicate, type KeyValue } from "../odata/key-predicate.js";
import type { ODataRequest, ODataResponse } from "../odata/types.js";
import type { ParsedEntity } from "../metadata/parse-shared.js";
import type { ToolContext } from "./context.js";
import { findActionFqn, propsByName, requireEntity, requireService } from "./helpers.js";

type DraftStrategy = "auto" | "active-direct" | "draft-activate";
type ResolvedStrategy = "active-direct" | "draft-activate";

const draftStrategyField = z
  .enum(["auto", "active-direct", "draft-activate"])
  .optional()
  .describe(
    "auto = inspect metadata; active-direct = write IsActiveEntity=true; draft-activate = create draft then Activate."
  );

const confirmField = z
  .boolean()
  .optional()
  .describe("Must be true to execute. When false (default), returns a dry-run preview without calling SAP.");

const previewSchema = z
  .object({
    method: z.string(),
    url: z.string(),
    body: z.unknown().optional(),
    plan: z.array(z.string()).optional(),
  })
  .optional();

function resolveStrategy(requested: DraftStrategy, entity: ParsedEntity): ResolvedStrategy {
  if (requested === "auto") return entity.isDraftEnabled ? "draft-activate" : "active-direct";
  return requested;
}

function extractKey(entity: ParsedEntity, obj: unknown): Record<string, string | number | boolean> | null {
  if (!obj || typeof obj !== "object") return null;
  const src = obj as Record<string, unknown>;
  const out: Record<string, string | number | boolean> = {};
  for (const k of entity.keyFields) {
    const v = src[k];
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function registerWriteTools(server: McpServer, ctx: ToolContext): void {
  // ---- create_entity ----
  server.registerTool(
    "create_entity",
    {
      title: "Create an entity",
      description:
        "Create a new entity (draft-aware). CSRF is handled automatically. With confirm=false " +
        "returns a dry-run preview. For draft-enabled entities, auto creates a draft then Activates.",
      inputSchema: {
        system: systemKeyField,
        serviceId: serviceIdField,
        entitySet: entitySetField,
        body: z.record(z.string(), z.unknown()),
        confirm: confirmField,
        draftStrategy: draftStrategyField,
      },
      outputSchema: {
        entitySet: z.string(),
        executed: z.boolean(),
        preview: previewSchema,
        created: z.record(z.string(), z.unknown()).nullable(),
        key: z.record(z.string(), z.unknown()).nullable(),
        etag: z.string().nullable(),
        draftFlow: z.array(z.string()).optional(),
        ...errorShape,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const { systemKey, service } = requireService(ctx, args.system, args.serviceId);
        const system = ctx.config.resolveSystem(systemKey);
        const entity = requireEntity(service, args.entitySet);
        ctx.governance.assertWriteAllowed(system, "POST", entity.entitySetName);

        const strategy = resolveStrategy(args.draftStrategy ?? "auto", entity);
        const url = `${service.servicePath}/${entity.entitySetName}`;
        const plan = strategy === "draft-activate" ? ["POST draft", "Activate draft"] : ["POST (active)"];

        if (!args.confirm) {
          auditWrite(ctx.logger, {
            system: systemKey,
            operation: "create",
            serviceId: service.serviceId,
            entitySet: entity.entitySetName,
            method: "POST",
            outcome: "dry-run",
            correlationId: "n/a",
          });
          return ok({
            entitySet: entity.entitySetName,
            executed: false,
            preview: { method: "POST", url, body: args.body, plan },
            created: null,
            key: null,
            etag: null,
          });
        }

        const res = await ctx.client.request({
          systemKey,
          version: service.version,
          method: "POST",
          servicePath: service.servicePath,
          resourcePath: entity.entitySetName,
          body: args.body,
        });
        let created = (res.data as Record<string, unknown>) ?? null;
        let etag = res.etag ?? null;
        const draftFlow = ["POST"];

        if (strategy === "draft-activate") {
          const activateFqn = findActionFqn(entity, "activate");
          const draftKey = extractKey(entity, created);
          if (activateFqn && draftKey) {
            const predicate = buildKeyPredicate(
              entity.keyFields,
              draftKey,
              service.version,
              propsByName(entity)
            );
            const actRes = await ctx.client.request({
              systemKey,
              version: service.version,
              method: "POST",
              servicePath: service.servicePath,
              resourcePath: `${entity.entitySetName}${predicate}/${activateFqn}`,
              body: {},
            });
            created = (actRes.data as Record<string, unknown>) ?? created;
            etag = actRes.etag ?? etag;
            draftFlow.push(`Activate (${activateFqn})`);
          } else {
            draftFlow.push("Activate skipped (no activate action or draft key resolvable)");
          }
        }

        auditWrite(ctx.logger, {
          system: systemKey,
          operation: "create",
          serviceId: service.serviceId,
          entitySet: entity.entitySetName,
          method: "POST",
          outcome: "executed",
          status: res.status,
          correlationId: res.correlationId,
        });
        return ok({
          entitySet: entity.entitySetName,
          executed: true,
          created,
          key: extractKey(entity, created),
          etag,
          draftFlow,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  // ---- update_entity ----
  server.registerTool(
    "update_entity",
    {
      title: "Update an entity",
      description:
        "Update an entity by key (PATCH default), ETag-guarded. On 412 it re-reads the current " +
        "ETag and retries once. With confirm=false returns a dry-run preview.",
      inputSchema: {
        system: systemKeyField,
        serviceId: serviceIdField,
        entitySet: entitySetField,
        key: keyValueField,
        body: z.record(z.string(), z.unknown()),
        method: z.enum(["PATCH", "PUT"]).optional(),
        ifMatch: z.string().optional().describe("ETag for optimistic concurrency; overrides the auto re-read."),
        confirm: confirmField,
      },
      outputSchema: {
        entitySet: z.string(),
        executed: z.boolean(),
        preview: previewSchema,
        updated: z.record(z.string(), z.unknown()).nullable(),
        etag: z.string().nullable(),
        etagRetried: z.boolean(),
        ...errorShape,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const { systemKey, service } = requireService(ctx, args.system, args.serviceId);
        const system = ctx.config.resolveSystem(systemKey);
        const entity = requireEntity(service, args.entitySet);
        const method = args.method ?? "PATCH";
        ctx.governance.assertWriteAllowed(system, method, entity.entitySetName);

        const predicate = buildKeyPredicate(
          entity.keyFields,
          args.key as KeyValue,
          service.version,
          propsByName(entity)
        );
        const resourcePath = `${entity.entitySetName}${predicate}`;
        const url = `${service.servicePath}/${resourcePath}`;

        if (!args.confirm) {
          return ok({
            entitySet: entity.entitySetName,
            executed: false,
            preview: { method, url, body: args.body },
            updated: null,
            etag: null,
            etagRetried: false,
          });
        }

        // Resolve ETag: explicit ifMatch, else re-read current.
        let etag = args.ifMatch;
        if (!etag) {
          try {
            const cur = await ctx.client.request({
              systemKey,
              version: service.version,
              method: "GET",
              servicePath: service.servicePath,
              resourcePath,
            });
            if (cur.etag) etag = cur.etag;
          } catch {
            /* proceed without — server may not require If-Match */
          }
        }

        const doUpdate = (matchEtag: string | undefined): Promise<ODataResponse> => {
          const req: ODataRequest = {
            systemKey,
            version: service.version,
            method,
            servicePath: service.servicePath,
            resourcePath,
            body: args.body,
          };
          if (matchEtag) req.etag = matchEtag;
          return ctx.client.request(req);
        };

        let etagRetried = false;
        let res: ODataResponse;
        try {
          res = await doUpdate(etag);
        } catch (err) {
          if (err instanceof ODataError && err.status === 412) {
            etagRetried = true;
            const cur = await ctx.client.request({
              systemKey,
              version: service.version,
              method: "GET",
              servicePath: service.servicePath,
              resourcePath,
            });
            res = await doUpdate(cur.etag);
          } else {
            throw err;
          }
        }

        auditWrite(ctx.logger, {
          system: systemKey,
          operation: "update",
          serviceId: service.serviceId,
          entitySet: entity.entitySetName,
          key: predicate,
          method,
          outcome: "executed",
          status: res.status,
          correlationId: res.correlationId,
        });
        return ok({
          entitySet: entity.entitySetName,
          executed: true,
          updated: (res.data as Record<string, unknown>) ?? null,
          etag: res.etag ?? null,
          etagRetried,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  // ---- delete_entity ----
  server.registerTool(
    "delete_entity",
    {
      title: "Delete an entity",
      description:
        "Delete an entity by key, ETag-guarded (412 → re-read + retry once). A second delete that " +
        "404s is reported as deleted. With confirm=false returns a dry-run preview.",
      inputSchema: {
        system: systemKeyField,
        serviceId: serviceIdField,
        entitySet: entitySetField,
        key: keyValueField,
        ifMatch: z.string().optional(),
        confirm: confirmField,
      },
      outputSchema: {
        entitySet: z.string(),
        executed: z.boolean(),
        preview: previewSchema,
        deleted: z.boolean(),
        etagRetried: z.boolean(),
        ...errorShape,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const { systemKey, service } = requireService(ctx, args.system, args.serviceId);
        const system = ctx.config.resolveSystem(systemKey);
        const entity = requireEntity(service, args.entitySet);
        ctx.governance.assertWriteAllowed(system, "DELETE", entity.entitySetName);

        const predicate = buildKeyPredicate(
          entity.keyFields,
          args.key as KeyValue,
          service.version,
          propsByName(entity)
        );
        const resourcePath = `${entity.entitySetName}${predicate}`;
        const url = `${service.servicePath}/${resourcePath}`;

        if (!args.confirm) {
          return ok({
            entitySet: entity.entitySetName,
            executed: false,
            preview: { method: "DELETE", url },
            deleted: false,
            etagRetried: false,
          });
        }

        const doDelete = (matchEtag: string | undefined): Promise<ODataResponse> => {
          const req: ODataRequest = {
            systemKey,
            version: service.version,
            method: "DELETE",
            servicePath: service.servicePath,
            resourcePath,
          };
          if (matchEtag) req.etag = matchEtag;
          return ctx.client.request(req);
        };

        let etagRetried = false;
        let status = 0;
        try {
          const res = await doDelete(args.ifMatch);
          status = res.status;
        } catch (err) {
          if (err instanceof ODataError && err.status === 404) {
            // Already gone — idempotent success.
          } else if (err instanceof ODataError && err.status === 412) {
            etagRetried = true;
            const cur = await ctx.client.request({
              systemKey,
              version: service.version,
              method: "GET",
              servicePath: service.servicePath,
              resourcePath,
            });
            const res = await doDelete(cur.etag);
            status = res.status;
          } else {
            throw err;
          }
        }

        auditWrite(ctx.logger, {
          system: systemKey,
          operation: "delete",
          serviceId: service.serviceId,
          entitySet: entity.entitySetName,
          key: predicate,
          method: "DELETE",
          outcome: "executed",
          status,
          correlationId: "n/a",
        });
        return ok({ entitySet: entity.entitySetName, executed: true, deleted: true, etagRetried });
      } catch (err) {
        return fail(err);
      }
    }
  );

  // ---- activate_draft ----
  server.registerTool(
    "activate_draft",
    {
      title: "Activate or discard a draft",
      description:
        "Drive the draft lifecycle for a draft entity: prepare_activate (Prepare then Activate) or " +
        "discard. Use for recovery or deferred activation. With confirm=false returns a preview.",
      inputSchema: {
        system: systemKeyField,
        serviceId: serviceIdField,
        entitySet: entitySetField,
        key: keyValueField.describe("Draft key (typically includes IsActiveEntity=false)."),
        action: z.enum(["prepare_activate", "discard"]).optional(),
        confirm: confirmField,
      },
      outputSchema: {
        entitySet: z.string(),
        executed: z.boolean(),
        action: z.string(),
        preview: previewSchema,
        steps: z.array(z.string()).optional(),
        activeKey: z.record(z.string(), z.unknown()).nullable(),
        ...errorShape,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const { systemKey, service } = requireService(ctx, args.system, args.serviceId);
        const system = ctx.config.resolveSystem(systemKey);
        const entity = requireEntity(service, args.entitySet);
        ctx.governance.assertWriteAllowed(system, "POST", entity.entitySetName);

        const action = args.action ?? "prepare_activate";
        const predicate = buildKeyPredicate(
          entity.keyFields,
          args.key as KeyValue,
          service.version,
          propsByName(entity)
        );

        const activateFqn = findActionFqn(entity, "activate");
        const prepareFqn = findActionFqn(entity, "prepare");
        const discardFqn = findActionFqn(entity, "discard");

        if (action === "prepare_activate" && !activateFqn) {
          throw new ToolValidationError(
            `Entity "${entity.entitySetName}" has no Activate action; it is not draft-enabled.`
          );
        }

        const steps: string[] = [];
        const url = `${service.servicePath}/${entity.entitySetName}${predicate}`;

        if (!args.confirm) {
          const plan =
            action === "discard"
              ? [discardFqn ? `POST ${discardFqn}` : "DELETE draft"]
              : [prepareFqn ? `POST ${prepareFqn}` : "(no Prepare)", `POST ${activateFqn}`];
          return ok({
            entitySet: entity.entitySetName,
            executed: false,
            action,
            preview: { method: "POST", url, plan },
            activeKey: null,
          });
        }

        let lastData: unknown = null;
        if (action === "discard") {
          if (discardFqn) {
            const res = await ctx.client.request({
              systemKey,
              version: service.version,
              method: "POST",
              servicePath: service.servicePath,
              resourcePath: `${entity.entitySetName}${predicate}/${discardFqn}`,
              body: {},
            });
            lastData = res.data;
            steps.push(`Discard (${discardFqn})`);
          } else {
            await ctx.client.request({
              systemKey,
              version: service.version,
              method: "DELETE",
              servicePath: service.servicePath,
              resourcePath: `${entity.entitySetName}${predicate}`,
            });
            steps.push("DELETE draft");
          }
        } else {
          if (prepareFqn) {
            await ctx.client.request({
              systemKey,
              version: service.version,
              method: "POST",
              servicePath: service.servicePath,
              resourcePath: `${entity.entitySetName}${predicate}/${prepareFqn}`,
              body: {},
            });
            steps.push(`Prepare (${prepareFqn})`);
          }
          const res = await ctx.client.request({
            systemKey,
            version: service.version,
            method: "POST",
            servicePath: service.servicePath,
            resourcePath: `${entity.entitySetName}${predicate}/${activateFqn}`,
            body: {},
          });
          lastData = res.data;
          steps.push(`Activate (${activateFqn})`);
        }

        auditWrite(ctx.logger, {
          system: systemKey,
          operation: "activate_draft",
          serviceId: service.serviceId,
          entitySet: entity.entitySetName,
          key: predicate,
          method: "POST",
          outcome: "executed",
          correlationId: "n/a",
        });
        return ok({
          entitySet: entity.entitySetName,
          executed: true,
          action,
          steps,
          activeKey: extractKey(entity, lastData),
        });
      } catch (err) {
        return fail(err);
      }
    }
  );
}
