import type { AuthDeps, AuthProvider } from "./provider.js";
import type { CachedToken } from "./token-cache.js";
import { TokenFetchError } from "./errors.js";

/** Config subset OAuth2 client-credentials needs. */
export interface OAuth2Config {
  key: string;
  tokenUrl: string;
  clientIdEnvVar: string;
  clientSecretEnvVar: string;
  tokenRefreshMarginSec: number;
}

interface TokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

const DEFAULT_EXPIRES_IN_SEC = 3600;

/**
 * OAuth 2.0 client-credentials provider for SAP S/4HANA Cloud Public Edition.
 *
 * Verified Public-Edition specifics:
 *  - POST to the per-system token URL (read from the Communication Arrangement;
 *    never hardcoded). Credentials go in the `Authorization: Basic` header
 *    (`base64(clientId:clientSecret)`), body is `grant_type=client_credentials`.
 *  - NO `scope` parameter (access is governed by the communication scenario).
 *  - NO refresh token — we re-fetch on expiry (with a safety margin) or on 401.
 *  - `token_type` is commonly lowercase `bearer`; matched case-insensitively.
 */
export class OAuth2ClientCredentialsProvider implements AuthProvider {
  constructor(
    private readonly config: OAuth2Config,
    private readonly deps: AuthDeps
  ) {}

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.deps.tokenCache.getOrFetch(
      this.cacheKey,
      this.config.tokenRefreshMarginSec,
      () => this.fetchToken()
    );
    return { authorization: `Bearer ${token.accessToken}` };
  }

  invalidate(): void {
    this.deps.tokenCache.delete(this.cacheKey);
  }

  private get cacheKey(): string {
    return `oauth2:${this.config.key}`;
  }

  private async fetchToken(): Promise<CachedToken> {
    const clientId = await this.deps.credentials.getRequired(this.config.clientIdEnvVar);
    const clientSecret = await this.deps.credentials.getRequired(this.config.clientSecretEnvVar);
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    let res: Response;
    try {
      res = await fetch(this.config.tokenUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          authorization: `Basic ${basic}`,
          accept: "application/json",
        },
        body: "grant_type=client_credentials",
      });
    } catch (err) {
      throw new TokenFetchError(
        `OAuth2 token request failed (network) for system "${this.config.key}": ` +
          (err instanceof Error ? err.message : String(err))
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new TokenFetchError(
        `OAuth2 token request for system "${this.config.key}" returned HTTP ${res.status}` +
          (body ? `: ${body.slice(0, 300)}` : ""),
        res.status
      );
    }

    const json = (await res.json().catch(() => null)) as TokenResponse | null;
    if (!json?.access_token) {
      throw new TokenFetchError(
        `OAuth2 token response for system "${this.config.key}" did not contain an access_token.`
      );
    }
    const tokenType = json.token_type ?? "bearer";
    if (tokenType.toLowerCase() !== "bearer") {
      throw new TokenFetchError(
        `OAuth2 token response for system "${this.config.key}" had unexpected token_type "${tokenType}".`
      );
    }
    const expiresIn =
      typeof json.expires_in === "number" && json.expires_in > 0
        ? json.expires_in
        : DEFAULT_EXPIRES_IN_SEC;

    this.deps.logger.debug(
      { system: this.config.key, expiresIn },
      "oauth2 client-credentials token acquired"
    );

    return {
      accessToken: json.access_token,
      tokenType,
      expiresAtMs: Date.now() + expiresIn * 1000,
    };
  }
}
