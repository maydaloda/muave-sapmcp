import { z } from "zod";

/**
 * `systems.json` schema.
 *
 * Committed without secrets: credentials are referenced by env-var NAME only.
 * Each system selects exactly one auth strategy via the `authType` discriminator.
 */

const baseFields = {
  key: z.string().min(1).max(120),
  name: z.string().optional(),
  baseUrl: z.string().url(),
  /** Optional ABAP client; appended as `sap-client` when present (rarely needed on Public Cloud). */
  sapClient: z.string().optional(),
  /** Read-only by default; writes are opt-in per system. */
  readOnly: z.boolean().default(true),
  /** When writes are enabled, restrict them to these entity sets (undefined = all). */
  allowedEntities: z.array(z.string()).optional(),
  timeoutMs: z.number().int().positive().max(600_000).default(30_000),
  maxConcurrency: z.number().int().positive().max(50).default(15),
};

const BasicAuthConfig = z.object({
  ...baseFields,
  authType: z.literal("BASIC"),
  userEnvVar: z.string().optional(),
  passwordEnvVar: z.string().optional(),
  preEncodedEnvVar: z.string().optional(),
});

const OAuth2Config = z.object({
  ...baseFields,
  authType: z.literal("OAUTH2"),
  /** Full token endpoint URL, read from the Communication Arrangement (never hardcoded). */
  tokenUrl: z.string().url(),
  clientIdEnvVar: z.string().min(1),
  clientSecretEnvVar: z.string().min(1),
  /** Refresh the cached token this many seconds before `expires_in` elapses. */
  tokenRefreshMarginSec: z.number().int().min(0).max(3600).default(60),
});

const X509Config = z.object({
  ...baseFields,
  authType: z.literal("X509"),
  certEnvVar: z.string().optional(),
  keyEnvVar: z.string().optional(),
});

export const SystemConfigSchema = z
  .discriminatedUnion("authType", [BasicAuthConfig, OAuth2Config, X509Config])
  .superRefine((cfg, ctx) => {
    if (cfg.authType === "BASIC") {
      const hasUserPass = Boolean(cfg.userEnvVar && cfg.passwordEnvVar);
      if (!cfg.preEncodedEnvVar && !hasUserPass) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `System "${cfg.key}": BASIC auth requires preEncodedEnvVar, or both userEnvVar and passwordEnvVar.`,
        });
      }
    }
  });

export const SystemsFileSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    systems: z.array(SystemConfigSchema).min(1),
    defaultSystem: z.string().optional(),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    for (const s of file.systems) {
      if (seen.has(s.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate system key "${s.key}".`,
        });
      }
      seen.add(s.key);
    }
    if (file.defaultSystem && !seen.has(file.defaultSystem)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `defaultSystem "${file.defaultSystem}" does not match any configured system key.`,
      });
    }
  });

export type SystemConfig = z.infer<typeof SystemConfigSchema>;
export type SystemsFile = z.infer<typeof SystemsFileSchema>;
export type AuthType = SystemConfig["authType"];
