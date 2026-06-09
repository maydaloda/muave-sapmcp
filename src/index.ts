#!/usr/bin/env node
import { existsSync } from "node:fs";
import { createServer } from "./container.js";
import { logger } from "./observability/logger.js";
import { createStdioTransport } from "./transport/index.js";

/**
 * Optionally load credentials from a local env file so they need not be placed
 * in the MCP client config. Precedence: MUAVE_ENV_FILE (explicit absolute path),
 * then ./.env.local, then ./.env. Existing process env always wins.
 */
function loadLocalEnv(): void {
  const candidates = [process.env.MUAVE_ENV_FILE, ".env.local", ".env"].filter(
    (f): f is string => Boolean(f)
  );
  for (const file of candidates) {
    if (existsSync(file)) {
      try {
        (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(file);
      } catch {
        /* ignore unreadable env file */
      }
      return;
    }
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const server = await createServer();
  const transport = createStdioTransport();
  await server.connect(transport);
  logger.info("muave-sapmcp MCP server started (stdio transport)");
}

main().catch((err: unknown) => {
  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    "fatal: muave-sapmcp failed to start"
  );
  process.exit(1);
});
