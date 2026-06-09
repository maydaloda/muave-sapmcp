import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Starter prompt that teaches the safe register → describe → query → dry-run-write workflow. */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "explore_sap_service",
    {
      title: "Explore an SAP OData service",
      description: "Guided workflow to register, inspect, and safely query/write an S/4HANA service.",
      argsSchema: {
        system: z.string().optional(),
        serviceId: z.string().optional(),
      },
    },
    (args) => {
      const system = args.system ? ` on system "${args.system}"` : "";
      const service = args.serviceId ? ` Focus on service "${args.serviceId}".` : "";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Help me work with SAP S/4HANA OData via muave-sapmcp${system}.${service}\n\n` +
                "Follow this workflow:\n" +
                "1. Call list_systems to see configured systems and which allow writes.\n" +
                "2. Register the target service with register_service (path + version), or list_services if already registered.\n" +
                "3. Use describe_service then describe_entity to learn the entity sets, key fields, draft status, and filterable properties.\n" +
                "4. Read with query_entities (use the nextCursor to page) or get_entity by key.\n" +
                "5. For ANY write (create/update/delete), ALWAYS first call it with confirm:false to get a dry-run preview, show me the resolved request, and only re-issue with confirm:true after I approve.\n" +
                "6. Respect read-only systems and the entity allowlist; for draft-enabled entities, prefer the auto draft strategy and explain the draft lifecycle.",
            },
          },
        ],
      };
    }
  );
}
