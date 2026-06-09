/** A cached OAuth2 access token. */
export interface CachedToken {
  accessToken: string;
  tokenType: string;
  /** Absolute expiry in epoch ms. */
  expiresAtMs: number;
}

/**
 * In-memory token cache keyed per system, with single-flight de-duplication so
 * concurrent callers on a cold cache trigger exactly one token request.
 */
export class TokenCache {
  private readonly store = new Map<string, CachedToken>();
  private readonly inflight = new Map<string, Promise<CachedToken>>();

  /** Return a cached token still valid beyond `marginSec`, else undefined. */
  get(key: string, marginSec: number): CachedToken | undefined {
    const token = this.store.get(key);
    if (!token) return undefined;
    if (token.expiresAtMs - marginSec * 1000 <= Date.now()) return undefined;
    return token;
  }

  set(key: string, token: CachedToken): void {
    this.store.set(key, token);
  }

  /** Invalidate a token (e.g. after a 401). */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Return a valid cached token, or run `loader` exactly once even under
   * concurrent calls, caching the result.
   */
  async getOrFetch(
    key: string,
    marginSec: number,
    loader: () => Promise<CachedToken>
  ): Promise<CachedToken> {
    const cached = this.get(key, marginSec);
    if (cached) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const token = await loader();
        this.set(key, token);
        return token;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, promise);
    return promise;
  }
}
