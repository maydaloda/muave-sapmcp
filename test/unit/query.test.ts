import { describe, expect, it } from "vitest";
import { buildKeyPredicate } from "../../src/odata/key-predicate.js";
import { buildQueryString } from "../../src/odata/query-builder.js";
import type { ParsedProperty } from "../../src/metadata/parse-shared.js";

function prop(name: string, edmType: string): ParsedProperty {
  return {
    name,
    edmType,
    label: null,
    maxLength: null,
    isKey: true,
    isNullable: false,
    filterable: true,
    sortable: true,
    navigationTarget: null,
    navigationIsCollection: false,
  };
}

describe("buildQueryString", () => {
  it("forces $format=json on v2 and uses $inlinecount for count", () => {
    const qs = buildQueryString({ count: true, top: 5 }, "v2");
    expect(qs).toContain("$format=json");
    expect(qs).toContain("$inlinecount=allpages");
    expect(qs).toContain("$top=5");
  });

  it("omits $format on v4 and uses $count=true", () => {
    const qs = buildQueryString({ count: true }, "v4");
    expect(qs).not.toContain("$format");
    expect(qs).toContain("$count=true");
  });

  it("encodes $filter and joins $select/$orderby", () => {
    const qs = buildQueryString(
      { filter: "Name eq 'A B'", select: ["A", "B"], orderby: ["A desc"] },
      "v4"
    );
    expect(qs).toContain("$filter=Name%20eq%20'A%20B'");
    expect(qs).toContain("$select=A%2CB");
    expect(qs).toContain("$orderby=A%20desc");
  });

  it("returns empty string when no params on v4", () => {
    expect(buildQueryString(undefined, "v4")).toBe("");
  });

  it("omits $format on writes (SAP rejects $-system query options on non-GET)", () => {
    // includeFormat=false is what the client passes for POST/PATCH/PUT/DELETE.
    expect(buildQueryString(undefined, "v2", false)).toBe("");
    expect(buildQueryString({ count: true }, "v2", false)).not.toContain("$format");
  });
});

describe("buildKeyPredicate", () => {
  it("quotes a single string key", () => {
    expect(buildKeyPredicate(["BusinessPartner"], "1000", "v2")).toBe("('1000')");
  });

  it("escapes single quotes in string keys", () => {
    expect(buildKeyPredicate(["Name"], "O'Brien", "v4")).toBe("('O''Brien')");
  });

  it("leaves numeric and boolean keys bare", () => {
    expect(buildKeyPredicate(["N"], 42, "v4")).toBe("(42)");
    expect(buildKeyPredicate(["B"], true, "v4")).toBe("(true)");
  });

  it("builds composite keys with EDM-typed formatting (guid bare on v4)", () => {
    const props = new Map<string, ParsedProperty>([
      ["ID", prop("ID", "Edm.Guid")],
      ["IsActiveEntity", prop("IsActiveEntity", "Edm.Boolean")],
    ]);
    const pred = buildKeyPredicate(["ID", "IsActiveEntity"], { ID: "abc-1", IsActiveEntity: false }, "v4", props);
    expect(pred).toBe("(ID=abc-1,IsActiveEntity=false)");
  });

  it("uses guid'...' on v2", () => {
    const props = new Map<string, ParsedProperty>([["ID", prop("ID", "Edm.Guid")]]);
    expect(buildKeyPredicate(["ID"], "abc", "v2", props)).toBe("(guid'abc')");
  });

  it("throws on a composite key passed as a scalar", () => {
    expect(() => buildKeyPredicate(["A", "B"], "x", "v4")).toThrow();
  });

  it("emits BARE date literals in V4 key predicates (SAP RAP validity keys)", () => {
    const props = new Map<string, ParsedProperty>([
      ["ControllingArea", prop("ControllingArea", "Edm.String")],
      ["ValidityEndDate", prop("ValidityEndDate", "Edm.Date")],
    ]);
    const pred = buildKeyPredicate(
      ["ControllingArea", "ValidityEndDate"],
      { ControllingArea: "A000", ValidityEndDate: "9999-12-31" },
      "v4",
      props
    );
    expect(pred).toBe("(ControllingArea='A000',ValidityEndDate=9999-12-31)");
  });

  it("uses type-prefixed quoted datetime literals on V2", () => {
    const props = new Map<string, ParsedProperty>([["D", prop("D", "Edm.DateTime")]]);
    expect(buildKeyPredicate(["D"], "2026-01-01T00:00:00", "v2", props)).toBe(
      "(datetime'2026-01-01T00:00:00')"
    );
  });

  it("V4 DateTimeOffset keys are bare; V2 are datetimeoffset-prefixed", () => {
    const props = new Map<string, ParsedProperty>([["T", prop("T", "Edm.DateTimeOffset")]]);
    expect(buildKeyPredicate(["T"], "2026-01-01T00:00:00Z", "v4", props)).toBe(
      "(2026-01-01T00:00:00Z)"
    );
    expect(buildKeyPredicate(["T"], "2026-01-01T00:00:00Z", "v2", props)).toBe(
      "(datetimeoffset'2026-01-01T00:00:00Z')"
    );
  });
});
