import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SENSITIVE_HEADERS } from "../observability/redact.js";
import { errorShape, systemKeyField } from "../lib/schemas.js";
import { fail, ok } from "../lib/tool-result.js";
import type { ODataRequest, QueryParams } from "../odata/types.js";
import type { ToolContext } from "./context.js";

/** Drop any caller-supplied auth/session headers — those are managed by the client. */
function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

export function registerEscapeTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "odata_request",
    {
      title: "Low-level OData passthrough",
      description:
        "Escape hatch for requests the typed tools don't cover ($batch, function imports, unusual " +
        "options). Auth + CSRF are managed by the client; auth/session headers in `headers` are " +
        "ignored. Non-GET/HEAD requests are blocked on read-only systems.",
      inputSchema: {
        system: systemKeyField,
        method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD"]),
        path: z.string().min(1).describe("Path after baseUrl, e.g. /sap/opu/odata/sap/SRV/Entity('1')"),
        query: z.record(z.string(), z.string()).optional(),
        headers: z.record(z.string(), z.string()).optional(),
        body: z.unknown().optional(),
        version: z.enum(["v2", "v4"]).optional().describe("Hints CSRF method + response shape; default v4."),
      },
      outputSchema: {
        status: z.number().int(),
        body: z.unknown(),
        etag: z.string().nullable(),
        ...errorShape,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const version = args.version ?? "v4";
        const req: ODataRequest = {
          version,
          method: args.method,
          servicePath: args.path,
          resourcePath: "",
          headers: sanitizeHeaders(args.headers),
        };
        if (args.system) req.systemKey = args.system;
        if (args.query) {
          const query: QueryParams = { raw: args.query };
          req.query = query;
        }
        if (args.body !== undefined) req.body = args.body;

        const res = await ctx.client.request(req);
        return ok({ status: res.status, body: res.data, etag: res.etag ?? null });
      } catch (err) {
        return fail(err);
      }
    }
  );
}
