import { CredentialMissingError, type CredentialResolver } from "./resolver.js";

/** Resolves credentials from process environment variables by name. */
export class EnvCredentialResolver implements CredentialResolver {
  get(ref: string): Promise<string | undefined> {
    const value = process.env[ref];
    return Promise.resolve(value && value.length > 0 ? value : undefined);
  }

  async getRequired(ref: string): Promise<string> {
    const value = await this.get(ref);
    if (value === undefined) throw new CredentialMissingError(ref);
    return value;
  }
}
