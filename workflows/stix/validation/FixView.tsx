"use client";
import WorkflowHeading from "@/components/WorkflowHeading";
import WorkflowNavigation from "@/components/WorkflowNavigation";
import PagedTable from "@/components/PagedTable";
import StudentEntry, { studentReference } from "@/components/StudentEntry";
import { type ReactNode, useState } from "react";
import { Wand2, CheckCircle2 } from "lucide-react";
import AddressRepairCard from "@/components/AddressRepairCard";
import { guardianSectionForField } from "@/lib/fields";
import { ADDRESS_REPAIR_FIELDS } from "@/lib/addressRepair";
import { defaultRules } from "@/lib/rulesets";
import type { AppliedFix, StudentRecord, ValidateSession, ValidationIssue, ValidationSeverity } from "@/lib/types";
import { suggestedAddressDraft } from "./helpers";
import { SeverityBadge } from "./ValidationBadges";
import { issueTypeLabel, matchesReviewFilter, isExcludedFromReview } from "./overview";
import type { ReviewFilter, ReviewExclusion } from "./overview";

const identityReviewFields: Record<string, string[]> = {
  OEN_DUPLICATE: ["OEN"],
  OEN_DUAL_ENROLLMENT: ["OEN"],
  NAME_DOB_DUPLICATE: ["FirstName", "LastName", "BirthDate"],
  IDENTITY_REVIEW: ["FirstName", "LastName", "BirthDate"],
};
const isIdentityReview = (issue: ValidationIssue) => identityReviewFields[issue.ruleId] !== undefined;

// ─── ValidateFixView ──────────────────────────────────────────────────────────
// Screen 3: Fix Data

export default function FixView({
  session,
  advancedOptions,
  onApply,
  onBack,
  filter = {},
  onClearFilter,
  exclusions = [],
  view,
  onContinue,
  onAutoApply,
  onBusyChange,
}: {
  advancedOptions?: ReactNode;
  onBack: () => void;
  session: ValidateSession;
  onApply: (fixes: AppliedFix[]) => void;
  filter?: ReviewFilter;
  onClearFilter: () => void;
  exclusions?: ReviewExclusion[];
  view: "automatic" | "manual";
  onContinue: () => void;
  onAutoApply: (fixes: AppliedFix[]) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const currentResult = session.revalidatedResult ?? session.initialResult;
  const records = currentResult.records;
  const rules = session.validationRules ?? defaultRules;
  // Retain previously applied fixes when revisiting this step.
  const recordSchools = new Map(records.map(record => [record.id, record.fields.SchoolNumber]));
  const issues = currentResult.issues.filter((issue) => !isExcludedFromReview(issue, exclusions, recordSchools.get(issue.recordId ?? "") ?? issue.schoolNumber ?? "")
    && matchesReviewFilter(issue, filter, recordSchools.get(issue.recordId ?? "") ?? issue.schoolNumber ?? ""));
  const addressIssues = issues.filter((issue) => issue.repairProposal?.kind === "address" && issue.recordId);

  // pending: issueId → new value. A present empty value is an intentional removal.
  const [pending, setPending] = useState<Record<string, string>>({});
  const [operation, setOperation] = useState<{ phase: "applying" | "done"; count: number } | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [addressDrafts, setAddressDrafts] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(addressIssues.map((issue) => [issue.repairProposal!.id, suggestedAddressDraft(issue, records)])),
  );
  const [selectedAddressRepairs, setSelectedAddressRepairs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(addressIssues.map((issue) => [issue.repairProposal!.id, false])),
  );

  const [studentDrafts, setStudentDrafts] = useState<Record<string, Record<string, string>>>({});
  const studentFixes = (now: number): AppliedFix[] => records.flatMap(record => {
    const draft = studentDrafts[record.id] ?? {};
    return Object.entries(draft).filter(([field, value]) => {
      const guardian = guardianSectionForField(field);
      if (guardian === field) return true;
      if (guardian && draft[guardian] === "") return false;
      return value !== (record.fields[field] ?? "");
    }).map(([field, newValue]) => ({ issueId: `student-edit:${record.id}:${field}`, recordId: record.id,
      field, oldValue: record.fields[field] ?? "", newValue, ruleId: "MANUAL_STUDENT_EDIT", appliedAt: now }));
  });

  const studentDraft = (record: StudentRecord): Record<string, string> => ({
    ...Object.assign({}, ...addressIssues.filter(issue => issue.recordId === record.id && selectedAddressRepairs[issue.repairProposal!.id])
      .map(issue => addressDrafts[issue.repairProposal!.id] ?? suggestedAddressDraft(issue, records))),
    ...Object.fromEntries(issues.filter(issue => issue.recordId === record.id && issue.field && pending[issue.id] !== undefined)
      .map(issue => [issue.field!, pending[issue.id]])),
    ...studentDrafts[record.id],
  });

  const [severityFilter, setSeverityFilter] = useState<"all" | ValidationSeverity>("all");

  const isAutomatic = (issue: ValidationIssue) => !issue.repairProposal && (issue.autoFixable || issue.ruleId === "EMPTY_GUARDIAN");
  const groups = [
    { label: "Automatic fixes", items: issues.filter(isAutomatic), automatic: true },
    { label: "Needs review", items: issues, automatic: false },
  ];

  const automaticCandidates = issues.filter(issue => isAutomatic(issue) && issue.recordId && issue.field && (issue.ruleId === "EMPTY_GUARDIAN" || issue.suggestedFix !== undefined));
  const applyAutomatic = async (candidates: ValidationIssue[]) => {
    if (operation || !candidates.length) return;
    const batch: AppliedFix[] = candidates.map(issue => ({ issueId: issue.id, recordId: issue.recordId!, field: issue.field!, oldValue: issue.currentValue ?? records.find(record => record.id === issue.recordId)?.fields[issue.field!] ?? "", newValue: issue.ruleId === "EMPTY_GUARDIAN" ? "" : issue.suggestedFix!, ruleId: issue.ruleId, appliedAt: Date.now() }));
    const started = performance.now();
    setApplyError(null);
    setOperation({ phase: "applying", count: batch.length });
    onBusyChange(true);
    try {
      await new Promise(resolve => window.setTimeout(resolve, 120));
      onAutoApply(batch);
      setPending({});
      setOperation({ phase: "done", count: batch.length });
      // Hold completed feedback briefly; never finish before processing does.
      await new Promise(resolve => window.setTimeout(resolve, Math.max(200, 1000 - (performance.now() - started))));
    } catch (cause) {
      setApplyError(cause instanceof Error ? cause.message : "Unable to apply fixes.");
    } finally {
      setOperation(null);
      onBusyChange(false);
    }
  };

  const stageIssue = (issue: ValidationIssue, value: string) => {
    setPending(current => ({ ...current, [issue.id]: value }));
    if (issue.recordId && issue.field) setStudentDrafts(current => ({ ...current,
      [issue.recordId!]: Object.fromEntries(Object.entries(current[issue.recordId!] ?? {}).filter(([field]) => field !== issue.field && !(issue.ruleId === "EMPTY_GUARDIAN" && guardianSectionForField(field) === guardianSectionForField(issue.field!)))),
    }));
  };

  const toggleGuardianRemoval = (record: StudentRecord, guardian: "Guardian" | "Guardian2", remove: boolean) => {
    setStudentDrafts(current => {
      const draft = { ...current[record.id] };
      if (remove) draft[guardian] = "";
      else delete draft[guardian];
      return { ...current, [record.id]: draft };
    });
    setPending(current => Object.fromEntries(Object.entries(current).filter(([id]) => !issues.some(issue =>
      issue.id === id && issue.recordId === record.id && issue.field === guardian))));
  };

  const studentReview = (record: StudentRecord, issue: ValidationIssue) => {
    const proposal = issue.repairProposal;
    return <StudentEntry record={record} editor={{
      rules, issue, draft: studentDraft(record),
      issues: currentResult.issues.filter(candidate => candidate.recordId === record.id),
      readOnlyFields: currentResult.issues.filter(candidate => candidate.recordId === record.id).flatMap(candidate => identityReviewFields[candidate.ruleId] ?? []),
      triggerLabel: proposal ? (selectedAddressRepairs[proposal.id] ? "Edit staged address" : "Review address") : undefined,
      onDraftChange: (field, value) => {
        setStudentDrafts(current => ({ ...current, [record.id]: { ...current[record.id], [field]: value } }));
        setPending(current => Object.fromEntries(Object.entries(current).filter(([id]) => !issues.some(candidate =>
          candidate.id === id && candidate.recordId === record.id && candidate.field === field))));
      },
      onGuardianRemoval: (guardian, remove) => toggleGuardianRemoval(record, guardian, remove),
      onReset: () => {
        setStudentDrafts(current => ({ ...current, [record.id]: {} }));
        setPending(current => Object.fromEntries(Object.entries(current).filter(([id]) => !issues.some(candidate => candidate.id === id && candidate.recordId === record.id))));
        setSelectedAddressRepairs(current => Object.fromEntries(Object.entries(current).filter(([id]) => !addressIssues.some(candidate => candidate.recordId === record.id && candidate.repairProposal!.id === id))));
      },
      addressEditor: proposal && <AddressRepairCard
        proposal={proposal} record={record} rules={rules}
        draft={{ ...(addressDrafts[proposal.id] ?? suggestedAddressDraft(issue, records)), ...Object.fromEntries(Object.entries(studentDrafts[record.id] ?? {}).filter(([field]) => ADDRESS_REPAIR_FIELDS.some(candidate => candidate === field))) }}
        selected={selectedAddressRepairs[proposal.id] ?? false}
        onDraftChange={(field, value) => {
          setStudentDrafts(current => ({ ...current, [record.id]: Object.fromEntries(Object.entries(current[record.id] ?? {}).filter(([key]) => key !== field)) }));
          setAddressDrafts(current => ({ ...current, [proposal.id]: { ...(current[proposal.id] ?? suggestedAddressDraft(issue, records)), [field]: value } }));
          setPending(current => Object.fromEntries(Object.entries(current).filter(([id]) => !issues.some(candidate => candidate.id === id && candidate.recordId === record.id && candidate.field === field))));
        }}
        onSelectedChange={selected => setSelectedAddressRepairs(current => ({ ...current, [proposal.id]: selected }))}
        onReset={() => {
          setAddressDrafts(current => ({ ...current, [proposal.id]: suggestedAddressDraft(issue, records) }));
          setSelectedAddressRepairs(current => ({ ...current, [proposal.id]: false }));
        }}
      />,
    }} />;
  };

  const clearAll = () => {
    setPending({});
    setSelectedAddressRepairs({});
    setStudentDrafts({});
  };

  const applyFixes = (now: number) => {
    const fixes: AppliedFix[] = [];
    for (const issue of issues) {
      if (issue.repairProposal) continue;
      const newValue = pending[issue.id];
      // A staged blank is an intentional correction, particularly when
      // removing an invalid phone. Only untouched fields are skipped.
      if (newValue === undefined) continue;
      if (!issue.recordId || !issue.field) continue;
      const record = records.find(r => r.id === issue.recordId);
      const oldValue = issue.currentValue ?? (record ? (record.fields[issue.field] ?? "") : "");
      if (!record && issue.currentValue === undefined) continue;
      fixes.push({
        issueId: issue.id,
        recordId: issue.recordId,
        field: issue.field,
        oldValue,
        newValue,
        ruleId: issue.ruleId,
        appliedAt: now,
      });
    }
    for (const issue of addressIssues) {
      const proposal = issue.repairProposal!;
      if (!selectedAddressRepairs[proposal.id]) continue;
      const record = records.find((candidate) => candidate.id === issue.recordId);
      if (!record || !issue.recordId) continue;
      const draft = addressDrafts[proposal.id] ?? suggestedAddressDraft(issue, records);
      for (const field of ADDRESS_REPAIR_FIELDS) {
        const oldValue = record.fields[field] ?? "";
        const newValue = draft[field] ?? "";
        if (newValue === oldValue) continue;
        fixes.push({
          issueId: issue.id,
          recordId: issue.recordId,
          field,
          oldValue,
          newValue,
          ruleId: issue.ruleId,
          appliedAt: now,
          repairId: proposal.id,
        });
      }
    }
    const edits = studentFixes(now);
    onApply([...session.fixes, ...fixes.filter(fix => {
      const draft = studentDrafts[fix.recordId] ?? {};
      const guardian = guardianSectionForField(fix.field);
      return draft[fix.field] === undefined && !(guardian && draft[guardian] === "");
    }), ...edits]);
  };

  const addressChangeCount = addressIssues.reduce((count, issue) => {
    const proposal = issue.repairProposal!;
    if (!selectedAddressRepairs[proposal.id]) return count;
    const record = records.find((candidate) => candidate.id === issue.recordId);
    const draft = addressDrafts[proposal.id];
    if (!record || !draft) return count;
    return count + ADDRESS_REPAIR_FIELDS.filter((field) => (draft[field] ?? "") !== (record.fields[field] ?? "")).length;
  }, 0);
  const automaticSelectedCount = automaticCandidates.filter(issue => pending[issue.id] !== undefined).length;
  const pendingCount = Object.keys(pending).length + addressChangeCount + studentFixes(0).length;

  return (
    <main style={{ flex: 1, maxWidth: "var(--page-width)", width: "100%", margin: "0 auto", padding: "56px var(--page-gutter) 100px" }}>
      <WorkflowNavigation onBack={onBack} disabled={Boolean(operation)} onNext={() => view === "automatic" ? onContinue() : applyFixes(Date.now())} nextLabel={view === "automatic" ? "Manual fixes" : "Apply fixes and view summary"} nextDescription={view === "automatic" ? "Continue to manual fixes" : "Apply selected fixes and recheck"} />
      {operation && <div className="autofix-feedback" role="status" aria-live="polite">
        <div className={`autofix-feedback-card ${operation.phase === "done" ? "is-done" : ""}`}>
          {operation.phase === "done" ? <CheckCircle2 size={56} /> : <Wand2 size={48} className="autofix-wand" />}
          <h2>{operation.phase === "done" ? `${operation.count} fixes applied` : "Working a little magic…"}</h2>
          <p>{operation.phase === "done" ? "File rechecked. Ready for the next step." : "Applying corrections and checking the results."}</p>
          <div className="fix-operation-track" role="progressbar" aria-label="Apply automatic fixes and recheck" aria-valuemin={0} aria-valuemax={100} aria-valuenow={operation.phase === "done" ? 100 : 0}><span style={{ width: operation.phase === "done" ? "100%" : "0%" }} /></div>
        </div>
      </div>}
      <fieldset disabled={Boolean(operation)} className="fix-controls">
      {applyError && <p role="alert">{applyError}</p>}

      <WorkflowHeading title={view === "automatic" ? "Choose automatic fixes" : "Review manual fixes"} advancedOptions={view === "automatic" ? advancedOptions : undefined} />

      {/* Filters */}
      {exclusions.length > 0 && <p className="cleaning-description">Review exclusions are active. Manage them in Assess quality; validation results are unchanged.</p>}
      {Object.keys(filter).length > 0 && <div className="review-filter">
        <span>{filter.schoolNumber !== undefined ? (filter.schoolNumber ? `School ${filter.schoolNumber}` : "File / unassigned") : filter.ruleId ? issueTypeLabel(filter.ruleId, filter.field) : "Blocking errors"} · {issues.length} issues</span>
        <button className="btn btn-ghost" title="Clear the filter and reset selections" onClick={onClearFilter}>Show all issues</button>
      </div>}

      {groups.filter(group => group.automatic === (view === "automatic")).map(group => {
        const visible = group.items.filter(issue => severityFilter === "all" || issue.severity === severityFilter);
        const visibleIssues = visible;
        return <section key={group.label} aria-label={group.label} className="fix-group fix-group--review">
          {visible.length === 0 && <p className="cleaning-description">{group.items.length ? "No issues match this filter." : "No issues."}</p>}

      {/* Fix table */}
      <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ overflowX: "auto" }}>
          <PagedTable className="data-table" headerControls={{ 0: <select className="input table-header-filter" aria-label="Filter severity" value={severityFilter} onChange={event => setSeverityFilter(event.target.value as typeof severityFilter)}>
            <option value="all">All severities</option><option value="error">Errors only</option><option value="warning">Warnings only</option><option value="info">Info only</option>
          </select> }} pageActions={ids => <div className="autofix-page-actions">
            <button type="button" className="btn btn-ghost" disabled={!pendingCount} onClick={clearAll}>Clear all</button>
            {group.automatic && <>
            <button type="button" className="btn btn-primary" disabled={!automaticSelectedCount} onClick={() => applyAutomatic(automaticCandidates.filter(issue => pending[issue.id] !== undefined))}>Apply selected ({automaticSelectedCount})</button>
            <button type="button" className="btn btn-secondary" disabled={!ids.length} onClick={() => applyAutomatic(automaticCandidates.filter(issue => ids.includes(issue.id)))}>Apply all on current page ({ids.length})</button>
            <button type="button" className="btn btn-primary" disabled={!automaticCandidates.some(issue => severityFilter === "all" || issue.severity === severityFilter)} onClick={() => applyAutomatic(automaticCandidates.filter(issue => severityFilter === "all" || issue.severity === severityFilter))}><Wand2 size={18} /> Apply all across all pages ({automaticCandidates.filter(issue => severityFilter === "all" || issue.severity === severityFilter).length})</button>
            </>}
          </div>}>
            <thead>
              <tr>
                <th style={{ width: 178 }}>Severity</th>
                <th>Record</th>
                <th>Issue</th>
                <th>Field</th>
                <th>Current Value</th>
                <th data-sortable={false}>New Value</th>
              </tr>
            </thead>
            <tbody>
              {visibleIssues.map(issue => {
                const record = records.find(r => r.id === issue.recordId);
                const currentValue = issue.currentValue ?? (issue.field && record ? (record.fields[issue.field] ?? "") : "");
                const isEmptyGuardian = issue.ruleId === "EMPTY_GUARDIAN";
                const suggestedValue = isEmptyGuardian ? "" : issue.suggestedFix;
                const pendingVal = (record && issue.field ? studentDrafts[record.id]?.[issue.field] : undefined) ?? pending[issue.id] ?? "";
                const isGuardianRelationship = issue.field === "GuardianRelationship" || issue.field === "Guardian2Relationship";
                const guardian = guardianSectionForField(issue.field ?? "");
                const guardianRemoved = record && guardian && studentDrafts[record.id]?.[guardian] === "";

                const proposal = issue.repairProposal;
                const recordLabel = record ? studentReference(record) : "File / unassigned";
                return (
                  <tr key={issue.id} data-row-id={issue.id} style={{ opacity: !record && !issue.field && !issue.repairProposal ? 0.5 : 1 }}>
                    <td data-sort-value={issue.severity === "error" ? 0 : issue.severity === "warning" ? 1 : 2}><SeverityBadge severity={issue.severity} /></td>
                    <td data-sort-value={recordLabel} style={{ fontSize: 12 }}>
                      {record ? <StudentEntry record={record} /> : recordLabel}
                    </td>
                    <td style={{ fontSize: 12 }}>{issue.message}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-secondary)" }}>{issue.field || <span style={{ color: "var(--color-text-muted)", fontFamily: "inherit" }}>—</span>}</td>
                    <td>
                      {currentValue ? (
                        <code style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>{currentValue}</code>
                      ) : <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ minWidth: 200 }}>
                      {guardianRemoved ? (
                        <span className="student-removal-notice">Removal staged <button type="button" className="btn btn-ghost" onClick={() => toggleGuardianRemoval(record, guardian, false)}>Undo removal</button></span>
                      ) : proposal && record ? (
                        studentReview(record, issue)
                      ) : group.automatic || isEmptyGuardian ? (
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input type="checkbox" aria-label={`Select fix for ${recordLabel}: ${issue.field}`} checked={pending[issue.id] !== undefined} disabled={suggestedValue === undefined} onChange={event => {
                            if (event.target.checked) stageIssue(issue, suggestedValue!);
                            else setPending(p => Object.fromEntries(Object.entries(p).filter(([id]) => id !== issue.id)));
                          }} />
                          <span>{isEmptyGuardian ? "Remove empty Guardian placeholder" : suggestedValue === "" ? "Clear value" : suggestedValue ?? "No automatic correction available"}</span>
                        </label>
                      ) : isIdentityReview(issue) ? (
                        <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>Review in source</span>
                      ) : record && !issue.field ? (
                        studentReview(record, issue)
                      ) : issue.field ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {isGuardianRelationship ? (
                            <select
                              className="input"
                              value={pendingVal}
                              onChange={e => stageIssue(issue, e.target.value)}
                              style={{ fontSize: 12, padding: "5px 8px" }}
                              aria-label={`${issue.field} for ${recordLabel}`}
                            >
                              <option value="">Select relationship…</option>
                              {rules.allowedRelationshipValues.map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                          ) : (
                            <input
                              className="input"
                              aria-label={`Correct ${issue.field} for ${recordLabel}`}
                              value={pendingVal}
                              onChange={e => stageIssue(issue, e.target.value)}
                              placeholder={issue.suggestedFix ?? "Enter corrected value…"}
                              style={{ fontSize: 12, padding: "5px 8px" }}
                            />
                          )}
                          {issue.suggestedFix && pendingVal !== issue.suggestedFix && (
                            <button
                              onClick={() => stageIssue(issue, issue.suggestedFix!)}
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: "4px 7px", whiteSpace: "nowrap" as const }}
                              title={`Use suggested: ${issue.suggestedFix}`}
                            >
                              Use suggested
                            </button>
                          )}
                          {issue.field.includes("Phone") && (
                            <button
                              type="button"
                              onClick={() => stageIssue(issue, "")}
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: "4px 7px", whiteSpace: "nowrap" as const }}
                            >
                              Clear value
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>No field — review manually</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PagedTable>
        </div>
      </div>

        </section>;
      })}

      </fieldset>
    </main>
  );
}
