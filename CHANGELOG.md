# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Private Cloud (RISE) / on-premise connectivity.** New per-system `tls`
  (custom CA via `caFile` or `caEnvVar`, `rejectUnauthorized`, `serverName`) and
  `proxy` (`url` + `authEnvVar`) options build a per-system `undici` dispatcher
  that is injected into every outbound request — data calls, the CSRF token
  fetch, and the OAuth2 token request. This lets the connector reach S/4HANA
  Private Cloud Edition / on-prem systems behind a **corporate-CA or self-signed**
  TLS cert and/or an **HTTP(S) proxy**. Secrets stay out of the config (CA PEM via
  a file path or an env-var name; proxy auth via an env-var name). The library API
  now exports `createDispatcherFactory` and the `DispatcherFactory` type.

## [0.2.0] — 2026-06-11

### Added

- **Programmatic API.** The package is now importable (`import { registerAllTools, ConfigStore, … } from "muave-sapmcp"`)
  for embedding the connector in other hosts (e.g. a remote Streamable-HTTP
  deployment). `main`/`types` point at the new `dist/lib.js`; the CLI `bin`
  (stdio server) is unchanged.
- **`MUAVE_SYSTEMS_JSON` env var** — supply the systems configuration as inline
  JSON (takes precedence over `systems.json` files) for serverless hosts with
  no filesystem config.

## [0.1.1] — 2026-06-10

### Changed

- **Predictable catalog-cache location.** The catalog cache now defaults to a
  `.muave-sapmcp/` directory **next to the loaded `systems.json`** instead of the
  process working directory. This makes registrations persist correctly when the
  server is spawned with an arbitrary cwd (e.g. by Claude Desktop) and lets
  Claude Code and Claude Desktop share one cache. Full precedence:
  `MUAVE_CACHE_DIR` env → `cacheDir` (systems.json) → `MUAVE_HOME` env →
  systems-file directory → cwd.
  - Migration: if a previous launch used a cwd different from the systems-file
    directory, move that `.muave-sapmcp/catalog.json` next to your
    `systems.json` (or simply re-register services).

### Added

- Optional top-level `cacheDir` in `systems.json` (relative paths resolve
  against the systems file's directory).
- README: "Use with Claude Desktop" setup section and catalog-cache docs.

### Fixed

- **Date-typed key predicates.** V4 `Edm.Date`/`Edm.DateTimeOffset`/`Edm.TimeOfDay`
  keys are now emitted as bare literals (`ValidityEndDate=9999-12-31`) instead of
  quoted strings — required by SAP RAP A2X services with validity-period keys
  (e.g. Cost Center). V2 `Edm.DateTime`/`Edm.DateTimeOffset`/`Edm.Time` keys get
  their type-prefixed quoted forms (`datetime'...'`).

## [0.1.0] — 2026-06-10

Initial release: an enterprise-grade MCP server connecting Claude Code to SAP
S/4HANA Cloud Public Edition OData services (V2 + V4).

### Added

- **stdio MCP server** built on `@modelcontextprotocol/sdk`, with structured
  tool output (`outputSchema`/`structuredContent`) and MCP tool annotations.
- **Pluggable authentication**: OAuth 2.0 client-credentials (primary, with
  in-memory token cache + single-flight refresh), HTTP Basic (communication
  user), and an X.509/mTLS stub for the roadmap.
- **Dynamic metadata engine**: fetch + parse OData V2/V4 `$metadata`, normalized
  to a shared shape, extended to detect draft-enabled entities and bound draft
  actions (Edit/Prepare/Activate/Discard).
- **Resilient OData client**: CSRF token+cookie round-trip for writes (V2 & V4),
  ETag/`If-Match` optimistic concurrency, retry with backoff+jitter, `Retry-After`
  handling, per-system concurrency bounding, and V2/V4 response/error normalization.
- **Tool surface**: `list_systems`, `discover_catalog` (best-effort, graceful),
  `register_service`, `list_services`, `refresh_metadata`, `describe_service`,
  `describe_entity`, `query_entities` (cursor pagination), `get_entity`,
  `create_entity`, `update_entity`, `delete_entity`, `activate_draft`, and the
  `odata_request` escape hatch.
- **Governance**: read-only by default; writes opt-in per system; entity
  allowlist; dry-run-first confirmation; destructive/idempotent annotations.
- **Persistence**: local JSON catalog cache with atomic writes and schema-version
  gating.
- **Observability**: structured `pino` logging to stderr with secret redaction,
  correlation ids, and a write audit trail.
- **MCP resources** (`services://`, `metadata://…`) and an `explore_sap_service`
  prompt.
- Packaging: npm `bin`, multi-stage Dockerfile, GitHub Actions CI, vitest test
  suite (unit + mocked-fetch integration + in-memory MCP roundtrip).
