import { describe, expect, it } from "vitest";
import { parseMetadata } from "../../src/metadata/index.js";
import { fixture } from "../fixtures/load.js";

const md = parseMetadata(fixture("v2-business-partner.metadata.xml"), "v2");

describe("parseMetadata v2", () => {
  it("discovers all entity sets", () => {
    expect(md.entities.map((e) => e.entitySetName).sort()).toEqual([
      "A_BusinessPartner",
      "A_BusinessPartnerAddress",
    ]);
  });

  it("captures keys, label guess, maxLength, and sap:filterable/sortable defaults", () => {
    const bp = md.entities.find((e) => e.entitySetName === "A_BusinessPartner")!;
    expect(bp.keyFields).toEqual(["BusinessPartner"]);
    expect(bp.labelFieldGuess).toBe("BusinessPartnerName");

    const name = bp.properties.find((p) => p.name === "BusinessPartnerName")!;
    expect(name.maxLength).toBe(80);
    expect(name.label).toBe("Name");
    expect(name.filterable).toBe(true);

    const created = bp.properties.find((p) => p.name === "CreationDate")!;
    expect(created.sortable).toBe(false);
    // Default-true when sap:filterable omitted.
    expect(created.filterable).toBe(true);
  });

  it("resolves v2 navigation target + collection via <Association>/Multiplicity", () => {
    const bp = md.entities.find((e) => e.entitySetName === "A_BusinessPartner")!;
    const nav = bp.properties.find((p) => p.name === "to_BusinessPartnerAddress")!;
    expect(nav.navigationTarget).toBe("A_BusinessPartnerAddressType");
    expect(nav.navigationIsCollection).toBe(true);
  });

  it("marks no draft info on v2", () => {
    const bp = md.entities.find((e) => e.entitySetName === "A_BusinessPartner")!;
    expect(bp.isDraftEnabled).toBeUndefined();
    expect(bp.boundActions).toBeUndefined();
  });
});
