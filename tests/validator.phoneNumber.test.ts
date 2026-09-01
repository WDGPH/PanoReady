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
      <ns1:Gender>X</ns1:Gender>
      <ns1:BirthDate>2015-02-${String(index + 1).padStart(2, "0")}</ns1:BirthDate>
      <ns1:ContactPhone>${phone}</ns1:ContactPhone>
    </ns1:Student>`).join("");

  return `<?xml version="1.0" encoding="utf-8"?>
    <ns1:SchoolUpload xmlns:ns1="http://ontario.ca">
      <ns1:School>
        <ns1:SchoolNumber>123456</ns1:SchoolNumber>
        <ns1:Name>Synthetic Phone School</ns1:Name>
        <ns1:Students>${students}</ns1:Students>
      </ns1:School>
    </ns1:SchoolUpload>`;
}

function phoneIssues(phones: string[], rules: RulesProfile = defaultRules) {
  return validateXml(stixWithPhones(phones), rules).issues.filter(
    (issue) => issue.field === "ContactPhone"
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
      "519-824-1234 ext 2",
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
    expect(validateXml(fixedXml).issues.filter((issue) => issue.field === "ContactPhone")).toEqual([]);
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

    expect(result.issues.filter((issue) => issue.field === "ContactPhone")).toEqual([]);
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

  it("keeps the synthetic UI demonstration fixture representative", () => {
    const fixtureUrl = new URL(
      "../public/samples/phone-number-validation-demo.stix",
      import.meta.url
    );
    const result = validateXml(readFileSync(fixtureUrl, "utf8"));
    const issues = result.issues.filter((issue) => issue.field === "ContactPhone");

    expect(result.studentCount).toBe(16);
    expect(issues).toHaveLength(15);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_FORMAT")).toHaveLength(6);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_NPA_STRUCTURE")).toHaveLength(2);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_NXX_STRUCTURE")).toHaveLength(3);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_CANADIAN_AREA_CODE")).toHaveLength(3);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_PLACEHOLDER")).toHaveLength(1);
  });

  it("preserves representative phone cases in the general validation fixture", () => {
    const fixtureUrl = new URL("../test_stix_validation.xml", import.meta.url);
    const result = validateXml(readFileSync(fixtureUrl, "utf8"));
    const issues = result.issues.filter((issue) => issue.field === "ContactPhone");

    expect(result.studentCount).toBe(13);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_FORMAT")).toHaveLength(6);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_NPA_STRUCTURE")).toHaveLength(1);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_NXX_STRUCTURE")).toHaveLength(2);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_PLACEHOLDER")).toHaveLength(1);
    expect(issues.filter((issue) => issue.ruleId === "PHONE_CANADIAN_AREA_CODE")).toHaveLength(2);
  });
});
