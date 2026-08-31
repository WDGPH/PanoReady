import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import defaultRulesJson from "../config/rules.stix.default.json";
import type { AppliedFix, RulesProfile } from "../lib/types";
import { applyValidationFixes, validateXml } from "../lib/validator";

const defaultRules = defaultRulesJson as RulesProfile;

function stixWithPostalCodes(postalCodes: string[]): string {
  const students = postalCodes
    .map(
      (postalCode, index) => `
      <ns1:Student>
        <ns1:OEN>${String(100000000 + index)}</ns1:OEN>
        <ns1:Grade>GR5</ns1:Grade>
        <ns1:Name><ns1:First>Postal${index}</ns1:First><ns1:Last>Tester</ns1:Last></ns1:Name>
        <ns1:Gender>X</ns1:Gender>
        <ns1:BirthDate>2015-01-${String(index + 1).padStart(2, "0")}</ns1:BirthDate>
        <ns1:Address>
          <ns1:City>Guelph</ns1:City><ns1:Province>ON</ns1:Province>
          <ns1:PostalCode>${postalCode}</ns1:PostalCode>
        </ns1:Address>
      </ns1:Student>`
    )
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
  <ns1:SchoolUpload xmlns:ns1="http://ontario.ca">
    <ns1:School>
      <ns1:SchoolNumber>123456</ns1:SchoolNumber><ns1:Name>Synthetic School</ns1:Name>
      <ns1:Students>${students}</ns1:Students>
    </ns1:School>
  </ns1:SchoolUpload>`;
}

describe("postal-code validator integration", () => {
  it("creates dedicated normalization and repair fixes without generic duplicates", () => {
    const xml = stixWithPostalCodes(["N1G2W1", " n1g / 2w1 ", "NIG/2WI", "Z1G2W1"]);
    const result = validateXml(xml);
    const postalIssues = result.issues.filter((issue) => issue.field === "PostalCode");

    expect(postalIssues).toHaveLength(3);
    expect(postalIssues.map((issue) => ({
      ruleId: issue.ruleId,
      severity: issue.severity,
      suggestedFix: issue.suggestedFix,
      autoFixable: issue.autoFixable,
    }))).toEqual([
      { ruleId: "POSTAL_CODE_NORMALIZE", severity: "info", suggestedFix: "N1G2W1", autoFixable: true },
      { ruleId: "POSTAL_CODE_REPAIR", severity: "warning", suggestedFix: "N1G2W1", autoFixable: true },
      { ruleId: "POSTAL_CODE_FORMAT", severity: "warning", suggestedFix: undefined, autoFixable: false },
    ]);
    expect(result.issues.some((issue) =>
      issue.field === "PostalCode" && ["WHITESPACE_TRIM", "FIELD_LENGTH"].includes(issue.ruleId)
    )).toBe(false);
  });

  it("applies suggested fixes through AppliedFix and clears them on revalidation", () => {
    const xml = stixWithPostalCodes(["N1G 2W1", "NLG2W1"]);
    const initial = validateXml(xml);
    const fixes: AppliedFix[] = initial.issues.map((issue) => ({
      issueId: issue.id,
      recordId: issue.recordId!,
      field: issue.field!,
      oldValue: initial.records.find((record) => record.id === issue.recordId)!.fields[issue.field!],
      newValue: issue.suggestedFix!,
      ruleId: issue.ruleId,
      appliedAt: 0,
    }));

    const fixedXml = applyValidationFixes(xml, fixes);
    expect(fixedXml.match(/<ns1:PostalCode>N1G2W1<\/ns1:PostalCode>/g)).toHaveLength(2);
    expect(validateXml(fixedXml).issues.filter((issue) => issue.field === "PostalCode")).toEqual([]);
  });

  it("never suggests truncation or stitching for long invalid punctuation", () => {
    const result = validateXml(stixWithPostalCodes(["N1G!!!2W1", "N1G2W11"]));
    const postalIssues = result.issues.filter((issue) => issue.field === "PostalCode");

    expect(postalIssues).toHaveLength(2);
    expect(postalIssues.every((issue) =>
      issue.ruleId === "POSTAL_CODE_FORMAT" && !issue.autoFixable && issue.suggestedFix === undefined
    )).toBe(true);
  });

  it("continues to honor a customized postalCodePattern", () => {
    const customRules = structuredClone(defaultRules);
    customRules.postalCodePattern = "^[A-Za-z]\\d[A-Za-z]\\s?\\d[A-Za-z]\\d$";

    const result = validateXml(stixWithPostalCodes(["D1D 1D1"]), customRules);
    expect(result.issues.filter((issue) => issue.field === "PostalCode")).toEqual([]);
  });

  it("keeps the synthetic UI demonstration fixture valid and representative", () => {
    const fixtureUrl = new URL(
      "../public/samples/postal-code-validation-demo.stix",
      import.meta.url
    );
    const result = validateXml(readFileSync(fixtureUrl, "utf8"));
    const postalIssues = result.issues.filter((issue) => issue.field === "PostalCode");

    expect(result.studentCount).toBe(15);
    expect(postalIssues).toHaveLength(14);
    expect(postalIssues.filter((issue) => issue.ruleId === "POSTAL_CODE_NORMALIZE")).toHaveLength(5);
    expect(postalIssues.filter((issue) => issue.ruleId === "POSTAL_CODE_REPAIR")).toHaveLength(3);
    expect(postalIssues.filter((issue) => issue.ruleId === "POSTAL_CODE_FORMAT")).toHaveLength(6);
    expect(result.issues.some((issue) =>
      issue.field === "PostalCode" && ["WHITESPACE_TRIM", "FIELD_LENGTH"].includes(issue.ruleId)
    )).toBe(false);
  });

  it("preserves the postal-code cases in the general validation fixture", () => {
    const fixtureUrl = new URL("../test_stix_validation.xml", import.meta.url);
    const result = validateXml(readFileSync(fixtureUrl, "utf8"));
    const postalIssues = result.issues.filter((issue) => issue.field === "PostalCode");

    expect(result.studentCount).toBe(13);
    expect(postalIssues).toHaveLength(10);
    expect(postalIssues.filter((issue) => issue.ruleId === "POSTAL_CODE_NORMALIZE")).toHaveLength(3);
    expect(postalIssues.filter((issue) => issue.ruleId === "POSTAL_CODE_REPAIR")).toHaveLength(3);
    expect(postalIssues.filter((issue) => issue.ruleId === "POSTAL_CODE_FORMAT")).toHaveLength(4);
    expect(postalIssues.filter((issue) => issue.autoFixable)).toHaveLength(6);
    expect(postalIssues.find((issue) => issue.studentName === "Indiana Jones")?.suggestedFix).toBe("N1G2W1");
    expect(postalIssues.find((issue) => issue.studentName === "Lara Croft")?.suggestedFix).toBe("N1G2W1");
    expect(postalIssues.find((issue) => issue.studentName === "Oscar Grouch")?.suggestedFix).toBe("N0G2W1");
  });
});
