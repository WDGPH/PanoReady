import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import defaultRulesJson from "../config/rules.stix.default.json";
import type { AppliedFix, RulesProfile } from "../lib/types";
import { applyValidationFixes, validateXml } from "../lib/validator";

const defaultRules = defaultRulesJson as RulesProfile;

function stixWithPhones(phones: string[]): string {
  const students = phones.map((phone, index) => `
    <ns1:Student>
      <ns1:OEN>${String(700000000 + index)}</ns1:OEN>
      <ns1:Grade>GR5</ns1:Grade>
      <ns1:Name><ns1:First>Phone${index}</ns1:First><ns1:Last>Tester</ns1:Last></ns1:Name>
      <ns1:Gender>Other</ns1:Gender>
      <ns1:BirthDate>2015-02-${String(index + 1).padStart(2, "0")}</ns1:BirthDate>
      <ns1:Address></ns1:Address>
      <ns1:Phone>${phone}</ns1:Phone>
    </ns1:Student>`).join("");

  return `<?xml version="1.0" encoding="utf-8"?>
    <ns1:SchoolUpload xmlns:ns1="http://ontario.ca">
      <ns1:Metadata><ns1:CreateDate>2026-09-01</ns1:CreateDate><ns1:CreateTime>12:00:00</ns1:CreateTime><ns1:CreatedBy>Phone Tests</ns1:CreatedBy><ns1:ContactPhone type="WORK">519-824-9999</ns1:ContactPhone><ns1:ContactEmail>phone@example.invalid</ns1:ContactEmail><ns1:FullUpload>YES</ns1:FullUpload></ns1:Metadata>
      <ns1:School>
        <ns1:SchoolNumber>123456</ns1:SchoolNumber>
        <ns1:Name>Synthetic Phone School</ns1:Name>
        <ns1:Students>${students}</ns1:Students>
      </ns1:School>
    </ns1:SchoolUpload>`;
}

function phoneIssues(phones: string[], rules: RulesProfile = defaultRules) {
  return validateXml(stixWithPhones(phones), rules).issues.filter(
    (issue) => issue.field === "Phone"
  );
}

describe("phone-number validator integration", () => {
  it("enforces both NANP NPA and NXX structure without suggesting digit changes", () => {
    const issues = phoneIssues([
      "519-824-1234",
      "019-824-1234",
      "119-824-1234",
      "519-024-1234",
      "519-124-1234",
    ]);

    expect(issues.map((issue) => issue.ruleId)).toEqual([
      "PHONE_NPA_STRUCTURE",
      "PHONE_NPA_STRUCTURE",
      "PHONE_NXX_STRUCTURE",
      "PHONE_NXX_STRUCTURE",
    ]);
    expect(issues.every((issue) => !issue.autoFixable && issue.suggestedFix === undefined)).toBe(true);
  });

  it("preserves length, multiple-number, and appended-text errors", () => {
    const issues = phoneIssues([
      "519-824-123",
      "519-824-12345",
      "519-824-1234 / 416-555-1234",
      "519-824-1234 call office",
    ]);

    expect(issues).toHaveLength(4);
    expect(issues.every((issue) => issue.ruleId === "PHONE_FORMAT" && issue.severity === "error")).toBe(true);
    expect(issues.every((issue) => !issue.autoFixable)).toBe(true);
  });

  it("applies deterministic formatting fixes and clears them on revalidation", () => {
    const xml = stixWithPhones(["5198241234", "(416) 555-6789", "+1 867 920 1234"]);
    const initial = validateXml(xml);
    const formattingIssues = initial.issues.filter((issue) => issue.ruleId === "PHONE_FORMAT");
    const fixes: AppliedFix[] = formattingIssues.map((issue) => ({
      issueId: issue.id,
      recordId: issue.recordId!,
      field: issue.field!,
      oldValue: initial.records.find((record) => record.id === issue.recordId)!.fields[issue.field!],
      newValue: issue.suggestedFix!,
      ruleId: issue.ruleId,
      appliedAt: 0,
    }));

    expect(formattingIssues.map((issue) => issue.suggestedFix)).toEqual([
      "519-824-1234",
      "416-555-6789",
      "867-920-1234",
    ]);
    const fixedXml = applyValidationFixes(xml, fixes);
    expect(validateXml(fixedXml).issues.filter((issue) => issue.field === "Phone")).toEqual([]);
  });

  it("accepts canonical extensions and auto-fixes common unambiguous variants", () => {
    const xml = stixWithPhones([
      "519-824-1234x1",
      "519-824-1234x12345",
      "519-824-1234X12",
      "519-824-1234 ext. 34",
      "519-824-1234 #56",
    ]);
    const issues = validateXml(xml).issues.filter((issue) => issue.field === "Phone");

    expect(issues).toHaveLength(3);
    expect(issues.every((issue) => issue.ruleId === "PHONE_EXTENSION_NORMALIZE")).toBe(true);
    expect(issues.map((issue) => issue.suggestedFix)).toEqual([
      "519-824-1234x12",
      "519-824-1234x34",
      "519-824-1234x56",
    ]);
    expect(issues.every((issue) => issue.autoFixable)).toBe(true);
  });

  it("requires manual review when extension intent or digits are ambiguous", () => {
    const issues = phoneIssues([
      "519-824-1234x",
      "519-824-1234 ext.",
      "519-824-1234x123456",
      "519-824-1234 ext ABC",
      "519-824-1234x12A",
    ]);

    expect(issues).toHaveLength(5);
    expect(issues.every((issue) => issue.ruleId === "PHONE_EXTENSION_FORMAT")).toBe(true);
    expect(issues.every((issue) => !issue.autoFixable && issue.suggestedFix === undefined)).toBe(true);
  });

  it("validates and fixes metadata, student, and both nested guardian phone locations", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <ns1:SchoolUpload xmlns:ns1="http://ontario.ca">
        <ns1:Metadata>
          <ns1:CreateDate>2026-09-01</ns1:CreateDate><ns1:CreateTime>12:00:00</ns1:CreateTime>
          <ns1:CreatedBy>Pear Orchard</ns1:CreatedBy><ns1:ContactPhone type="WORK">519-824-1000 ext. 10</ns1:ContactPhone>
          <ns1:ContactEmail>demo@example.invalid</ns1:ContactEmail><ns1:FullUpload>YES</ns1:FullUpload>
        </ns1:Metadata>
        <ns1:School><ns1:SchoolNumber>123456</ns1:SchoolNumber><ns1:Name>Synthetic Phone School</ns1:Name>
          <ns1:Students><ns1:Student>
            <ns1:OEN>700000000</ns1:OEN><ns1:Grade>GR5</ns1:Grade>
            <ns1:Name><ns1:First>Apple</ns1:First><ns1:Last>Tester</ns1:Last></ns1:Name>
            <ns1:Gender>Other</ns1:Gender><ns1:BirthDate>2015-02-01</ns1:BirthDate>
            <ns1:Guardian><ns1:Name><ns1:First>Pear</ns1:First></ns1:Name><ns1:Relationship>LEGALGRD</ns1:Relationship><ns1:Phone type="HOME">519-824-2000 #20</ns1:Phone></ns1:Guardian>
            <ns1:Guardian><ns1:Name><ns1:First>Plum</ns1:First></ns1:Name><ns1:Relationship>OTHER</ns1:Relationship><ns1:Phone type="MOBILE">519-824-3000X30</ns1:Phone></ns1:Guardian>
            <ns1:Address></ns1:Address><ns1:Phone type="MOBILE">519-824-4000 x 40</ns1:Phone>
          </ns1:Student></ns1:Students>
        </ns1:School>
      </ns1:SchoolUpload>`;
    const initial = validateXml(xml);
    const extensionIssues = initial.issues.filter((issue) => issue.ruleId === "PHONE_EXTENSION_NORMALIZE");
    expect(extensionIssues.map((issue) => issue.field)).toEqual([
      "MetadataContactPhone",
      "Phone",
      "GuardianPhoneNumber",
      "Guardian2PhoneNumber",
    ]);

    const fixes: AppliedFix[] = extensionIssues.map((issue) => ({
      issueId: issue.id,
      recordId: issue.recordId!,
      field: issue.field!,
      oldValue: issue.currentValue ?? initial.records.find((record) => record.id === issue.recordId)!.fields[issue.field!],
      newValue: issue.suggestedFix!,
      ruleId: issue.ruleId,
      appliedAt: 0,
    }));
    const fixedXml = applyValidationFixes(xml, fixes);

    expect(fixedXml).toContain('<ns1:ContactPhone type="WORK">519-824-1000x10</ns1:ContactPhone>');
    expect(fixedXml).toContain('<ns1:Phone type="HOME">519-824-2000x20</ns1:Phone>');
    expect(fixedXml).toContain('<ns1:Phone type="MOBILE">519-824-3000x30</ns1:Phone>');
    expect(fixedXml).toContain('<ns1:Phone type="MOBILE">519-824-4000x40</ns1:Phone>');
    expect(validateXml(fixedXml).issues.filter((issue) => issue.ruleId.startsWith("PHONE_EXTENSION"))).toEqual([]);
  });

  it("reports configured placeholders after structural checks", () => {
    const issues = phoneIssues(["519-000-0000"]);
    expect(issues.map((issue) => issue.ruleId)).toEqual([
      "PHONE_NXX_STRUCTURE",
      "PHONE_PLACEHOLDER",
    ]);
    expect(issues.some((issue) => issue.ruleId === "PHONE_CANADIAN_AREA_CODE")).toBe(false);
  });

  it.each([
    ["off", 0],
    ["info", 1],
    ["warning", 1],
  ] as const)("honors Canadian geographic NPA policy level %s", (level, expectedCount) => {
    const rules = structuredClone(defaultRules);
    rules.phoneConfig.canadianAreaCodeCheck = level;
    const result = validateXml(stixWithPhones(["212-555-1234"]), rules);
    const issues = result.issues.filter((issue) => issue.ruleId === "PHONE_CANADIAN_AREA_CODE");

    expect(issues).toHaveLength(expectedCount);
    if (expectedCount) {
      expect(issues[0]).toMatchObject({ severity: level, autoFixable: false });
      expect(issues[0].suggestedFix).toBeUndefined();
    }
    expect(result.gate).toBe("READY");
  });

  it("retains the previous off behavior when a legacy ruleset omits the policy setting", () => {
    const legacyRules = structuredClone(defaultRules);
    delete legacyRules.phoneConfig.canadianAreaCodeCheck;
    const result = validateXml(stixWithPhones(["212-555-1234"]), legacyRules);

    expect(result.issues.filter((issue) => issue.field === "Phone")).toEqual([]);
    expect(result.gate).toBe("READY");
  });

  it("distinguishes active Canadian geographic NPAs from future and non-geographic resources", () => {
    const result = validateXml(stixWithPhones([
      "519-824-1234",
      "257-555-1234",
      "851-555-1234",
      "273-555-1234",
      "600-555-1234",
    ]));
    const issues = result.issues.filter((issue) => issue.ruleId === "PHONE_CANADIAN_AREA_CODE");

    expect(issues).toHaveLength(3);
    expect(issues.map((issue) => issue.message.slice(10, 13))).toEqual(["851", "273", "600"]);
    expect(issues.every((issue) => issue.severity === "warning")).toBe(true);
    expect(result.gate).toBe("READY");
  });

  it("does not emit Canadian policy findings for structurally invalid NANP numbers", () => {
    const issues = phoneIssues(["119-824-1234", "519-124-1234", "212-555-123"]);
    expect(issues.some((issue) => issue.ruleId === "PHONE_CANADIAN_AREA_CODE")).toBe(false);
  });

  it("preserves representative phone cases in the canonical test and demo fixture", () => {
    const fixtureUrl = new URL("../public/samples/stix-validation-demo.stix", import.meta.url);
    const result = validateXml(readFileSync(fixtureUrl, "utf8"));
    const issues = result.issues.filter((issue) => issue.field?.includes("Phone"));

    expect(result.studentCount).toBe(17);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_FORMAT")).toHaveLength(5);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_EXTENSION_NORMALIZE")).toHaveLength(5);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_EXTENSION_FORMAT")).toHaveLength(3);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_NPA_STRUCTURE")).toHaveLength(2);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_NXX_STRUCTURE")).toHaveLength(2);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_PLACEHOLDER")).toHaveLength(1);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_CANADIAN_AREA_CODE")).toHaveLength(3);
    expect(new Set(issues.map((issue) => issue.field))).toEqual(new Set([
      "MetadataContactPhone",
      "Phone",
      "GuardianPhoneNumber",
      "Guardian2PhoneNumber",
    ]));
  });
});
