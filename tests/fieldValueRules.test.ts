import { describe, expect, it } from "vitest";
import { defaultRules } from "../lib/rulesets";
import { fieldValueMeetsRules } from "../lib/validator";

describe("field value status", () => {
  it("uses the same canonical phone requirements as validation", () => {
    expect(fieldValueMeetsRules("GuardianPhoneNumber", "416-555-1111", defaultRules)).toBe(true);
    expect(fieldValueMeetsRules("GuardianPhoneNumber", "416-555-1111x", defaultRules)).toBe(false);
    expect(fieldValueMeetsRules("GuardianPhoneNumber", "519-000-0000", defaultRules)).toBe(false);
  });

  it("checks configured lengths and allowed values", () => {
    expect(fieldValueMeetsRules("StreetNumber", "123456", defaultRules)).toBe(true);
    expect(fieldValueMeetsRules("StreetNumber", "1234567", defaultRules)).toBe(false);
    expect(fieldValueMeetsRules("Province", "ON", defaultRules)).toBe(true);
    expect(fieldValueMeetsRules("Province", "ZZ", defaultRules)).toBe(false);
  });

  it("distinguishes optional and required empty fields", () => {
    expect(fieldValueMeetsRules("City", "", defaultRules)).toBe(true);
    expect(fieldValueMeetsRules("FirstName", "", defaultRules)).toBe(false);
  });
});
