import type { Logger } from "../src/observability/logger.js";
import type { CredentialResolver } from "../src/credentials/resolver.js";
import { CredentialMissingError } from "../src/credentials/resolver.js";

/** A logger that discards output, for tests. */
export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
  trace() {},
  child() {
    return silentLogger;
  },
} as unknown as Logger;

/** A credential resolver backed by a fixed map. */
export class FakeCredentials implements CredentialResolver {
  constructor(private readonly values: Record<string, string> = {}) {}
  get(ref: string): Promise<string | undefined> {
    return Promise.resolve(this.values[ref]);
  }
  async getRequired(ref: string): Promise<string> {
    const v = await this.get(ref);
    if (v === undefined) throw new CredentialMissingError(ref);
    return v;
  }
}
