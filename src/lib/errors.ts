import { AuthError } from "../auth/errors.js";
import { ConfigError } from "../config/load.js";
import { CredentialMissingError } from "../credentials/resolver.js";
import { GovernanceError } from "../governance/policy.js";
import { ODataError, type ErrorCategory } from "../odata/errors.js";

/** Tool-facing normalized error (machine-readable, secret-free). */
export interface ToolError {
  status: number;
  category: ErrorCategory;
  message: string;
  sapCode?: string;
  retryAfterSeconds?: number;
  hint?: string;
}

/** Thrown by tool handlers when a referenced service/entity isn't registered/known. */
export class ToolNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolNotFoundError";
  }
}

/** Thrown by tool handlers for caller input that fails a pre-flight check. */
export class ToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolValidationError";
  }
}

function hintFor(category: ErrorCategory, retryAfterSeconds?: number): string | undefined {
  switch (category) {
    case "auth":
      return "Check the system's credentials (OAuth client id/secret or Basic user/password env vars) and that the Communication Arrangement authorizes this service.";
    case "csrf":
      return "CSRF/session likely expired (token+cookie are handled automatically). Retry the operation.";
    case "etag":
      return "The entity changed concurrently (optimistic concurrency). Re-read it to get a fresh ETag, then retry.";
    case "throttle":
      return retryAfterSeconds !== undefined
        ? `Throttled by SAP. Retry after ${retryAfterSeconds}s.`
        : "Throttled by SAP. Back off and retry.";
    case "notfound":
      return "Verify the service path/key and that the service is registered (register_service) and active in the Communication Arrangement.";
    case "draft":
      return "Draft conflict/lock. Re-read the draft, or use activate_draft / discard.";
    case "governance":
      return undefined; // message is already actionable
    default:
      return undefined;
  }
}

/** Convert any thrown value into a {@link ToolError}. */
export function toToolError(err: unknown): ToolError {
  if (err instanceof ODataError) {
    const out: ToolError = {
      status: err.status,
      category: err.category,
      message: err.message,
    };
    if (err.sapCode) out.sapCode = err.sapCode;
    if (err.retryAfterSeconds !== undefined) out.retryAfterSeconds = err.retryAfterSeconds;
    const hint = hintFor(err.category, err.retryAfterSeconds);
    if (hint) out.hint = hint;
    return out;
  }

  if (err instanceof GovernanceError) {
    return { status: 0, category: "governance", message: err.message };
  }

  if (err instanceof CredentialMissingError || err instanceof AuthError) {
    const out: ToolError = { status: 401, category: "auth", message: err.message };
    const hint = hintFor("auth");
    if (hint) out.hint = hint;
    return out;
  }

  if (err instanceof ToolNotFoundError) {
    const out: ToolError = { status: 404, category: "notfound", message: err.message };
    const hint = hintFor("notfound");
    if (hint) out.hint = hint;
    return out;
  }

  if (err instanceof ToolValidationError) {
    return { status: 400, category: "validation", message: err.message };
  }

  if (err instanceof ConfigError) {
    return { status: 0, category: "validation", message: err.message };
  }

  return {
    status: 0,
    category: "transport",
    message: err instanceof Error ? err.message : String(err),
  };
}
