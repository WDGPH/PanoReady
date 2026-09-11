import type { ValidationIssue, ValidationResult, ValidationSeverity } from "@/lib/types";

export type ReviewFilter = { schoolNumber?: string; ruleId?: string; field?: string; severity?: ValidationSeverity };
export type ReviewExclusion = { schoolNumber: string } | { ruleId: string; field: string };

export function isExcludedFromReview(issue: ValidationIssue, exclusions: ReviewExclusion[], schoolNumber = issue.schoolNumber ?? "") {
  return exclusions.some(exclusion => matchesReviewFilter(issue, exclusion, schoolNumber));
}

export function matchesReviewFilter(issue: ValidationIssue, filter: ReviewFilter, schoolNumber = issue.schoolNumber ?? "") {
  return (filter.schoolNumber === undefined || schoolNumber === filter.schoolNumber)
    && (filter.ruleId === undefined || issue.ruleId === filter.ruleId)
    && (filter.field === undefined || (issue.field ?? "") === filter.field)
    && (filter.severity === undefined || issue.severity === filter.severity);
}

const labels: Record<string, string> = {
  EMPTY_GUARDIAN: "Empty Guardian placeholder", GUARDIAN_RELATIONSHIP_REQUIRED: "Missing Guardian relationship",
  REQUIRED_FIELD: "Missing required field", FIELD_LENGTH: "Value too long", ALLOWED_VALUE: "Invalid code",
  POSTAL_CODE_NORMALIZE: "Postal code normalization", POSTAL_CODE_REPAIR: "Postal code repair", POSTAL_CODE_FORMAT: "Invalid postal code",
  BIRTHDATE_FORMAT: "Invalid birth date", BIRTHDATE_FUTURE: "Future birth date", OEN_FORMAT: "Invalid OEN",
  OEN_DUPLICATE: "Duplicate OEN", OEN_DUAL_ENROLLMENT: "Possible dual enrollment", NAME_DOB_DUPLICATE: "Possible duplicate student",
  PHONE_FORMAT: "Invalid phone format", PHONE_NPA_STRUCTURE: "Invalid area code", PHONE_NXX_STRUCTURE: "Invalid phone exchange",
  PHONE_PLACEHOLDER: "Placeholder phone number", PHONE_EXTENSION_FORMAT: "Invalid phone extension", PHONE_EXTENSION_NORMALIZE: "Phone extension normalization",
  PHONE_CANADIAN_AREA_CODE: "Non-Canadian area code", STREET_NUMBER_UNIT_PREFIX: "Unit in street number",
  ALTERNATE_DELIVERY_IN_STREET_FIELD: "Delivery address in street field", EMPTY_STUDENTS: "School has no students",
  METADATA_REQUIRED: "Missing file information", METADATA_EMAIL: "Invalid contact email", METADATA_DATE: "Invalid file date",
  METADATA_TIME: "Invalid file time", METADATA_CREATED_BY: "Invalid file author", SCHOOL_NUMBER_REQUIRED: "Missing school number",
  SCHOOL_NUMBER_LENGTH: "Invalid school number", BOARD_NUMBER_FORMAT: "Invalid board number", IDENTITY_REVIEW: "Possible shared student identity",
};
export function issueTypeLabel(ruleId: string, field = "") {
  const label = labels[ruleId] ?? ruleId.toLowerCase().replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
  return field ? `${label} · ${field.replace(/([a-z])([A-Z])/g, "$1 $2")}` : label;
}

export function summarizeValidation(result: ValidationResult, inventory: { schoolNumber: string; name: string }[] = []) {
  const records = new Map(result.records.map(record => [record.id, record]));
  const count = (issues: ValidationIssue[]) => ({
    total: issues.length,
    errors: issues.filter(issue => issue.severity === "error").length,
    warnings: issues.filter(issue => issue.severity === "warning").length,
    info: issues.filter(issue => issue.severity === "info").length,
    automatic: issues.filter(issue => issue.autoFixable && !issue.repairProposal).length,
    affected: new Set(issues.filter(issue => issue.recordId && records.has(issue.recordId)).map(issue => issue.recordId)).size,
  });
  const schools = new Map<string, { schoolNumber: string; name: string; students: number; issues: ValidationIssue[] }>();
  const school = (number: string, name = "") => {
    if (!schools.has(number)) schools.set(number, { schoolNumber: number, name, students: 0, issues: [] });
    return schools.get(number)!;
  };
  for (const entry of inventory) school(entry.schoolNumber, entry.name);
  for (const record of records.values()) school(record.fields.SchoolNumber ?? "", record.fields.SchoolName).students++;
  const types = new Map<string, { ruleId: string; field: string; issues: ValidationIssue[] }>();
  for (const issue of result.issues) {
    const number = records.get(issue.recordId ?? "")?.fields.SchoolNumber ?? issue.schoolNumber ?? "";
    school(number).issues.push(issue);
    const key = JSON.stringify([issue.ruleId, issue.field ?? ""]);
    if (!types.has(key)) types.set(key, { ruleId: issue.ruleId, field: issue.field ?? "", issues: [] });
    types.get(key)!.issues.push(issue);
  }
  return {
    ...count(result.issues), students: records.size,
    schools: [...schools.values()].map(({ issues, ...entry }) => ({ ...entry, ...count(issues) })).sort((a, b) => b.errors - a.errors || b.total - a.total || a.schoolNumber.localeCompare(b.schoolNumber)),
    types: [...types.values()].map(({ issues, ...entry }) => ({ ...entry, ...count(issues) })).sort((a, b) => b.total - a.total || a.ruleId.localeCompare(b.ruleId)),
  };
}

export function percentage(numerator: number, denominator: number) {
  return denominator ? `${(numerator / denominator * 100).toFixed(1)}%` : "—";
}

export function severityLabel(counts: { errors: number; warnings: number; info: number }) {
  const levels = [
    { count: counts.errors, label: "Error", plural: "errors" },
    { count: counts.warnings, label: "Warning", plural: "warnings" },
    { count: counts.info, label: "Info", plural: "info" },
  ].filter(level => level.count > 0);
  if (levels.length === 1) return levels[0].label;
  return levels.map(level => `${level.count} ${level.count === 1 ? level.label.toLowerCase() : level.plural}`).join(" · ") || "—";
}
