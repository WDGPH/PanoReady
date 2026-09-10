"use client";
import { useState } from "react";
import { ArrowRight, RefreshCw, Wand2 } from "lucide-react";
import AddressRepairCard from "@/components/AddressRepairCard";
import { ADDRESS_REPAIR_FIELDS } from "@/lib/addressRepair";
import { defaultRules } from "@/lib/rulesets";
import type { AppliedFix, ValidateSession, ValidationIssue, ValidationSeverity } from "@/lib/types";
import { guardianRelationshipContext, suggestedAddressDraft } from "./helpers";
import { SeverityBadge } from "./ValidationBadges";
import { issueTypeLabel, matchesReviewFilter } from "./overview";
import type { ReviewFilter } from "./overview";

// ─── ValidateFixView ──────────────────────────────────────────────────────────
// Screen 3: Fix Data

export default function FixView({
  session,
  onApply,
  filter = {},
  onClearFilter,
}: {
  session: ValidateSession;
  onApply: (fixes: AppliedFix[]) => void;
  filter?: ReviewFilter;
  onClearFilter: () => void;
}) {
  const records = session.initialResult.records;
  const rules = session.validationRules ?? defaultRules;
  // Retain previously applied fixes when revisiting this step.
  const resolvedIssueIds = new Set(session.fixes.map((f) => f.issueId));
  const recordSchools = new Map(records.map(record => [record.id, record.fields.SchoolNumber]));
  const issues = session.initialResult.issues.filter((issue) => !resolvedIssueIds.has(issue.id)
    && matchesReviewFilter(issue, filter, recordSchools.get(issue.recordId ?? "") ?? issue.schoolNumber ?? ""));
  const addressIssues = issues.filter((issue) => issue.repairProposal?.kind === "address" && issue.recordId);

  // pending: issueId → new value. A present empty value is an intentional removal.
  const [pending, setPending] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const issue of issues) {
      if (!issue.repairProposal && issue.ruleId !== "EMPTY_GUARDIAN" && issue.autoFixable && issue.suggestedFix !== undefined) {
        init[issue.id] = issue.suggestedFix;
      }
    }
    return init;
  });
  const [addressDrafts, setAddressDrafts] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(addressIssues.map((issue) => [issue.repairProposal!.id, suggestedAddressDraft(issue, records)])),
  );
  const [selectedAddressRepairs, setSelectedAddressRepairs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(addressIssues.map((issue) => [issue.repairProposal!.id, false])),
  );

  const [removeGuardians, setRemoveGuardians] = useState(false);
  const emptyGuardians = issues.filter(issue => issue.ruleId === "EMPTY_GUARDIAN" && issue.recordId && issue.field);
  const [severityFilter, setSeverityFilter] = useState<"all" | ValidationSeverity>("all");

  const isAutomatic = (issue: ValidationIssue) => !issue.repairProposal && (issue.autoFixable || issue.ruleId === "EMPTY_GUARDIAN");
  const groups = [
    { label: "Automatic fixes", items: issues.filter(isAutomatic), automatic: true },
    { label: "Needs review", items: issues.filter(issue => !isAutomatic(issue)), automatic: false },
  ];

  const autoFillAll = () => {
    const next: Record<string, string> = { ...pending };
    for (const issue of issues) {
      if (!issue.repairProposal && issue.ruleId !== "EMPTY_GUARDIAN" && issue.autoFixable && issue.suggestedFix !== undefined) {
        next[issue.id] = issue.suggestedFix;
      }
    }
    setPending(next);
    setRemoveGuardians(true);

  };

  const clearAll = () => {
    setPending({});
    setRemoveGuardians(false);
    setSelectedAddressRepairs({});
  };

  const applyFixes = () => {
    const fixes: AppliedFix[] = [];
    const now = Date.now();
    for (const issue of issues) {
      if (issue.repairProposal || issue.ruleId === "EMPTY_GUARDIAN") continue;
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
    if (removeGuardians) for (const issue of emptyGuardians) {
      fixes.push({ issueId: issue.id, recordId: issue.recordId!, field: issue.field!, oldValue: "Empty Guardian placeholder", newValue: "", ruleId: issue.ruleId, appliedAt: now });
    }
    onApply([...session.fixes, ...fixes]);
  };

  const addressChangeCount = addressIssues.reduce((count, issue) => {
    const proposal = issue.repairProposal!;
    if (!selectedAddressRepairs[proposal.id]) return count;
    const record = records.find((candidate) => candidate.id === issue.recordId);
    const draft = addressDrafts[proposal.id];
    if (!record || !draft) return count;
    return count + ADDRESS_REPAIR_FIELDS.filter((field) => (draft[field] ?? "") !== (record.fields[field] ?? "")).length;
  }, 0);
  const pendingCount = Object.keys(pending).length + addressChangeCount + (removeGuardians ? emptyGuardians.length : 0);

  return (
    <main style={{ flex: 1, maxWidth: "var(--page-width)", width: "100%", margin: "0 auto", padding: "56px var(--page-gutter) 100px" }}>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Review corrections</h1>
          <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 13 }}>
            {pendingCount} changes selected
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={clearAll} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>Clear All</button>
          <button onClick={autoFillAll} className="btn btn-secondary" style={{ fontSize: 12, padding: "6px 12px", gap: 5 }}>
            <Wand2 size={13} /> Fill automatic fixes
          </button>
        </div>
      </div>

      {/* Filters */}
      {Object.keys(filter).length > 0 && <div className="review-filter">
        <span>{filter.schoolNumber !== undefined ? (filter.schoolNumber ? `School ${filter.schoolNumber}` : "File / unassigned") : filter.ruleId ? issueTypeLabel(filter.ruleId, filter.field) : "Blocking errors"} · {issues.length} issues</span>
        <button className="btn btn-ghost" title="Clear the filter and reset selections" onClick={onClearFilter}>Show all issues</button>
      </div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginBottom: 14 }}>
        <select
          className="input"
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value as typeof severityFilter)}
          style={{ flex: "0 0 140px" }}
        >
          <option value="all">All severities</option>
          <option value="error">Errors only</option>
          <option value="warning">Warnings only</option>
          <option value="info">Info only</option>
        </select>

      </div>

      {groups.map(group => {
        const visible = group.items.filter(issue => severityFilter === "all" || issue.severity === severityFilter);
        const visibleIssues = visible.filter(issue => !issue.repairProposal && issue.ruleId !== "EMPTY_GUARDIAN");
        const visibleAddressIssues = visible.filter(issue => issue.repairProposal && issue.recordId);
        const visibleGuardians = visible.filter(issue => issue.ruleId === "EMPTY_GUARDIAN");
        return <section key={group.label} aria-label={group.label} className="fix-group">
          <h2>{group.label} <span className="optional-label">({group.items.length})</span></h2>
          {group.automatic && group.items.length > 0 && <p className="cleaning-description">Review the selected corrections before applying.</p>}
          {visible.length === 0 && <p className="cleaning-description">{group.items.length ? "No issues match this filter." : "No issues."}</p>}
          {visibleGuardians.length > 0 && <label className="guardian-removal">
            <input type="checkbox" checked={removeGuardians} onChange={event => setRemoveGuardians(event.target.checked)} />
            Remove {emptyGuardians.length} empty Guardian placeholder{emptyGuardians.length === 1 ? "" : "s"}
          </label>}
      {visibleAddressIssues.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
            <div>
              <h2 style={{ margin: "0 0 3px", fontSize: 16 }}>Address repairs</h2>

            </div>
            <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{visibleAddressIssues.length} address{visibleAddressIssues.length === 1 ? "" : "es"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {visibleAddressIssues.map((issue) => {
              const proposal = issue.repairProposal!;
              const record = records.find((candidate) => candidate.id === issue.recordId);
              if (!record) return null;
              return (
                <AddressRepairCard
                  key={proposal.id}
                  proposal={proposal}
                  record={record}
                  studentName={issue.studentName}
                  schoolNumber={issue.schoolNumber}
                  rules={session.validationRules ?? defaultRules}
                  draft={addressDrafts[proposal.id] ?? suggestedAddressDraft(issue, records)}
                  selected={selectedAddressRepairs[proposal.id] ?? false}
                  onDraftChange={(field, value) => setAddressDrafts((current) => ({
                    ...current,
                    [proposal.id]: { ...(current[proposal.id] ?? suggestedAddressDraft(issue, records)), [field]: value },
                  }))}
                  onSelectedChange={(selected) => setSelectedAddressRepairs((current) => ({ ...current, [proposal.id]: selected }))}
                  onReset={() => {
                    setAddressDrafts((current) => ({ ...current, [proposal.id]: suggestedAddressDraft(issue, records) }));
                    setSelectedAddressRepairs((current) => ({ ...current, [proposal.id]: false }));
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* Fix table */}
      {visibleIssues.length > 0 && <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Severity</th>
                <th>Student</th>
                <th>Field</th>
                <th>Current Value</th>
                <th>New Value</th>
              </tr>
            </thead>
            <tbody>
              {visibleIssues.map(issue => {
                const record = records.find(r => r.id === issue.recordId);
                const currentValue = issue.currentValue ?? (issue.field && record ? (record.fields[issue.field] ?? "") : "");
                const pendingVal = pending[issue.id] ?? "";
                const isGuardianRelationship = issue.field === "GuardianRelationship" || issue.field === "Guardian2Relationship";

                const guardianContext = guardianRelationshipContext(issue, record);
                return (
                  <tr key={issue.id} style={{ opacity: !issue.field ? 0.5 : 1 }}>
                    <td><SeverityBadge severity={issue.severity} /></td>
                    <td style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 500 }}>{issue.studentName || "—"}</div>
                      <div style={{ fontSize: 12, marginTop: 4 }}>{issue.message}</div>
                      <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{issue.schoolNumber}</div>
                      {guardianContext && (
                        <div style={{ color: "var(--color-text-secondary)", fontSize: 11, marginTop: 5, lineHeight: 1.45 }}>
                          <strong>{guardianContext.label}:</strong>{guardianContext.hasDetails
                            ? <>{guardianContext.name ? ` ${guardianContext.name}` : ""}{guardianContext.name && guardianContext.phone ? <br /> : null}{guardianContext.phone}</>
                            : " Empty in source XML"}
                          {guardianContext.oen && <div>OEN: {guardianContext.oen}</div>}
                        </div>
                      )}
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-secondary)" }}>{issue.field || <span style={{ color: "var(--color-text-muted)", fontFamily: "inherit" }}>—</span>}</td>
                    <td>
                      {currentValue ? (
                        <code style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>{currentValue}</code>
                      ) : <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ minWidth: 200 }}>
                      {issue.field ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {isGuardianRelationship ? (
                            <select
                              className="input"
                              value={pendingVal}
                              onChange={e => setPending(p => ({ ...p, [issue.id]: e.target.value }))}
                              style={{ fontSize: 12, padding: "5px 8px" }}
                              aria-label={`Relationship for ${issue.studentName || "student"}`}
                            >
                              <option value="">Select relationship…</option>
                              {rules.allowedRelationshipValues.map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                          ) : (
                            <input
                              className="input"
                              value={pendingVal}
                              onChange={e => setPending(p => ({ ...p, [issue.id]: e.target.value }))}
                              placeholder={issue.suggestedFix ?? "Enter corrected value…"}
                              style={{ fontSize: 12, padding: "5px 8px" }}
                            />
                          )}
                          {issue.suggestedFix && pendingVal !== issue.suggestedFix && (
                            <button
                              onClick={() => setPending(p => ({ ...p, [issue.id]: issue.suggestedFix! }))}
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
                              onClick={() => setPending(p => ({ ...p, [issue.id]: "" }))}
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
          </table>
        </div>
      </div>}

        </section>;
      })}

      {/* Apply */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={applyFixes} className="btn btn-primary" style={{ gap: 6 }}>
          <RefreshCw size={14} />
          Apply fixes and recheck{pendingCount > 0 ? ` (${pendingCount})` : ""}
          <ArrowRight size={14} />
        </button>
      </div>
    </main>
  );
}
