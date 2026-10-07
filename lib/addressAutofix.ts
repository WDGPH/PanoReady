/** Plan address repairs without mutating records or XML. */
import { ADDRESS_REPAIR_FIELDS } from "./addressRepair";
import { assessAddress, type AddressFinding } from "./addressRules";
import { fieldValueMeetsRules } from "./fieldValidation";
import type { AddressAutofixPlan, RepairChange, RulesProfile, StudentRecord } from "./types";

export function addressSnapshot(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(ADDRESS_REPAIR_FIELDS.map(field => [field, fields[field] ?? ""]));
}

function proposedChanges(finding: AddressFinding, fields: Record<string, string>): RepairChange[] {
  if (!finding.autoFixable) return [];
  if (finding.repairProposal) return finding.repairProposal.confidence === "safe" ? finding.repairProposal.changes : [];
  return finding.field && finding.suggestedFix !== undefined
    ? [{ field: finding.field, currentValue: fields[finding.field] ?? "", proposedValue: finding.suggestedFix }] : [];
}

export type AddressPlanOptions = {
  /** Applied to every newly discovered finding, not just the original assessment. */
  allowsFinding?: (finding: AddressFinding) => boolean;
  maxSteps?: number;
};

/**
 * Reassess the whole address after each atomic repair. Array order in ADDRESS_RULES
 * is the sole priority. Only the final diff is committed; steps explain the preview.
 */
export function planAddressRepairs(record: StudentRecord, rules: RulesProfile, options: AddressPlanOptions = {}): AddressAutofixPlan {
  const before = addressSnapshot(record.fields);
  let current = { ...before };
  const allows = options.allowsFinding ?? (() => true);
  const steps: AddressAutofixPlan["steps"] = [];
  const states = new Set([JSON.stringify(current)]);
  const fieldValues = new Map(Object.entries(current).map(([field, value]) => [field, new Set([value])]));
  const initialErrors = new Set(assessAddress(before, rules, record.id).filter(finding => finding.severity === "error").map(finding => `${finding.ruleId}:${finding.field}`));
  let stoppedReason: string | undefined;

  for (;;) {
    const findings = assessAddress(current, rules, record.id, true);
    const candidates = findings.filter(allows).map(finding => ({ finding,
      changes: proposedChanges(finding, current).filter(change => change.currentValue !== change.proposedValue),
    }));
    const candidate = candidates.find(({ changes }) => changes.length && !findings.some(finding =>
      // A selected character category can share its replacement with an excluded
      // category. Do not let that replacement bypass the exclusion or filter.
      !allows(finding) && changes.some(change => change.field === finding.field)));
    if (!candidate) break;
    if (steps.length >= (options.maxSteps ?? 24)) {
      stoppedReason = "The address repair sequence reached its step limit. Review the address manually.";
      break;
    }
    const { finding, changes } = candidate;
    if (new Set(changes.map(change => change.field)).size !== changes.length
      || changes.some(change => !(change.field in current) || current[change.field] !== change.currentValue)) {
      stoppedReason = "An address repair no longer matches its source values. Review the address manually.";
      break;
    }
    const next = { ...current };
    for (const change of changes) next[change.field] = change.proposedValue;
    if (states.has(JSON.stringify(next)) || changes.some(change => fieldValues.get(change.field)!.has(change.proposedValue))) {
      stoppedReason = "Address repairs would repeat or reverse an earlier change. Review the address manually.";
      break;
    }
    states.add(JSON.stringify(next));
    for (const change of changes) fieldValues.get(change.field)!.add(change.proposedValue);
    steps.push({ ruleId: finding.ruleId, field: finding.field ?? "", severity: finding.severity,
      explanation: finding.message, changes });
    current = next;
  }

  const changes = ADDRESS_REPAIR_FIELDS.filter(field => before[field] !== current[field])
    .map(field => ({ field, currentValue: before[field], proposedValue: current[field] }));
  const remaining = assessAddress(current, rules, record.id);
  if (!stoppedReason && (changes.some(change => !fieldValueMeetsRules(change.field, change.proposedValue, rules))
    || remaining.some(finding => finding.severity === "error" && !initialErrors.has(`${finding.ruleId}:${finding.field}`)))) {
    stoppedReason = "The complete address repair would leave a changed field invalid or introduce a blocking issue. Review the address manually.";
  }
  return {
    recordId: record.id, before, rulesSnapshot: JSON.stringify(rules), steps,
    // Withhold the entire address plan on failure; no partial sequence is applied.
    changes: stoppedReason ? [] : changes, stoppedReason,
    remaining: (stoppedReason ? assessAddress(before, rules, record.id) : remaining)
      .map(({ ruleId, field, severity, message }) => ({ ruleId, field, severity, message })),
  };
}

/** Check the full address, including fields read but not changed by the repair. */
export function assertAddressPlanCurrent(plan: AddressAutofixPlan, record: StudentRecord | undefined, rules: RulesProfile): void {
  if (!record || JSON.stringify(addressSnapshot(record.fields)) !== JSON.stringify(plan.before)
    || JSON.stringify(rules) !== plan.rulesSnapshot) {
    throw new Error("The address or rules changed after preview. Review the refreshed automatic fixes before applying.");
  }
  if (plan.stoppedReason || !plan.changes.length) throw new Error("This address needs manual review.");
}
