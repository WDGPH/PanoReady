"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import PhixRepairCard from "@/components/PhixRepairCard";
import WorkflowNavigation from "@/components/WorkflowNavigation";
import WorkflowHeading from "@/components/WorkflowHeading";
import type { AppliedFix, PhixRepairProposal, PhixSession, ValidationIssue } from "@/lib/types";

const PAGE_SIZE = 25;

export default function AutoFixView({
  session,
  onBack,
  onAutoApply,
}: {
  session: PhixSession;
  onBack: () => void;
  onAutoApply: (fixes: AppliedFix[]) => void;
}) {
  const currentResult = session.revalidatedResult ?? session.initialResult;
  const records = currentResult.records;

  const safeIssues = currentResult.issues.filter(
    (i): i is ValidationIssue & { repairProposal: PhixRepairProposal } =>
      i.repairProposal?.kind === "phix" &&
      (i.repairProposal as PhixRepairProposal).confidence === "safe" &&
      !!i.recordId &&
      !session.fixes.some(f => f.issueId === i.id),
  );

  const [draftValues, setDraftValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const iss of safeIssues) {
      const p = iss.repairProposal;
      const hasCommentFallback = p.additionalChanges && p.additionalChanges.length > 0;
      init[p.id] = p.proposedValue || (hasCommentFallback ? "" : (records.find(r => r.id === iss.recordId)?.fields[p.field] ?? ""));
    }
    return init;
  });

  const [selectedRepairs, setSelectedRepairs] = useState<Record<string, boolean>>(
    () => Object.fromEntries(safeIssues.map(i => [i.repairProposal.id, true])),
  );

  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(safeIssues.length / PAGE_SIZE));
  const visibleIssues = safeIssues.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const applyFixes = () => {
    const fixes: AppliedFix[] = [];
    const now = Date.now();
    for (const iss of safeIssues) {
      const p = iss.repairProposal;
      if (!selectedRepairs[p.id]) continue;
      if (!iss.recordId) continue;
      const rec = records.find(r => r.id === iss.recordId);
      if (!rec) continue;
      const oldValue = rec.fields[p.field] ?? "";
      const newValue = draftValues[p.id] ?? p.proposedValue ?? "";
      const hasAdditional = p.additionalChanges && p.additionalChanges.length > 0;
      const useCommentFallback = newValue === "" && hasAdditional;
      if (!hasAdditional && (!newValue || newValue === oldValue)) continue;
      fixes.push({
        issueId: iss.id,
        recordId: iss.recordId,
        field: p.field,
        oldValue,
        newValue,
        ruleId: iss.ruleId,
        appliedAt: now,
        repairId: p.id,
      });
      if (useCommentFallback) {
        for (const change of p.additionalChanges ?? []) {
          fixes.push({
            issueId: iss.id,
            recordId: iss.recordId,
            field: change.field,
            oldValue: rec.fields[change.field] ?? "",
            newValue: change.proposedValue,
            ruleId: iss.ruleId,
            appliedAt: now,
            repairId: p.id,
          });
        }
      }
    }
    onAutoApply(fixes);
  };

  const nextLabel = safeIssues.length > 0 ? "Apply Safe Fixes & Continue" : "Continue to Manual Fix";

  return (
    <main style={{ flex: 1, maxWidth: 960, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <WorkflowNavigation onBack={onBack} onNext={applyFixes} nextLabel={nextLabel} nextDescription={safeIssues.length > 0 ? "Apply all selected safe fixes and continue to manual fixes" : "Continue to manual fixes"} />

      <WorkflowHeading title="Automatic Fixes" />

      <p style={{ color: "var(--color-text-secondary)", margin: "0 0 24px", fontSize: 13 }}>
        {safeIssues.length > 0
          ? `${safeIssues.length} safe fix${safeIssues.length !== 1 ? "es" : ""} detected — all pre-selected for you.`
          : "No automatic fixes to apply."}
      </p>

      {safeIssues.length > 0 ? (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {visibleIssues.map(iss => {
              const p = iss.repairProposal;
              const rec = records.find(r => r.id === iss.recordId);
              if (!rec) return null;
              return (
                <PhixRepairCard
                  key={p.id}
                  proposal={p}
                  record={rec}
                  draftValue={draftValues[p.id] ?? p.proposedValue ?? ""}
                  selected={selectedRepairs[p.id] ?? true}
                  onDraftChange={value => setDraftValues(prev => ({ ...prev, [p.id]: value }))}
                  onSelectedChange={sel => setSelectedRepairs(prev => ({ ...prev, [p.id]: sel }))}
                  onReset={() => {
                    const hasCommentFallback = p.additionalChanges && p.additionalChanges.length > 0;
                    setDraftValues(prev => ({ ...prev, [p.id]: p.proposedValue || (hasCommentFallback ? "" : rec.fields[p.field] ?? "") }));
                    setSelectedRepairs(prev => ({ ...prev, [p.id]: true }));
                  }}
                />
              );
            })}
          </div>
          {pages > 1 && (
            <nav className="table-paging" aria-label="Repair cards pages">
              <span aria-live="polite">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, safeIssues.length)} of {safeIssues.length}</span>
              <button type="button" className="btn btn-secondary" disabled={page === 0} onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0 }); }}>Previous</button>
              <span>Page {page + 1} of {pages}</span>
              <button type="button" className="btn btn-secondary" disabled={page === pages - 1} onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0 }); }}>Next</button>
            </nav>
          )}
        </>
      ) : (
        <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "40px 24px", textAlign: "center", marginBottom: 28 }}>
          <p style={{ color: "var(--color-text-muted)", fontSize: 13, margin: 0 }}>
            No auto-fixes to apply — safe repairs have already been applied or none were detected.
          </p>
        </div>
      )}
    </main>
  );
}
