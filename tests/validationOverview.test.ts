import { describe, expect, it } from "vitest";
import type { ValidationIssue, ValidationResult } from "../lib/types";
import { matchesReviewFilter, percentage, summarizeValidation, issueTypeLabel, severityLabel, isExcludedFromReview } from "../workflows/stix/validation/overview";

const finding = (id: string, recordId?: string): ValidationIssue => ({ id, recordId, ruleId: "FIELD_LENGTH", field: "Unit", message: "PRIVATE source value", severity: "error", autoFixable: true });
const result: ValidationResult = {
  schoolCount: 3, studentCount: 3, gate: "BLOCKED",
  records: [
    { id: "a", xmlPath: "", fields: { SchoolNumber: "001", SchoolName: "First" } },
    { id: "b", xmlPath: "", fields: { SchoolNumber: "001", SchoolName: "First" } },
    { id: "c", xmlPath: "", fields: { SchoolNumber: "002", SchoolName: "Second" } },
  ],
  issues: [finding("1", "a"), finding("2", "a"), { ...finding("3", "c"), severity: "warning", autoFixable: false }, { ...finding("4"), ruleId: "METADATA_REQUIRED", field: "CreatedBy", autoFixable: false }],
};

describe("validation overview", () => {
  it("excludes matching schools or issue types without changing validation results", () => {
    const before = JSON.stringify(result);
    expect(isExcludedFromReview(result.issues[0], [{ schoolNumber: "001" }], "001")).toBe(true);
    expect(isExcludedFromReview(result.issues[0], [{ schoolNumber: "002" }], "001")).toBe(false);
    expect(isExcludedFromReview(result.issues[0], [{ ruleId: "FIELD_LENGTH", field: "Unit" }])).toBe(true);
    expect(isExcludedFromReview(result.issues[0], [{ ruleId: "FIELD_LENGTH", field: "City" }])).toBe(false);
    expect(isExcludedFromReview(result.issues[0], [])).toBe(false);
    expect(isExcludedFromReview(result.issues[3], [{ schoolNumber: "" }])).toBe(true);
    expect(JSON.stringify(result)).toBe(before);
    expect(summarizeValidation(result).errors).toBe(3);
  });
  it("labels uniform severity and counts mixed severities within an issue type", () => {
    const mixed = summarizeValidation(result).types.find(row => row.ruleId === "FIELD_LENGTH")!;
    expect(severityLabel(mixed)).toBe("2 errors · 1 warning");
    expect(severityLabel({ errors: 2, warnings: 0, info: 0 })).toBe("Error");
    expect(severityLabel({ errors: 0, warnings: 2, info: 0 })).toBe("Warning");
    expect(severityLabel({ errors: 0, warnings: 0, info: 2 })).toBe("Info");
    const info = summarizeValidation({ ...result, issues: [...result.issues, { ...finding("info"), severity: "info" }] }).types.find(row => row.ruleId === "FIELD_LENGTH")!;
    expect(severityLabel(info)).toBe("2 errors · 1 warning · 1 info");
  });
  it("deduplicates affected students and keeps file-level issues out of student denominators", () => {
    const summary = summarizeValidation(result, [{ schoolNumber: "003", name: "Empty school" }]);
    expect(summary).toMatchObject({ students: 3, affected: 2, total: 4, errors: 3, warnings: 1, automatic: 2 });
    expect(summary.schools.find(row => row.schoolNumber === "001")).toMatchObject({ students: 2, affected: 1, total: 2 });
    expect(summary.schools.find(row => row.schoolNumber === "")).toMatchObject({ students: 0, affected: 0, total: 1 });
    expect(summary.schools.find(row => row.schoolNumber === "003")).toMatchObject({ students: 0, total: 0 });
    expect(summary.types.find(row => row.ruleId === "FIELD_LENGTH")).toMatchObject({ affected: 2, total: 3 });
    expect(JSON.stringify(summary)).not.toContain("PRIVATE");
    expect(percentage(2, 4)).toBe("50.0%");
    expect(percentage(0, 0)).toBe("—");
  });
  it("matches drill-downs by school, type and severity without leaking other issues", () => {
    expect(matchesReviewFilter(result.issues[0], { schoolNumber: "001" }, "001")).toBe(true);
    expect(matchesReviewFilter(result.issues[0], { schoolNumber: "002" }, "001")).toBe(false);
    expect(matchesReviewFilter(result.issues[0], { ruleId: "FIELD_LENGTH", field: "PostalCode" })).toBe(false);
    expect(matchesReviewFilter(result.issues[2], { severity: "error" })).toBe(false);
    expect(matchesReviewFilter(result.issues[3], { schoolNumber: "" })).toBe(true);
    expect(issueTypeLabel("FIELD_LENGTH", "Unit")).toBe("Value too long · Unit");
    expect(issueTypeLabel("RURAL_ROUTE_IN_STREET_FIELD", "StreetNumber")).toBe("Rural route in street field · Street Number");
  });
  it.each([["safe", 1], ["review", 0], ["manual", 0]] as const)("counts only safe address proposals as automatic corrections (%s)", (confidence, expected) => {
    const issue = { ...finding("repair", "a"), repairProposal: { kind: "address" as const, id: "repair", confidence, title: "Repair", explanation: "", changes: [{ field: "Unit", currentValue: "old", proposedValue: "new" }] } };
    expect(summarizeValidation({ ...result, issues: [issue] }).automatic).toBe(expected);
  });
});
