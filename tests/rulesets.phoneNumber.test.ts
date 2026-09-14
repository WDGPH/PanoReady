import { describe, expect, it } from "vitest";
import defaultRulesJson from "../config/rules.stix.default.json";
import type { CustomRuleset, RulesProfile } from "../lib/types";
import { importRulesetFromJson, validateRulesetSchema } from "../lib/rulesets";

function customRuleset(rules: RulesProfile): CustomRuleset {
  return {
    id: "synthetic-phone-rules",
    name: "Synthetic phone rules",
    createdAt: "2026-09-01T00:00:00.000Z",
    rules,
  };
}

describe("phone ruleset schema", () => {
  it("accepts the fixed baseline policy level", () => {
    const rules = structuredClone(defaultRulesJson) as RulesProfile;
    expect(validateRulesetSchema(customRuleset(rules)).rules.phoneConfig.canadianAreaCodeCheck).toBe("warning");
  });

  it("rejects a profile missing the fixed policy level", () => {
    const rules = structuredClone(defaultRulesJson) as RulesProfile;
    delete (rules.phoneConfig as Partial<RulesProfile["phoneConfig"]>).canadianAreaCodeCheck;
    expect(() => importRulesetFromJson(JSON.stringify(customRuleset(rules)))).toThrow(/canadianAreaCodeCheck/);
  });

  it("rejects unsupported policy values", () => {
    const rules = structuredClone(defaultRulesJson) as unknown as RulesProfile;
    (rules.phoneConfig as { canadianAreaCodeCheck: string }).canadianAreaCodeCheck = "error";
    expect(() => validateRulesetSchema(customRuleset(rules))).toThrow(
      "'rules.phoneConfig.canadianAreaCodeCheck' must be 'off', 'info', or 'warning'."
    );
  });

  it.each([
    ["required field", (rules: RulesProfile) => { rules.requiredFields = rules.requiredFields.filter((field) => field !== "BirthDate"); }],
    ["controlled value", (rules: RulesProfile) => { rules.allowedGenderValues.push("UNSUPPORTED"); }],
    ["length limit", (rules: RulesProfile) => { rules.fieldLengths.FirstName = 500; }],
    ["duplicate check", (rules: RulesProfile) => { rules.duplicateDetection.checkOen = false; }],
  ] as const)("rejects a profile that relaxes the baseline %s", (_label, mutate) => {
    const rules = structuredClone(defaultRulesJson) as RulesProfile;
    mutate(rules);
    expect(() => validateRulesetSchema(customRuleset(rules))).toThrow(/Custom profiles cannot/);
  });

  it("accepts additional local restrictions", () => {
    const rules = structuredClone(defaultRulesJson) as RulesProfile;
    rules.requiredFields.push("City");
    rules.allowedGenderValues = ["F", "M"];
    rules.fieldLengths.FirstName = 40;
    expect(validateRulesetSchema(customRuleset(rules)).rules.requiredFields).toContain("City");
  });
});
