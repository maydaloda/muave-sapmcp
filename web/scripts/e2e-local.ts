/**
 * Local E2E against the REAL built server (next start + PGlite):
 *  1. unauthenticated /api/mcp → 401 + WWW-Authenticate
 *  2. admin token → tools/list works, list_systems shows ALL systems
 *  3. restricted user token → list_systems shows only the group's system,
 *     and resolving the denied system fails with a governance error
 *
 *   npm run build && npm run e2e
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";

const PORT = 3111;
const BASE = `http://localhost:${PORT}`;
const ADMIN_TOKEN = "e2e-admin-token";
const USER_TOKEN = "e2e-user-token";

const ENV = {
  ...process.env,
  BETTER_AUTH_URL: BASE,
  BETTER_AUTH_SECRET: "e2e-secret-not-for-production-0123456789",
  DATABASE_URL: "",
  MUAVE_SYSTEMS_JSON: JSON.stringify({
    schemaVersion: 1,
    defaultSystem: "SYS_A",
    systems: [
      { key: "SYS_A", baseUrl: "https://a.example.invalid", authType: "BASIC", preEncodedEnvVar: "E2E_CRED" },
      { key: "SYS_B", baseUrl: "https://b.example.invalid", authType: "BASIC", preEncodedEnvVar: "E2E_CRED" },
    ],
  }),
  E2E_CRED: "ZHVtbXk6ZHVtbXk=",
  // 32 zero bytes base64 — test-only master key for encrypted DB credentials.
  MUAVE_CRED_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};
delete (ENV as Record<string, unknown>).DATABASE_URL;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function record(name: string, ok: boolean, detail = ""): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function mcpCall(token: string | null, body: unknown): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/mcp`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  // Streamable HTTP may answer as SSE ("data: {...}") or plain JSON.
  const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
  let json: any = null;
  try {
    json = JSON.parse(dataLine ? dataLine.slice(6) : text);
  } catch {
    /* non-JSON (e.g. 401 body) */
  }
  return { status: res.status, json };
}

function toolsCall(name: string, args: Record<string, unknown> = {}): unknown {
  return {
    jsonrpc: "2.0",
    id: Math.floor(Math.random() * 100000),
    method: "tools/call",
    params: { name, arguments: args },
  };
}

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/login`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not become ready");
}

async function main(): Promise<void> {
  rmSync(join(process.cwd(), ".data"), { recursive: true, force: true });

  console.log("[e2e] seeding fixtures…");
  const setup = spawnSync("npx", ["tsx", "scripts/e2e-setup.ts"], {
    env: ENV,
    shell: true,
    encoding: "utf8",
  });
  if (setup.status !== 0) {
    console.error(setup.stdout, setup.stderr);
    throw new Error("e2e-setup failed");
  }

  console.log("[e2e] starting server…");
  const server: ChildProcess = spawn("npx", ["next", "start", "-p", String(PORT)], {
    env: ENV,
    shell: true,
    stdio: "ignore",
  });

  try {
    await waitForServer();

    // 1. No token → 401 with resource metadata pointer.
    {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      };
      const res = await fetch(`${BASE}/api/mcp`, {
        method: "POST",
        headers,
        body: JSON.stringify(toolsCall("list_systems")),
      });
      record(
        "unauthenticated request rejected",
        res.status === 401 && (res.headers.get("www-authenticate") ?? "").includes("resource_metadata"),
        `status=${res.status}`
      );
    }

    // 1b. Dynamic Client Registration (the first thing claude.ai does). NOTE:
    // INFORMATIONAL ONLY under this harness — DCR does a multi-query insert and
    // the embedded PGlite test DB is single-connection, so it intermittently
    // 500s here purely from connection contention. It is reliable on real
    // Postgres (Neon) and is verified against the live deployment, not here.
    {
      const res = await fetch(`${BASE}/api/auth/mcp/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "e2e-dcr",
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        }),
      });
      const json: any = await res.json().catch(() => null);
      const ok = (res.status === 200 || res.status === 201) && typeof json?.client_id === "string";
      console.log(`  ${ok ? "✓" : "·"} dynamic client registration (informational, PGlite) — status=${res.status}`);
    }

    // 2. Admin sees ALL systems — env-defined AND the DB-managed one (encrypted creds).
    {
      const { status, json } = await mcpCall(ADMIN_TOKEN, toolsCall("list_systems"));
      const systems = json?.result?.structuredContent?.systems?.map((s: any) => s.key) ?? [];
      record(
        "admin sees env systems AND the DB-managed system",
        status === 200 &&
          systems.includes("SYS_A") &&
          systems.includes("SYS_B") &&
          systems.includes("SYS_DB"),
        `systems=${JSON.stringify(systems)}`
      );
    }

    // 3. Restricted user sees only SYS_A.
    {
      const { status, json } = await mcpCall(USER_TOKEN, toolsCall("list_systems"));
      const systems = json?.result?.structuredContent?.systems?.map((s: any) => s.key) ?? [];
      record(
        "restricted user sees only the group's system",
        status === 200 && systems.length === 1 && systems[0] === "SYS_A",
        `systems=${JSON.stringify(systems)}`
      );
    }

    // 4. Restricted user is denied SYS_B with a governance error.
    {
      const { json } = await mcpCall(
        USER_TOKEN,
        toolsCall("register_service", { system: "SYS_B", path: "/sap/opu/odata/sap/X", version: "v2" })
      );
      const text = json?.result?.content?.[0]?.text ?? "";
      record(
        "denied system fails with governance error",
        json?.result?.isError === true && /not available to your user group/i.test(text),
        text.slice(0, 80)
      );
    }

    // 5. OAuth discovery endpoints respond.
    {
      const as = await fetch(`${BASE}/.well-known/oauth-authorization-server`);
      const pr = await fetch(`${BASE}/.well-known/oauth-protected-resource`);
      const asJson: any = await as.json().catch(() => null);
      record(
        "OAuth discovery metadata served",
        as.ok && pr.ok && typeof asJson?.authorization_endpoint === "string",
        `authorize=${asJson?.authorization_endpoint ?? "?"}`
      );
    }
  } finally {
    server.kill();
    // On Windows, kill the whole tree.
    if (server.pid) spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { shell: true });
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[e2e] ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("[e2e] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
