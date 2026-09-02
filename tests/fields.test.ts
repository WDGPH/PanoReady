import { describe, expect, it } from "vitest";
import defaultRulesJson from "../config/rules.stix.default.json";
import { flattenCanonicalStudent, type CanonicalSchool, type CanonicalStudent } from "../lib/canonical";
import { REQUIRED_FIELDS } from "../lib/fields";
import type { RulesProfile } from "../lib/types";
import { validateXml } from "../lib/validator";

const defaultRules = defaultRulesJson as RulesProfile;

const emptyStudent: CanonicalStudent = {
  recordId: "school0:student0",
  oen: "",
  grade: "",
  className: "",
  name: { first: "", middle: "", last: "" },
  aliasName: null,
  gender: "",
  birthDate: "",
  language: "",
  countryOfOrigin: "",
  guardians: [],
  address: {
    unit: "", streetNumber: "", streetNumberSuffix: "", streetName: "",
    streetType: "", streetDirection: "", ruralRoute: "", poBoxNumber: "",
    city: "", province: "", postalCode: "",
  },
  phone: null,
};

const emptySchool: CanonicalSchool = {
  schoolId: "school0",
  schoolNumber: "",
  name: "",
  students: [emptyStudent],
};

const minimalXml = `<?xml version="1.0"?>
  <SchoolUpload xmlns="http://ontario.ca">
    <School><Students><Student><Name></Name><Address></Address></Student></Students></School>
  </SchoolUpload>`;

describe("canonical required-field catalog", () => {
  it("contains every field exposed by the flattened validation model", () => {
    expect([...REQUIRED_FIELDS].sort()).toEqual(
      Object.keys(flattenCanonicalStudent(emptyStudent, emptySchool)).sort(),
    );
    expect(new Set(REQUIRED_FIELDS).size).toBe(REQUIRED_FIELDS.length);
  });

  it("enforces student, nested guardian, phone, and school selections", () => {
    const rules: RulesProfile = {
      ...structuredClone(defaultRules),
      requiredFields: ["Phone", "PhoneType", "GuardianPhoneNumber", "Guardian2PhoneNumber", "SchoolName"],
    };
    const requiredIssues = validateXml(minimalXml, rules).issues.filter(
      (finding) => finding.ruleId === "REQUIRED_FIELD",
    );

    expect(requiredIssues.map((finding) => finding.field).sort()).toEqual(
      ["Guardian2PhoneNumber", "GuardianPhoneNumber", "Phone", "PhoneType", "SchoolName"].sort(),
    );
  });

  it("allows SchoolNumber to be optional when a custom ruleset deselects it", () => {
    const rules: RulesProfile = { ...structuredClone(defaultRules), requiredFields: [] };
    const result = validateXml(minimalXml, rules);

    expect(result.issues.some((finding) =>
      finding.field === "SchoolNumber" && ["REQUIRED_FIELD", "SCHOOL_NUMBER_REQUIRED"].includes(finding.ruleId)
    )).toBe(false);
  });
});
