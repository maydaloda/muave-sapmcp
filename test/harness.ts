import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { TokenCache } from "../src/auth/token-cache.js";
import type { AuthDeps } from "../src/auth/provider.js";
import { ConfigStore } from "../src/config/resolve.js";
import { SystemsFileSchema } from "../src/config/schema.js";
import { GovernancePolicy } from "../src/governance/policy.js";
import { ODataClient } from "../src/odata/client.js";
import { ConcurrencyLimiter } from "../src/odata/concurrency.js";
import { JsonFileCatalogStore } from "../src/store/json-file-store.js";
import { registerAllTools, type ToolContext } from "../src/tools/index.js";
import { FakeCredentials, silentLogger } from "./helpers.js";

export const HOST = "https://sap.example.com";
export const SVC = "/sap/opu/odata/sap/API_BUSINESS_PARTNER";

/** Build a live in-memory MCP client/server wired to a single configurable system. */
export async function makeClientServer(readOnly: boolean): Promise<Client> {
  const file = SystemsFileSchema.parse({
    schemaVersion: 1,
    defaultSystem: "T",
    systems: [{ key: "T", baseUrl: HOST, authType: "BASIC", preEncodedEnvVar: "PRE", readOnly }],
  });
  const deps: AuthDeps = {
    credentials: new FakeCredentials({ PRE: "YWJj" }),
    tokenCache: new TokenCache(),
    logger: silentLogger,
  };
  const config = new ConfigStore(file, deps);
  const odata = new ODataClient({
    resolver: config,
    logger: silentLogger,
    limiter: new ConcurrencyLimiter(15),
  });
  const store = new JsonFileCatalogStore(
    join(mkdtempSync(join(tmpdir(), "muave-")), "catalog.json"),
    silentLogger
  );
  await store.load();
  const ctx: ToolContext = {
    config,
    client: odata,
    store,
    governance: new GovernancePolicy(),
    logger: silentLogger,
  };

  const server = new McpServer({ name: "muave-sapmcp-test", version: "0.0.0" });
  registerAllTools(server, ctx);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}
