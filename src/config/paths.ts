import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/**
 * Resolves filesystem locations for config and cache.
 *
 * - `MUAVE_HOME`        — base dir for config + cache (default `<cwd>/.muave-sapmcp`).
 * - `MUAVE_SYSTEMS_FILE`— explicit path to systems.json (overrides discovery).
 * - `MUAVE_CACHE_DIR`   — overrides where catalog.json is written.
 */
export function muaveHome(): string {
  const env = process.env.MUAVE_HOME;
  return env ? resolve(env) : resolve(process.cwd(), ".muave-sapmcp");
}

/** Candidate locations for systems.json, in precedence order. */
export function systemsFileCandidates(): string[] {
  const explicit = process.env.MUAVE_SYSTEMS_FILE;
  if (explicit) return [isAbsolute(explicit) ? explicit : resolve(process.cwd(), explicit)];
  return [
    resolve(process.cwd(), "systems.json"),
    join(muaveHome(), "systems.json"),
  ];
}

/** First existing systems.json candidate, or undefined if none exist. */
export function findSystemsFile(): string | undefined {
  return systemsFileCandidates().find((p) => existsSync(p));
}

/** Path to the local metadata catalog cache. */
export function catalogFilePath(): string {
  const dir = process.env.MUAVE_CACHE_DIR ? resolve(process.env.MUAVE_CACHE_DIR) : muaveHome();
  return join(dir, "catalog.json");
}
