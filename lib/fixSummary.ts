import type { AppliedFix, ReviewAction } from "./types";

export type AppliedCorrectionSummary = {
  automatic: number;
  manual: number;
  cleaning: number;
  uncategorized: number;
  total: number;
  fieldChanges: number;
};

/** Remove repeated writes of the same value to the same field within one batch. */
export function deduplicateAppliedFixes(fixes: AppliedFix[]): AppliedFix[] {
  const seen = new Set<string>();
  return fixes.filter((fix) => {
    const key = JSON.stringify([fix.recordId, fix.field, fix.oldValue, fix.newValue]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Count one correction per coordinated repair, or per finding for ordinary fixes. */
export function countAppliedCorrections(fixes: AppliedFix[]): number {
  return new Set(fixes.map((fix) => fix.repairId
    ? `repair\0${fix.repairId}`
    : `issue\0${fix.issueId}`)).size;
}

function fixSignature(fix: AppliedFix): string {
  return JSON.stringify([
    fix.issueId, fix.recordId, fix.field, fix.oldValue, fix.newValue,
    fix.ruleId, fix.appliedAt, fix.repairId ?? "",
  ]);
}

/** Split committed corrections by the workflow action that applied them. */
export function summarizeAppliedCorrections(
  fixes: AppliedFix[],
  history: ReviewAction[] = [],
): AppliedCorrectionSummary {
  const summary = { automatic: 0, manual: 0, cleaning: 0, uncategorized: 0 };
  const categorized = new Set<string>();

  for (const action of history) {
    if (action.status !== "applied") continue;
    const count = countAppliedCorrections(action.changes);
    if (action.label === "Automatic fixes") summary.automatic += count;
    else if (action.label === "Manual fixes") summary.manual += count;
    else summary.cleaning += count;
    for (const fix of action.changes) categorized.add(fixSignature(fix));
  }

  const unmatched = fixes.filter((fix) => !categorized.has(fixSignature(fix)));
  summary.uncategorized = countAppliedCorrections(unmatched);
  return {
    ...summary,
    total: summary.automatic + summary.manual + summary.cleaning + summary.uncategorized,
    fieldChanges: fixes.length,
  };
}
