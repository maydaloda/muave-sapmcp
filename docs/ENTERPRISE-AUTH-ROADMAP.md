# Enterprise authentication roadmap (parked design)

Status: **parked** — recorded for a future phase. The shipped remote deployment
(`web/`) intentionally uses the simpler model (ID+password on our domain,
admin-managed group→system access). This document preserves the full
multi-customer architecture agreed during design, so it can be picked up
without re-research.

## The two auth planes

1. **Front door — users/Claude → the MCP server.** OAuth 2.1 + PKCE with
   Dynamic Client Registration, delegated to a managed authorization server
   (recommended: **WorkOS AuthKit** — first-class MCP support, hosted login,
   DCR, consent, AS metadata; see https://workos.com/docs/authkit/mcp). The MCP
   deployment stays a pure *resource server*: it publishes RFC 9728 protected-
   resource metadata, validates JWTs (issuer, audience-bound, expiry), and
   derives the tenant **exclusively from the verified token's organization
   claim** — never from headers or parameters.
2. **Back door — the server → SAP.** Per-tenant communication users / OAuth
   client-credentials resolved server-side, envelope-encrypted at rest
   (AES-256-GCM with a managed master key; upgradeable to KMS/Vault). SAP
   credentials never transit the client, never appear in tokens or logs.

## Tenant model

- **IdP organizations = tenants.** Internal staff in one org; each customer in
  their own. Customer enterprise SSO (SAML/OIDC via their own IdP) and SCIM
  provisioning become IdP configuration, not code (WorkOS core competency).
- Per tenant: SAP systems config, encrypted credentials, governance
  (readOnly default **true**, entity allowlists), namespaced catalog cache
  (`tenant:{org}:system:service`), and an audit trail (user, tool, entity,
  outcome, correlation id).
- Isolation is structural: a compromised credential in one tenant cannot reach
  another tenant's config, cache, or systems.

## Authorization layers (defense in depth)

valid token → tenant resolution (org claim) → role scopes within the org
(admin / write / read) → existing per-system governance (readOnly/allowlist)
→ audit.

## Provider evaluation (as of 2026-06)

- **WorkOS AuthKit** — recommended. MCP/DCR support, Organizations,
  Enterprise SSO + SCIM, independent vendor, free to 1M MAU.
- **Auth0** — capable; opaque enterprise pricing; tool-level authz pulls in FGA.
- **Clerk** — great DX; no native SCIM (enterprise-deal blocker).
- **Stytch** — purpose-built for MCP OAuth but acquired by Twilio (roadmap risk).

## Migration path from the simple model

The simple deployment's better-auth user table maps onto IdP-managed
identities; groups map onto org roles; the group→system allowlist generalizes
to the per-tenant systems config. The `FilteredSystemDirectory` and
`CatalogStore` seams in `web/` are the intended extension points — swap the
session source (better-auth → JWT claims) and the tenant-config source
(env JSON → tenant store) without touching the MCP tool layer.

## Open items when resumed

- Per-tenant SAP credential vaulting + rotation (dual-credential overlap).
- Admin-managed systems config (today: operator env vars).
- API keys / machine clients for headless integrations.
- Rate limiting per tenant; data-residency placement if customers require it.
