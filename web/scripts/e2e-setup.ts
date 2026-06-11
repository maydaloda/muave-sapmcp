/**
 * E2E fixture setup (runs as its own process so PGlite's lock is released
 * before the server starts): migrate, create admin + restricted user, a group
 * limited to SYS_A, and pre-issued OAuth access tokens for both users.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

const ADMIN_TOKEN = "e2e-admin-token";
const USER_TOKEN = "e2e-user-token";

async function main(): Promise<void> {
  const { db, dbReady, schema } = await import("../lib/db");
  await dbReady;
  const { auth } = await import("../lib/auth");

  await auth.api.createUser({
    body: { email: "admin@example.com", password: "admin-password-1", name: "Admin", role: "admin" },
  });
  await auth.api.createUser({
    body: { email: "user@example.com", password: "user-password-1", name: "User", role: "user" },
  });

  const groupId = randomUUID();
  await db.insert(schema.groups).values({ id: groupId, name: "sys-a-only", allowedSystems: ["SYS_A"] });

  const [adminRow] = await db.select().from(schema.user).where(eq(schema.user.email, "admin@example.com"));
  const [userRow] = await db.select().from(schema.user).where(eq(schema.user.email, "user@example.com"));
  if (!adminRow || !userRow) throw new Error("users not created");
  await db.update(schema.user).set({ groupId }).where(eq(schema.user.id, userRow.id));

  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(schema.oauthAccessToken).values([
    {
      id: randomUUID(),
      accessToken: ADMIN_TOKEN,
      accessTokenExpiresAt: expires,
      clientId: "e2e-client",
      userId: adminRow.id,
      scopes: "openid",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: randomUUID(),
      accessToken: USER_TOKEN,
      accessTokenExpiresAt: expires,
      clientId: "e2e-client",
      userId: userRow.id,
      scopes: "openid",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  console.log("[e2e-setup] done");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("[e2e-setup] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
