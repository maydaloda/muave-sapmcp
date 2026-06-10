import { existsSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

/**
 * Resolves filesystem locations for config and cache.
 *
 * - `MUAVE_SYSTEMS_FILE` — explicit path to systems.json (overrides discovery).
 * - `MUAVE_HOME`         — base dir for config + cache (default `<cwd>/.muave-sapmcp`).
 * - `MUAVE_CACHE_DIR`    — overrides where catalog.json is written (strongest).
 */
export function muaveHome(): string {
  const env = process.env.MUAVE_HOME;
  return env ? resolve(env) : resolve(process.cwd(), ".muave-sapmcp");
}

/** Candidate locations for systems.json, in precedence order. */
export function systemsFileCandidates(): string[] {
  const explicit = process.env.MUAVE_SYSTEMS_FILE;
  if (explicit) return [isAbsolute(explicit) ? explicit : resolve(process.cwd(), explicit)];
  return [resolve(process.cwd(), "systems.json"), join(muaveHome(), "systems.json")];
}

/** First existing systems.json candidate, or undefined if none exist. */
export function findSystemsFile(): string | undefined {
  return systemsFileCandidates().find((p) => existsSync(p));
}

export interface CatalogPathOptions {
  /** Path of the systems.json actually loaded (anchors the default cache location). */
  systemsFilePath?: string | undefined;
  /** Optional `cacheDir` from systems.json; relative values resolve against the systems file's dir. */
  cacheDir?: string | undefined;
}

/**
 * Path to the local metadata catalog cache.
 *
 * Precedence:
 *  1. `MUAVE_CACHE_DIR` env
 *  2. `cacheDir` from systems.json (relative → resolved against the systems file's directory)
 *  3. `MUAVE_HOME` env
 *  4. `<dir of systems.json>/.muave-sapmcp` — anchoring to the config keeps the cache
 *     predictable when the server is spawned with an arbitrary cwd (e.g. by Claude
 *     Desktop). If systems.json already lives in a `.muave-sapmcp` dir, that dir is
 *     used directly (no nesting).
 *  5. `<cwd>/.muave-sapmcp`
 */
export function catalogFilePath(opts: CatalogPathOptions = {}): string {
  if (process.env.MUAVE_CACHE_DIR) {
    return join(resolve(process.env.MUAVE_CACHE_DIR), "catalog.json");
  }

  if (opts.cacheDir) {
    const base = opts.systemsFilePath ? dirname(opts.systemsFilePath) : process.cwd();
    const dir = isAbsolute(opts.cacheDir) ? opts.cacheDir : resolve(base, opts.cacheDir);
    return join(dir, "catalog.json");
  }

  if (process.env.MUAVE_HOME) {
    return join(resolve(process.env.MUAVE_HOME), "catalog.json");
  }

  if (opts.systemsFilePath) {
    const configDir = dirname(resolve(opts.systemsFilePath));
    const dir =
      basename(configDir) === ".muave-sapmcp" ? configDir : join(configDir, ".muave-sapmcp");
    return join(dir, "catalog.json");
  }

  return join(resolve(process.cwd(), ".muave-sapmcp"), "catalog.json");
}
