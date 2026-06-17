# muave-sapmcp

An enterprise-grade **MCP server** that connects [Claude Code](https://claude.com/claude-code)
(and any MCP client) to **SAP S/4HANA Cloud Public Edition** OData services — **dynamically**.

Point it at an OData service path; it fetches and parses `$metadata`, caches it
locally, and exposes generic tools to **discover, read, and (opt-in) write** any
entity set — for both **OData V2 and V4**.

- 🔐 **Pluggable auth** — OAuth 2.0 client-credentials (recommended for cloud) and HTTP Basic, behind one abstraction (X.509/mTLS on the roadmap).
- 🧭 **Dynamic & metadata-driven** — no per-service code; register a path and the tools adapt to its entities, keys, and navigations.
- 🛟 **Handles what breaks naive clients** — CSRF (V2 **and** V4), **draft-enabled** RAP/Fiori entities, ETag/`If-Match` concurrency, `Retry-After` throttling, and server-driven pagination.
- 🛡️ **Safe by default** — read-only unless you opt in per system; write tools are dry-run-first; entity allowlists; secrets never become tool arguments and are redacted from logs.

> Status: `0.2.0`. See [CHANGELOG.md](CHANGELOG.md) and the [Roadmap](#roadmap).

**Two ways to run it:** as a **local stdio server** for Claude Code / Desktop (the
setup below), or as a **remote hosted server** reachable from claude.ai custom
connectors, with email/password login and admin-managed access — see
[Remote / hosted deployment](#remote--hosted-deployment).

## Install

```bash
npm install -g muave-sapmcp
# or run from source:
npm install && npm run build
```

Requires Node.js ≥ 20.12.

## Configure

### 1. `systems.json` (no secrets — env-var names only)

Copy [systems.json.example](systems.json.example) to `systems.json` (in the cwd,
`./.muave-sapmcp/`, or wherever `MUAVE_SYSTEMS_FILE` points):

```jsonc
{
  "schemaVersion": 1,
  "defaultSystem": "EXAMPLE",
  "systems": [
    {
      "key": "EXAMPLE",
      "baseUrl": "https://my123456-api.s4hana.cloud.sap",
      "sapClient": "100",
      "authType": "OAUTH2",
      "tokenUrl": "https://my123456-api.s4hana.cloud.sap/sap/bc/sec/oauth2/token?sap-client=100",
      "clientIdEnvVar": "EXAMPLE_OAUTH_CLIENT_ID",
      "clientSecretEnvVar": "EXAMPLE_OAUTH_CLIENT_SECRET",
      "readOnly": true
    }
  ]
}
```

Per-system fields: `key`, `baseUrl`, `authType` (`OAUTH2` | `BASIC` | `X509`),
optional `sapClient`, `readOnly` (default **true**), `allowedEntities`,
`timeoutMs`, `maxConcurrency`, `tls`, `proxy`.

- **OAUTH2**: `tokenUrl` (read it from the Communication Arrangement's *"OAuth 2.0 Confidential Client Token Service URL"* — **do not** hardcode the host), `clientIdEnvVar`, `clientSecretEnvVar`. The flow is `grant_type=client_credentials` with the client id/secret in the `Authorization: Basic` header; there is **no** scope param and **no** refresh token (the token is cached and re-fetched on expiry/401).
- **BASIC**: `userEnvVar` + `passwordEnvVar`, or a `preEncodedEnvVar` (pre-base64'd `user:pass`).

### Private Cloud (RISE) / on-premise

Public-CA cloud systems need nothing extra. **Private Cloud Edition / on-prem**
systems usually present a **corporate-CA or self-signed** TLS cert and may sit
behind a proxy — configure that per system (still no secrets in the file):

- **`tls`** — trust a corporate/self-signed cert:
  - `caFile`: path to the CA chain PEM (handy when self-hosting), **or**
  - `caEnvVar`: env-var **name** holding the CA PEM (for hosts with no filesystem),
  - `rejectUnauthorized: false`: disable verification entirely — **dev only**,
  - `serverName`: override the SNI/hostname checked against the cert.
- **`proxy`** — `url` of an HTTP(S) proxy (corporate proxy, or the SAP BTP
  Connectivity on-premise proxy); `authEnvVar` names an env var holding the full
  `Proxy-Authorization` header value.
- **`sapClient`** — set the ABAP client (`sap-client`), commonly needed on-prem.
- **OData V2 (SAP Gateway `/sap/opu/odata/...`)** — fully supported (CSRF, ETag,
  drafts, `sap-client`); it's the usual on-prem flavor.

```jsonc
{
  "key": "PRIVATE",
  "baseUrl": "https://s4.corp.example.internal:44300",
  "sapClient": "100",
  "authType": "BASIC",
  "userEnvVar": "PRIVATE_COMM_USER",
  "passwordEnvVar": "PRIVATE_COMM_PASSWORD",
  "readOnly": true,
  "tls": { "caFile": "./corporate-ca.pem" }
}
```

**Reachability:** run the connector **inside the network/VPN** (stdio, or the
self-hosted remote build) so it can reach the private system directly. The
SAP BTP **Cloud Connector** is only consumable by an app **hosted on BTP**
(Cloud Foundry/Kyma) — that path is on the roadmap.

**Serverless / inline config (`MUAVE_SYSTEMS_JSON`):** instead of a file, supply
the whole configuration as inline JSON in the **`MUAVE_SYSTEMS_JSON`** env var
(same shape; takes precedence over any `systems.json`). Intended for hosts with no
writable filesystem — it's how the [hosted deployment](#remote--hosted-deployment)
is configured.

### 2. Credentials (environment)

Secrets are resolved from the environment by the names referenced above — supply
them via your MCP client's `env` block, a process manager, or a secret manager.
See [.env.example](.env.example). **Never** put secret values in `systems.json`.

### Where the catalog cache lives

Registered services and parsed metadata persist in `catalog.json` (entries are
namespaced per system as `"<systemKey>:<serviceId>"`, so multiple S/4HANA systems
share one cache file without mixing). Location precedence:

1. `MUAVE_CACHE_DIR` env var
2. `cacheDir` in `systems.json` (relative paths resolve against the systems file's directory)
3. `MUAVE_HOME` env var
4. **Default:** a `.muave-sapmcp/` directory **next to your `systems.json`** — predictable even
   when the server is spawned with an arbitrary working directory (e.g. by Claude Desktop)
5. `<cwd>/.muave-sapmcp/` (no systems file found yet)

### 3. Register with Claude Code (`.mcp.json`)

```jsonc
{
  "mcpServers": {
    "muave-sapmcp": {
      "command": "muave-sapmcp",
      "env": {
        "MUAVE_SYSTEMS_FILE": "/abs/path/systems.json",
        "EXAMPLE_OAUTH_CLIENT_ID": "…",
        "EXAMPLE_OAUTH_CLIENT_SECRET": "…"
      }
    }
  }
}
```

(From source, use `"command": "node", "args": ["/abs/path/dist/index.js"]`.)

### 4. Use with Claude Desktop

Claude Desktop reads the same `mcpServers` shape from its own config file:

| OS | Config file |
|---|---|
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Windows (Microsoft Store app) | `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |

(Or open it via **Claude Desktop → Settings → Developer → Edit Config**.)

```jsonc
{
  "mcpServers": {
    "muave-sapmcp": {
      "command": "node",
      "args": ["C:\\path\\to\\node_modules\\muave-sapmcp\\dist\\index.js"],
      "env": {
        "MUAVE_SYSTEMS_FILE": "C:\\path\\to\\systems.json",
        "MUAVE_ENV_FILE": "C:\\path\\to\\.env.local",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

Desktop-specific notes:

- **Use `node` with an absolute path** to `dist/index.js` — GUI apps don't reliably inherit your shell `PATH`, and `npx`/`.cmd` shims often fail on Windows. After `npm install -g muave-sapmcp`, find the install dir with `npm root -g`.
- **Keep secrets out of the config**: point `MUAVE_ENV_FILE` at a local env file (e.g. `.env.local`) containing the credential variables your `systems.json` references, instead of inlining them in `env`.
- **Catalog cache**: from 0.1.1 the cache defaults to a `.muave-sapmcp/` dir next to your `systems.json`, so Claude Desktop and Claude Code share registrations automatically. Set `MUAVE_HOME` (or `cacheDir` in `systems.json`) only if you want it elsewhere.
- **Fully quit and relaunch** after editing the config (system tray → Quit on Windows; ⌘Q on macOS) — closing the window isn't enough.
- Verify: the tools icon in the chat box lists the `muave-sapmcp` tools; try *"List my SAP systems."* If the server shows as failed, check the MCP logs next to the config file (`logs/mcp-server-muave-sapmcp.log`).

## Remote / hosted deployment

The same connector can run as a **remote MCP server** (Streamable HTTP), reachable
from **claude.ai custom connectors** (web/mobile) as well as Claude Code/Desktop
remote MCP — with **email + password login on your own domain** (no third-party
IdP), **admin-managed group → system access**, and support for **multiple
customers** on one deployment.

- better-auth acts as the OAuth 2.1 authorization server (PKCE + Dynamic Client
  Registration) that claude.ai connectors require — users just see your login page.
- Admins create users/groups and assign which SAP systems each group may use,
  enforced server-side (not just hidden in the UI). Optional admin-managed systems
  with AES-256-GCM-encrypted credentials.
- Ships as a Next.js app under [`web/`](web/) (deploy to Vercel with root directory
  `web/`); Postgres (Neon) backs users/groups and the catalog cache.

Connect from claude.ai: **Settings → Connectors → Add custom connector**, URL
`https://<your-app>/api/mcp` (leave the OAuth client fields blank — the client
self-registers via DCR), then sign in.

Full setup, environment variables, and onboarding are in **[web/README.md](web/README.md)**.

## Tools

| Tool | Purpose |
|---|---|
| `list_systems` | Configured systems (no secrets) + default. |
| `discover_catalog` | Best-effort catalog enumeration; degrades gracefully when gated. |
| `register_service` | Fetch + parse a service's `$metadata` by path and cache it. |
| `list_services` / `refresh_metadata` | List / re-fetch registered services. |
| `describe_service` / `describe_entity` | Entity sets, keys, draft status; full property/nav detail + draft action FQNs. |
| `query_entities` | Paged collection read (`$filter/$select/$expand/$orderby`) with an opaque `nextCursor`. |
| `get_entity` | Fetch one entity by key; returns its ETag. |
| `create_entity` / `update_entity` / `delete_entity` | Draft-aware writes; CSRF + ETag handled; dry-run-first. |
| `activate_draft` | Drive the draft lifecycle (Prepare+Activate / Discard). |
| `odata_request` | Low-level passthrough for `$batch`, function imports, etc. |

Registered services and metadata are also exposed as read-only MCP **resources**
(`services://`, `metadata://{system}/{serviceId}[/{entitySet}]`), and a starter
prompt `explore_sap_service` teaches the safe workflow.

## Read-only by default; enabling writes

Every system is `readOnly: true` until you opt in. Set `"readOnly": false` (and
optionally `"allowedEntities": [...]`) on a system to enable writes there. Write
tools are only advertised when **some** system allows writes, and every write is
re-checked at call time. Writes are **dry-run-first**: call with `confirm: false`
(default) to get a preview of the resolved request, then `confirm: true` to execute.

## SAP specifics it handles

- **CSRF** — fetches the token + session cookie and replays both on every write (V2 and V4); auto-retries once on a `403 X-CSRF-Token: Required`.
- **Draft entities** — detects draft-enabled RAP/Fiori entities (IsActiveEntity key, DraftAdministrativeData, DraftRoot/Node) and resolves bound action FQNs; `create_entity` can drive create-draft → Activate; `activate_draft` handles recovery.
- **ETag** — `update_entity`/`delete_entity` use optimistic concurrency and retry once on `412` after re-reading.
- **Throttling** — honors `Retry-After` on `429`, with bounded per-system concurrency.
- **Pagination** — never materializes whole collections; follows `__next`/`@odata.nextLink`, else `$top`/`$skip` with a deterministic `$orderby`.

### Catalog discovery caveat

On S/4HANA Cloud Public Edition the OData catalog services are frequently gated
(KBA 3657717; they need a catalog communication scenario such as SAP_COM_0449).
`discover_catalog` therefore degrades gracefully (returns `available: false` with
guidance) — **manual `register_service` is the reliable path**. Find service
paths on the [SAP Business Accelerator Hub](https://api.sap.com) and in your
Communication Arrangement's Inbound Services.

## Troubleshooting

- `[auth/401]` — check the system's OAuth client id/secret or Basic user/password env vars, and that the Communication Arrangement authorizes the service.
- `[csrf/403]` — usually an expired session; retry (token+cookie are automatic).
- `[etag/412]` — the entity changed concurrently; re-read and retry.
- `[throttle/429]` — back off; `retryAfterSeconds` is surfaced.
- All diagnostics go to **stderr** (JSON via `pino`); set `LOG_LEVEL=debug` for detail.

## Use as a library

Beyond the stdio CLI, the package is **importable** for embedding the connector in
your own host (this is what the hosted deployment does — register the tools on any
`McpServer` and supply your own catalog/credential/transport wiring):

```ts
import {
  registerAllTools,        // wire all tools onto an McpServer
  ConfigStore,             // systems config + group-filtering hook (SystemDirectory)
  ODataClient,             // CSRF/ETag/draft/throttle-aware OData client
  GovernancePolicy,        // read-only / allowedEntities enforcement
  JsonFileCatalogStore,    // or implement the CatalogStore interface yourself
  createLogger,
  type ToolContext,
} from "muave-sapmcp";
```

`main`/`types` resolve to the library entry (`dist/lib.js`); the `muave-sapmcp`
**bin** (stdio server) is unchanged. See [src/lib.ts](src/lib.ts) for the full
exported surface.

## Development

```bash
npm run dev        # tsx watch
npm run typecheck
npm run lint
npm test           # vitest (unit + mocked-fetch integration + in-memory MCP roundtrip)
npm run coverage
npm run build
```

## Roadmap

SAP BTP deployment (Cloud Foundry) using the SAP Cloud SDK for Connectivity +
Destination services and **Cloud Connector** reach to on-prem, with optional
**principal propagation** via IAS; X.509/mTLS auth provider (trusting the SAP
Cloud Root CA — 2026 CA migration); secret-manager credential backends
(Vault / AWS / Azure / GCP); `$batch` as a first-class tool; SOAP/REST adapters;
metadata-driven per-entity input schemas.

## License

[Apache-2.0](LICENSE).
