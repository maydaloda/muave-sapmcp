import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, mcp } from "better-auth/plugins";
import { db, schema } from "./db";

/**
 * better-auth: email+password login on our own domain, acting as the OAuth
 * authorization server for MCP clients (claude.ai connector, Claude Code/Desktop
 * remote MCP) via the MCP plugin (DCR + PKCE + token issuance), plus the admin
 * plugin for user management.
 *
 * Public self-signup is disabled — users are created by an admin in /admin.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  // Extra origins allowed to reach auth endpoints (e.g. the *.vercel.app URL
  // alongside a custom domain). Comma-separated.
  trustedOrigins: (process.env.MUAVE_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      oauthApplication: schema.oauthApplication,
      oauthAccessToken: schema.oauthAccessToken,
      oauthConsent: schema.oauthConsent,
    },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      groupId: { type: "string", required: false, input: false },
    },
  },
  plugins: [mcp({ loginPage: "/login" }), admin()],
});

export type Session = typeof auth.$Infer.Session;
