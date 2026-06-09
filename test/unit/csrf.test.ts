import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { fetchCsrf } from "../../src/odata/csrf.js";

const HOST = "https://sap.example.com";
const PATH = "/sap/opu/odata/sap/SRV/";

describe("fetchCsrf", () => {
  let agent: MockAgent;
  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });
  afterEach(async () => {
    await agent.close();
  });

  it("captures the token and reduces Set-Cookie to a Cookie header", async () => {
    agent
      .get(HOST)
      .intercept({ path: PATH, method: "GET" })
      .reply(200, "", {
        headers: {
          "x-csrf-token": "TKN123",
          "set-cookie": ["SAP_SESSIONID=xyz; path=/; HttpOnly", "sap-usercontext=sap-client=100; path=/"],
        },
      });

    const res = await fetchCsrf(`${HOST}${PATH}`, {}, "GET");
    expect(res.token).toBe("TKN123");
    expect(res.cookie).toBe("SAP_SESSIONID=xyz; sap-usercontext=sap-client=100");
  });

  it("returns nulls (never throws) on network failure", async () => {
    agent.get(HOST).intercept({ path: PATH, method: "HEAD" }).replyWithError(new Error("boom"));
    const res = await fetchCsrf(`${HOST}${PATH}`, {}, "HEAD");
    expect(res).toEqual({ token: null, cookie: null });
  });
});
