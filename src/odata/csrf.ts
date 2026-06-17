import type { Dispatcher } from "undici";

/**
 * CSRF token fetch for OData write requests (ported from the reference impl).
 *
 * SAP Gateway ties the X-CSRF-Token to the **session cookie** returned by the
 * token-fetch response. A write that sends the token but not the cookie is
 * rejected with 403 "CSRF token validation failed". So we capture both and
 * reduce Set-Cookie(s) to a single Cookie request header for replay.
 *
 * Applies to BOTH V2 and V4 modifying requests (fetch method differs: GET vs HEAD).
 */
export interface CsrfResult {
  token: string | null;
  cookie: string | null;
}

/** Reduce a response's Set-Cookie(s) to a `name=value; name2=value2` Cookie header. */
function extractCookieHeader(res: Response): string | null {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const raw =
    typeof h.getSetCookie === "function"
      ? h.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
  const pairs = raw.map((c) => c.split(";")[0]?.trim()).filter((p): p is string => Boolean(p));
  return pairs.length ? pairs.join("; ") : null;
}

export async function fetchCsrf(
  url: string,
  headers: Record<string, string>,
  method: "GET" | "HEAD" = "GET",
  signal?: AbortSignal,
  dispatcher?: Dispatcher
): Promise<CsrfResult> {
  try {
    const init: RequestInit = {
      method,
      headers: { ...headers, "x-csrf-token": "fetch", accept: "application/json" },
    };
    if (signal) init.signal = signal;
    if (dispatcher) (init as Record<string, unknown>).dispatcher = dispatcher;
    const res = await fetch(url, init);
    return { token: res.headers.get("x-csrf-token"), cookie: extractCookieHeader(res) };
  } catch {
    return { token: null, cookie: null };
  }
}
