import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { BasicAuthProvider } from "../../src/auth/basic.js";
import { OAuth2ClientCredentialsProvider } from "../../src/auth/oauth2.js";
import { TokenCache } from "../../src/auth/token-cache.js";
import type { AuthDeps } from "../../src/auth/provider.js";
import { FakeCredentials, silentLogger } from "../helpers.js";

describe("BasicAuthProvider", () => {
  const deps: AuthDeps = {
    credentials: new FakeCredentials({ PRE: "cHJlOmVuYw==", U: "user", P: "pass" }),
    tokenCache: new TokenCache(),
    logger: silentLogger,
  };

  it("prefers a pre-encoded credential", async () => {
    const p = new BasicAuthProvider({ key: "S", preEncodedEnvVar: "PRE" }, deps);
    expect((await p.getAuthHeaders()).authorization).toBe("Basic cHJlOmVuYw==");
  });

  it("falls back to user/password (base64-encoded)", async () => {
    const p = new BasicAuthProvider({ key: "S", userEnvVar: "U", passwordEnvVar: "P" }, deps);
    const expected = `Basic ${Buffer.from("user:pass").toString("base64")}`;
    expect((await p.getAuthHeaders()).authorization).toBe(expected);
  });

  it("throws when no credentials resolve", async () => {
    const p = new BasicAuthProvider({ key: "S", userEnvVar: "MISSING" }, deps);
    await expect(p.getAuthHeaders()).rejects.toThrow(/no BASIC credentials/i);
  });
});

describe("TokenCache single-flight", () => {
  it("runs the loader once under concurrent access", async () => {
    const cache = new TokenCache();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return { accessToken: "t", tokenType: "bearer", expiresAtMs: Date.now() + 60_000 };
    };
    const [a, b, c] = await Promise.all([
      cache.getOrFetch("k", 0, loader),
      cache.getOrFetch("k", 0, loader),
      cache.getOrFetch("k", 0, loader),
    ]);
    expect(calls).toBe(1);
    expect(a.accessToken).toBe("t");
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("treats tokens within the expiry margin as expired", () => {
    const cache = new TokenCache();
    cache.set("k", { accessToken: "t", tokenType: "bearer", expiresAtMs: Date.now() + 30_000 });
    expect(cache.get("k", 60)).toBeUndefined(); // 60s margin > 30s remaining
    expect(cache.get("k", 5)).toBeDefined();
  });
});

describe("OAuth2ClientCredentialsProvider", () => {
  const TOKEN_URL = "https://my123456-api.s4hana.cloud.sap/sap/bc/sec/oauth2/token";
  let agent: MockAgent;

  beforeEach(() => {
    agent = new MockAgent();
    agent.disableNetConnect();
    setGlobalDispatcher(agent);
  });
  afterEach(async () => {
    await agent.close();
  });

  function provider(): OAuth2ClientCredentialsProvider {
    const deps: AuthDeps = {
      credentials: new FakeCredentials({ CID: "client", CSEC: "secret" }),
      tokenCache: new TokenCache(),
      logger: silentLogger,
    };
    return new OAuth2ClientCredentialsProvider(
      { key: "S", tokenUrl: TOKEN_URL, clientIdEnvVar: "CID", clientSecretEnvVar: "CSEC", tokenRefreshMarginSec: 60 },
      deps
    );
  }

  it("fetches a bearer token with Basic-header client credentials and caches it", async () => {
    let tokenCalls = 0;
    agent
      .get("https://my123456-api.s4hana.cloud.sap")
      .intercept({ path: "/sap/bc/sec/oauth2/token", method: "POST" })
      .reply((opts) => {
        tokenCalls += 1;
        expect(opts.headers).toMatchObject({
          authorization: `Basic ${Buffer.from("client:secret").toString("base64")}`,
        });
        expect(String(opts.body)).toContain("grant_type=client_credentials");
        return { statusCode: 200, data: { access_token: "abc", token_type: "bearer", expires_in: 3600 } };
      })
      .times(1);

    const p = provider();
    expect((await p.getAuthHeaders()).authorization).toBe("Bearer abc");
    // Second call is served from cache (only one interceptor registered).
    expect((await p.getAuthHeaders()).authorization).toBe("Bearer abc");
    expect(tokenCalls).toBe(1);
  });
});
