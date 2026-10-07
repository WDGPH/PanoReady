import { expect, it } from "vitest";
import { issueDescription } from "../lib/issueDescription";
import { addressRepairIssueText, addressRepairStepTitle } from "../workflows/stix/validation/addressRepairCopy";

it("keeps known and future issue descriptions independent of record data", () => {
  for (const ruleId of ["BIRTHDATE_FORMAT", "OEN_DUPLICATE", "OEN_DUAL_ENROLLMENT", "NAME_DOB_DUPLICATE", "EMPTY_STUDENTS", "GENDER_ALLOWED_VALUE", "FUTURE_RULE"]) {
    const first = { ruleId, field: "FirstName", message: "Private student A, school A, value A", currentValue: "A" };
    const second = { ...first, message: "Private student B, school B, value B", currentValue: "B" };
    expect(issueDescription(first)).toBe(issueDescription(second));
    expect(issueDescription(first)).not.toMatch(/Private|value A|school A/);
  }
});

it("does not fall back to a future address rule's value-bearing explanation", () => {
  const step = { ruleId: "FUTURE_RULE", field: "StreetName", severity: "warning" as const,
    explanation: "Private street value", changes: [] };
  expect(addressRepairIssueText(step)).toBe("Street name needs review.");
  expect(addressRepairStepTitle(step)).not.toContain(step.explanation);
});
