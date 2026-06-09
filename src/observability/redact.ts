/**
 * Secret redaction for logs.
 *
 * The stdio transport sends JSON-RPC on stdout; all diagnostics go to stderr via
 * pino. Regardless of stream, we must never emit credentials. These helpers mask
 * the sensitive request/response headers SAP integration uses.
 */

/** Header names that must never appear in plaintext in any log line. */
export const SENSITIVE_HEADERS: ReadonlySet<string> = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-csrf-token",
  "proxy-authorization",
]);

const REDACTED = "<redacted>";

/** Return a shallow copy of `headers` with sensitive values masked. */
export function redactHeaders(
  headers: Record<string, string | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

/**
 * Strip query-string values that commonly carry secrets (tokens, keys) while
 * keeping the path + parameter names visible for debugging.
 */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const key of u.searchParams.keys()) {
      const lower = key.toLowerCase();
      if (
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("password") ||
        lower.includes("client_secret") ||
        lower === "code"
      ) {
        u.searchParams.set(key, REDACTED);
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}
