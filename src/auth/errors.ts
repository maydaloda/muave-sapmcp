/** Base error for all authentication failures. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** OAuth2 token-endpoint failure (network or non-2xx). Message is redaction-safe. */
export class TokenFetchError extends AuthError {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "TokenFetchError";
    this.status = status;
  }
}
