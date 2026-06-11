/**
 * Idempotent seed: creates the initial admin (ADMIN_EMAIL/ADMIN_PASSWORD env)
 * and a default "admins" group with access to all systems.
 *
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD to seed the initial admin.");
    process.exit(1);
  }

  const { db, dbReady, schema } = await import("../lib/db");
  await dbReady;
  const { auth } = await import("../lib/auth");

  const [existing] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);
  if (existing) {
    console.log(`Admin ${email} already exists — nothing to do.`);
    return;
  }

  await auth.api.createUser({
    body: { email, password, name: "Administrator", role: "admin" },
  });
  console.log(`Created admin user ${email}.`);

  const [grp] = await db.select().from(schema.groups).where(eq(schema.groups.name, "admins")).limit(1);
  if (!grp) {
    await db.insert(schema.groups).values({ id: randomUUID(), name: "admins", allowedSystems: ["*"] });
    console.log(`Created "admins" group (all systems).`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
