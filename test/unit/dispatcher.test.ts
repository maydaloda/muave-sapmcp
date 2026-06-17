import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:https";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, ProxyAgent } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SystemConfigSchema, type SystemConfig } from "../../src/config/schema.js";
import type { CredentialResolver } from "../../src/credentials/resolver.js";
import { createDispatcherFactory } from "../../src/odata/dispatcher.js";
import { FakeCredentials, silentLogger } from "../helpers.js";

function cfg(extra: Record<string, unknown>): SystemConfig {
  return SystemConfigSchema.parse({
    key: "T",
    baseUrl: "https://sap.example.com",
    authType: "BASIC",
    preEncodedEnvVar: "PRE",
    ...extra,
  });
}

describe("createDispatcherFactory", () => {
  it("returns undefined when no tls/proxy is configured", async () => {
    const factory = createDispatcherFactory(cfg({}), new FakeCredentials(), silentLogger);
    expect(await factory()).toBeUndefined();
  });

  it("builds an Agent for a tls block and memoizes it", async () => {
    const factory = createDispatcherFactory(
      cfg({ tls: { rejectUnauthorized: false } }),
      new FakeCredentials(),
      silentLogger
    );
    const a = await factory();
    const b = await factory();
    expect(a).toBeInstanceOf(Agent);
    expect(b).toBe(a); // memoized — built once
  });

  it("builds a ProxyAgent when a proxy url is configured", async () => {
    const factory = createDispatcherFactory(
      cfg({ proxy: { url: "http://proxy.local:8080" } }),
      new FakeCredentials(),
      silentLogger
    );
    expect(await factory()).toBeInstanceOf(ProxyAgent);
  });

  it("resolves the CA PEM through the credential resolver (by env-var name)", async () => {
    const asked: string[] = [];
    const creds: CredentialResolver = {
      get: (ref) => {
        asked.push(ref);
        return Promise.resolve(ref === "MY_CA" ? "-----BEGIN CERTIFICATE-----\nAA\n-----END CERTIFICATE-----" : undefined);
      },
      getRequired: () => Promise.resolve("x"),
    };
    const factory = createDispatcherFactory(cfg({ tls: { caEnvVar: "MY_CA" } }), creds, silentLogger);
    expect(await factory()).toBeInstanceOf(Agent);
    expect(asked).toContain("MY_CA");
  });
});

/** Generate a throwaway self-signed cert; returns null if openssl is unavailable. */
function genSelfSigned(): { key: string; cert: string } | null {
  try {
    const dir = mkdtempSync(join(tmpdir(), "muave-tls-"));
    const keyPath = join(dir, "key.pem");
    const certPath = join(dir, "cert.pem");
    execFileSync(
      "openssl",
      [
        "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1",
        "-nodes", "-keyout", keyPath, "-out", certPath, "-days", "1",
        "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
      ],
      { stdio: "ignore" }
    );
    const key = readFileSync(keyPath, "utf8");
    const cert = readFileSync(certPath, "utf8");
    rmSync(dir, { recursive: true, force: true });
    return { key, cert };
  } catch {
    return null;
  }
}

const selfSigned = genSelfSigned();

describe.skipIf(!selfSigned)("tls dispatcher against a self-signed HTTPS server", () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    server = createServer({ key: selfSigned!.key, cert: selfSigned!.cert }, (_req, res) =>
      res.end("ok")
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    url = `https://localhost:${port}/`;
  });

  afterAll(() => {
    server?.close();
  });

  const fetchWith = (dispatcher: unknown) =>
    fetch(url, { dispatcher } as unknown as RequestInit);

  it("rejects the self-signed cert without a trusted CA (control)", async () => {
    await expect(fetch(url)).rejects.toThrow();
  });

  it("trusts the server when its CA is supplied via tls.caEnvVar", async () => {
    const factory = createDispatcherFactory(
      cfg({ tls: { caEnvVar: "TEST_CA" } }),
      new FakeCredentials({ TEST_CA: selfSigned!.cert }),
      silentLogger
    );
    const res = await fetchWith(await factory());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("connects when verification is disabled (rejectUnauthorized:false)", async () => {
    const factory = createDispatcherFactory(
      cfg({ tls: { rejectUnauthorized: false } }),
      new FakeCredentials(),
      silentLogger
    );
    const res = await fetchWith(await factory());
    expect(res.status).toBe(200);
  });
});
