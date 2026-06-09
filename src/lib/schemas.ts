import { z } from "zod";

/** Reusable zod fragments for tool input/output schemas. */

export const systemKeyField = z
  .string()
  .min(1)
  .max(120)
  .optional()
  .describe("System key from systems.json; omit to use the default system.");

export const serviceIdField = z
  .string()
  .min(1)
  .max(200)
  .describe("Registered service id (e.g. API_BUSINESS_PARTNER), scoped to the system.");

export const entitySetField = z
  .string()
  .min(1)
  .max(200)
  .describe("EntitySet name exactly as reported by describe_service.");

export const keyScalar = z.union([z.string(), z.number(), z.boolean()]);

export const keyValueField = z
  .union([keyScalar, z.record(z.string(), keyScalar)])
  .describe("Single key value, or a {field: value} map for composite keys.");

export const odataVersionField = z.enum(["v2", "v4"]);

/** Error fragment included (optional) in every tool's outputSchema. */
export const errorShape = {
  error: z
    .object({
      status: z.number().int(),
      category: z.string(),
      message: z.string(),
      sapCode: z.string().optional(),
      retryAfterSeconds: z.number().optional(),
      hint: z.string().optional(),
    })
    .optional(),
};
