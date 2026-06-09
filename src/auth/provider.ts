import type { CredentialResolver } from "../credentials/resolver.js";
import type { Logger } from "../observability/logger.js";
import type { TokenCache } from "./token-cache.js";

/**
 * Pluggable outbound-auth strategy for a single SAP system. Implementations:
 * BASIC (communication user), OAUTH2 client-credentials, X509/mTLS (stub).
 */
export interface AuthProvider {
  /** Resolve outbound auth headers. May fetch/refresh a token (single-flight). */
  getAuthHeaders(): Promise<Record<string, string>>;
  /** Force the next {@link getAuthHeaders} to re-acquire (called on 401). No-op when stateless. */
  invalidate(): void;
}

/** Dependencies shared by all auth providers. */
export interface AuthDeps {
  credentials: CredentialResolver;
  tokenCache: TokenCache;
  logger: Logger;
}
