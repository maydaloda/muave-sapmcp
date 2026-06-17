import type { SystemConfig } from "../config/schema.js";
import type { DispatcherFactory } from "../odata/dispatcher.js";
import type { AuthDeps, AuthProvider } from "./provider.js";
import { BasicAuthProvider } from "./basic.js";
import { OAuth2ClientCredentialsProvider } from "./oauth2.js";
import { X509AuthProvider } from "./x509.js";

/** Construct the {@link AuthProvider} for a system based on its `authType`. */
export function createAuthProvider(
  config: SystemConfig,
  deps: AuthDeps,
  dispatcher?: DispatcherFactory
): AuthProvider {
  switch (config.authType) {
    case "BASIC":
      return new BasicAuthProvider(config, deps);
    case "OAUTH2":
      return new OAuth2ClientCredentialsProvider(config, deps, dispatcher);
    case "X509":
      return new X509AuthProvider(config.key);
  }
}
