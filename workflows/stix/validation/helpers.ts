import { ADDRESS_REPAIR_FIELDS } from "@/lib/addressRepair";
import type { StudentRecord, ValidationIssue } from "@/lib/types";

export function suggestedAddressDraft(issue: ValidationIssue, records: StudentRecord[]): Record<string, string> {
  const record = records.find((candidate) => candidate.id === issue.recordId);
  const draft = Object.fromEntries(ADDRESS_REPAIR_FIELDS.map((field) => [field, record?.fields[field] ?? ""]));
  for (const change of issue.repairProposal?.changes ?? []) draft[change.field] = change.proposedValue;
  return draft;
}

export function guardianRelationshipContext(issue: ValidationIssue, record?: StudentRecord) {
  if (!record || (issue.field !== "GuardianRelationship" && issue.field !== "Guardian2Relationship")) return null;
  const second = issue.field === "Guardian2Relationship";
  const prefix = second ? "Guardian2" : "Guardian";
  const name = [record.fields[`${prefix}FirstName`], record.fields[`${prefix}LastName`]].filter(Boolean).join(" ");
  const phone = record.fields[`${prefix}PhoneNumber`] ?? "";
  const phoneType = record.fields[`${prefix}PhoneType`] ?? "";
  return {
    label: second ? "Guardian 2" : "Guardian 1",
    name,
    phone: phone ? `${phone}${phoneType ? ` (${phoneType})` : ""}` : "",
    hasDetails: Boolean(name || phone),
    oen: record.fields.OEN ?? "",
  };
}
