import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { decodeCursor, encodeCursor, type CursorState } from "../lib/cursor.js";
import {
  entitySetField,
  errorShape,
  keyValueField,
  odataVersionField,
  serviceIdField,
  systemKeyField,
} from "../lib/schemas.js";
import { fail, ok } from "../lib/tool-result.js";
import { ODataError } from "../odata/errors.js";
import { buildKeyPredicate, type KeyValue } from "../odata/key-predicate.js";
import type { ODataRequest, QueryParams } from "../odata/types.js";
import type { ToolContext } from "./context.js";
import { propsByName, requireEntity, requireService } from "./helpers.js";

const DEFAULT_PAGE = 50;
const MAX_PAGE = 200;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function toAbsolute(ctx: ToolContext, system: string | undefined, link: string): string {
  if (/^https?:\/\//i.test(link)) return link;
  const base = ctx.config.resolveSystem(system).baseUrl;
  return `${base}/${link.replace(/^\/+/, "")}`;
}

export function registerReadTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "query_entities",
    {
      title: "Query entities",
      description:
        "Read a collection with $filter/$select/$expand/$orderby. Returns up to a page of rows and " +
        "an opaque nextCursor for the next page (pass it back as `cursor`). Never returns whole " +
        "collections; default page 50, max 200.",
      inputSchema: {
        system: systemKeyField,
        serviceId: serviceIdField,
        entitySet: entitySetField,
        filter: z.string().max(2000).optional().describe("Raw $filter (version-correct V2/V4 syntax)."),
        select: z.array(z.string()).optional(),
        expand: z.array(z.string()).optional(),
        orderby: z
          .array(z.string())
          .optional()
          .describe("Sort terms; defaults to key fields for stable paging when omitted."),
        top: z.number().int().min(1).max(MAX_PAGE).optional(),
        count: z.boolean().optional(),
        cursor: z.string().optional().describe("Opaque nextCursor from a prior call; other paging args are ignored when set."),
      },
      outputSchema: {
        entitySet: z.string(),
        version: odataVersionField,
        rows: z.array(z.record(z.string(), z.unknown())),
        pageSize: z.number().int(),
        count: z.number().int().nullable(),
        nextCursor: z.string().nullable(),
        ...errorShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        let state: CursorState;
        if (args.cursor) {
          state = decodeCursor(args.cursor);
        } else {
          const { service } = requireService(ctx, args.system, args.serviceId);
          const entity = requireEntity(service, args.entitySet);
          const top = clamp(args.top ?? DEFAULT_PAGE, 1, MAX_PAGE);
          const orderby = args.orderby?.length ? args.orderby : entity.keyFields;
          const query: QueryParams = { top, count: Boolean(args.count) };
          if (args.filter) query.filter = args.filter;
          if (args.select?.length) query.select = args.select;
          if (args.expand?.length) query.expand = args.expand;
          if (orderby.length) query.orderby = orderby;
          state = {
            system: args.system,
            serviceId: service.serviceId,
            entitySet: entity.entitySetName,
            version: service.version,
            top,
            count: Boolean(args.count),
            skip: 0,
            query,
          };
        }

        // Build the request: server-driven (nextLink) or client-driven ($skip).
        let req: ODataRequest;
        if (state.nextLink) {
          req = {
            version: state.version,
            method: "GET",
            servicePath: "",
            resourcePath: "",
            absoluteUrl: toAbsolute(ctx, state.system, state.nextLink),
          };
          if (state.system) req.systemKey = state.system;
        } else {
          const { service } = requireService(ctx, state.system, state.serviceId);
          const query: QueryParams = { ...state.query, skip: state.skip ?? 0 };
          req = {
            version: state.version,
            method: "GET",
            servicePath: service.servicePath,
            resourcePath: state.entitySet,
            query,
          };
          if (state.system) req.systemKey = state.system;
        }

        const res = await ctx.client.request(req);
        const rows = Array.isArray(res.data)
          ? (res.data as Record<string, unknown>[])
          : res.data != null
            ? [res.data as Record<string, unknown>]
            : [];

        let nextCursor: string | null = null;
        if (res.nextLink) {
          nextCursor = encodeCursor({ ...state, nextLink: res.nextLink, count: false });
        } else if (rows.length === state.top) {
          const advanced: CursorState = {
            ...state,
            skip: (state.skip ?? 0) + state.top,
            count: false,
          };
          if (advanced.query) advanced.query = { ...advanced.query, count: false };
          nextCursor = encodeCursor(advanced);
        }

        return ok({
          entitySet: state.entitySet,
          version: state.version,
          rows,
          pageSize: rows.length,
          count: res.count ?? null,
          nextCursor,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_entity",
    {
      title: "Get one entity by key",
      description: "Fetch a single entity by its key predicate. Returns the ETag for follow-up writes.",
      inputSchema: {
        system: systemKeyField,
        serviceId: serviceIdField,
        entitySet: entitySetField,
        key: keyValueField,
        select: z.array(z.string()).optional(),
        expand: z.array(z.string()).optional(),
      },
      outputSchema: {
        entitySet: z.string(),
        found: z.boolean(),
        entity: z.record(z.string(), z.unknown()).nullable(),
        etag: z.string().nullable(),
        ...errorShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const { systemKey, service } = requireService(ctx, args.system, args.serviceId);
        const entity = requireEntity(service, args.entitySet);
        const predicate = buildKeyPredicate(
          entity.keyFields,
          args.key as KeyValue,
          service.version,
          propsByName(entity)
        );
        const query: QueryParams = {};
        if (args.select?.length) query.select = args.select;
        if (args.expand?.length) query.expand = args.expand;

        try {
          const res = await ctx.client.request({
            systemKey,
            version: service.version,
            method: "GET",
            servicePath: service.servicePath,
            resourcePath: `${entity.entitySetName}${predicate}`,
            query,
          });
          return ok({
            entitySet: entity.entitySetName,
            found: true,
            entity: (res.data as Record<string, unknown>) ?? null,
            etag: res.etag ?? null,
          });
        } catch (err) {
          if (err instanceof ODataError && err.status === 404) {
            return ok({ entitySet: entity.entitySetName, found: false, entity: null, etag: null });
          }
          throw err;
        }
      } catch (err) {
        return fail(err);
      }
    }
  );
}
