import {
  GovernanceError,
  type ConfigStore,
  type ResolvedSystem,
  type SystemConfig,
  type SystemDirectory,
} from "muave-sapmcp";

/**
 * Group-scoped view over the global ConfigStore: only the systems in the
 * group's allowlist are visible/resolvable. Enforced server-side here (not in
 * the UI) — denied systems fail with a governance error even if a caller
 * guesses the key. `"*"` grants all systems.
 */
export class FilteredSystemDirectory implements SystemDirectory {
  private readonly allowAll: boolean;
  private readonly allowed: Set<string>;

  constructor(
    private readonly base: ConfigStore,
    allowedSystems: string[]
  ) {
    this.allowAll = allowedSystems.includes("*");
    this.allowed = new Set(allowedSystems);
  }

  private isAllowed(key: string): boolean {
    return this.allowAll || this.allowed.has(key);
  }

  listSystems(): readonly SystemConfig[] {
    return this.base.listSystems().filter((s) => this.isAllowed(s.key));
  }

  get defaultSystemKey(): string | undefined {
    const baseDefault = this.base.defaultSystemKey;
    if (baseDefault && this.isAllowed(baseDefault)) return baseDefault;
    return this.listSystems()[0]?.key;
  }

  anyWritable(): boolean {
    return this.listSystems().some((s) => !s.readOnly);
  }

  resolveSystem(key?: string): ResolvedSystem {
    const targetKey = key ?? this.defaultSystemKey;
    if (!targetKey || !this.isAllowed(targetKey)) {
      throw new GovernanceError(
        `System "${targetKey ?? "(none)"}" is not available to your user group. ` +
          `Available systems: ${this.listSystems()
            .map((s) => s.key)
            .join(", ") || "(none)"}.`
      );
    }
    // Delegate to the global store so SAP auth providers/token cache are reused.
    return this.base.resolveSystem(targetKey);
  }
}
