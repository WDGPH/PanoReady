/** Preconditions for a reviewed automatic batch. Manual edits have a separate contract. */
import { assertAddressPlanCurrent } from "./addressAutofix";
import type { AppliedFix, RulesProfile, ValidationResult } from "./types";

export function assertAutomaticBatchCurrent(fixes: AppliedFix[], result: ValidationResult, rules: RulesProfile): void {
  const records = new Map(result.records.map(record => [record.id, record]));
  const writes = new Map<string, string>();
  for (const fix of fixes) {
    const key = JSON.stringify([fix.recordId, fix.field]);
    if (writes.has(key) && writes.get(key) !== fix.newValue) {
      throw new Error("Automatic fixes contain conflicting changes to one field. Review the refreshed fixes before applying.");
    }
    writes.set(key, fix.newValue);
    if (fix.addressPlan) {
      assertAddressPlanCurrent(fix.addressPlan, records.get(fix.recordId), rules);
      // The committed diff must be exactly the preview, with no additional writes
      // to any address field read by this plan.
      const actual = fixes.filter(entry => entry.recordId === fix.recordId && entry.field in fix.addressPlan!.before);
      if (actual.length !== fix.addressPlan.changes.length || fix.addressPlan.changes.some(change =>
        !actual.some(entry => entry.field === change.field && entry.oldValue === change.currentValue && entry.newValue === change.proposedValue))) {
        throw new Error("The address changes differ from the preview. Review the refreshed fixes before applying.");
      }
    }
    // Section removals are verified by the canonical executor. Their value is not
    // a flattened field; other automatic writes must match the current assessment.
    if (fix.field === "Guardian" || fix.field === "Guardian2") continue;
    const record = records.get(fix.recordId);
    const current = record ? record.fields[fix.field] ?? "" : result.issues.find(issue =>
      issue.recordId === fix.recordId && issue.field === fix.field && issue.currentValue !== undefined)?.currentValue;
    if (current === undefined || current !== fix.oldValue) {
      throw new Error("A value changed after preview. Review the refreshed automatic fixes before applying.");
    }
  }
}
