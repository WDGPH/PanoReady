import { automaticFixes } from "../workflows/stix/validation/helpers";
import { describe, expect, it } from "vitest";
import {
  analyzeAlternateDeliveryInStreetFields,
  analyzeStreetNameSuffix,
  analyzeStreetNumberRepair,
  analyzeStreetNumberUnitPrefix,
  analyzeUnitOverflow,
} from "../lib/addressRepair";
import { applyValidationFixes, parseSTIXXml, validateXml } from "../lib/validator";
import type { AppliedFix } from "../lib/types";

const address = (streetNumber: string, streetName = "", suffix = "") => ({
  Unit: "", StreetNumber: streetNumber, StreetNumberSuffix: suffix, StreetName: streetName,
  StreetType: "ST", StreetDirection: "", RuralRoute: "", PoBoxNumber: "",
  City: "Exampleville", Province: "ON", PostalCode: "H0H0H0",
});

function studentXml(addressXml: string, prefix = ""): string {
  const p = prefix ? `${prefix}:` : "";
  const namespace = prefix ? `xmlns:${prefix}="http://ontario.ca"` : `xmlns="http://ontario.ca"`;
  const body = `<Metadata><CreateDate>2026-09-01</CreateDate><CreateTime>12:00:00</CreateTime><CreatedBy>Synthetic Test</CreatedBy><ContactPhone type="WORK">204-555-0100</ContactPhone><ContactEmail>test@example.invalid</ContactEmail><FullUpload>YES</FullUpload></Metadata><School><SchoolNumber>123</SchoolNumber><Name>Synthetic School</Name><Students><Student><Name><First>Sample</First><Last>Student</Last></Name><Gender>F</Gender><BirthDate>2015-01-01</BirthDate><Address>${addressXml}</Address></Student></Students></School>`;
  const raw = `<?xml version="1.0"?><${p}SchoolUpload ${namespace}>${body}</${p}SchoolUpload>`;
  return prefix ? raw.replace(/<(\/?)([A-Z])/g, `<$1${p}$2`) : raw;
}

describe("address repair proposals", () => {
  it("splits a combined number and name when StreetName is empty", () => {
    expect(analyzeStreetNumberRepair(address("51 Example"), 6)).toMatchObject({
      confidence: "safe",
      changes: [
        { field: "StreetNumber", currentValue: "51 Example", proposedValue: "51" },
        { field: "StreetName", currentValue: "", proposedValue: "Example" },
      ],
    });
  });

  it("removes a duplicated name without overwriting StreetName", () => {
    expect(analyzeStreetNumberRepair(address("51 Example", "Example"), 6)).toMatchObject({
      confidence: "safe",
      changes: [{ field: "StreetNumber", currentValue: "51 Example", proposedValue: "51" }],
    });
  });

  it("surfaces conflicting StreetName data for review", () => {
    const proposal = analyzeStreetNumberRepair(address("51 Example", "Existing"), 6);
    expect(proposal).toMatchObject({ confidence: "review" });
    expect(proposal?.explanation).toContain("StreetName is already “Existing”");
    expect(proposal?.changes).toEqual([
      { field: "StreetNumber", currentValue: "51 Example", proposedValue: "51" },
    ]);
  });

  it("separates a number suffix when the target is available", () => {
    expect(analyzeStreetNumberRepair(address("51A Example"), 6)?.changes).toEqual([
      { field: "StreetNumber", currentValue: "51A Example", proposedValue: "51" },
      { field: "StreetNumberSuffix", currentValue: "", proposedValue: "A" },
      { field: "StreetName", currentValue: "", proposedValue: "Example" },
    ]);
  });

  it("does not guess unit, numeric range, or structurally ambiguous values", () => {
    for (const value of ["406 unit", "13 - 142", "302-380", "B-2C-360"]) {
      expect(analyzeStreetNumberRepair(address(value), 6), value).toBeUndefined();
    }
  });

  it("applies every field in a coordinated repair and clears the finding", () => {
    const xml = `<?xml version="1.0"?><SchoolUpload xmlns="http://ontario.ca"><Metadata><CreateDate>2026-09-01</CreateDate><CreateTime>12:00:00</CreateTime><CreatedBy>Synthetic Test</CreatedBy><ContactPhone type="WORK">204-555-0100</ContactPhone><ContactEmail>test@example.invalid</ContactEmail><FullUpload>YES</FullUpload></Metadata><School><SchoolNumber>123</SchoolNumber><Name>Synthetic School</Name><Students><Student><Name><First>Sample</First><Last>Student</Last></Name><Gender>F</Gender><BirthDate>2015-01-01</BirthDate><Address><StreetNumber>51 Example</StreetNumber><City>Exampleville</City><Province>ON</Province></Address></Student></Students></School></SchoolUpload>`;
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
    const fields = parseSTIXXml(fixedXml)[0].fields;
    expect(fields.StreetNumber).toBe("51");
    expect(fields.StreetName).toBe("Example");
    // Applying the compound repair must not disturb address fields the proposal never touched.
    expect(fields.City).toBe("Exampleville");
    expect(fields.Province).toBe("ON");
    expect(validateXml(fixedXml).issues.some((candidate) => candidate.repairProposal)).toBe(false);
  });

  it("works the same for default and prefixed namespaces", () => {
    const addr = "<StreetNumber>51 Example</StreetNumber><City>Exampleville</City><Province>ON</Province>";
    for (const prefix of ["", "stix"]) {
      const result = validateXml(studentXml(addr, prefix));
      const issue = result.issues.find((i) => i.field === "StreetNumber" && i.ruleId === "FIELD_LENGTH");
      expect(issue?.repairProposal?.confidence, `prefix "${prefix}"`).toBe("safe");
      expect(issue?.repairProposal?.changes.map((c) => [c.field, c.proposedValue]), `prefix "${prefix}"`).toEqual([
        ["StreetNumber", "51"],
        ["StreetName", "Example"],
      ]);
    }
  });
});

describe("street type and direction found in StreetName", () => {
  const types = ["ST", "RD", "AVE", "CRES", "DR", "BLVD", "CRT", "LANE", "HWY", "PL", "PKY", "TERR", "TRAIL", "CIR", "WAY"];
  const directions = ["E", "N", "NE", "NW", "S", "SE", "SW", "W"];

  it.each([
    ["Example St.", "Example", "ST", undefined],
    ["Sample Cres.", "Sample", "CRES", undefined],
    ["Placeholder Dr.", "Placeholder", "DR", undefined],
    ["Synthetic Street East", "Synthetic", "ST", "E"],
    ["Fixture Rd. N", "Fixture", "RD", "N"],
    ["Mock Ave. West", "Mock", "AVE", "W"],
    ["testway cres.", "testway", "CRES", undefined],
  ])("separates %s into canonical address fields", (raw, name, type, direction) => {
    const proposal = analyzeStreetNameSuffix(
      { StreetName: raw, StreetType: "", StreetDirection: "" },
      types,
      directions,
    );
    expect(proposal).toMatchObject({ confidence: "safe" });
    expect(proposal?.changes).toEqual([
      { field: "StreetName", currentValue: raw, proposedValue: name },
      { field: "StreetType", currentValue: "", proposedValue: type },
      ...(direction ? [{ field: "StreetDirection", currentValue: "", proposedValue: direction }] : []),
    ]);
  });

  it("does not mistake an internal type word for a suffix", () => {
    expect(analyzeStreetNameSuffix(
      { StreetName: "Road to Example", StreetType: "", StreetDirection: "" },
      types,
      directions,
    )).toBeUndefined();
  });

  it("does not overwrite a conflicting populated destination field", () => {
    const proposal = analyzeStreetNameSuffix(
      { StreetName: "Fixture Rd N", StreetType: "ST", StreetDirection: "S" },
      types,
      directions,
    );
    expect(proposal).toMatchObject({ confidence: "review", changes: [] });
    expect(proposal?.explanation).toContain("StreetType is already “ST”");
    expect(proposal?.explanation).toContain("StreetDirection is already “S”");
  });

  it("respects the active ruleset's allowed codes", () => {
    expect(analyzeStreetNameSuffix(
      { StreetName: "Example St", StreetType: "", StreetDirection: "" },
      ["RD"],
      directions,
    )).toBeUndefined();
  });

  it("emits one warning with a coordinated autofix that clears after application", () => {
    const xml = studentXml("<StreetName>Synthetic Street East</StreetName><City>Exampleville</City><Province>ON</Province>");
    const initial = validateXml(xml);
    const issue = initial.issues.find(candidate => candidate.ruleId === "STREET_TYPE_IN_STREET_NAME");
    expect(issue).toMatchObject({ severity: "warning", autoFixable: true, field: "StreetName" });

    const fixes: AppliedFix[] = issue!.repairProposal!.changes.map(change => ({
      issueId: issue!.id, recordId: issue!.recordId!, field: change.field,
      oldValue: change.currentValue, newValue: change.proposedValue,
      ruleId: issue!.ruleId, repairId: issue!.repairProposal!.id, appliedAt: 1,
    }));
    const fixedXml = applyValidationFixes(xml, fixes);
    expect(parseSTIXXml(fixedXml)[0].fields).toMatchObject({
      StreetName: "Synthetic", StreetType: "ST", StreetDirection: "E",
    });
    expect(validateXml(fixedXml).issues.some(candidate => candidate.ruleId === "STREET_TYPE_IN_STREET_NAME")).toBe(false);
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

  it("surfaces 34-8773 as a reviewable unit/street-number split", () => {
    const result = validateXml(studentXml("<StreetNumber>34-8773</StreetNumber><City>Exampleville</City><Province>ON</Province>"));
    const issue = result.issues.find((candidate) => candidate.field === "StreetNumber" && candidate.ruleId === "FIELD_LENGTH");

    expect(issue?.repairProposal).toMatchObject({ confidence: "review" });
    expect(issue?.repairProposal?.changes).toEqual([
      { field: "StreetNumber", currentValue: "34-8773", proposedValue: "8773" },
      { field: "Unit", currentValue: "", proposedValue: "34" },
    ]);
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
    expect(proposal).toMatchObject({ confidence: "review", deliveryType: "poBox", sourceField: "StreetName" });
    expect(proposal?.changes).toEqual([
      { field: "StreetName", currentValue: "PO Box 42", proposedValue: "" },
      { field: "PoBoxNumber", currentValue: "", proposedValue: "42" },
    ]);
  });

  it("proposes moving a clean rural route match out of StreetNumber for review", () => {
    const proposal = analyzeAlternateDeliveryInStreetFields({ StreetNumber: "RR 2", RuralRoute: "" });
    expect(proposal).toMatchObject({ confidence: "review", deliveryType: "ruralRoute", sourceField: "StreetNumber" });
    expect(proposal?.changes).toEqual([
      { field: "StreetNumber", currentValue: "RR 2", proposedValue: "" },
      { field: "RuralRoute", currentValue: "", proposedValue: "RR 2" },
    ]);
  });

  it("normalizes an equivalent existing rural route without treating it as a conflict", () => {
    const proposal = analyzeAlternateDeliveryInStreetFields({ StreetNumber: "RR01", RuralRoute: "R.R. 1" });
    expect(proposal).toMatchObject({ confidence: "review" });
    expect(proposal?.changes).toEqual([
      { field: "StreetNumber", currentValue: "RR01", proposedValue: "" },
      { field: "RuralRoute", currentValue: "R.R. 1", proposedValue: "RR 1" },
    ]);
  });

  it("never overwrites an existing conflicting PoBoxNumber", () => {
    const proposal = analyzeAlternateDeliveryInStreetFields({ StreetName: "PO Box 42", PoBoxNumber: "99" });
    expect(proposal).toMatchObject({ confidence: "review", changes: [] });
    expect(proposal?.explanation).toContain("PoBoxNumber is already “99”");
  });

  it("keeps a conflicting rural route in review", () => {
    const proposal = analyzeAlternateDeliveryInStreetFields({ StreetName: "Rural Route 2", RuralRoute: "RR 9" });
    expect(proposal).toMatchObject({ confidence: "review", changes: [] });
    expect(proposal?.explanation).toContain("RuralRoute is already “RR 9”");
  });

  it("falls back to a manual, no-guess finding when the box number can't be parsed", () => {
    const proposal = analyzeAlternateDeliveryInStreetFields({ StreetName: "PO Box unit 4", PoBoxNumber: "" });
    expect(proposal).toMatchObject({ confidence: "manual", changes: [] });
  });

  it("does not fire on ordinary street names", () => {
    expect(analyzeAlternateDeliveryInStreetFields({ StreetName: "Boxwood Lane", PoBoxNumber: "" })).toBeUndefined();
  });
});

it("applies a safe automatic address correction as a complete repair", () => {
  const xml = studentXml("<StreetNumber>51 Example</StreetNumber><City>Exampleville</City><Province>ON</Province>");
  const result = validateXml(xml);
  const issue = result.issues.find(issue => issue.repairProposal?.confidence === "safe")!;
  const fixes = automaticFixes(issue, result.records, 1);
  expect(fixes.map(fix => [fix.field, fix.newValue])).toEqual([["StreetNumber", "51"], ["StreetName", "Example"]]);
  expect(new Set(fixes.map(fix => fix.repairId))).toEqual(new Set([issue.repairProposal!.id]));
  const updated = validateXml(applyValidationFixes(xml, fixes));
  expect(updated.records[0].fields).toMatchObject({ StreetNumber: "51", StreetName: "Example", City: "Exampleville" });
  const conflict = validateXml(studentXml("<StreetNumber>66 Placeholder</StreetNumber><StreetName>Rd</StreetName>"));
  const conflictIssue = conflict.issues.find(issue => issue.repairProposal)!;
  expect(conflictIssue.autoFixable).toBe(false);
  expect(automaticFixes(conflictIssue, conflict.records, 1)).toEqual([]);
  for (const [streetNumber, streetName] of [
    ["9 Redwood", "Pl"],
    ["92 Pear", "Circle"],
    ["1097 Mos", "Mosey"],
    ["9200 7th", "line"],
  ]) {
    const partial = validateXml(studentXml("<StreetNumber>" + streetNumber + "</StreetNumber><StreetName>" + streetName + "</StreetName>"));
    const partialIssue = partial.issues.find(candidate => candidate.field === "StreetNumber" && candidate.repairProposal)!;
    expect(partialIssue.repairProposal, streetNumber).toMatchObject({ confidence: "review" });
    expect(partialIssue.autoFixable, streetNumber).toBe(false);
    expect(automaticFixes(partialIssue, partial.records, 1), streetNumber).toEqual([]);
  }
  const noSuggestion = validateXml(studentXml("<Unit>437 Example</Unit><StreetNumber>99</StreetNumber><StreetName>Existing</StreetName>"));
  const manualIssue = noSuggestion.issues.find(issue => issue.repairProposal)!;
  expect(manualIssue.autoFixable).toBe(false);
  expect(automaticFixes(manualIssue, noSuggestion.records, 1)).toEqual([]);
});

it("offers a clean rural route as a coordinated review address repair", () => {
  const xml = studentXml("<StreetNumber>RR1</StreetNumber><City>Exampleville</City><Province>ON</Province>");
  const result = validateXml(xml);
  const issue = result.issues.find(candidate => candidate.ruleId === "RURAL_ROUTE_IN_STREET_FIELD");
  expect(issue).toMatchObject({ field: "StreetNumber", autoFixable: false, repairProposal: { confidence: "review" } });
  expect(issue?.repairProposal?.changes).toEqual([
    { field: "StreetNumber", currentValue: "RR1", proposedValue: "" },
    { field: "RuralRoute", currentValue: "", proposedValue: "RR 1" },
  ]);
});
