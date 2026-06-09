import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { TokenCache } from "../../src/auth/token-cache.js";
import type { AuthDeps } from "../../src/auth/provider.js";
import { SystemsFileSchema, type SystemConfig } from "../../src/config/schema.js";
import { ConfigStore } from "../../src/config/resolve.js";
import { ODataClient } from "../../src/odata/client.js";
import { ConcurrencyLimiter } from "../../src/odata/concurrency.js";
import { ODataError } from "../../src/odata/errors.js";
import { FakeCredentials, silentLogger } from "../helpers.js";

const HOST = "https://sap.example.com";
const SVC = "/sap/opu/odata/sap/SRV";

function makeClient(systems: unknown[]): ODataClient {
  const file = SystemsFileSchema.parse({ schemaVersion: 1, systems });
  const deps: AuthDeps = {
    credentials: new FakeCredentials({ PRE: "YWJj" }),
    tokenCache: new TokenCache(),
    logger: silentLogger,
  };
  const config = new ConfigStore(file, deps);
  return new ODataClient({ resolver: config, logger: silentLogger, limiter: new ConcurrencyLimiter(15) });
}

const writableV2: SystemConfig = SystemsFileSchema.parse({
  schemaVersion: 1,
  systems: [{ key: "T", baseUrl: HOST, authType: "BASIC", preEncodedEnvVar: "PRE", readOnly: false }],
}).systems[0]!;

describe("ODataClient integration", () => {
  let agent: MockAgent;
  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });
  afterEach(async () => {
    await agent.close();
  });

  it("normalizes a V2 collection (d.results) and inline count", async () => {
    const client = makeClient([writableV2]);
    agent
      .get(HOST)
      .intercept({ path: (p) => p.startsWith(`${SVC}/A_BusinessPartner`), method: "GET" })
      .reply(
        200,
        { d: { results: [{ BusinessPartner: "1" }, { BusinessPartner: "2" }], __count: "2" } },
        { headers: { "content-type": "application/json" } }
      );

    const res = await client.request({
      systemKey: "T",
      version: "v2",
      method: "GET",
      servicePath: SVC,
      resourcePath: "A_BusinessPartner",
      query: { top: 2, count: true },
    });
    expect(Array.isArray(res.data)).toBe(true);
    expect((res.data as unknown[]).length).toBe(2);
    expect(res.count).toBe(2);
  });

  it("normalizes a V4 collection (value) and captures @odata.nextLink", async () => {
    const client = makeClient([
      { key: "T", baseUrl: HOST, authType: "BASIC", preEncodedEnvVar: "PRE", readOnly: false },
    ]);
    agent
      .get(HOST)
      .intercept({ path: (p) => p.startsWith(`${SVC}/Sample`), method: "GET" })
      .reply(
        200,
        { value: [{ ID: "a" }], "@odata.count": 5, "@odata.nextLink": "Sample?$skiptoken='X'" },
        { headers: { "content-type": "application/json" } }
      );

    const res = await client.request({
      systemKey: "T",
      version: "v4",
      method: "GET",
      servicePath: SVC,
      resourcePath: "Sample",
    });
    expect((res.data as unknown[]).length).toBe(1);
    expect(res.count).toBe(5);
    expect(res.nextLink).toBe("Sample?$skiptoken='X'");
  });

  it("performs the CSRF token+cookie round-trip on a write", async () => {
    const client = makeClient([writableV2]);
    const pool = agent.get(HOST);

    // CSRF fetch (GET service root with x-csrf-token: fetch).
    pool
      .intercept({ path: (p) => p.startsWith(`${SVC}/?`), method: "GET" })
      .reply(200, "", {
        headers: { "x-csrf-token": "TKN", "set-cookie": "SAP_SESSIONID=zzz; path=/" },
      });

    // The write must echo BOTH the token and the cookie.
    let sawToken: string | undefined;
    let sawCookie: string | undefined;
    pool
      .intercept({ path: (p) => p.startsWith(`${SVC}/A_BusinessPartner`), method: "POST" })
      .reply((opts) => {
        sawToken = opts.headers?.["x-csrf-token"] as string | undefined;
        sawCookie = opts.headers?.["cookie"] as string | undefined;
        return {
          statusCode: 201,
          data: { d: { BusinessPartner: "999" } },
          responseOptions: { headers: { "content-type": "application/json" } },
        };
      });

    const res = await client.request({
      systemKey: "T",
      version: "v2",
      method: "POST",
      servicePath: SVC,
      resourcePath: "A_BusinessPartner",
      body: { BusinessPartnerName: "Acme" },
    });
    expect(res.status).toBe(201);
    expect(sawToken).toBe("TKN");
    expect(sawCookie).toContain("SAP_SESSIONID=zzz");
  });

  it("retries on 429 honoring Retry-After, then succeeds", async () => {
    const client = makeClient([writableV2]);
    const pool = agent.get(HOST);
    pool
      .intercept({ path: (p) => p.startsWith(`${SVC}/A_BusinessPartner`), method: "GET" })
      .reply(429, "", { headers: { "retry-after": "0" } });
    pool
      .intercept({ path: (p) => p.startsWith(`${SVC}/A_BusinessPartner`), method: "GET" })
      .reply(200, { d: { results: [] } }, { headers: { "content-type": "application/json" } });

    const res = await client.request({
      systemKey: "T",
      version: "v2",
      method: "GET",
      servicePath: SVC,
      resourcePath: "A_BusinessPartner",
    });
    expect(res.status).toBe(200);
  });

  it("surfaces a normalized SAP error on 4xx", async () => {
    const client = makeClient([writableV2]);
    agent
      .get(HOST)
      .intercept({ path: (p) => p.startsWith(`${SVC}/A_BusinessPartner`), method: "GET" })
      .reply(
        400,
        { error: { code: "BAD", message: { value: "Invalid filter" } } },
        { headers: { "content-type": "application/json" } }
      );

    await expect(
      client.request({
        systemKey: "T",
        version: "v2",
        method: "GET",
        servicePath: SVC,
        resourcePath: "A_BusinessPartner",
      })
    ).rejects.toMatchObject({ status: 400, category: "validation", sapCode: "BAD" });
  });

  it("blocks writes on read-only systems before any network call", async () => {
    const client = makeClient([
      { key: "RO", baseUrl: HOST, authType: "BASIC", preEncodedEnvVar: "PRE", readOnly: true },
    ]);
    await expect(
      client.request({
        systemKey: "RO",
        version: "v2",
        method: "POST",
        servicePath: SVC,
        resourcePath: "A_BusinessPartner",
        body: {},
      })
    ).rejects.toBeInstanceOf(ODataError);
  });
});
