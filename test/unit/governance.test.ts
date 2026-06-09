import { describe, expect, it } from "vitest";
import type { ResolvedSystem } from "../../src/config/resolve.js";
import { annotationsFor } from "../../src/governance/annotations.js";
import { GovernanceError, GovernancePolicy } from "../../src/governance/policy.js";

function system(overrides: Partial<ResolvedSystem>): ResolvedSystem {
  return {
    key: "S",
    readOnly: true,
    allowedEntities: undefined,
    ...overrides,
  } as unknown as ResolvedSystem;
}

describe("GovernancePolicy.assertWriteAllowed", () => {
  const policy = new GovernancePolicy();

  it("always allows reads", () => {
    expect(() => policy.assertWriteAllowed(system({ readOnly: true }), "GET", "X")).not.toThrow();
  });

  it("blocks writes on read-only systems", () => {
    expect(() => policy.assertWriteAllowed(system({ readOnly: true }), "POST", "X")).toThrow(
      GovernanceError
    );
  });

  it("allows writes when readOnly is false and entity is allowlisted", () => {
    const s = system({ readOnly: false, allowedEntities: ["A_BusinessPartner"] });
    expect(() => policy.assertWriteAllowed(s, "PATCH", "A_BusinessPartner")).not.toThrow();
  });

  it("blocks writes to entities outside the allowlist", () => {
    const s = system({ readOnly: false, allowedEntities: ["Other"] });
    expect(() => policy.assertWriteAllowed(s, "DELETE", "A_BusinessPartner")).toThrow(GovernanceError);
  });

  it("allows all entities when no allowlist is set and writes are enabled", () => {
    const s = system({ readOnly: false, allowedEntities: undefined });
    expect(() => policy.assertWriteAllowed(s, "POST", "Anything")).not.toThrow();
  });
});

describe("annotationsFor", () => {
  it("marks reads read-only and PATCH/DELETE destructive", () => {
    expect(annotationsFor("GET")).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(annotationsFor("POST")).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
    expect(annotationsFor("PATCH")).toMatchObject({ destructiveHint: true, idempotentHint: true });
    expect(annotationsFor("DELETE")).toMatchObject({ destructiveHint: true });
  });
});
