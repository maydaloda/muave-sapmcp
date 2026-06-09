import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * Create the stdio transport. stdout carries JSON-RPC; all logging goes to
 * stderr (see observability/logger). A future Streamable-HTTP transport plugs in
 * behind the same seam.
 */
export function createStdioTransport(): StdioServerTransport {
  return new StdioServerTransport();
}
