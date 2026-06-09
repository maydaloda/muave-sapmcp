import { EnvCredentialResolver } from "./env-resolver.js";
import type { CredentialResolver } from "./resolver.js";

export type { CredentialResolver } from "./resolver.js";
export { CredentialMissingError } from "./resolver.js";
export { EnvCredentialResolver } from "./env-resolver.js";

/**
 * Select the active credential resolver. Today this is always the env resolver;
 * the seam exists so a secret-manager backend can be wired in via configuration
 * without touching call sites.
 */
export function createCredentialResolver(): CredentialResolver {
  return new EnvCredentialResolver();
}
