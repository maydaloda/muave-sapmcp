"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db, dbReady, schema } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { getMergedSystems, getShared } from "@/lib/systems";
import { logger } from "muave-sapmcp";

async function requireAdmin(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") {
    throw new Error("Forbidden: admin role required.");
  }
  return session.user.email;
}

const KEY_RE = /^[A-Z0-9_-]{2,40}$/i;

export async function createSystem(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  await dbReady;

  const key = String(formData.get("key") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || key;
  const baseUrl = String(formData.get("baseUrl") ?? "").trim().replace(/\/+$/, "");
  const sapClient = String(formData.get("sapClient") ?? "").trim();
  const authType = String(formData.get("authType")) === "OAUTH2" ? "OAUTH2" : "BASIC";
  // Writes are opt-in: the checkbox ENABLES writes; default stays read-only.
  const readOnly = formData.get("enableWrites") !== "on";

  if (!KEY_RE.test(key)) throw new Error("System key must be 2–40 chars (letters, digits, _ or -).");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("Base URL must be https://");

  // Reject collisions with env-defined AND db-defined systems.
  const shared = await getShared();
  if (shared.envFile.systems.some((s) => s.key === key)) {
    throw new Error(`System key "${key}" is already defined in the server configuration.`);
  }
  const [existing] = await db.select().from(schema.sapSystems).where(eq(schema.sapSystems.key, key)).limit(1);
  if (existing) throw new Error(`System key "${key}" already exists.`);

  const values: typeof schema.sapSystems.$inferInsert = {
    key,
    name,
    baseUrl,
    sapClient: sapClient || null,
    authType,
    readOnly,
  };

  if (authType === "BASIC") {
    const user = String(formData.get("user") ?? "");
    const password = String(formData.get("password") ?? "");
    if (!user || !password) throw new Error("BASIC auth requires user and password.");
    values.encUser = encryptSecret(user);
    values.encPassword = encryptSecret(password);
  } else {
    const tokenUrl = String(formData.get("tokenUrl") ?? "").trim();
    const clientId = String(formData.get("clientId") ?? "");
    const clientSecret = String(formData.get("clientSecret") ?? "");
    if (!/^https:\/\//i.test(tokenUrl)) throw new Error("OAuth token URL must be https://");
    if (!clientId || !clientSecret) throw new Error("OAUTH2 requires client id and secret.");
    values.tokenUrl = tokenUrl;
    values.encClientId = encryptSecret(clientId);
    values.encClientSecret = encryptSecret(clientSecret);
  }

  await db.insert(schema.sapSystems).values(values);
  logger.info({ audit: true, action: "system.create", system: key, by: admin }, "admin created system");
  revalidatePath("/admin/systems");
  revalidatePath("/admin/groups");
}

export async function deleteSystem(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  await dbReady;
  const key = String(formData.get("key"));
  await db.delete(schema.sapSystems).where(eq(schema.sapSystems.key, key));
  logger.info({ audit: true, action: "system.delete", system: key, by: admin }, "admin deleted system");
  revalidatePath("/admin/systems");
  revalidatePath("/admin/groups");
}

export async function toggleSystemWrites(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  await dbReady;
  const key = String(formData.get("key"));
  const readOnly = String(formData.get("readOnly")) === "true";
  await db.update(schema.sapSystems).set({ readOnly, updatedAt: new Date() }).where(eq(schema.sapSystems.key, key));
  logger.info(
    { audit: true, action: "system.toggleWrites", system: key, readOnly, by: admin },
    "admin toggled system writes"
  );
  revalidatePath("/admin/systems");
}

/**
 * Connection test: resolve the system's credentials and probe the gateway.
 * 401 → bad credentials; any other HTTP status → credentials accepted.
 * Result is passed back via query string (never the credentials themselves).
 */
export async function testSystem(formData: FormData): Promise<void> {
  await requireAdmin();
  const key = String(formData.get("key"));
  let outcome: string;
  try {
    const { store } = await getMergedSystems();
    const system = store.resolveSystem(key);
    const headers = await system.authProvider.getAuthHeaders();
    const res = await fetch(`${system.baseUrl}/sap/opu/odata/`, {
      headers: { ...headers, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    outcome =
      res.status === 401
        ? "auth-failed"
        : res.status === 403
          ? "reachable-403"
          : res.ok || res.status === 404
            ? "ok"
            : `http-${res.status}`;
  } catch (err) {
    outcome = `unreachable`;
    logger.warn({ system: key, err: err instanceof Error ? err.message : String(err) }, "system test failed");
  }
  redirect(`/admin/systems?test=${encodeURIComponent(key)}&result=${encodeURIComponent(outcome)}`);
}
