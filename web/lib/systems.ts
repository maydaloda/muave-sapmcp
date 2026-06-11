/**
 * Global SAP wiring, shared across requests (warm lambda): the systems config
 * from MUAVE_SYSTEMS_JSON, one ConfigStore (caches SAP auth providers), one
 * OAuth token cache, one concurrency limiter, one governance policy.
 */
import {
  ConcurrencyLimiter,
  ConfigStore,
  createCredentialResolver,
  GovernancePolicy,
  loadSystemsFile,
  logger,
  TokenCache,
  type AuthDeps,
  type SystemsFile,
} from "muave-sapmcp";

export interface GlobalSap {
  file: SystemsFile;
  store: ConfigStore;
  authDeps: AuthDeps;
  limiter: ConcurrencyLimiter;
  governance: GovernancePolicy;
}

declare global {
  // eslint-disable-next-line no-var
  var __muaveSap: Promise<GlobalSap> | undefined;
}

async function create(): Promise<GlobalSap> {
  const file = await loadSystemsFile(); // MUAVE_SYSTEMS_JSON takes precedence
  const authDeps: AuthDeps = {
    credentials: createCredentialResolver(),
    tokenCache: new TokenCache(),
    logger,
  };
  return {
    file,
    store: new ConfigStore(file, authDeps),
    authDeps,
    limiter: new ConcurrencyLimiter(15),
    governance: new GovernancePolicy(),
  };
}

export function getGlobalSap(): Promise<GlobalSap> {
  globalThis.__muaveSap ??= create();
  return globalThis.__muaveSap;
}

/** All configured system keys (for the admin UI's group editor). */
export async function allSystemKeys(): Promise<string[]> {
  const sap = await getGlobalSap();
  return sap.store.listSystems().map((s) => s.key);
}
