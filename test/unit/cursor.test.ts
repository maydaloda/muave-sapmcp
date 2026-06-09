import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, type CursorState } from "../../src/lib/cursor.js";

const base: CursorState = {
  system: "EXAMPLE",
  serviceId: "API_BUSINESS_PARTNER",
  entitySet: "A_BusinessPartner",
  version: "v2",
  top: 50,
  count: false,
  skip: 50,
};

describe("cursor encode/decode", () => {
  it("round-trips state", () => {
    const decoded = decodeCursor(encodeCursor(base));
    expect(decoded).toEqual(base);
  });

  it("preserves a server-driven nextLink", () => {
    const s = { ...base, nextLink: "A_BusinessPartner?$skiptoken='X'" };
    expect(decodeCursor(encodeCursor(s)).nextLink).toBe("A_BusinessPartner?$skiptoken='X'");
  });

  it("throws on a garbage token", () => {
    expect(() => decodeCursor("@@@not-base64-json@@@")).toThrow(/Invalid pagination cursor/);
  });

  it("throws on a structurally invalid cursor", () => {
    const bad = Buffer.from(JSON.stringify({ serviceId: "x" }), "utf8").toString("base64url");
    expect(() => decodeCursor(bad)).toThrow(/unexpected shape/);
  });
});
