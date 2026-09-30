import { describe, expect, it } from "vitest";
import { defaultRules } from "../lib/rulesets";
import { fieldValueMeetsRules } from "../lib/validator";

describe("field value status", () => {
  it("uses the same canonical phone requirements as validation", () => {
    expect(fieldValueMeetsRules("GuardianPhoneNumber", "204-555-0100", defaultRules)).toBe(true);
    expect(fieldValueMeetsRules("GuardianPhoneNumber", "204-555-0100x", defaultRules)).toBe(false);
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

  it("requires Canada Post format for a populated rural route", () => {
    expect(fieldValueMeetsRules("RuralRoute", "", defaultRules)).toBe(true);
    expect(fieldValueMeetsRules("RuralRoute", "RR 7", defaultRules)).toBe(true);
    expect(fieldValueMeetsRules("RuralRoute", "RR 07", defaultRules)).toBe(true);
    expect(fieldValueMeetsRules("RuralRoute", "RR 9999", defaultRules)).toBe(true);
    for (const value of ["RR7", "rr 7", "R.R. 7", "RR #7", "Rural Route 7", "RR 7 STN A", "RR 10000"]) {
      expect(fieldValueMeetsRules("RuralRoute", value, defaultRules), value).toBe(false);
    }
  });

  it("requires only digits in a populated PO box number", () => {
    for (const value of ["", "42", "0042"]) {
      expect(fieldValueMeetsRules("PoBoxNumber", value, defaultRules), value).toBe(true);
    }
    for (const value of ["PO Box 42", "P.O. Box 42", "#42", "42A", "4_2", "4 2", " 42 "]) {
      expect(fieldValueMeetsRules("PoBoxNumber", value, defaultRules), value).toBe(false);
    }
  });
});
