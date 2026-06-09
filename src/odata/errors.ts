import type { ODataVersion } from "../types.js";

export type ErrorCategory =
  | "auth"
  | "csrf"
  | "etag"
  | "throttle"
  | "notfound"
  | "validation"
  | "draft"
  | "server"
  | "transport"
  | "governance"
  | "unknown";

export interface SapErrorInfo {
  code: string | undefined;
  message: string;
}

export interface ODataErrorOptions {
  status: number;
  category: ErrorCategory;
  message: string;
  correlationId: string;
  sapCode?: string | undefined;
  retryable?: boolean;
  retryAfterSeconds?: number | undefined;
}

/** Normalized error thrown by the OData client. Never carries a raw stack to callers. */
export class ODataError extends Error {
  readonly status: number;
  readonly category: ErrorCategory;
  readonly correlationId: string;
  readonly sapCode: string | undefined;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;

  constructor(opts: ODataErrorOptions) {
    super(opts.message);
    this.name = "ODataError";
    this.status = opts.status;
    this.category = opts.category;
    this.correlationId = opts.correlationId;
    this.sapCode = opts.sapCode;
    this.retryable = opts.retryable ?? false;
    this.retryAfterSeconds = opts.retryAfterSeconds;
  }
}

/**
 * Extract a human-readable message (+ optional SAP code) from a SAP error body.
 * V2: `error.message.value` / `error.code`. V4: `error.message` (+ `error.code`).
 * Falls back to the first ~300 chars of a non-JSON (e.g. HTML) body.
 */
export function parseSapError(version: ODataVersion, body: string): SapErrorInfo {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const json = JSON.parse(trimmed) as any;
      const err = json?.error;
      if (err) {
        const code: string | undefined = typeof err.code === "string" ? err.code : undefined;
        let message: string | undefined;
        if (version === "v2") {
          message =
            typeof err.message === "object" ? err.message?.value : (err.message as string);
        } else {
          message =
            typeof err.message === "string" ? err.message : (err.message?.value as string);
        }
        // V4 inner details, if present, add useful specificity.
        const details: any[] = Array.isArray(err.details) ? err.details : [];
        const detailMsg = details
          .map((d) => (typeof d?.message === "string" ? d.message : null))
          .filter(Boolean)
          .join("; ");
        const full = [message, detailMsg].filter(Boolean).join(" — ");
        if (full) return { code, message: full };
      }
    } catch {
      // fall through to text fallback
    }
  }
  return { code: undefined, message: trimmed.slice(0, 300) || "(empty error body)" };
}

/** Categorize an HTTP status into an {@link ErrorCategory}. */
export function categorizeStatus(status: number, isCsrf: boolean): ErrorCategory {
  if (status === 401) return "auth";
  if (status === 403) return isCsrf ? "csrf" : "auth";
  if (status === 404) return "notfound";
  if (status === 409 || status === 423) return "draft";
  if (status === 412) return "etag";
  if (status === 429) return "throttle";
  if (status === 400) return "validation";
  if (status >= 500) return "server";
  return "unknown";
}
