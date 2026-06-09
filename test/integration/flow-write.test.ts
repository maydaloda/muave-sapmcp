import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, type MockPool, setGlobalDispatcher } from "undici";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { HOST, SVC, makeClientServer } from "../harness.js";
import { fixture } from "../fixtures/load.js";

const ENTITY = "A_BusinessPartner";
const META = (p: string) => p.startsWith(`${SVC}/$metadata`);
const CSRF = (p: string) => p.startsWith(`${SVC}/?`);
const ENT = (p: string) => p.startsWith(`${SVC}/${ENTITY}`);

async function registered(agent: MockAgent): Promise<Client> {
  const client = await makeClientServer(false);
  agent
    .get(HOST)
    .intercept({ path: META, method: "GET" })
    .reply(200, fixture("v2-business-partner.metadata.xml"), {
      headers: { "content-type": "application/xml" },
    });
  await client.callTool({ name: "register_service", arguments: { system: "T", path: SVC, version: "v2" } });
  return client;
}

function csrfReply(pool: MockPool, times = 1): void {
  pool
    .intercept({ path: CSRF, method: "GET" })
    .reply(200, "", { headers: { "x-csrf-token": "TKN", "set-cookie": "SAP_SESSIONID=z; path=/" } })
    .times(times);
}

describe("write flows via MCP tools", () => {
  let agent: MockAgent;
  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });
  afterEach(async () => {
    await agent.close();
  });

  it("create_entity executes with CSRF and reports the new key", async () => {
    const client = await registered(agent);
    const pool = agent.get(HOST);
    csrfReply(pool);
    pool
      .intercept({ path: ENT, method: "POST" })
      .reply(201, { d: { BusinessPartner: "42", BusinessPartnerName: "Acme" } }, {
        headers: { "content-type": "application/json" },
      });

    const res = await client.callTool({
      name: "create_entity",
      arguments: {
        system: "T",
        serviceId: "API_BUSINESS_PARTNER",
        entitySet: ENTITY,
        body: { BusinessPartnerName: "Acme" },
        confirm: true,
      },
    });
    const out = res.structuredContent as any;
    expect(res.isError).toBeFalsy();
    expect(out.executed).toBe(true);
    expect(out.created.BusinessPartner).toBe("42");
    expect(out.key).toEqual({ BusinessPartner: "42" });
  });

  it("update_entity retries once on 412 after re-reading the ETag", async () => {
    const client = await registered(agent);
    const pool = agent.get(HOST);
    csrfReply(pool, 2); // one CSRF fetch per PATCH attempt

    // First PATCH → 412.
    pool
      .intercept({ path: ENT, method: "PATCH" })
      .reply(412, { error: { message: { value: "precondition failed" } } }, {
        headers: { "content-type": "application/json" },
      });
    // Re-read GET → fresh ETag.
    pool
      .intercept({ path: ENT, method: "GET" })
      .reply(200, { d: { BusinessPartner: "42" } }, {
        headers: { "content-type": "application/json", etag: 'W/"2"' },
      });
    // Second PATCH → 200.
    pool
      .intercept({ path: ENT, method: "PATCH" })
      .reply(200, { d: { BusinessPartner: "42", BusinessPartnerName: "Updated" } }, {
        headers: { "content-type": "application/json" },
      });

    const res = await client.callTool({
      name: "update_entity",
      arguments: {
        system: "T",
        serviceId: "API_BUSINESS_PARTNER",
        entitySet: ENTITY,
        key: "42",
        body: { BusinessPartnerName: "Updated" },
        ifMatch: 'W/"1"',
        confirm: true,
      },
    });
    const out = res.structuredContent as any;
    expect(res.isError).toBeFalsy();
    expect(out.executed).toBe(true);
    expect(out.etagRetried).toBe(true);
  });

  it("delete_entity executes (204) and reports deleted", async () => {
    const client = await registered(agent);
    const pool = agent.get(HOST);
    csrfReply(pool);
    pool.intercept({ path: ENT, method: "DELETE" }).reply(204, "");

    const res = await client.callTool({
      name: "delete_entity",
      arguments: { system: "T", serviceId: "API_BUSINESS_PARTNER", entitySet: ENTITY, key: "42", confirm: true },
    });
    const out = res.structuredContent as any;
    expect(out.executed).toBe(true);
    expect(out.deleted).toBe(true);
  });

  it("blocks a write on a read-only system at the tool layer", async () => {
    const client = await makeClientServer(true);
    // Read-only → write tools aren't even registered; calling one errors.
    const res = await client.callTool({
      name: "create_entity",
      arguments: { system: "T", serviceId: "X", entitySet: "Y", body: {}, confirm: true },
    });
    expect(res.isError).toBe(true);
  });
});
