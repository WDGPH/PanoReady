/** Adapt individual findings into selectable corrections without changing assessment totals. */
import { planAddressRepairs } from "@/lib/addressAutofix";
import { isAddressField } from "@/lib/addressRules";
import type { AutomaticFixItem, RulesProfile, ValidationResult, ValidationSeverity } from "@/lib/types";
import { addressRepairIssueText, addressRepairStepTitle } from "./addressRepairCopy";
import { isAutomaticIssue } from "./helpers";
import { isExcludedFromReview, matchesReviewFilter, type ReviewExclusion, type ReviewFilter } from "./overview";

export function automaticReviewItems(result: ValidationResult, rules: RulesProfile, filter: ReviewFilter, exclusions: ReviewExclusion[], severity: "all" | ValidationSeverity = "all"): AutomaticFixItem[] {
  const schools = new Map(result.records.map(record => [record.id, record.fields.SchoolNumber]));
  const allowed = (issue: AutomaticFixItem) => {
    const school = schools.get(issue.recordId ?? "") ?? issue.schoolNumber ?? "";
    return (severity === "all" || issue.severity === severity) && matchesReviewFilter(issue, filter, school) && !isExcludedFromReview(issue, exclusions, school);
  };
  const items: AutomaticFixItem[] = result.issues.filter(issue => !isAddressField(issue.field ?? "") && allowed(issue) && isAutomaticIssue(issue));
  const addressFindings = new Map<string, AutomaticFixItem[]>();
  for (const issue of result.issues) {
    if (!issue.recordId || !isAddressField(issue.field ?? "")) continue;
    const group = addressFindings.get(issue.recordId) ?? [];
    group.push(issue);
    addressFindings.set(issue.recordId, group);
  }
  for (const record of result.records) {
    const findings = addressFindings.get(record.id)?.filter(allowed);
    if (!findings?.length) continue;
    const plan = planAddressRepairs(record, rules, { allowsFinding: finding => allowed({ ...finding, id: "", recordId: record.id }) });
    if (!plan.changes.length && !plan.stoppedReason) continue;
    if (plan.changes.length) {
      plan.resolvedFindings = addressFindings.get(record.id)!
        .filter(finding => !plan.remaining.some(remaining => remaining.ruleId === finding.ruleId && remaining.field === finding.field))
        .map(({ recordId, studentName, schoolNumber, ruleId, field, message }) => ({ recordId, studentName, schoolNumber, ruleId, field, message }));
    }
    const firstStep = plan.steps[0];
    // Retain the original row ID when possible so selection remains familiar.
    const anchor = findings.find(finding => finding.ruleId === firstStep?.ruleId && finding.field === firstStep?.field) ?? findings[0];
    const combinedSeverity = plan.steps.some(step => step.severity === "error") ? "error"
      : plan.steps.some(step => step.severity === "warning") ? "warning" : anchor.severity;
    const title = plan.steps.length === 1 ? addressRepairStepTitle(plan.steps[0]) : `Address repair · ${plan.steps.length} steps`;
    items.push({ ...anchor, severity: combinedSeverity, addressPlan: plan, suggestedFix: undefined,
      autoFixable: plan.changes.length > 0,
      message: plan.stoppedReason ?? [...new Set(plan.steps.map(addressRepairIssueText))].join(" "),
      repairProposal: { kind: "address", id: `${record.id}-address-sequence`, confidence: plan.stoppedReason ? "manual" : "safe",
        title, explanation: plan.stoppedReason ?? "Review the final address changes and the steps that produce them.", changes: plan.changes },
    });
  }
  // Grouping an address must not move it behind every non-address correction.
  const originalOrder = new Map(result.issues.map((issue, index) => [issue.id, index]));
  return items.sort((left, right) => originalOrder.get(left.id)! - originalOrder.get(right.id)!);
}
