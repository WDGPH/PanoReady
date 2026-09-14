import { ADDRESS_REPAIR_FIELDS } from "@/lib/addressRepair";
import type { StudentRecord, ValidationIssue } from "@/lib/types";

export function suggestedAddressDraft(issue: ValidationIssue, records: StudentRecord[]): Record<string, string> {
  const record = records.find((candidate) => candidate.id === issue.recordId);
  const draft = Object.fromEntries(ADDRESS_REPAIR_FIELDS.map((field) => [field, record?.fields[field] ?? ""]));
  for (const change of issue.repairProposal?.changes ?? []) draft[change.field] = change.proposedValue;
  return draft;
}
