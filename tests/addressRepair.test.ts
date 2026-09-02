import { describe, expect, it } from "vitest";
import {
  analyzeAlternateDeliveryInStreetFields,
  analyzeStreetNumberRepair,
  analyzeStreetNumberUnitPrefix,
  analyzeUnitOverflow,
} from "../lib/addressRepair";
import { applyValidationFixes, parseStixXml, validateXml } from "../lib/validator";
import type { AppliedFix } from "../lib/types";

const address = (streetNumber: string, streetName = "", suffix = "") => ({
  Unit: "", StreetNumber: streetNumber, StreetNumberSuffix: suffix, StreetName: streetName,
  StreetType: "ST", StreetDirection: "", RuralRoute: "", PoBoxNumber: "",
  City: "Guelph", Province: "ON", PostalCode: "N1G2W1",
});

function studentXml(addressXml: string, prefix = ""): string {
  const p = prefix ? `${prefix}:` : "";
  const namespace = prefix ? `xmlns:${prefix}="http://ontario.ca"` : `xmlns="http://ontario.ca"`;
  const body = `<Metadata><CreateDate>2026-09-01</CreateDate><CreateTime>12:00:00</CreateTime><CreatedBy>Test</CreatedBy><ContactPhone type="WORK">519-824-9999</ContactPhone><ContactEmail>test@example.invalid</ContactEmail><FullUpload>YES</FullUpload></Metadata><School><SchoolNumber>123</SchoolNumber><Name>Test</Name><Students><Student><Name><First>Ada</First><Last>Lovelace</Last></Name><Gender>F</Gender><BirthDate>2015-01-01</BirthDate><Address>${addressXml}</Address></Student></Students></School>`;
  const raw = `<?xml version="1.0"?><${p}SchoolUpload ${namespace}>${body}</${p}SchoolUpload>`;
  return prefix ? raw.replace(/<(\/?)([A-Z])/g, `<$1${p}$2`) : raw;
}

describe("address repair proposals", () => {
  it("splits a combined number and name when StreetName is empty", () => {
    expect(analyzeStreetNumberRepair(address("51 Keats"), 6)).toMatchObject({
      confidence: "safe",
      changes: [
        { field: "StreetNumber", currentValue: "51 Keats", proposedValue: "51" },
        { field: "StreetName", currentValue: "", proposedValue: "Keats" },
      ],
    });
  });

  it("removes a duplicated name without overwriting StreetName", () => {
    expect(analyzeStreetNumberRepair(address("51 Keats", "Keats"), 6)).toMatchObject({
      confidence: "safe",
      changes: [{ field: "StreetNumber", currentValue: "51 Keats", proposedValue: "51" }],
    });
  });

  it("surfaces conflicting StreetName data for review", () => {
    const proposal = analyzeStreetNumberRepair(address("51 Keats", "Woolwich"), 6);
    expect(proposal).toMatchObject({ confidence: "review" });
    expect(proposal?.explanation).toContain("StreetName is already “Woolwich”");
    expect(proposal?.changes).toEqual([
      { field: "StreetNumber", currentValue: "51 Keats", proposedValue: "51" },
    ]);
  });

  it("separates a number suffix when the target is available", () => {
    expect(analyzeStreetNumberRepair(address("51A Keats"), 6)?.changes).toEqual([
      { field: "StreetNumber", currentValue: "51A Keats", proposedValue: "51" },
      { field: "StreetNumberSuffix", currentValue: "", proposedValue: "A" },
      { field: "StreetName", currentValue: "", proposedValue: "Keats" },
    ]);
  });

  it("does not guess unit, numeric range, or structurally ambiguous values", () => {
    for (const value of ["406 unit", "13 - 142", "302-380", "B-2C-360"]) {
      expect(analyzeStreetNumberRepair(address(value), 6), value).toBeUndefined();
    }
  });

  it("applies every field in a coordinated repair and clears the finding", () => {
    const xml = `<?xml version="1.0"?><SchoolUpload xmlns="http://ontario.ca"><Metadata><CreateDate>2026-09-01</CreateDate><CreateTime>12:00:00</CreateTime><CreatedBy>Test</CreatedBy><ContactPhone type="WORK">519-824-9999</ContactPhone><ContactEmail>test@example.invalid</ContactEmail><FullUpload>YES</FullUpload></Metadata><School><SchoolNumber>123</SchoolNumber><Name>Test</Name><Students><Student><Name><First>Ada</First><Last>Lovelace</Last></Name><Gender>F</Gender><BirthDate>2015-01-01</BirthDate><Address><StreetNumber>51 Keats</StreetNumber><City>Guelph</City><Province>ON</Province></Address></Student></Students></School></SchoolUpload>`;
    const initial = validateXml(xml);
    const issue = initial.issues.find((candidate) => candidate.repairProposal);
    const fixes: AppliedFix[] = issue!.repairProposal!.changes.map((change) => ({
      issueId: issue!.id,
      recordId: issue!.recordId!,
      field: change.field,
      oldValue: change.currentValue,
      newValue: change.proposedValue,
      ruleId: issue!.ruleId,
      repairId: issue!.repairProposal!.id,
      appliedAt: 1,
    }));

    const fixedXml = applyValidationFixes(xml, fixes);
    const fields = parseStixXml(fixedXml)[0].fields;
    expect(fields.StreetNumber).toBe("51");
    expect(fields.StreetName).toBe("Keats");
    // Applying the compound repair must not disturb address fields the proposal never touched.
    expect(fields.City).toBe("Guelph");
    expect(fields.Province).toBe("ON");
    expect(validateXml(fixedXml).issues.some((candidate) => candidate.repairProposal)).toBe(false);
  });

  it("works the same for default and prefixed namespaces", () => {
    const addr = "<StreetNumber>51 Keats</StreetNumber><City>Guelph</City><Province>ON</Province>";
    for (const prefix of ["", "stix"]) {
      const result = validateXml(studentXml(addr, prefix));
      const issue = result.issues.find((i) => i.field === "StreetNumber" && i.ruleId === "FIELD_LENGTH");
      expect(issue?.repairProposal?.confidence, `prefix "${prefix}"`).toBe("safe");
      expect(issue?.repairProposal?.changes.map((c) => [c.field, c.proposedValue]), `prefix "${prefix}"`).toEqual([
        ["StreetNumber", "51"],
        ["StreetName", "Keats"],
      ]);
    }
  });
});

describe("unit number fused to the street number", () => {
  it("cautiously proposes a small unit prefix as review, never safe", () => {
    const proposal = analyzeStreetNumberUnitPrefix({ StreetNumber: "4-51", Unit: "" });
    expect(proposal).toMatchObject({
      confidence: "review",
      changes: [
        { field: "StreetNumber", currentValue: "4-51", proposedValue: "51" },
        { field: "Unit", currentValue: "", proposedValue: "4" },
      ],
    });
  });

  it("does not overwrite an existing conflicting Unit", () => {
    const proposal = analyzeStreetNumberUnitPrefix({ StreetNumber: "4-51", Unit: "12" });
    expect(proposal?.explanation).toContain("Unit is already “12”");
    expect(proposal?.changes).toEqual([{ field: "StreetNumber", currentValue: "4-51", proposedValue: "51" }]);
  });

  it("leaves genuinely ambiguous ranges alone", () => {
    for (const value of ["302-380", "13 - 142"]) {
      expect(analyzeStreetNumberUnitPrefix({ StreetNumber: value, Unit: "" }), value).toBeUndefined();
    }
  });
});

describe("a street number and name found in Unit", () => {
  it("proposes clearing Unit and filling empty StreetNumber/StreetName", () => {
    const proposal = analyzeUnitOverflow({ Unit: "437 Pine", StreetNumber: "", StreetName: "" }, 6);
    expect(proposal).toMatchObject({ confidence: "review" });
    expect(proposal?.changes).toEqual([
      { field: "Unit", currentValue: "437 Pine", proposedValue: "" },
      { field: "StreetNumber", currentValue: "", proposedValue: "437" },
      { field: "StreetName", currentValue: "", proposedValue: "Pine" },
    ]);
  });

  it("only clears Unit when StreetNumber/StreetName already agree", () => {
    const proposal = analyzeUnitOverflow({ Unit: "437 Pine", StreetNumber: "437", StreetName: "Pine" }, 6);
    expect(proposal?.changes).toEqual([{ field: "Unit", currentValue: "437 Pine", proposedValue: "" }]);
  });

  it("proposes no changes on conflicting StreetNumber/StreetName data, rather than guessing and dropping Unit", () => {
    const proposal = analyzeUnitOverflow({ Unit: "437 Pine", StreetNumber: "12", StreetName: "Oak" }, 6);
    expect(proposal).toMatchObject({ confidence: "review" });
    expect(proposal?.explanation).toContain("StreetNumber is already “12”");
    expect(proposal?.explanation).toContain("StreetName is already “Oak”");
    expect(proposal?.changes).toEqual([]);
  });

  it("does not guess unit descriptions that aren't a street number and name", () => {
    for (const value of ["Basement Suite 4", "12 Rear", "2 Suite"]) {
      expect(analyzeUnitOverflow({ Unit: value, StreetNumber: "", StreetName: "" }, 6), value).toBeUndefined();
    }
  });

  it("leaves a StreetNumber-length overflow alone", () => {
    expect(analyzeUnitOverflow({ Unit: "4375678 Pine", StreetNumber: "", StreetName: "" }, 6)).toBeUndefined();
  });
});

describe("PO Box and rural route text in street fields", () => {
  it("moves a clean PO Box match out of StreetName", () => {
    const proposal = analyzeAlternateDeliveryInStreetFields({ StreetName: "PO Box 42", PoBoxNumber: "" });
    expect(proposal).toMatchObject({ confidence: "review" });
    expect(proposal?.changes).toEqual([
      { field: "StreetName", currentValue: "PO Box 42", proposedValue: "" },
      { field: "PoBoxNumber", currentValue: "", proposedValue: "42" },
    ]);
  });

  it("moves a clean rural route match out of StreetNumber", () => {
    const proposal = analyzeAlternateDeliveryInStreetFields({ StreetNumber: "RR 2", RuralRoute: "" });
    expect(proposal).toMatchObject({ confidence: "review" });
    expect(proposal?.changes).toEqual([
      { field: "StreetNumber", currentValue: "RR 2", proposedValue: "" },
      { field: "RuralRoute", currentValue: "", proposedValue: "RR 2" },
    ]);
  });

  it("never overwrites an existing conflicting PoBoxNumber", () => {
    const proposal = analyzeAlternateDeliveryInStreetFields({ StreetName: "PO Box 42", PoBoxNumber: "99" });
    expect(proposal).toMatchObject({ confidence: "review", changes: [] });
    expect(proposal?.explanation).toContain("PoBoxNumber is already “99”");
  });

  it("falls back to a manual, no-guess finding when the box number can't be parsed", () => {
    const proposal = analyzeAlternateDeliveryInStreetFields({ StreetName: "PO Box unit 4", PoBoxNumber: "" });
    expect(proposal).toMatchObject({ confidence: "manual", changes: [] });
  });

  it("does not fire on ordinary street names", () => {
    expect(analyzeAlternateDeliveryInStreetFields({ StreetName: "Boxwood Lane", PoBoxNumber: "" })).toBeUndefined();
  });
});
