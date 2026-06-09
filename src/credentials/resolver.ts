/**
 * Credential resolution seam.
 *
 * Secrets are sourced out-of-band by the server — NEVER passed as tool arguments
 * and never stored in `systems.json` (which holds only env-var *names*). The
 * default implementation reads `process.env`; a secret-manager backend
 * (Vault / AWS / Azure / GCP) can implement this same interface later.
 */
export interface CredentialResolver {
  /** Resolve a secret by reference (env-var name today). Never logs the value. */
  get(ref: string): Promise<string | undefined>;
  /** Resolve a required secret, throwing {@link CredentialMissingError} if absent. */
  getRequired(ref: string): Promise<string>;
}

export class CredentialMissingError extends Error {
  readonly ref: string;
  constructor(ref: string) {
    super(`Credential not available: environment variable "${ref}" is not set.`);
    this.name = "CredentialMissingError";
    this.ref = ref;
  }
}
