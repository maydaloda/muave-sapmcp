"use server";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db, dbReady, schema } from "@/lib/db";

/** Every admin action re-verifies the session server-side. */
async function requireAdmin(): Promise<void> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") {
    throw new Error("Forbidden: admin role required.");
  }
}

export async function createUser(formData: FormData): Promise<void> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || email;
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "user") === "admin" ? "admin" : "user";
  if (!email || password.length < 8) {
    throw new Error("Email and a password of at least 8 characters are required.");
  }
  await auth.api.createUser({ body: { email, name, password, role } });
  revalidatePath("/admin");
}

export async function setUserGroup(formData: FormData): Promise<void> {
  await requireAdmin();
  await dbReady;
  const userId = String(formData.get("userId"));
  const groupId = String(formData.get("groupId") ?? "");
  await db
    .update(schema.user)
    .set({ groupId: groupId || null })
    .where(eq(schema.user.id, userId));
  revalidatePath("/admin");
}

export async function setUserRole(formData: FormData): Promise<void> {
  await requireAdmin();
  await dbReady;
  const userId = String(formData.get("userId"));
  const role = String(formData.get("role")) === "admin" ? "admin" : "user";
  await db.update(schema.user).set({ role }).where(eq(schema.user.id, userId));
  revalidatePath("/admin");
}

export async function createGroup(formData: FormData): Promise<void> {
  await requireAdmin();
  await dbReady;
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Group name is required.");
  await db.insert(schema.groups).values({ id: randomUUID(), name, allowedSystems: [] });
  revalidatePath("/admin/groups");
}

export async function setGroupSystems(formData: FormData): Promise<void> {
  await requireAdmin();
  await dbReady;
  const groupId = String(formData.get("groupId"));
  const all = formData.get("all") === "on";
  const systems = all ? ["*"] : formData.getAll("systems").map(String);
  await db.update(schema.groups).set({ allowedSystems: systems }).where(eq(schema.groups.id, groupId));
  revalidatePath("/admin/groups");
  revalidatePath("/admin");
}

export async function deleteGroup(formData: FormData): Promise<void> {
  await requireAdmin();
  await dbReady;
  const groupId = String(formData.get("groupId"));
  // Detach members first so they fall back to "no access" rather than a dangling id.
  await db.update(schema.user).set({ groupId: null }).where(eq(schema.user.groupId, groupId));
  await db.delete(schema.groups).where(eq(schema.groups.id, groupId));
  revalidatePath("/admin/groups");
  revalidatePath("/admin");
}
