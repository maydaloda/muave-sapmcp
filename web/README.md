# muave-sapmcp-web — remote MCP deployment (Vercel)

Hosts [muave-sapmcp](https://www.npmjs.com/package/muave-sapmcp) as a **remote MCP
server** (Streamable HTTP) with:

- **Email + password login** on your own domain (no third-party IdP) — better-auth
  acts as the OAuth 2.1 authorization server (PKCE + Dynamic Client Registration),
  which is what claude.ai custom connectors require.
- **Admin-managed access**: admins create users and **groups**, and assign which
  SAP **systems** each group may use (enforced server-side; admins see all).
- **Postgres** (Neon) for users/groups/catalog cache; embedded PGlite locally.

MCP endpoint: `https://<your-app>/api/mcp` · Admin UI: `https://<your-app>/admin`

## Deploy to Vercel

0. **Prerequisite:** `muave-sapmcp@>=0.2.0` published to npm (this app imports it).
1. **Create the Vercel project** — import the GitHub repo, set **Root Directory = `web`**
   (Framework: Next.js; no other build settings needed).
2. **Database** — create a Neon Postgres (Vercel Marketplace or neon.tech) and note the
   pooled connection string.
3. **Environment variables** (Project → Settings → Environment Variables):

   | Var | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled connection string |
   | `BETTER_AUTH_URL` | `https://<your-app>.vercel.app` (no trailing slash) |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
   | `MUAVE_SYSTEMS_JSON` | your systems config as one-line JSON (see `.env.example`) |
   | `S4_USER`, `S4_PASSWORD`, … | the SAP credentials your systems config references by name |

4. **Migrate + seed** (from your machine, against Neon):
   ```bash
   cd web && npm install
   DATABASE_URL=postgres://… npm run db:migrate
   DATABASE_URL=postgres://… ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=… npm run seed
   ```
5. **Deploy** (git push), then sign in at `https://<your-app>/admin`:
   create groups, assign systems, create users.

## Connect clients

- **claude.ai (web/mobile):** Settings → Connectors → *Add custom connector* →
  URL `https://<your-app>.vercel.app/api/mcp` (leave OAuth client fields empty —
  the client self-registers via DCR). The login page appears; sign in with the
  user's email/password.
- **Claude Code:** `claude mcp add --transport http muave-sap https://<your-app>.vercel.app/api/mcp`
  → run `/mcp` to authenticate (same browser login).
- **Claude Desktop:** Settings → Connectors → Add custom connector (same URL).

## Access model

- `user.role = admin` → all systems, plus `/admin`.
- Regular users → the systems of their assigned **group** (`*` = all). No group → no systems.
- Enforcement is server-side in the MCP request path (`FilteredSystemDirectory`,
  group-scoped catalog reads) — not just hidden in the UI. Per-system `readOnly` /
  `allowedEntities` from the systems config still apply on top.
- Public self-signup is disabled; only admins create accounts.

## Local development

```bash
npm install
npm run dev            # PGlite (web/.data/) — no DATABASE_URL needed
ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run seed
npm run build && npm run e2e   # scripted auth + group-filtering E2E (5 checks)
```

## Notes

- SAP credentials live **only** in env vars; they never reach the browser, tools,
  DB, or logs (the core package redacts auth headers).
- Start systems as `readOnly: true` in `MUAVE_SYSTEMS_JSON`; enable writes per
  system deliberately.
- The enterprise multi-tenant design (WorkOS, per-tenant credential vaulting,
  SSO/SCIM) is parked in [docs/ENTERPRISE-AUTH-ROADMAP.md](../docs/ENTERPRISE-AUTH-ROADMAP.md).
