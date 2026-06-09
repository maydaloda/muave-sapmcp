/** Capture the ETag from a response (for follow-up optimistic-concurrency writes). */
export function captureETag(res: Response): string | undefined {
  return res.headers.get("etag") ?? undefined;
}

/**
 * Compute the `If-Match` header value for a modifying request.
 * `forceOverwrite` → `*` (intentional overwrite). Otherwise the supplied ETag,
 * or undefined (no precondition).
 */
export function ifMatchHeader(opts: {
  etag?: string | undefined;
  forceOverwrite?: boolean | undefined;
}): string | undefined {
  if (opts.forceOverwrite) return "*";
  if (opts.etag) return opts.etag;
  return undefined;
}
