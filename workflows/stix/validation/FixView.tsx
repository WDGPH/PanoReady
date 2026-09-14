"use client";
import WorkflowHeading from "@/components/WorkflowHeading";
import WorkflowNavigation from "@/components/WorkflowNavigation";
import PagedTable from "@/components/PagedTable";
import StatCard from "@/components/StatCard";
import StudentEntry from "@/components/StudentEntry";
import { fieldHierarchy } from "@/lib/fields";
import { type ReactNode, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import AddressRepairCard from "@/components/AddressRepairCard";
import { ADDRESS_REPAIR_FIELDS } from "@/lib/addressRepair";
import { draftTargetKey, staleDraftKeys } from "@/lib/session";
import SeverityFilter from "@/components/SeverityFilter";
import { defaultRules } from "@/lib/rulesets";
import type { AppliedFix, ValidateSession, ValidationIssue, ValidationSeverity } from "@/lib/types";
import { suggestedAddressDraft } from "./helpers";
import { SeverityBadge } from "./ValidationBadges";
import { issueTypeLabel, matchesReviewFilter, isExcludedFromReview, summarizeValidation, percentage } from "./overview";
import type { ReviewFilter, ReviewExclusion } from "./overview";

// ─── ValidateFixView ──────────────────────────────────────────────────────────
// Screen 3: Fix Data

export default function FixView({
  session,
  saveProgress,
  advancedOptions,
  onApply,
  onBack,
  filter = {},
  onClearFilter,
  exclusions = [],
  view,
  onContinue,
  onAutoApply,
  onDraftsChange,
}: {
  advancedOptions?: ReactNode;
  onBack: () => void;
  session: ValidateSession;
  saveProgress?: ReactNode;
  onApply: (fixes: AppliedFix[]) => void;
  filter?: ReviewFilter;
  onClearFilter: () => void;
  exclusions?: ReviewExclusion[];
  view: "automatic" | "manual";
  onContinue: () => void;
  onAutoApply: (fixes: AppliedFix[]) => void;
  onDraftsChange: (drafts: ValidateSession["drafts"]) => void;
}) {
  const currentResult = session.currentResult;
  const summary = summarizeValidation(currentResult, session.document.schools);
  const records = currentResult.records;
  const recordById = new Map(records.map((record) => [record.id, record]));
  const rules = session.validationRules ?? defaultRules;
  // Retain previously applied fixes when revisiting this step.
  const recordSchools = new Map(records.map(record => [record.id, record.fields.SchoolNumber]));
  const issues = currentResult.issues.filter((issue) => !isExcludedFromReview(issue, exclusions, recordSchools.get(issue.recordId ?? "") ?? issue.schoolNumber ?? "")
    && matchesReviewFilter(issue, filter, recordSchools.get(issue.recordId ?? "") ?? issue.schoolNumber ?? ""));
  const addressIssues = issues.filter((issue) => issue.repairProposal?.kind === "address" && issue.recordId);
  const addressTargets = [...new Map(addressIssues.map((issue) => [issue.recordId, issue])).values()];

  // A present empty value is an intentional removal; stable keys survive revalidation.
  const pending = session.drafts.values;
  const [addressIssueId, setAddressIssueId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const addressDrafts = session.drafts.addresses;

  const [severityFilter, setSeverityFilter] = useState<"all" | ValidationSeverity>("all");
  const [reviewStatus, setReviewStatus] = useState<"all" | "remaining" | "applied">("all");
  const issueOldValue = (issue: ValidationIssue) => issue.currentValue ?? recordById.get(issue.recordId ?? "")?.fields[issue.field ?? ""] ?? "";
  const stageValue = (issue: ValidationIssue, value: string) => {
    const key = draftTargetKey(issue);
    const existing = session.drafts.values[key];
    onDraftsChange({
      ...session.drafts,
      values: {
        ...session.drafts.values,
        [key]: {
          value,
          // Keep the original expectation while a draft is edited. If the
          // document changed underneath it, stale detection must remain active.
          expected: existing?.expected ?? { recordId: issue.recordId!, targetId: issue.targetId, field: issue.field!, oldValue: issueOldValue(issue) },
        },
      },
    });
  };
  const clearValue = (key: string) => onDraftsChange({
    ...session.drafts,
    values: Object.fromEntries(Object.entries(session.drafts.values).filter(([id]) => id !== key)),
  });
  const { values: staleDraftIds, addresses: staleAddressIds } = staleDraftKeys(session.document, session.drafts);
  const staleDraftCount = staleDraftIds.length + staleAddressIds.length;

  const isAutomatic = (issue: ValidationIssue) => !issue.repairProposal && (issue.autoFixable || issue.ruleId === "EMPTY_GUARDIAN");
  const groups = [
    { label: "Automatic fixes", items: issues.filter(isAutomatic), automatic: true },
    { label: "Needs review", items: issues, automatic: false },
  ];

  const automaticCandidates = issues.filter(issue => isAutomatic(issue) && issue.recordId && issue.field && (issue.ruleId === "EMPTY_GUARDIAN" || issue.suggestedFix !== undefined));
  const applyAutomatic = (candidates: ValidationIssue[], selectedOnly = false) => {
    if (selectedOnly) candidates = [...new Map(candidates.map((issue) => [draftTargetKey(issue), issue])).values()];
    if (selectedOnly && candidates.some((issue) => staleDraftIds.includes(draftTargetKey(issue)))) {
      setApplyError("Discard outdated edits before applying the selected changes.");
      return;
    }
    if (!candidates.length) return;
    const batch: AppliedFix[] = candidates.map(issue => {
      const draft = pending[draftTargetKey(issue)];
      if (selectedOnly && !draft) throw new Error("The selected fix is no longer staged.");
      return { issueId: issue.id, recordId: issue.recordId!, targetId: issue.targetId, field: issue.field!, oldValue: selectedOnly ? draft!.expected.oldValue : issueOldValue(issue), newValue: selectedOnly ? draft!.value : issue.ruleId === "EMPTY_GUARDIAN" ? "" : issue.suggestedFix!, ruleId: issue.ruleId, appliedAt: 0 };
    });
    setApplyError(null);
    try {
      onAutoApply(batch);
    } catch (cause) {
      setApplyError(cause instanceof Error ? cause.message : "Unable to apply fixes.");
    }
  };

  const scopedIssueIds = new Set((view === "automatic" ? automaticCandidates : issues).map(draftTargetKey));
  const scopedRepairIds = new Set(view === "manual" ? addressIssues.map((issue) => issue.recordId!) : []);
  const clearAll = () => {
    onDraftsChange({
      ...session.drafts,
      values: Object.fromEntries(Object.entries(session.drafts.values).filter(([id]) => !scopedIssueIds.has(id))),
      addresses: Object.fromEntries(Object.entries(session.drafts.addresses).filter(([id]) => !scopedRepairIds.has(id))),
    });
  };

  const applyFixes = () => {
    if (staleDraftCount) {
      setApplyError("Discard outdated edits before applying the selected changes.");
      return;
    }
    const fixes: AppliedFix[] = [];
    const included = new Set<string>();
    for (const issue of issues) {
      if (issue.repairProposal || included.has(draftTargetKey(issue))) continue;
      included.add(draftTargetKey(issue));
      const draft = pending[draftTargetKey(issue)];
      const newValue = draft?.value;
      // A staged blank is an intentional correction, particularly when
      // removing an invalid phone. Only untouched fields are skipped.
      if (newValue === undefined) continue;
      if (!issue.recordId || !issue.field) continue;
      const record = recordById.get(issue.recordId);
      const oldValue = draft?.expected.oldValue ?? issue.currentValue ?? (record ? (record.fields[issue.field] ?? "") : "");
      if (!record && issue.currentValue === undefined) continue;
      fixes.push({
        issueId: issue.id,
        recordId: issue.recordId,
        targetId: issue.targetId,
        field: issue.field,
        oldValue,
        newValue,
        ruleId: issue.ruleId,
        appliedAt: 0,
      });
    }
    for (const issue of addressTargets) {
      const proposal = issue.repairProposal!;
      const addressDraft = addressDrafts[issue.recordId!];
      if (!addressDraft?.selected) continue;
      const record = recordById.get(issue.recordId ?? "");
      if (!record || !issue.recordId) continue;
      const draft = addressDraft?.values ?? suggestedAddressDraft(issue, records);
      for (const field of ADDRESS_REPAIR_FIELDS) {
        const oldValue = addressDraft?.expectedValues[field] ?? record.fields[field] ?? "";
        const newValue = draft[field] ?? "";
        if (newValue === oldValue) continue;
        fixes.push({
          issueId: issue.id,
          recordId: issue.recordId,
          targetId: issue.targetId,
          field,
          oldValue,
          newValue,
          ruleId: issue.ruleId,
          appliedAt: 0,
          repairId: proposal.id,
        });
      }
    }
    if (!fixes.length) return;
    setApplyError(null);
    try { onApply(fixes); }
    catch (cause) { setApplyError(cause instanceof Error ? cause.message : "Unable to apply fixes."); }
  };

  const addressChangeCount = addressTargets.reduce((count, issue) => {
    const addressDraft = addressDrafts[issue.recordId!];
    if (!addressDraft?.selected) return count;
    const record = recordById.get(issue.recordId ?? "");
    const draft = addressDraft.values;
    if (!record || !draft) return count;
    return count + ADDRESS_REPAIR_FIELDS.filter((field) => (draft[field] ?? "") !== (record.fields[field] ?? "")).length;
  }, 0);
  const pendingCount = new Set((view === "automatic" ? automaticCandidates : issues).filter((issue) => !issue.repairProposal && pending[draftTargetKey(issue)] !== undefined).map(draftTargetKey)).size + (view === "manual" ? addressChangeCount : 0);
  const hasPendingDrafts = Object.keys(pending).some((key) => scopedIssueIds.has(key)) || Object.keys(addressDrafts).some((key) => scopedRepairIds.has(key));
  const appliedChanges = session.history.flatMap((group) => group.changes.map((change, index) => ({ group, change, index })));
  return (
    <main style={{ flex: 1, maxWidth: "var(--page-width)", width: "100%", margin: "0 auto", padding: "56px var(--page-gutter) 100px" }}>
      <WorkflowNavigation secondaryAction={saveProgress} onBack={onBack} backLabel={view === "manual" ? "Return to automatic fixes" : "Back"} onNext={onContinue} nextLabel={view === "automatic" ? "Manual fixes" : "View summary"} nextDescription={view === "automatic" ? "Continue to manual fixes" : "Review the current checked document and downloads"} />
      <Dialog.Root open={addressIssueId !== null} onOpenChange={(open) => { if (!open) setAddressIssueId(null); }}><Dialog.Portal>
        <Dialog.Overlay className="address-dialog-overlay" />
        <Dialog.Content className="address-dialog">
          <Dialog.Title>Edit address</Dialog.Title>
          <Dialog.Description className="cleaning-description">Edit the address fields, then return to the table and apply the selected changes.</Dialog.Description>
          {(() => {
            const issue = addressIssues.find((candidate) => candidate.id === addressIssueId);
            if (!issue) return null;
              const proposal = issue.repairProposal!;
              const record = recordById.get(issue.recordId ?? "");
              if (!record) return null;
              return (
                <AddressRepairCard
                  key={proposal.id}
                  proposal={proposal}
                  record={record}
                  rules={session.validationRules ?? defaultRules}
                  draft={addressDrafts[issue.recordId!]?.values ?? suggestedAddressDraft(issue, records)}
                  selected={addressDrafts[issue.recordId!]?.selected ?? false}
                  onDraftChange={(field, value) => {
                    const existing = session.drafts.addresses[issue.recordId!];
                    onDraftsChange({
                      ...session.drafts,
                      addresses: {
                        ...session.drafts.addresses,
                        [issue.recordId!]: {
                          values: { ...(existing?.values ?? suggestedAddressDraft(issue, records)), [field]: value },
                          expectedValues: existing?.expectedValues ?? Object.fromEntries(ADDRESS_REPAIR_FIELDS.map((name) => [name, record.fields[name] ?? ""])),
                          selected: true,
                        },
                      },
                    });
                  }}
                  onSelectedChange={(selected) => {
                    const existing = session.drafts.addresses[issue.recordId!];
                    onDraftsChange({
                      ...session.drafts,
                      addresses: {
                        ...session.drafts.addresses,
                        [issue.recordId!]: {
                          values: existing?.values ?? suggestedAddressDraft(issue, records),
                          selected,
                          expectedValues: existing?.expectedValues ?? Object.fromEntries(ADDRESS_REPAIR_FIELDS.map((name) => [name, record.fields[name] ?? ""])),
                        },
                      },
                    });
                  }}
                  onReset={() => onDraftsChange({
                    ...session.drafts,
                    addresses: Object.fromEntries(Object.entries(session.drafts.addresses).filter(([key]) => key !== issue.recordId)),
                  })}
                />
              );

          })()}
          <div className="address-dialog-actions"><Dialog.Close asChild><button type="button" className="btn btn-primary">Back to fixes</button></Dialog.Close></div>
        </Dialog.Content>
      </Dialog.Portal></Dialog.Root>
      <div className="fix-controls">
      {applyError && <p role="alert">{applyError}</p>}
      {staleDraftCount > 0 && <div role="alert"><p>{staleDraftCount} pending edit{staleDraftCount === 1 ? " is" : "s are"} outdated because the original value changed or its target was removed. Discard the outdated edits, then review the current values.</p><button type="button" className="btn btn-secondary" onClick={() => {
        const stale = new Set(staleDraftIds);
        const staleAddress = new Set(staleAddressIds);
        onDraftsChange({
          ...session.drafts,
          values: Object.fromEntries(Object.entries(session.drafts.values).filter(([key]) => !stale.has(key))),
          addresses: Object.fromEntries(Object.entries(session.drafts.addresses).filter(([key]) => !staleAddress.has(key))),
        });
      }}>Discard outdated edits</button></div>}

      <WorkflowHeading title={view === "automatic" ? "Choose automatic fixes" : "Review manual fixes"} advancedOptions={view === "automatic" ? advancedOptions : undefined} />
      <div className="summary-stats summary-stats--four" role="status" aria-label="Current file quality, including filtered and excluded findings" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 28, marginBottom: 24 }}>
        <StatCard label="Blocking errors" value={summary.errors} accent="red" />
        <StatCard label="Warnings" value={summary.warnings} accent="yellow" />
        <StatCard label="Affected students" value={summary.affected} sub={`of ${summary.students.toLocaleString()} students (${percentage(summary.affected, summary.students)})`} />
        <StatCard label="Auto-fixable issues" value={summary.automatic} sub={`of ${summary.total.toLocaleString()} issues (${percentage(summary.automatic, summary.total)})`} />
      </div>

      <div className="review-view-tabs" role="group" aria-label="Review status">
        {(["all", "remaining", "applied"] as const).map((status) => <button key={status} type="button" aria-pressed={reviewStatus === status} className={reviewStatus === status ? "btn btn-secondary" : "btn btn-ghost"} onClick={() => setReviewStatus(status)}>{status[0].toUpperCase() + status.slice(1)}</button>)}
      </div>

      {/* Filters */}
      {exclusions.length > 0 && <p className="cleaning-description">Review exclusions are active. Manage them in Assess quality; validation results are unchanged.</p>}
      {Object.keys(filter).length > 0 && <div className="review-filter">
        <span>{filter.schoolNumber !== undefined ? (filter.schoolNumber ? `School ${filter.schoolNumber}` : "File / unassigned") : filter.ruleId ? issueTypeLabel(filter.ruleId, filter.field) : "Blocking errors"} · {issues.length} issues</span>
        <button className="btn btn-ghost" title="Show all findings without discarding pending edits" onClick={onClearFilter}>Show all issues</button>
      </div>}

      {reviewStatus !== "applied" && groups.filter(group => group.automatic === (view === "automatic")).map(group => {
        const visible = group.items.filter(issue => severityFilter === "all" || issue.severity === severityFilter);
        const visibleIssues = visible;
        return <section key={group.label} aria-label={group.label} className="fix-group fix-group--review">
          {visible.length === 0 && <p className="cleaning-description">{group.items.length ? "No issues match this filter." : "No issues."}</p>}

      {/* Fix table */}
      <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ overflowX: "auto" }}>
          <PagedTable className="data-table correction-table" headerControls={{ 0: <SeverityFilter value={severityFilter} onChange={setSeverityFilter} /> }} pageActions={ids => <div className="autofix-page-actions">
            <div className="autofix-apply-actions">
            {group.automatic && <>
            <button type="button" className="text-action" disabled={!pendingCount || automaticCandidates.some((issue) => pending[draftTargetKey(issue)] !== undefined && staleDraftIds.includes(draftTargetKey(issue)))} onClick={() => applyAutomatic(automaticCandidates.filter(issue => pending[draftTargetKey(issue)] !== undefined), true)}>Apply selected ({pendingCount})</button>
            <button type="button" className="text-action" disabled={!ids.length} onClick={() => applyAutomatic(automaticCandidates.filter(issue => ids.includes(issue.id)))}>Apply current page ({ids.length})</button>
            <button type="button" className="text-action" disabled={!automaticCandidates.some(issue => severityFilter === "all" || issue.severity === severityFilter)} onClick={() => applyAutomatic(automaticCandidates.filter(issue => severityFilter === "all" || issue.severity === severityFilter))}>Apply all pages ({automaticCandidates.filter(issue => severityFilter === "all" || issue.severity === severityFilter).length})</button>
            </>}
            {!group.automatic && <button type="button" className="btn btn-primary" disabled={!pendingCount || staleDraftCount > 0} onClick={applyFixes}>Apply selected ({pendingCount})</button>}
            </div>
            <button type="button" className="btn btn-ghost autofix-clear-action" disabled={!hasPendingDrafts} onClick={clearAll}>Clear selected</button>
          </div>} rows={visibleIssues} rowKey={(issue) => issue.id} rowId={(issue) => issue.id} sortValue={(issue, column) => [issue.severity === "error" ? 0 : issue.severity === "warning" ? 1 : 2, issue.recordId ?? "", issue.field ?? "", issue.message, issue.currentValue ?? ""][column] ?? ""} renderRow={issue => {
                const record = recordById.get(issue.recordId ?? "");
                const currentValue = issue.currentValue ?? (issue.field && record ? (record.fields[issue.field] ?? "") : "");
                const isEmptyGuardian = issue.ruleId === "EMPTY_GUARDIAN";
                const suggestedValue = isEmptyGuardian ? "" : issue.suggestedFix;
                const pendingVal = pending[draftTargetKey(issue)]?.value ?? "";
                const isGuardianRelationship = issue.field === "GuardianRelationship" || issue.field === "Guardian2Relationship";

                const hierarchy = issue.field ? fieldHierarchy(issue.field) : undefined;
                return (
                  <tr key={issue.id} data-row-id={issue.id} style={{ opacity: !issue.field && !issue.repairProposal ? 0.5 : 1 }}>
                    <td data-sort-value={issue.severity === "error" ? 0 : issue.severity === "warning" ? 1 : 2}><SeverityBadge severity={issue.severity} /></td>
                    <td style={{ fontSize: 12 }}>
                      {record ? <StudentEntry record={record} /> : <div style={{ fontWeight: 500 }}>{issue.studentName || "—"}</div>}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-secondary)" }}>{issue.field ? <span className="field-location" title={hierarchy} tabIndex={hierarchy ? 0 : undefined} aria-label={hierarchy}>{issue.field.split(/(?=[A-Z])/).map((part, index) => <span key={index}>{index > 0 && <wbr />}{part}</span>)}</span> : "—"}</td>
                    <td style={{ fontSize: 12 }}>{issue.message}</td>
                    <td>
                      {currentValue ? (
                        <code style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>{currentValue}</code>
                      ) : <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>}
                    </td>
                    <td>
                      {issue.ruleId === "OEN_DUPLICATE" || issue.ruleId === "OEN_DUAL_ENROLLMENT" ? (
                        <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>Resolve in the source file</span>
                      ) : issue.repairProposal ? (
                        <button type="button" className="text-action" onClick={() => setAddressIssueId(issue.id)}>Edit address</button>
                      ) : group.automatic || isEmptyGuardian ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                          <span>{isEmptyGuardian ? "Remove empty Guardian placeholder" : suggestedValue === "" ? "Remove value" : suggestedValue ?? "No automatic correction available"}</span>
                          <button type="button" className="text-action" aria-label={`Select fix for ${issue.studentName || "student"}: ${issue.field}`} aria-pressed={pending[draftTargetKey(issue)] !== undefined} disabled={suggestedValue === undefined} onClick={() => {
                            if (pending[draftTargetKey(issue)] === undefined) stageValue(issue, suggestedValue!);
                            else clearValue(draftTargetKey(issue));
                          }}>{pending[draftTargetKey(issue)] !== undefined ? "Selected ✓" : "Select"}</button>
                        </div>
                      ) : issue.field ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {isGuardianRelationship ? (
                            <select
                              className="input"
                              value={pendingVal}
                              onChange={e => stageValue(issue, e.target.value)}
                              style={{ fontSize: 12, padding: "5px 8px" }}
                              aria-label={`Relationship for ${issue.studentName || "student"}`}
                            >
                              <option value="">Select relationship…</option>
                              {rules.allowedRelationshipValues.map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                          ) : (
                            <input
                              className="input"
                              aria-label={`Correct ${issue.field} for ${issue.studentName || "record"}`}
                              value={pendingVal}
                              onChange={e => stageValue(issue, e.target.value)}
                              placeholder="Enter corrected value…"
                              style={{ fontSize: 12, padding: "5px 8px" }}
                            />
                          )}
                          {issue.field.includes("Phone") && (
                            <button
                              type="button"
                              onClick={() => stageValue(issue, "")}
                              className="text-action"
                              title="Select an empty value; apply the change to remove it from the file."
                              style={{ fontSize: 11, padding: "4px 7px", whiteSpace: "nowrap" as const }}
                            >
                              Remove value
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>No field — review manually</span>
                      )}
                    </td>
                  </tr>
                );
              }}>
            <thead>
              <tr>
                <th style={{ width: "12%" }}>Severity</th>
                <th style={{ width: "11%" }}>Record</th>
                <th style={{ width: "16%" }}>Field</th>
                <th style={{ width: "25%" }}>Issue</th>
                <th style={{ width: "12%" }}>Current value</th>
                <th style={{ width: "24%" }} data-sortable={false}>Action</th>
              </tr>
            </thead>
          </PagedTable>
        </div>
      </div>

        </section>;
      })}

      {reviewStatus === "applied" && <section className="fix-group fix-group--review" aria-label="Applied fixes">
        {session.history.length === 0 ? <p className="cleaning-description">No changes have been applied in this session.</p> : <div className="overview-table"><PagedTable className="data-table" rows={appliedChanges} rowKey={({ group, index }) => `${group.id}-${index}`} sortValue={({ group, change }, column) => [group.label, change.field, change.oldValue, change.newValue, group.status][column] ?? ""} renderRow={({ group, change, index }) => <tr key={`${group.id}-${index}`} style={{ opacity: group.status === "applied" ? 1 : 0.65 }}><td>{group.label}</td><td>{change.field}</td><td>{change.oldValue || "(blank)"}</td><td>{change.newValue || "(blank)"}</td><td>{group.status === "applied" ? "Applied" : group.status === "undone" ? "Undone" : "Changed again"}</td></tr>}>
          <thead><tr><th>Action</th><th>Field</th><th>Original value</th><th>New value</th><th>Status</th></tr></thead>
        </PagedTable></div>}
      </section>}

      </div>
    </main>
  );
}
