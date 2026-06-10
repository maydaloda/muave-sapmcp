# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
