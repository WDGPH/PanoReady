import { describe, expect, it } from "vitest";
import defaultRulesJson from "../config/rules.stix.default.json";
import type { CustomRuleset, RulesProfile } from "../lib/types";
import { validateRulesetSchema } from "../lib/rulesets";

function customRuleset(rules: RulesProfile): CustomRuleset {
  return {
    id: "synthetic-phone-rules",
    name: "Synthetic phone rules",
    createdAt: "2026-09-01T00:00:00.000Z",
    rules,
  };
}

describe("phone ruleset schema", () => {
  it.each(["off", "info", "warning"] as const)("accepts policy level %s", (level) => {
    const rules = structuredClone(defaultRulesJson) as RulesProfile;
    rules.phoneConfig.canadianAreaCodeCheck = level;
    expect(validateRulesetSchema(customRuleset(rules)).rules.phoneConfig.canadianAreaCodeCheck).toBe(level);
  });

  it("accepts a legacy custom ruleset without the policy property", () => {
    const rules = structuredClone(defaultRulesJson) as RulesProfile;
    delete rules.phoneConfig.canadianAreaCodeCheck;
    expect(validateRulesetSchema(customRuleset(rules)).rules.phoneConfig).toEqual({
      placeholderNumbers: ["519-000-0000", "000-000-0000"],
    });
  });

  it("rejects unsupported policy values", () => {
    const rules = structuredClone(defaultRulesJson) as unknown as RulesProfile;
    (rules.phoneConfig as { canadianAreaCodeCheck: string }).canadianAreaCodeCheck = "error";
    expect(() => validateRulesetSchema(customRuleset(rules))).toThrow(
      "'rules.phoneConfig.canadianAreaCodeCheck' must be 'off', 'info', or 'warning'."
    );
  });
});
