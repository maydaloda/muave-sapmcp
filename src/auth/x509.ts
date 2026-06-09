import type { AuthProvider } from "./provider.js";
import { AuthError } from "./errors.js";

/**
 * X.509 client-certificate / mTLS provider — SAP's preferred method for technical
 * communication users. STUB for this phase: the seam exists (and is wired into the
 * auth registry) but the TLS client-certificate Agent injection is not yet
 * implemented. See the roadmap; note the 2026 SAP Cloud Root CA migration.
 */
export class X509AuthProvider implements AuthProvider {
  constructor(private readonly systemKey: string) {}

  getAuthHeaders(): Promise<Record<string, string>> {
    return Promise.reject(
      new AuthError(
        `System "${this.systemKey}": X509/mTLS authentication is not yet implemented. ` +
          `Use authType "OAUTH2" or "BASIC" for now.`
      )
    );
  }

  invalidate(): void {
    // No state to clear.
  }
}
