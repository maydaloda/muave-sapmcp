import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthDeps } from "./auth/provider.js";
import { TokenCache } from "./auth/token-cache.js";
import { loadSystemsFile } from "./config/load.js";
import { catalogFilePath, findSystemsFile } from "./config/paths.js";
import { ConfigStore } from "./config/resolve.js";
import { createCredentialResolver } from "./credentials/index.js";
import { GovernancePolicy } from "./governance/policy.js";
import { logger } from "./observability/logger.js";
import { ConcurrencyLimiter } from "./odata/concurrency.js";
import { ODataClient } from "./odata/client.js";
import { registerPrompts } from "./prompts/index.js";
import { registerResources } from "./resources/index.js";
import { JsonFileCatalogStore } from "./store/json-file-store.js";
import { registerAllTools, type ToolContext } from "./tools/index.js";

const SERVER_NAME = "muave-sapmcp";
const SERVER_VERSION = "0.1.1";

/**
 * Composition root: load config, wire all layers, build the configured McpServer.
 */
export async function createServer(): Promise<McpServer> {
  const systemsFilePath = findSystemsFile();
  const file = await loadSystemsFile();

  const credentials = createCredentialResolver();
  const tokenCache = new TokenCache();
  const authDeps: AuthDeps = { credentials, tokenCache, logger };

  const config = new ConfigStore(file, authDeps);
  const limiter = new ConcurrencyLimiter(15);
  const client = new ODataClient({ resolver: config, logger, limiter });

  const store = new JsonFileCatalogStore(
    catalogFilePath({ systemsFilePath, cacheDir: file.cacheDir }),
    logger
  );
  await store.load();

  const governance = new GovernancePolicy();
  const ctx: ToolContext = { config, client, store, governance, logger };

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    title: "muave SAP S/4HANA Cloud OData connector",
  });

  registerAllTools(server, ctx);
  registerResources(server, ctx);
  registerPrompts(server);

  logger.info(
    {
      systems: config.listSystems().map((s) => s.key),
      defaultSystem: config.defaultSystemKey ?? null,
      writesEnabled: config.anyWritable(),
      registeredServices: store.listServices().length,
    },
    "muave-sapmcp configured"
  );

  return server;
}
