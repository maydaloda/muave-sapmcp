import type { AuthDeps, AuthProvider } from "./provider.js";
import { AuthError } from "./errors.js";

/** Config subset BASIC auth needs. */
export interface BasicAuthConfig {
  key: string;
  preEncodedEnvVar?: string | undefined;
  userEnvVar?: string | undefined;
  passwordEnvVar?: string | undefined;
}

/**
 * HTTP Basic auth for a communication user.
 *
 * Precedence (ported from the reference implementation, generalized to
 * per-system env-var names): pre-encoded base64 → user/password → throw.
 */
export class BasicAuthProvider implements AuthProvider {
  constructor(
    private readonly config: BasicAuthConfig,
    private readonly deps: AuthDeps
  ) {}

  async getAuthHeaders(): Promise<Record<string, string>> {
    return { authorization: await this.resolveHeader() };
  }

  invalidate(): void {
    // Stateless — credentials are read fresh each call.
  }

  private async resolveHeader(): Promise<string> {
    const { credentials } = this.deps;

    if (this.config.preEncodedEnvVar) {
      const value = await credentials.get(this.config.preEncodedEnvVar);
      if (value) return `Basic ${value}`;
    }

    if (this.config.userEnvVar && this.config.passwordEnvVar) {
      const user = await credentials.get(this.config.userEnvVar);
      const password = await credentials.get(this.config.passwordEnvVar);
      if (user && password) {
        return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
      }
    }

    throw new AuthError(
      `System "${this.config.key}": no BASIC credentials available. Set the configured ` +
        `env vars (preEncodedEnvVar, or userEnvVar + passwordEnvVar).`
    );
  }
}
