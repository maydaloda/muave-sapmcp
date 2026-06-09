import type { AuthDeps, AuthProvider } from "../auth/provider.js";
import { createAuthProvider } from "../auth/registry.js";
import { ConfigError } from "./load.js";
import type { AuthType, SystemConfig, SystemsFile } from "./schema.js";

/** A system config with its auth provider constructed and convenience fields hoisted. */
export interface ResolvedSystem {
  key: string;
  config: SystemConfig;
  /** baseUrl with trailing slashes stripped. */
  baseUrl: string;
  sapClient: string | undefined;
  readOnly: boolean;
  allowedEntities: string[] | undefined;
  timeoutMs: number;
  maxConcurrency: number;
  authType: AuthType;
  authProvider: AuthProvider;
}

/**
 * Holds the validated systems file and lazily resolves systems (constructing the
 * auth provider once per system and caching it for the process lifetime).
 */
export class ConfigStore {
  private readonly cache = new Map<string, ResolvedSystem>();

  constructor(
    private readonly file: SystemsFile,
    private readonly authDeps: AuthDeps
  ) {}

  listSystems(): readonly SystemConfig[] {
    return this.file.systems;
  }

  /** The default system key: explicit `defaultSystem`, else the sole system, else undefined. */
  get defaultSystemKey(): string | undefined {
    if (this.file.defaultSystem) return this.file.defaultSystem;
    return this.file.systems.length === 1 ? this.file.systems[0]?.key : undefined;
  }

  /** True if any configured system permits writes. */
  anyWritable(): boolean {
    return this.file.systems.some((s) => !s.readOnly);
  }

  resolveSystem(key?: string): ResolvedSystem {
    const targetKey = key ?? this.defaultSystemKey;
    if (!targetKey) {
      throw new ConfigError(
        "No system specified and no defaultSystem configured. Pass `system`, or set " +
          '"defaultSystem" in systems.json.'
      );
    }

    const cached = this.cache.get(targetKey);
    if (cached) return cached;

    const config = this.file.systems.find((s) => s.key === targetKey);
    if (!config) {
      throw new ConfigError(
        `Unknown system "${targetKey}". Configured systems: ${this.file.systems
          .map((s) => s.key)
          .join(", ")}.`
      );
    }

    const resolved: ResolvedSystem = {
      key: config.key,
      config,
      baseUrl: config.baseUrl.replace(/\/+$/, ""),
      sapClient: config.sapClient,
      readOnly: config.readOnly,
      allowedEntities: config.allowedEntities,
      timeoutMs: config.timeoutMs,
      maxConcurrency: config.maxConcurrency,
      authType: config.authType,
      authProvider: createAuthProvider(config, this.authDeps),
    };
    this.cache.set(targetKey, resolved);
    return resolved;
  }
}
