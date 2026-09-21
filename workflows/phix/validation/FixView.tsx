"use client";

import { useState } from "react";
import { X, Wand2, CheckCircle2 } from "lucide-react";
import PhixRepairCard from "@/components/PhixRepairCard";
import WorkflowNavigation from "@/components/WorkflowNavigation";
import WorkflowHeading from "@/components/WorkflowHeading";
import type { AppliedFix, PhixRepairProposal, PhixSession, ValidationSeverity, ValidationIssue } from "@/lib/types";
import { SeverityBadge } from "./shared";

const PAGE_SIZE = 25;

export default function FixView({
  session,
  onBack,
  onApply,
  requiredFields = [],
}: {
  session: PhixSession;
  onBack: () => void;
  onApply: (fixes: AppliedFix[]) => void;
  requiredFields?: string[];
}) {
  const currentResult = session.revalidatedResult ?? session.initialResult;
  const records = currentResult.records;

  const repairIssues = currentResult.issues.filter(
    (i): i is ValidationIssue & { repairProposal: PhixRepairProposal } =>
      i.repairProposal?.kind === "phix" && !!i.recordId &&
      !session.fixes.some(f => f.issueId === i.id),
  );

  // Issues without a repair card — shown in the inline table below.
  const inlineIssues = currentResult.issues.filter(
    i => !i.repairProposal || i.repairProposal.kind !== "phix",
  );

  const [draftValues, setDraftValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const iss of repairIssues) {
      const p = iss.repairProposal;
      const hasCommentFallback = p.additionalChanges && p.additionalChanges.length > 0;
      init[p.id] = p.proposedValue || (hasCommentFallback ? "" : (records.find(r => r.id === iss.recordId)?.fields[p.field] ?? ""));
    }
    return init;
  });

  const [selectedRepairs, setSelectedRepairs] = useState<Record<string, boolean>>(
    () => Object.fromEntries(repairIssues.map(i => [i.repairProposal.id, false])),
  );

  // Pending inline edits: issueId → new value.
  const [pending, setPending] = useState<Record<string, string>>({});

  const [severityFilter, setSeverityFilter] = useState<"all" | ValidationSeverity>("all");
  const [page, setPage] = useState(0);
  const [autoOperation, setAutoOperation] = useState<{ phase: "applying" | "done"; count: number } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const filteredRepairIssues = repairIssues.filter(
    i => severityFilter === "all" || i.severity === severityFilter,
  );
  const filteredInlineIssues = inlineIssues.filter(
    i => severityFilter === "all" || i.severity === severityFilter,
  );

  const pages = Math.max(1, Math.ceil(filteredRepairIssues.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pages - 1);
  const visibleRepairIssues = filteredRepairIssues.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE);

  const clearAll = () => {
    setSelectedRepairs({});
    setPending({});
  };

  // Safe-confidence issues that have an unambiguous proposed value and haven't been fixed yet.
  const safeIssues = repairIssues.filter(i => i.repairProposal.confidence === "safe" && i.repairProposal.proposedValue !== "");

  const applySafe = async () => {
    if (autoOperation || !safeIssues.length) return;
    const now = Date.now();
    const fixes: AppliedFix[] = safeIssues.map(iss => {
      const p = iss.repairProposal;
      const rec = records.find(r => r.id === iss.recordId);
      return {
        issueId: iss.id,
        recordId: iss.recordId!,
        field: p.field,
        oldValue: rec?.fields[p.field] ?? "",
        newValue: p.proposedValue,
        ruleId: iss.ruleId,
        appliedAt: now,
        repairId: p.id,
      };
    });
    const started = performance.now();
    setApplyError(null);
    setAutoOperation({ phase: "applying", count: fixes.length });
    try {
      await new Promise(resolve => window.setTimeout(resolve, 120));
      onApply(fixes);
      setAutoOperation({ phase: "done", count: fixes.length });
      await new Promise(resolve => window.setTimeout(resolve, Math.max(200, 1000 - (performance.now() - started))));
    } catch (cause) {
      setApplyError(cause instanceof Error ? cause.message : "Unable to apply fixes.");
    } finally {
      setAutoOperation(null);
    }
  };

  const isFieldOptional = (field: string) =>
    !requiredFields.map(f => f.toUpperCase()).includes(field.toUpperCase());

  const cardStagedCount = repairIssues.filter(i => {
    if (!selectedRepairs[i.repairProposal.id]) return false;
    const p = i.repairProposal;
    const rec = records.find(r => r.id === i.recordId);
    const oldVal = rec?.fields[p.field] ?? "";
    const newVal = draftValues[p.id] ?? "";
    const hasAdditional = p.additionalChanges && p.additionalChanges.length > 0;
    const blankAllowed = isFieldOptional(p.field);
    return hasAdditional ? true : (newVal !== oldVal && (newVal !== "" || blankAllowed));
  }).length;

  const inlineStagedCount = Object.keys(pending).length;
  const stagedCount = cardStagedCount + inlineStagedCount;

  const applyFixes = () => {
    const fixes: AppliedFix[] = [];
    const now = Date.now();

    // Repair card fixes
    for (const iss of repairIssues) {
      const p = iss.repairProposal;
      if (!selectedRepairs[p.id]) continue;
      if (!iss.recordId) continue;
      const rec = records.find(r => r.id === iss.recordId);
      if (!rec) continue;
      const oldValue = rec.fields[p.field] ?? "";
      const newValue = draftValues[p.id] ?? p.proposedValue ?? "";
      const hasAdditional = p.additionalChanges && p.additionalChanges.length > 0;
      const useCommentFallback = newValue === "" && hasAdditional;
      const blankAllowed = isFieldOptional(p.field);
      if (!hasAdditional && (newValue === oldValue || (newValue === "" && !blankAllowed))) continue;
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

    // Inline table fixes
    for (const iss of inlineIssues) {
      const newValue = pending[iss.id];
      if (newValue === undefined) continue;
      if (!iss.recordId || !iss.field) continue;
      const rec = records.find(r => r.id === iss.recordId);
      const oldValue = rec?.fields[iss.field] ?? "";
      fixes.push({
        issueId: iss.id,
        recordId: iss.recordId,
        field: iss.field,
        oldValue,
        newValue,
        ruleId: iss.ruleId,
        appliedAt: now,
      });
    }

    onApply(fixes);
  };

  const nextLabel = stagedCount > 0 ? `Apply ${stagedCount} Fix${stagedCount !== 1 ? "es" : ""} & Revalidate` : "Revalidate";

  return (
    <main style={{ flex: 1, maxWidth: 960, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <WorkflowNavigation onBack={onBack} onNext={applyFixes} nextLabel={nextLabel} nextDescription="Apply selected fixes and recheck" disabled={Boolean(autoOperation)} />
      {autoOperation && (
        <div className="autofix-feedback" role="status" aria-live="polite">
          <div className={`autofix-feedback-card ${autoOperation.phase === "done" ? "is-done" : ""}`}>
            {autoOperation.phase === "done" ? <CheckCircle2 size={56} /> : <Wand2 size={48} className="autofix-wand" />}
            <h2>{autoOperation.phase === "done" ? `${autoOperation.count} fix${autoOperation.count !== 1 ? "es" : ""} applied` : "Working a little magic…"}</h2>
            <p>{autoOperation.phase === "done" ? "File rechecked. Ready for the next step." : "Applying safe corrections and checking the results."}</p>
            <div className="fix-operation-track" role="progressbar" aria-label="Apply safe fixes" aria-valuemin={0} aria-valuemax={100} aria-valuenow={autoOperation.phase === "done" ? 100 : 0}><span style={{ width: autoOperation.phase === "done" ? "100%" : "0%" }} /></div>
          </div>
        </div>
      )}

      <fieldset disabled={Boolean(autoOperation)} className="fix-controls">
      {applyError && <p role="alert">{applyError}</p>}
      <WorkflowHeading title="Manual Fixes" />

      <p style={{ color: "var(--color-text-secondary)", margin: "0 0 20px", fontSize: 13 }}>
        {currentResult.issues.length} issue{currentResult.issues.length !== 1 ? "s" : ""} · {stagedCount} fix{stagedCount !== 1 ? "es" : ""} staged
      </p>

      {safeIssues.length > 0 && (
        <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
            <strong style={{ color: "var(--color-text)" }}>{safeIssues.length}</strong> safe fix{safeIssues.length !== 1 ? "es" : ""} can be applied automatically (postal code formatting, phone reformatting).
          </span>
          <button type="button" className="btn btn-primary" onClick={applySafe} style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontSize: 12, padding: "6px 14px" }}>
            <Wand2 size={14} /> Apply all safe fixes ({safeIssues.length})
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 18, alignItems: "center" }}>
        <select
          className="input"
          value={severityFilter}
          onChange={e => { setSeverityFilter(e.target.value as typeof severityFilter); setPage(0); }}
          style={{ flex: "0 0 140px" }}
        >
          <option value="all">All severities</option>
          <option value="error">Errors only</option>
          <option value="warning">Warnings only</option>
          <option value="info">Info only</option>
        </select>
        <button onClick={clearAll} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px", gap: 5 }}>
          <X size={13} /> Clear All
        </button>
      </div>

      {/* Repair cards — for issues with a PhixRepairProposal */}
      {filteredRepairIssues.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Guided Repairs
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {visibleRepairIssues.map(iss => {
              const p = iss.repairProposal;
              const rec = records.find(r => r.id === iss.recordId);
              if (!rec) return null;
              return (
                <PhixRepairCard
                  key={p.id}
                  proposal={p}
                  record={rec}
                  draftValue={draftValues[p.id] ?? p.proposedValue ?? ""}
                  selected={selectedRepairs[p.id] ?? false}
                  onDraftChange={value => setDraftValues(prev => ({ ...prev, [p.id]: value }))}
                  onSelectedChange={sel => setSelectedRepairs(prev => ({ ...prev, [p.id]: sel }))}
                  requiredFields={requiredFields}
                  onReset={() => {
                    const hasCommentFallback = p.additionalChanges && p.additionalChanges.length > 0;
                    setDraftValues(prev => ({ ...prev, [p.id]: p.proposedValue || (hasCommentFallback ? "" : rec.fields[p.field] ?? "") }));
                    setSelectedRepairs(prev => ({ ...prev, [p.id]: false }));
                  }}
                />
              );
            })}
          </div>
          {pages > 1 && (
            <nav className="table-paging" aria-label="Repair cards pages">
              <span aria-live="polite">{clampedPage * PAGE_SIZE + 1}–{Math.min((clampedPage + 1) * PAGE_SIZE, filteredRepairIssues.length)} of {filteredRepairIssues.length}</span>
              <button type="button" className="btn btn-secondary" disabled={clampedPage === 0} onClick={() => { setPage(p => p - 1); window.scrollTo({ top: 0 }); }}>Previous</button>
              <span>Page {clampedPage + 1} of {pages}</span>
              <button type="button" className="btn btn-secondary" disabled={clampedPage === pages - 1} onClick={() => { setPage(p => p + 1); window.scrollTo({ top: 0 }); }}>Next</button>
            </nav>
          )}
        </>
      )}

      {/* Inline table — for issues without a repair card */}
      {filteredInlineIssues.length > 0 && (
        <div style={{ marginTop: filteredRepairIssues.length > 0 ? 32 : 0 }}>
          {filteredRepairIssues.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Manual Corrections
            </div>
          )}
          <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Severity</th>
                    <th style={{ width: 80 }}>Row</th>
                    <th>Field</th>
                    <th>Current Value</th>
                    <th data-sortable={false}>New Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInlineIssues.map(iss => {
                    const rec = records.find(r => r.id === iss.recordId);
                    const currentValue = iss.field && rec ? (rec.fields[iss.field] ?? "") : "";
                    const pendingEntry = pending[iss.id];
                    const isCleared = pendingEntry === "";
                    const pendingVal = pendingEntry ?? currentValue;
                    return (
                      <tr key={iss.id}>
                        <td data-sort-value={iss.severity === "error" ? 0 : iss.severity === "warning" ? 1 : 2}>
                          <SeverityBadge severity={iss.severity} />
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-muted)" }}>{iss.rowPath ?? "—"}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-secondary)" }}>{iss.field ?? "—"}</td>
                        <td>
                          <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: currentValue ? 4 : 0 }}>{iss.message}</div>
                          {currentValue && (
                            <code style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>{currentValue}</code>
                          )}
                        </td>
                        <td style={{ minWidth: 200 }}>
                          {iss.recordId && iss.field ? (
                            isCleared ? (
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>(will be blank)</span>
                                <button
                                  type="button"
                                  onClick={() => setPending(p => { const next = { ...p }; delete next[iss.id]; return next; })}
                                  className="btn btn-ghost"
                                  style={{ fontSize: 11, padding: "4px 7px", whiteSpace: "nowrap" as const }}
                                >
                                  Undo
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <input
                                  className="input"
                                  value={pendingEntry ?? ""}
                                  onChange={e => setPending(p => ({ ...p, [iss.id]: e.target.value }))}
                                  placeholder={currentValue || iss.suggestedFix || "Enter corrected value…"}
                                  style={{ fontSize: 12, padding: "5px 8px" }}
                                />
                                {iss.suggestedFix && pendingVal !== iss.suggestedFix && (
                                  <button
                                    type="button"
                                    onClick={() => setPending(p => ({ ...p, [iss.id]: iss.suggestedFix! }))}
                                    className="btn btn-ghost"
                                    style={{ fontSize: 11, padding: "4px 7px", whiteSpace: "nowrap" as const }}
                                    title={`Use suggested: ${iss.suggestedFix}`}
                                  >
                                    Use suggested
                                  </button>
                                )}
                                {isFieldOptional(iss.field) && currentValue !== "" && (
                                  <button
                                    type="button"
                                    onClick={() => setPending(p => ({ ...p, [iss.id]: "" }))}
                                    className="btn btn-ghost"
                                    style={{ fontSize: 11, padding: "4px 7px", whiteSpace: "nowrap" as const }}
                                  >
                                    Clear value
                                  </button>
                                )}
                              </div>
                            )
                          ) : (
                            <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>No field — review manually</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {filteredRepairIssues.length === 0 && filteredInlineIssues.length === 0 && (
        <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "40px 24px", textAlign: "center", marginBottom: 28 }}>
          <p style={{ color: "var(--color-text-muted)", fontSize: 13, margin: 0 }}>
            {currentResult.issues.length === 0
              ? "No issues remain — file looks clean."
              : "No issues match the current filter."}
          </p>
        </div>
      )}

      </fieldset>
    </main>
  );
}
