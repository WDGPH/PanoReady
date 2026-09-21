import { describe, expect, it } from "vitest";
import defaultRulesJson from "../config/rules.stix.default.json";
import { parseSTIXXml, applyValidationFixes, validateXml } from "../lib/validator";
import { validateRulesetSchema } from "../lib/rulesets";
import type { AppliedFix, CustomRuleset, RulesProfile } from "../lib/types";

function xml(firstName: string, city: string, schoolName: string): string {
  return `<?xml version="1.0"?>
<SchoolUpload xmlns="http://ontario.ca">
  <Metadata>
    <CreateDate>2026-09-01</CreateDate><CreateTime>12:00:00</CreateTime>
    <CreatedBy>Analyst</CreatedBy><ContactPhone type="WORK">519-555-1234</ContactPhone>
    <ContactEmail>analyst@example.ca</ContactEmail><FullUpload>YES</FullUpload>
  </Metadata>
  <School>
    <SchoolNumber>001</SchoolNumber><Name>${schoolName}</Name>
    <Students><Student>
      <Name><First>${firstName}</First><Last>Example</Last></Name>
      <Gender>F</Gender><BirthDate>2015-04-12</BirthDate>
      <Address><City>${city}</City></Address>
    </Student></Students>
  </School>
</SchoolUpload>`;
}

const characterRuleIds = new Set([
  "FREE_TEXT_APOSTROPHE",
  "FREE_TEXT_QUOTATION",
  "FREE_TEXT_ACCENT",
  "FREE_TEXT_SPECIAL_CHARACTER",
]);

describe("free-text character validation", () => {
  it("creates separate info findings per category and field with composed auto-fixes", () => {
    const source = xml("O'“Renée@-2", "éèàùäöü", "St. Mary's &amp; “Academy”.");
    const result = validateXml(source);
    const findings = result.issues.filter((issue) => characterRuleIds.has(issue.ruleId));

    expect(findings.map((issue) => [issue.field, issue.ruleId])).toEqual([
      ["SchoolName", "FREE_TEXT_QUOTATION"],
      ["FirstName", "FREE_TEXT_APOSTROPHE"],
      ["FirstName", "FREE_TEXT_QUOTATION"],
      ["FirstName", "FREE_TEXT_ACCENT"],
      ["FirstName", "FREE_TEXT_SPECIAL_CHARACTER"],
      ["City", "FREE_TEXT_ACCENT"],
    ]);
    expect(findings.filter((issue) => issue.field === "FirstName").map((issue) => issue.suggestedFix))
      .toEqual(Array(4).fill("ORenee-2"));
    expect(findings.find((issue) => issue.field === "City")?.suggestedFix).toBe("eeauaou");
    expect(findings.find((issue) => issue.field === "SchoolName")?.suggestedFix).toBe("St. Mary's & Academy.");
    expect(findings.every((issue) => issue.severity === "info" && issue.autoFixable)).toBe(true);
    expect(result.gate).toBe("READY");
  });

  it("applies student and school suggestions and clears every character finding", () => {
    const source = xml("O'“Renée@-2", "Guelph", "St. Mary's &amp; “Academy”.");
    const result = validateXml(source);
    const fixes: AppliedFix[] = result.issues
      .filter((issue) => characterRuleIds.has(issue.ruleId))
      .map((issue, index) => ({
        issueId: issue.id,
        recordId: issue.recordId!,
        field: issue.field!,
        oldValue: issue.currentValue!,
        newValue: issue.suggestedFix!,
        ruleId: issue.ruleId,
        appliedAt: index,
      }));

    const fixed = applyValidationFixes(source, fixes);
    expect(validateXml(fixed).issues.filter((issue) => characterRuleIds.has(issue.ruleId))).toEqual([]);
    expect(parseSTIXXml(fixed)[0].fields).toMatchObject({
      FirstName: "ORenee-2",
      SchoolName: "St. Mary's & Academy.",
    });
  });

  it("allows each category to be enabled independently for each field", () => {
    const rules = structuredClone(defaultRulesJson) as RulesProfile;
    expect(validateXml(xml("Ada", "Guelph", "King's Academy"), rules).issues)
      .not.toContainEqual(expect.objectContaining({ ruleId: "FREE_TEXT_APOSTROPHE", field: "SchoolName" }));

    rules.freeTextCharacterChecks = {
      ...rules.freeTextCharacterChecks,
      apostrophe: [...(rules.freeTextCharacterChecks?.apostrophe ?? []), "SchoolName"],
      quotation: (rules.freeTextCharacterChecks?.quotation ?? []).filter((field) => field !== "FirstName"),
    };
    const findings = validateXml(xml('“Ada”', "Guelph", "King's Academy"), rules).issues;
    expect(findings).toContainEqual(expect.objectContaining({
      ruleId: "FREE_TEXT_APOSTROPHE", field: "SchoolName", suggestedFix: "Kings Academy",
    }));
    expect(findings).not.toContainEqual(expect.objectContaining({
      ruleId: "FREE_TEXT_QUOTATION", field: "FirstName",
    }));
  });

  it("preserves balanced parenthetical aliases as a protected value", () => {
    const findings = validateXml(xml("Anne@ (O'“Renée@”)", "Guelph", "Example School")).issues
      .filter((issue) => characterRuleIds.has(issue.ruleId) && issue.field === "FirstName");

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: "FREE_TEXT_SPECIAL_CHARACTER",
        suggestedFix: "Anne (O'“Renée@”)",
      }),
    ]);
  });

  it("allows periods and slashes only in street-address fields", () => {
    const source = xml("Ada", "Guelph/Eramosa.", "Example School").replace(
      "<Address><City>",
      "<Address><Unit>4/5</Unit><StreetNumber>12.5</StreetNumber><StreetNumberSuffix>A/.</StreetNumberSuffix><StreetName>Main St./West</StreetName><City>",
    );
    const findings = validateXml(source).issues
      .filter((issue) => characterRuleIds.has(issue.ruleId));

    expect(findings).toEqual([
      expect.objectContaining({
        ruleId: "FREE_TEXT_SPECIAL_CHARACTER",
        field: "City",
        suggestedFix: "Guelph/Eramosa",
      }),
    ]);
  });

  it("defers to a specialized finding on the same field", () => {
    const source = xml("Ada", "Guelph", "Example School")
      .replace("<Address><City>", "<Address><StreetName>P.O. Box 42</StreetName><City>");
    const findings = validateXml(source).issues;

    expect(findings).toContainEqual(expect.objectContaining({
      ruleId: "ALTERNATE_DELIVERY_IN_STREET_FIELD", field: "StreetName",
    }));
    expect(findings).not.toContainEqual(expect.objectContaining({
      ruleId: "FREE_TEXT_SPECIAL_CHARACTER", field: "StreetName",
    }));
  });

  it("accepts legacy profiles and validates configured field arrays", () => {
    const rules = structuredClone(defaultRulesJson) as RulesProfile;
    delete rules.freeTextCharacterChecks;
    delete rules.freeTextAllowedCharacters;
    const profile: CustomRuleset = {
      id: "legacy", name: "Legacy", createdAt: "2026-09-01T00:00:00.000Z", rules,
    };
    expect(validateRulesetSchema(profile).rules.freeTextCharacterChecks).toBeUndefined();
    expect(validateRulesetSchema(profile).rules.freeTextAllowedCharacters).toBeUndefined();

    const invalid = structuredClone(defaultRulesJson) as unknown as Record<string, unknown>;
    (invalid.freeTextCharacterChecks as Record<string, unknown>).accent = "City";
    expect(() => validateRulesetSchema({ ...profile, rules: invalid } as unknown as CustomRuleset))
      .toThrow("'rules.freeTextCharacterChecks.accent' must be an array of strings.");

    const invalidAllowed = structuredClone(defaultRulesJson) as unknown as Record<string, unknown>;
    (invalidAllowed.freeTextAllowedCharacters as Record<string, unknown>).SchoolName = [];
    expect(() => validateRulesetSchema({ ...profile, rules: invalidAllowed } as unknown as CustomRuleset))
      .toThrow("'freeTextAllowedCharacters.SchoolName' must be a string, got object.");
  });
});
