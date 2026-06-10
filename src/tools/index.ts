import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./context.js";
import { registerDescribeTools } from "./describe.js";
import { registerEscapeTools } from "./escape.js";
import { registerReadTools } from "./read.js";
import { registerRegistrationTools } from "./registration.js";
import { registerSystemTools } from "./systems.js";
import { registerWriteTools } from "./write.js";

export type { ToolContext } from "./context.js";

/**
 * Register all tools. Write tools are only registered when at least one
 * configured system permits writes (honest tool surface); per-system read-only
 * and allowlist are still enforced at call time by the client + governance.
 */
export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerSystemTools(server, ctx);
  registerRegistrationTools(server, ctx);
  registerDescribeTools(server, ctx);
  registerReadTools(server, ctx);
  registerEscapeTools(server, ctx);

  if (ctx.config.anyWritable()) {
    registerWriteTools(server, ctx);
  } else {
    ctx.logger.info("All configured systems are read-only — write tools are not registered.");
  }
}
