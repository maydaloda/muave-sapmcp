import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, loadSystemsFile } from "../../src/config/load.js";

const SAVED = process.env.MUAVE_SYSTEMS_JSON;

const VALID = JSON.stringify({
  schemaVersion: 1,
  defaultSystem: "T",
  systems: [
    { key: "T", baseUrl: "https://example.s4hana.cloud.sap", authType: "BASIC", preEncodedEnvVar: "X" },
  ],
});

describe("loadSystemsFile via MUAVE_SYSTEMS_JSON", () => {
  beforeEach(() => {
    delete process.env.MUAVE_SYSTEMS_JSON;
  });
  afterEach(() => {
    if (SAVED === undefined) delete process.env.MUAVE_SYSTEMS_JSON;
    else process.env.MUAVE_SYSTEMS_JSON = SAVED;
  });

  it("parses and validates inline JSON config", async () => {
    process.env.MUAVE_SYSTEMS_JSON = VALID;
    const file = await loadSystemsFile();
    expect(file.defaultSystem).toBe("T");
    expect(file.systems[0]?.key).toBe("T");
    expect(file.systems[0]?.readOnly).toBe(true); // default applied
  });

  it("rejects invalid JSON with a clear ConfigError", async () => {
    process.env.MUAVE_SYSTEMS_JSON = "{not json";
    await expect(loadSystemsFile()).rejects.toThrow(ConfigError);
    await expect(loadSystemsFile()).rejects.toThrow(/not valid JSON/);
  });

  it("rejects schema violations with the validation issues", async () => {
    process.env.MUAVE_SYSTEMS_JSON = JSON.stringify({ schemaVersion: 1, systems: [] });
    await expect(loadSystemsFile()).rejects.toThrow(/failed validation/);
  });
});
