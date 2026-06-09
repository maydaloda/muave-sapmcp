import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { HOST, SVC, makeClientServer } from "../harness.js";
import { fixture } from "../fixtures/load.js";

const ENT = (p: string) => p.startsWith(`${SVC}/A_BusinessPartner`);

async function registered(agent: MockAgent): Promise<Client> {
  const client = await makeClientServer(false);
  agent
    .get(HOST)
    .intercept({ path: (p) => p.startsWith(`${SVC}/$metadata`), method: "GET" })
    .reply(200, fixture("v2-business-partner.metadata.xml"), {
      headers: { "content-type": "application/xml" },
    });
  await client.callTool({ name: "register_service", arguments: { system: "T", path: SVC, version: "v2" } });
  return client;
}

describe("read + discovery flows via MCP tools", () => {
  let agent: MockAgent;
  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });
  afterEach(async () => {
    await agent.close();
  });

  it("paginates with an opaque cursor (client-driven $skip)", async () => {
    const client = await registered(agent);
    const pool = agent.get(HOST);
    // Page 1: returns a full page (==top) → a nextCursor is issued.
    pool
      .intercept({ path: ENT, method: "GET" })
      .reply(200, { d: { results: [{ BusinessPartner: "1" }, { BusinessPartner: "2" }] } }, {
        headers: { "content-type": "application/json" },
      });
    // Page 2: returns a partial page → nextCursor becomes null.
    pool
      .intercept({ path: ENT, method: "GET" })
      .reply(200, { d: { results: [{ BusinessPartner: "3" }] } }, {
        headers: { "content-type": "application/json" },
      });

    const page1 = await client.callTool({
      name: "query_entities",
      arguments: { system: "T", serviceId: "API_BUSINESS_PARTNER", entitySet: "A_BusinessPartner", top: 2 },
    });
    const out1 = page1.structuredContent as any;
    expect(out1.rows).toHaveLength(2);
    expect(out1.nextCursor).toBeTruthy();

    const page2 = await client.callTool({
      name: "query_entities",
      arguments: { serviceId: "API_BUSINESS_PARTNER", entitySet: "A_BusinessPartner", cursor: out1.nextCursor },
    });
    const out2 = page2.structuredContent as any;
    expect(out2.rows).toHaveLength(1);
    expect(out2.nextCursor).toBeNull();
  });

  it("discover_catalog degrades gracefully when the catalog is gated (403/404)", async () => {
    const client = await makeClientServer(false);
    const pool = agent.get(HOST);
    pool
      .intercept({ path: (p) => p.includes("CATALOGSERVICE"), method: "GET" })
      .reply(403, { error: { message: { value: "Forbidden" } } }, {
        headers: { "content-type": "application/json" },
      });
    pool.intercept({ path: (p) => p.includes("ServiceGroups"), method: "GET" }).reply(404, "");

    const res = await client.callTool({ name: "discover_catalog", arguments: { system: "T" } });
    const out = res.structuredContent as any;
    expect(res.isError).toBeFalsy();
    expect(out.available).toBe(false);
    expect(out.guidance).toContain("register_service");
  });

  it("odata_request passes through a raw GET", async () => {
    const client = await makeClientServer(false);
    agent
      .get(HOST)
      .intercept({ path: (p) => p.startsWith(`${SVC}/A_BusinessPartner`), method: "GET" })
      .reply(200, { d: { results: [] } }, { headers: { "content-type": "application/json" } });

    const res = await client.callTool({
      name: "odata_request",
      arguments: { system: "T", method: "GET", path: `${SVC}/A_BusinessPartner`, version: "v2" },
    });
    const out = res.structuredContent as any;
    expect(out.status).toBe(200);
  });
});
