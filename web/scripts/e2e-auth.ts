/**
 * In-process auth E2E (sequential better-auth handler calls → reliable on PGlite):
 * account lockout after 5 failed sign-ins, admin unlock, and password-reset request.
 *
 *   rm -rf .data && BETTER_AUTH_SECRET=… npx tsx scripts/e2e-auth.ts
 */
import { eq } from "drizzle-orm";

const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const EMAIL = "lock@example.com";
const GOOD = "correct-password-1";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function record(name: string, ok: boolean, detail = ""): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main(): Promise<void> {
  const { db, dbReady, schema } = await import("../lib/db");
  await dbReady;
  const { auth } = await import("../lib/auth");

  await auth.api.createUser({ body: { email: EMAIL, password: GOOD, name: "Lock", role: "user" } });

  const signIn = async (password: string): Promise<number> => {
    const res = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password }),
      })
    );
    return res.status;
  };
  const userRow = () =>
    db.query.user.findFirst({
      where: eq(schema.user.email, EMAIL),
      columns: { failedLoginAttempts: true, lockedUntil: true },
    });

  // 5 wrong-password attempts → each 401.
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) statuses.push(await signIn("wrong-password"));
  record("5 wrong attempts rejected (401)", statuses.every((s) => s === 401), JSON.stringify(statuses));

  const locked = await userRow();
  const isLocked = (locked?.failedLoginAttempts ?? 0) >= 5 && !!locked?.lockedUntil && locked.lockedUntil.getTime() > Date.now();
  record("counter reached 5 and lockedUntil set", isLocked, `attempts=${locked?.failedLoginAttempts}`);

  // 6th attempt WITH THE CORRECT password is still blocked (403, before-hook).
  const sixth = await signIn(GOOD);
  record("locked account blocked even with correct password (403)", sixth === 403, `status=${sixth}`);

  // Admin unlock (direct write, mirrors adminUnlockUser).
  await db
    .update(schema.user)
    .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(schema.user.email, EMAIL));
  const afterUnlock = await signIn(GOOD);
  record("after unlock, correct password signs in (200)", afterUnlock === 200, `status=${afterUnlock}`);

  const cleared = await userRow();
  record("successful sign-in cleared the counter", (cleared?.failedLoginAttempts ?? -1) === 0);

  // Password-reset request accepted (sendResetPassword fires → logged in dev).
  const rr = await auth.handler(
    new Request(`${BASE}/api/auth/request-password-reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, redirectTo: "/reset-password" }),
    })
  );
  record("password-reset request accepted (200)", rr.status === 200, `status=${rr.status}`);

  // Regression: a locked account that resets its password can sign in immediately
  // with the new password (onPasswordReset must clear the lockout).
  for (let i = 0; i < 5; i++) await signIn("wrong-again");
  const reLocked = await userRow();
  record("re-locked before reset", !!reLocked?.lockedUntil && reLocked.lockedUntil.getTime() > Date.now());

  const vers = await db.select().from(schema.verification);
  const resetRow = vers.find((v) => String(v.identifier).startsWith("reset-password"));
  const token = resetRow ? String(resetRow.identifier).split(":")[1] : undefined;
  const NEW = "brand-new-password-2";
  const resetRes = token
    ? await auth.handler(
        new Request(`${BASE}/api/auth/reset-password`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ newPassword: NEW, token }),
        })
      )
    : undefined;
  record("reset-password accepted (200)", resetRes?.status === 200, `status=${resetRes?.status}`);

  const afterReset = await userRow();
  record(
    "reset cleared the lockout",
    (afterReset?.failedLoginAttempts ?? -1) === 0 && !afterReset?.lockedUntil
  );

  const signInAfterReset = await signIn(NEW);
  record("sign-in with new password after reset (200)", signInAfterReset === 200, `status=${signInAfterReset}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n[e2e-auth] ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error("[e2e-auth] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
