import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { HOST, SVC, makeClientServer } from "../harness.js";
import { fixture } from "../fixtures/load.js";

describe("MCP roundtrip (in-memory transport)", () => {
  let agent: MockAgent;
  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });
  afterEach(async () => {
    await agent.close();
  });

  it("registers write tools when a system is writable", async () => {
    const client = await makeClientServer(false);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("query_entities");
    expect(names).toContain("create_entity");
    expect(names).toContain("update_entity");
    expect(names).toContain("odata_request");
  });

  it("omits write tools when all systems are read-only", async () => {
    const client = await makeClientServer(true);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("query_entities");
    expect(names).not.toContain("create_entity");
    expect(names).not.toContain("delete_entity");
  });

  it("runs register_service → describe_entity → query_entities, and dry-runs a write", async () => {
    const client = await makeClientServer(false);

    agent
      .get(HOST)
      .intercept({ path: (p) => p.startsWith(`${SVC}/$metadata`), method: "GET" })
      .reply(200, fixture("v2-business-partner.metadata.xml"), {
        headers: { "content-type": "application/xml" },
      });

    const reg = await client.callTool({
      name: "register_service",
      arguments: { system: "T", path: SVC, version: "v2" },
    });
    const regOut = reg.structuredContent as any;
    expect(reg.isError).toBeFalsy();
    expect(regOut.serviceId).toBe("API_BUSINESS_PARTNER");
    expect(regOut.entitySetCount).toBe(2);

    const desc = await client.callTool({
      name: "describe_entity",
      arguments: { system: "T", serviceId: "API_BUSINESS_PARTNER", entitySet: "A_BusinessPartner" },
    });
    const descOut = desc.structuredContent as any;
    expect(descOut.keyFields).toEqual(["BusinessPartner"]);
    expect(descOut.properties.some((p: any) => p.name === "to_BusinessPartnerAddress")).toBe(true);

    agent
      .get(HOST)
      .intercept({ path: (p) => p.startsWith(`${SVC}/A_BusinessPartner`), method: "GET" })
      .reply(
        200,
        { d: { results: [{ BusinessPartner: "1" }], __count: "1" } },
        { headers: { "content-type": "application/json" } }
      );

    const q = await client.callTool({
      name: "query_entities",
      arguments: { system: "T", serviceId: "API_BUSINESS_PARTNER", entitySet: "A_BusinessPartner", top: 1, count: true },
    });
    const qOut = q.structuredContent as any;
    expect(qOut.rows).toHaveLength(1);
    expect(qOut.count).toBe(1);

    const dry = await client.callTool({
      name: "create_entity",
      arguments: {
        system: "T",
        serviceId: "API_BUSINESS_PARTNER",
        entitySet: "A_BusinessPartner",
        body: { BusinessPartnerName: "Acme" },
        confirm: false,
      },
    });
    const dryOut = dry.structuredContent as any;
    expect(dryOut.executed).toBe(false);
    expect(dryOut.preview.method).toBe("POST");
  });

  it("returns a structured error (isError) for an unknown service", async () => {
    const client = await makeClientServer(false);
    const res = await client.callTool({
      name: "describe_service",
      arguments: { system: "T", serviceId: "NOPE" },
    });
    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ type: string; text?: string }>)
      .map((c) => c.text ?? "")
      .join("");
    expect(text).toContain("notfound");
  });
});
