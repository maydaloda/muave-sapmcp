import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorShape, systemKeyField } from "../lib/schemas.js";
import { fail, ok } from "../lib/tool-result.js";
import type { ToolContext } from "./context.js";

interface CatalogEntry {
  serviceId: string;
  title: string | null;
  path: string;
  version: "v2" | "v4";
}

/** Normalize a catalog ServiceUrl to a register-able path (strip host if absolute). */
function normalizeCatalogPath(raw: string): string {
  if (!raw) return "";
  let p = raw;
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
  } catch {
    /* keep raw */
  }
  return p.startsWith("/") ? p : `/${p}`;
}

function mapV2CatalogEntry(row: any): CatalogEntry | null {
  const serviceId: string | undefined =
    row?.TechnicalServiceName ?? row?.ID ?? row?.Title ?? row?.ServiceId;
  if (!serviceId) return null;
  const path: string = row?.ServiceUrl ?? row?.MetadataUrl ?? "";
  return {
    serviceId: String(serviceId),
    title: row?.Title ? String(row.Title) : null,
    path: normalizeCatalogPath(String(path)),
    version: "v2",
  };
}

function mapV4ServiceGroup(group: any): CatalogEntry[] {
  const services = group?.DefaultSystem?.Services ?? group?.Services ?? [];
  const list: any[] = Array.isArray(services) ? services : [];
  return list
    .map((s): CatalogEntry | null => {
      const serviceId: string | undefined = s?.ServiceId ?? s?.ServiceAlias ?? s?.Id;
      if (!serviceId) return null;
      return {
        serviceId: String(serviceId),
        title: s?.Description ? String(s.Description) : null,
        path: normalizeCatalogPath(String(s?.ServiceUrl ?? "")),
        version: "v4",
      };
    })
    .filter((e): e is CatalogEntry => e !== null);
}

export function registerSystemTools(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    "list_systems",
    {
      title: "List SAP systems",
      description:
        "List the configured S/4HANA systems (no secrets) and which one is the default.",
      inputSchema: {},
      outputSchema: {
        systems: z.array(
          z.object({
            key: z.string(),
            name: z.string(),
            baseUrl: z.string(),
            authType: z.enum(["BASIC", "OAUTH2", "X509"]),
            readOnly: z.boolean(),
            writesAllowed: z.boolean(),
            allowedEntities: z.array(z.string()).nullable(),
            registeredServiceCount: z.number().int(),
          })
        ),
        defaultSystem: z.string().nullable(),
        ...errorShape,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    () => {
      try {
        const systems = ctx.config.listSystems().map((s) => ({
          key: s.key,
          name: s.name ?? s.key,
          baseUrl: s.baseUrl,
          authType: s.authType,
          readOnly: s.readOnly,
          writesAllowed: !s.readOnly,
          allowedEntities: s.allowedEntities ?? null,
          registeredServiceCount: ctx.store.listServices(s.key).length,
        }));
        return ok({ systems, defaultSystem: ctx.config.defaultSystemKey ?? null });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "discover_catalog",
    {
      title: "Discover OData catalog (best-effort)",
      description:
        "Best-effort enumeration of OData services the communication user can reach. Catalog " +
        "discovery is frequently gated on S/4HANA Cloud Public Edition (KBA 3657717); on " +
        "403/404 this returns available=false with guidance rather than an error.",
      inputSchema: {
        system: systemKeyField,
        odataVersion: z.enum(["v2", "v4", "both"]).optional(),
        filter: z.string().max(200).optional(),
      },
      outputSchema: {
        available: z.boolean(),
        source: z.enum(["v2_catalogservice", "v4_servicegroups", "none"]),
        services: z.array(
          z.object({
            serviceId: z.string(),
            title: z.string().nullable(),
            path: z.string(),
            version: z.enum(["v2", "v4"]),
          })
        ),
        guidance: z.string().optional(),
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
        const system = ctx.config.resolveSystem(args.system);
        const want = args.odataVersion ?? "both";
        const services: CatalogEntry[] = [];
        let available = false;
        let source: "v2_catalogservice" | "v4_servicegroups" | "none" = "none";

        if (want === "v2" || want === "both") {
          try {
            const res = await ctx.client.request({
              systemKey: system.key,
              version: "v2",
              method: "GET",
              servicePath: "/sap/opu/odata/IWFND/CATALOGSERVICE;v=2",
              resourcePath: "ServiceCollection",
            });
            const rows = Array.isArray(res.data) ? res.data : [];
            for (const r of rows) {
              const m = mapV2CatalogEntry(r);
              if (m) services.push(m);
            }
            available = true;
            source = "v2_catalogservice";
          } catch (e) {
            ctx.logger.debug({ err: String(e) }, "v2 catalog discovery unavailable");
          }
        }

        if (want === "v4" || want === "both") {
          try {
            const res = await ctx.client.request({
              systemKey: system.key,
              version: "v4",
              method: "GET",
              servicePath: "/sap/opu/odata4/iwfnd/config/default/iwfnd/catalog/0002",
              resourcePath: "ServiceGroups",
              query: { expand: ["DefaultSystem($expand=Services)"] },
            });
            const groups = Array.isArray(res.data) ? res.data : [];
            for (const g of groups) services.push(...mapV4ServiceGroup(g));
            available = true;
            if (source === "none") source = "v4_servicegroups";
          } catch (e) {
            ctx.logger.debug({ err: String(e) }, "v4 catalog discovery unavailable");
          }
        }

        const filtered = args.filter
          ? services.filter((s) =>
              `${s.serviceId} ${s.title ?? ""}`.toLowerCase().includes(args.filter!.toLowerCase())
            )
          : services;

        const result: Record<string, unknown> = { available, source, services: filtered };
        if (!available) {
          result.guidance =
            "Catalog discovery is unavailable on this tenant (commonly gated on Public Cloud — " +
            "KBA 3657717; needs a catalog communication scenario such as SAP_COM_0449). Register " +
            "services manually with register_service, using service paths from the SAP Business " +
            "Accelerator Hub (api.sap.com) and your Communication Arrangement's Inbound Services.";
        }
        return ok(result);
      } catch (err) {
        return fail(err);
      }
    }
  );
}
