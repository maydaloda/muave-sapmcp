import { boolean, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/* ── better-auth core tables (field names must match better-auth's model) ── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // admin plugin
  role: text("role"),
  banned: boolean("banned"),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  // app-specific: group membership (managed in /admin)
  groupId: text("group_id"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonated_by"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ── better-auth MCP/OAuth-provider plugin tables ── */

export const oauthApplication = pgTable("oauth_application", {
  id: text("id").primaryKey(),
  name: text("name"),
  icon: text("icon"),
  metadata: text("metadata"),
  clientId: text("client_id").unique(),
  clientSecret: text("client_secret"),
  // Property MUST be `redirectUrls` (better-auth's field name); the DB column
  // keeps the name migration 0000 created, so no migration is required.
  redirectUrls: text("redirect_u_r_ls"),
  type: text("type"),
  disabled: boolean("disabled"),
  userId: text("user_id"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const oauthAccessToken = pgTable("oauth_access_token", {
  id: text("id").primaryKey(),
  accessToken: text("access_token").unique(),
  refreshToken: text("refresh_token").unique(),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  clientId: text("client_id"),
  userId: text("user_id"),
  scopes: text("scopes"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

export const oauthConsent = pgTable("oauth_consent", {
  id: text("id").primaryKey(),
  clientId: text("client_id"),
  userId: text("user_id"),
  scopes: text("scopes"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
  consentGiven: boolean("consent_given"),
});

/* ── application tables ── */

/** A user group with the SAP system keys its members may use. */
export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  /** Keys from the server's systems config; "*" grants all systems. */
  allowedSystems: jsonb("allowed_systems").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Admin-managed SAP systems (in addition to the operator's MUAVE_SYSTEMS_JSON).
 * Credential columns hold AES-256-GCM ciphertext (lib/crypto.ts) — never plaintext,
 * and they are never sent back to the browser.
 */
export const sapSystems = pgTable("sap_systems", {
  key: text("key").primaryKey(),
  name: text("name"),
  baseUrl: text("base_url").notNull(),
  sapClient: text("sap_client"),
  authType: text("auth_type").notNull(), // BASIC | OAUTH2
  readOnly: boolean("read_only").notNull().default(true),
  tokenUrl: text("token_url"),
  encUser: text("enc_user"),
  encPassword: text("enc_password"),
  encClientId: text("enc_client_id"),
  encClientSecret: text("enc_client_secret"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Catalog cache rows (replaces the stdio build's catalog.json). */
export const catalogServices = pgTable("catalog_services", {
  /** `${systemKey}:${serviceId}` — same key as the file store. */
  key: text("key").primaryKey(),
  data: jsonb("data").notNull(),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});
