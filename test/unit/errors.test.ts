import { describe, expect, it } from "vitest";
import { GovernanceError } from "../../src/governance/policy.js";
import { ToolNotFoundError, toToolError } from "../../src/lib/errors.js";
import { ODataError, categorizeStatus, parseSapError } from "../../src/odata/errors.js";

describe("parseSapError", () => {
  it("reads V2 error.message.value + code", () => {
    const body = JSON.stringify({ error: { code: "SY/530", message: { value: "Boom" } } });
    expect(parseSapError("v2", body)).toEqual({ code: "SY/530", message: "Boom" });
  });

  it("reads V4 error.message and appends details", () => {
    const body = JSON.stringify({
      error: { code: "X", message: "Top", details: [{ message: "d1" }, { message: "d2" }] },
    });
    expect(parseSapError("v4", body)).toEqual({ code: "X", message: "Top — d1; d2" });
  });

  it("falls back to truncated text for non-JSON bodies", () => {
    const r = parseSapError("v4", "<html>not json</html>");
    expect(r.code).toBeUndefined();
    expect(r.message).toContain("html");
  });
});

describe("categorizeStatus", () => {
  it("maps statuses to categories", () => {
    expect(categorizeStatus(401, false)).toBe("auth");
    expect(categorizeStatus(403, true)).toBe("csrf");
    expect(categorizeStatus(403, false)).toBe("auth");
    expect(categorizeStatus(404, false)).toBe("notfound");
    expect(categorizeStatus(412, false)).toBe("etag");
    expect(categorizeStatus(429, false)).toBe("throttle");
    expect(categorizeStatus(400, false)).toBe("validation");
    expect(categorizeStatus(503, false)).toBe("server");
    expect(categorizeStatus(409, false)).toBe("draft");
  });
});

describe("toToolError", () => {
  it("maps an ODataError, preserving status/category/code and adding a hint", () => {
    const e = toToolError(
      new ODataError({
        status: 412,
        category: "etag",
        message: "precondition failed",
        correlationId: "c1",
        sapCode: "Z1",
      })
    );
    expect(e).toMatchObject({ status: 412, category: "etag", message: "precondition failed", sapCode: "Z1" });
    expect(e.hint).toMatch(/concurrent/i);
  });

  it("maps a GovernanceError", () => {
    const e = toToolError(new GovernanceError("read only"));
    expect(e).toMatchObject({ status: 0, category: "governance", message: "read only" });
  });

  it("maps a ToolNotFoundError to notfound", () => {
    const e = toToolError(new ToolNotFoundError("missing"));
    expect(e.category).toBe("notfound");
    expect(e.status).toBe(404);
  });

  it("maps unknown errors to transport", () => {
    expect(toToolError(new Error("weird")).category).toBe("transport");
  });
});
