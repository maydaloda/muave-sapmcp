import { readFileSync } from "node:fs";
import { Agent, ProxyAgent, type Dispatcher } from "undici";
import type { SystemConfig } from "../config/schema.js";
import type { CredentialResolver } from "../credentials/resolver.js";
import type { Logger } from "../observability/logger.js";

/**
 * Per-system outbound transport.
 *
 * Public Cloud needs nothing here (global `fetch` trusts public CAs). Private
 * Cloud / on-prem systems often present a **corporate-CA or self-signed** cert,
 * or sit behind a **proxy** (incl. the SAP BTP Connectivity on-premise proxy) —
 * which the bare global `fetch` cannot accommodate. This builds an `undici`
 * Dispatcher carrying that trust/proxy config and the OData client passes it as
 * the per-request `dispatcher`.
 *
 * The factory is **lazy + memoized**: the Dispatcher is built (and the CA secret
 * resolved) on first use, then reused. Returns `undefined` when the system needs
 * no customization, so `fetch` falls back to its global default.
 */
export type DispatcherFactory = () => Promise<Dispatcher | undefined>;

async function resolveCa(
  tls: NonNullable<SystemConfig["tls"]>,
  credentials: CredentialResolver
): Promise<string | undefined> {
  if (tls.caEnvVar) {
    const pem = await credentials.get(tls.caEnvVar);
    if (pem) return pem;
  }
  if (tls.caFile) return readFileSync(tls.caFile, "utf8");
  return undefined;
}

export function createDispatcherFactory(
  config: SystemConfig,
  credentials: CredentialResolver,
  logger: Logger
): DispatcherFactory {
  const { tls, proxy } = config;

  // No transport customization → let global fetch use its default dispatcher.
  if (!tls && !proxy?.url) return () => Promise.resolve(undefined);

  let built: Promise<Dispatcher | undefined> | undefined;
  return () => {
    if (!built) {
      built = (async () => {
        const ca = tls ? await resolveCa(tls, credentials) : undefined;
        const rejectUnauthorized = tls?.rejectUnauthorized ?? true;
        const connect = {
          ...(ca !== undefined ? { ca } : {}),
          rejectUnauthorized,
          ...(tls?.serverName ? { servername: tls.serverName } : {}),
        };

        if (!rejectUnauthorized) {
          logger.warn(
            { system: config.key },
            "TLS certificate verification is DISABLED for this system (tls.rejectUnauthorized=false) — dev use only"
          );
        }

        if (proxy?.url) {
          const token = proxy.authEnvVar ? await credentials.get(proxy.authEnvVar) : undefined;
          logger.debug({ system: config.key }, "built proxy dispatcher");
          return new ProxyAgent({
            uri: proxy.url,
            ...(token ? { token } : {}),
            requestTls: connect,
          });
        }

        logger.debug(
          { system: config.key, customCa: ca !== undefined, rejectUnauthorized },
          "built tls dispatcher"
        );
        return new Agent({ connect });
      })();
    }
    return built;
  };
}
