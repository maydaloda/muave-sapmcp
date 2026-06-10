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

> Status: `0.1.0` — initial release. See [CHANGELOG.md](CHANGELOG.md) and the [Roadmap](#roadmap).

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
`timeoutMs`, `maxConcurrency`.

- **OAUTH2**: `tokenUrl` (read it from the Communication Arrangement's *"OAuth 2.0 Confidential Client Token Service URL"* — **do not** hardcode the host), `clientIdEnvVar`, `clientSecretEnvVar`. The flow is `grant_type=client_credentials` with the client id/secret in the `Authorization: Basic` header; there is **no** scope param and **no** refresh token (the token is cached and re-fetched on expiry/401).
- **BASIC**: `userEnvVar` + `passwordEnvVar`, or a `preEncodedEnvVar` (pre-base64'd `user:pass`).

### 2. Credentials (environment)

Secrets are resolved from the environment by the names referenced above — supply
them via your MCP client's `env` block, a process manager, or a secret manager.
See [.env.example](.env.example). **Never** put secret values in `systems.json`.

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

X.509/mTLS auth provider (trusting the SAP Cloud Root CA — 2026 CA migration);
remote Streamable-HTTP transport with the MCP OAuth 2.1 resource-server framework;
secret-manager credential backends (Vault / AWS / Azure / GCP); `$batch` as a
first-class tool; SOAP/REST adapters; metadata-driven per-entity input schemas.

## License

[Apache-2.0](LICENSE).
