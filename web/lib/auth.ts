import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, mcp } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { sendEmail } from "./email";

/**
 * better-auth: email+password login on our own domain, acting as the OAuth
 * authorization server for MCP clients (claude.ai connector, Claude Code/Desktop
 * remote MCP) via the MCP plugin (DCR + PKCE + token issuance), plus the admin
 * plugin for user management.
 *
 * Public self-signup is disabled — users are created by an admin in /admin.
 * Adds: self-service password reset (email link) and account lockout after
 * MAX_ATTEMPTS failed sign-ins.
 */
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes

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
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your muave-sapmcp password",
        text: `Reset your password: ${url}\n\nThis link expires in 1 hour. If you didn't request it, ignore this email.`,
        html: `<p>Reset your muave-sapmcp password:</p><p><a href="${url}">${url}</a></p><p>This link expires in 1 hour. If you didn't request it, ignore this email.</p>`,
      });
    },
  },
  user: {
    additionalFields: {
      groupId: { type: "string", required: false, input: false },
      failedLoginAttempts: { type: "number", required: false, input: false },
      lockedUntil: { type: "date", required: false, input: false },
    },
  },
  hooks: {
    // BEFORE: reject still-locked accounts before the credential check.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const email = ctx.body?.email as string | undefined;
      if (!email) return;
      const row = await db.query.user.findFirst({
        columns: { lockedUntil: true },
        where: eq(schema.user.email, email),
      });
      if (row?.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
        const mins = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60000);
        throw new APIError("FORBIDDEN", {
          code: "ACCOUNT_LOCKED",
          message: `Account locked after ${MAX_ATTEMPTS} failed attempts. Try again in ${mins} minute(s) or ask an administrator to unlock it.`,
        });
      }
    }),
    // AFTER: count failures / reset on success for /sign-in/email.
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email") return;
      const email = ctx.body?.email as string | undefined;
      if (!email) return;
      const returned = ctx.context.returned;
      const isError = returned instanceof APIError;

      if (isError) {
        // Only count wrong-credential attempts; ignore our own lock + other errors.
        if (returned.body?.code !== "INVALID_EMAIL_OR_PASSWORD") return;
        const row = await db.query.user.findFirst({
          columns: { failedLoginAttempts: true },
          where: eq(schema.user.email, email),
        });
        if (!row) return; // unknown email — never create lock state
        const attempts = (row.failedLoginAttempts ?? 0) + 1;
        await db
          .update(schema.user)
          .set({
            failedLoginAttempts: attempts,
            lockedUntil: attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MS) : null,
            updatedAt: new Date(),
          })
          .where(eq(schema.user.email, email));
      } else {
        // Successful sign-in → clear counter + any lock.
        await db
          .update(schema.user)
          .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
          .where(eq(schema.user.email, email));
      }
    }),
  },
  plugins: [mcp({ loginPage: "/login" }), admin()],
});

export type Session = typeof auth.$Infer.Session;
