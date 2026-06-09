import { describe, expect, it } from "vitest";
import { parseMetadata } from "../../src/metadata/index.js";
import { fixture } from "../fixtures/load.js";

const md = parseMetadata(fixture("v4-draft-service.metadata.xml"), "v4");
const sample = md.entities.find((e) => e.entitySetName === "Sample")!;

describe("parseMetadata v4", () => {
  it("captures composite keys and Common.Label", () => {
    expect(sample.keyFields).toEqual(["ID", "IsActiveEntity"]);
    const name = sample.properties.find((p) => p.name === "Name")!;
    expect(name.label).toBe("Sample Name");
    expect(name.maxLength).toBe(40);
  });

  it("resolves v4 Collection() vs single navigation targets", () => {
    const items = sample.properties.find((p) => p.name === "_Items")!;
    expect(items.navigationTarget).toBe("ItemType");
    expect(items.navigationIsCollection).toBe(true);

    const admin = sample.properties.find((p) => p.name === "DraftAdministrativeData")!;
    expect(admin.navigationTarget).toBe("DraftAdministrativeDataType");
    expect(admin.navigationIsCollection).toBe(false);
  });

  it("detects draft-enabled entity (IsActiveEntity key + DraftAdministrativeData + DraftRoot)", () => {
    expect(sample.isDraftEnabled).toBe(true);
    expect(sample.draftKeyField).toBe("IsActiveEntity");
    expect(sample.isDraftRoot).toBe(true);
  });

  it("extracts bound action FQNs", () => {
    const fqns = (sample.boundActions ?? []).map((a) => a.fqn).sort();
    expect(fqns).toContain("com.sap.gateway.srvd_a2x.zsample.v0001.Activate");
    expect(fqns).toContain("com.sap.gateway.srvd_a2x.zsample.v0001.Edit");
    expect(fqns).toContain("com.sap.gateway.srvd_a2x.zsample.v0001.Prepare");
  });
});
