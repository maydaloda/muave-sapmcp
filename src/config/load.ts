import { readFile } from "node:fs/promises";
import { findSystemsFile, systemsFileCandidates } from "./paths.js";
import { SystemsFileSchema, type SystemsFile } from "./schema.js";

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Locate, read, parse, and validate the systems configuration. Precedence:
 * `MUAVE_SYSTEMS_JSON` env var (inline JSON — for serverless hosts with no
 * filesystem config), then a `systems.json` file (see {@link findSystemsFile}).
 * Throws a {@link ConfigError} with an actionable message on any failure.
 */
export async function loadSystemsFile(): Promise<SystemsFile> {
  const inline = process.env.MUAVE_SYSTEMS_JSON;
  if (inline && inline.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(inline);
    } catch (err) {
      throw new ConfigError(
        `MUAVE_SYSTEMS_JSON is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    const result = SystemsFileSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");
      throw new ConfigError(`MUAVE_SYSTEMS_JSON failed validation:\n${issues}`);
    }
    return result.data;
  }

  const path = findSystemsFile();
  if (!path) {
    throw new ConfigError(
      `No systems.json found. Looked in: ${systemsFileCandidates().join(", ")}. ` +
        `Copy systems.json.example to one of these locations (or set MUAVE_SYSTEMS_FILE).`
    );
  }

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    throw new ConfigError(
      `Failed to read systems.json at ${path}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(
      `systems.json at ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const result = SystemsFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`systems.json at ${path} failed validation:\n${issues}`);
  }
  return result.data;
}
