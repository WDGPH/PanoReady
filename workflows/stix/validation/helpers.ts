import type { AppliedFix, StudentRecord, ValidationIssue } from "@/lib/types";

export function isAutomaticIssue(issue: ValidationIssue): boolean {
  return issue.repairProposal ? issue.autoFixable && issue.repairProposal.confidence === "safe"
    && issue.repairProposal.changes.some(change => change.proposedValue !== change.currentValue)
    : issue.suggestedFix !== undefined || issue.autoFixable || issue.ruleId === "EMPTY_GUARDIAN";
}

export function automaticFixes(issue: ValidationIssue, records: StudentRecord[], now: number): AppliedFix[] {
  if (!isAutomaticIssue(issue) || !issue.recordId || !issue.field) return [];
  const base = { issueId: issue.id, recordId: issue.recordId, ruleId: issue.ruleId, appliedAt: now };
  if (issue.repairProposal) return issue.repairProposal.changes.filter(change => change.proposedValue !== change.currentValue).map(change => ({
    ...base, field: change.field, oldValue: change.currentValue, newValue: change.proposedValue,
    repairId: issue.repairProposal!.id,
  }));
  if (issue.ruleId !== "EMPTY_GUARDIAN" && issue.suggestedFix === undefined) return [];
  return [{ ...base, field: issue.field,
    oldValue: issue.currentValue ?? records.find(record => record.id === issue.recordId)?.fields[issue.field] ?? "",
    newValue: issue.ruleId === "EMPTY_GUARDIAN" ? "" : issue.suggestedFix!,
  }];
}
