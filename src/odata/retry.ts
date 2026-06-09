import type { Logger } from "../observability/logger.js";

/** Transient statuses worth retrying (ported from the reference implementation). */
export const RETRYABLE_STATUS = [408, 425, 429, 500, 502, 503, 504];

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  capDelayMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  log?: Logger;
}

const DEFAULTS = { maxRetries: 3, baseDelayMs: 500, capDelayMs: 8000, timeoutMs: 30_000 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parse a `Retry-After` header (delta-seconds or HTTP-date) into milliseconds. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

/** Full-jitter exponential backoff capped at `capDelayMs`. */
function backoffWithJitter(attempt: number, baseDelayMs: number, capDelayMs: number): number {
  const exp = Math.min(capDelayMs, baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(Math.random() * exp);
}

/**
 * Execute `attempt` with a per-attempt timeout, retrying on transient statuses
 * and network/timeout errors. Honors `Retry-After` on 429. Returns the final
 * Response (even if `!ok` and non-retryable); throws only if every attempt threw.
 */
export async function withRetry(
  attempt: (signal: AbortSignal) => Promise<Response>,
  opts: RetryOptions = {}
): Promise<Response> {
  const cfg = { ...DEFAULTS, ...opts };
  let lastError: unknown;

  for (let i = 1; i <= cfg.maxRetries; i += 1) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
      const res = await attempt(controller.signal);
      if (res.ok || !RETRYABLE_STATUS.includes(res.status)) return res;

      // Retryable status — back off unless this was the last attempt.
      if (i === cfg.maxRetries) return res;
      const retryAfter = res.status === 429 ? parseRetryAfter(res.headers.get("retry-after")) : undefined;
      const delay = retryAfter ?? backoffWithJitter(i, cfg.baseDelayMs, cfg.capDelayMs);
      opts.log?.warn({ attempt: i, status: res.status, delayMs: delay }, "odata retry");
      await sleep(delay);
    } catch (err) {
      lastError = err;
      if (i === cfg.maxRetries) break;
      const delay = backoffWithJitter(i, cfg.baseDelayMs, cfg.capDelayMs);
      opts.log?.warn(
        { attempt: i, error: err instanceof Error ? err.message : String(err), delayMs: delay },
        "odata retry (network/timeout)"
      );
      await sleep(delay);
    } finally {
      clearTimeout(timer);
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Request failed after ${cfg.maxRetries} attempts`);
}
