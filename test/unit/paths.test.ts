import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join, resolve, sep } from "node:path";
import { catalogFilePath } from "../../src/config/paths.js";

const SAVED = { cache: process.env.MUAVE_CACHE_DIR, home: process.env.MUAVE_HOME };

describe("catalogFilePath precedence", () => {
  beforeEach(() => {
    delete process.env.MUAVE_CACHE_DIR;
    delete process.env.MUAVE_HOME;
  });
  afterEach(() => {
    if (SAVED.cache === undefined) delete process.env.MUAVE_CACHE_DIR;
    else process.env.MUAVE_CACHE_DIR = SAVED.cache;
    if (SAVED.home === undefined) delete process.env.MUAVE_HOME;
    else process.env.MUAVE_HOME = SAVED.home;
  });

  it("1. MUAVE_CACHE_DIR env wins over everything", () => {
    process.env.MUAVE_CACHE_DIR = join(sep, "cache-override");
    process.env.MUAVE_HOME = join(sep, "home-dir");
    const p = catalogFilePath({
      systemsFilePath: join(sep, "proj", "systems.json"),
      cacheDir: "custom",
    });
    expect(p).toBe(join(resolve(join(sep, "cache-override")), "catalog.json"));
  });

  it("2. cacheDir from systems.json resolves relative to the systems file's directory", () => {
    const p = catalogFilePath({
      systemsFilePath: join(sep, "proj", "cfg", "systems.json"),
      cacheDir: "my-cache",
    });
    expect(p).toBe(resolve(join(sep, "proj", "cfg", "my-cache", "catalog.json")));
  });

  it("2b. absolute cacheDir is used as-is", () => {
    const abs = resolve(join(sep, "abs-cache"));
    const p = catalogFilePath({
      systemsFilePath: join(sep, "proj", "systems.json"),
      cacheDir: abs,
    });
    expect(p).toBe(join(abs, "catalog.json"));
  });

  it("3. MUAVE_HOME applies when no cacheDir is configured", () => {
    process.env.MUAVE_HOME = join(sep, "muave-home");
    const p = catalogFilePath({ systemsFilePath: join(sep, "proj", "systems.json") });
    expect(p).toBe(join(resolve(join(sep, "muave-home")), "catalog.json"));
  });

  it("4. anchors to the systems file's directory by default", () => {
    const p = catalogFilePath({ systemsFilePath: join(sep, "proj", "systems.json") });
    expect(p).toBe(resolve(join(sep, "proj", ".muave-sapmcp", "catalog.json")));
  });

  it("4b. no nesting when systems.json already lives in a .muave-sapmcp dir", () => {
    const p = catalogFilePath({
      systemsFilePath: join(sep, "proj", ".muave-sapmcp", "systems.json"),
    });
    expect(p).toBe(resolve(join(sep, "proj", ".muave-sapmcp", "catalog.json")));
  });

  it("5. falls back to <cwd>/.muave-sapmcp when nothing else is known", () => {
    const p = catalogFilePath();
    expect(p).toBe(join(resolve(process.cwd(), ".muave-sapmcp"), "catalog.json"));
  });
});
