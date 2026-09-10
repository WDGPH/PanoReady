"use client";
import { useState } from "react";
import { ArrowLeft, ArrowRight, RefreshCw, Wand2 } from "lucide-react";
import AddressRepairCard from "@/components/AddressRepairCard";
import { ADDRESS_REPAIR_FIELDS } from "@/lib/addressRepair";
import { defaultRules } from "@/lib/rulesets";
import type { AppliedFix, ValidateSession, ValidationSeverity } from "@/lib/types";
import { guardianRelationshipContext, suggestedAddressDraft } from "./helpers";
import { SeverityBadge } from "./ValidationBadges";

// ─── ValidateFixView ──────────────────────────────────────────────────────────
// Screen 3: Fix Data

export default function FixView({
  session,
  onBack,
  onApply,
}: {
  session: ValidateSession;
  onBack: () => void;
  onApply: (fixes: AppliedFix[]) => void;
}) {
  const records = session.initialResult.records;
  const rules = session.validationRules ?? defaultRules;
  // Address fixes already staged and applied from the Issue Review page arrive via session.fixes;
  // don't re-offer those issues here, and fold the fixes back in unchanged when this page applies its own.
  const resolvedIssueIds = new Set(session.fixes.map((f) => f.issueId));
  const issues = session.initialResult.issues.filter((issue) => !resolvedIssueIds.has(issue.id));
  const addressIssues = issues.filter((issue) => issue.repairProposal?.kind === "address" && issue.recordId);

  // pending: issueId → new value. A present empty value is an intentional removal.
  const [pending, setPending] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const issue of issues) {
      if (!issue.repairProposal && issue.autoFixable && issue.suggestedFix !== undefined) {
        init[issue.id] = issue.suggestedFix;
      }
    }
    return init;
  });
  const [addressDrafts, setAddressDrafts] = useState<Record<string, Record<string, string>>>(() =>
    Object.fromEntries(addressIssues.map((issue) => [issue.repairProposal!.id, suggestedAddressDraft(issue, records)])),
  );
  const [selectedAddressRepairs, setSelectedAddressRepairs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(addressIssues.map((issue) => [issue.repairProposal!.id, issue.repairProposal!.confidence === "safe"])),
  );

  const [onlyFixable, setOnlyFixable] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<"all" | ValidationSeverity>("error");

  const visibleIssues = issues
    .filter(i => !i.repairProposal)
    .filter(i => !onlyFixable || i.autoFixable || i.field)
    .filter(i => severityFilter === "all" || i.severity === severityFilter);
  const visibleAddressIssues = addressIssues.filter(i => severityFilter === "all" || i.severity === severityFilter);

  const autoFillAll = () => {
    const next: Record<string, string> = { ...pending };
    for (const issue of issues) {
      if (!issue.repairProposal && issue.autoFixable && issue.suggestedFix !== undefined) {
        next[issue.id] = issue.suggestedFix;
      }
    }
    setPending(next);
    setSelectedAddressRepairs(Object.fromEntries(addressIssues.map((issue) => [issue.repairProposal!.id, issue.repairProposal!.confidence === "safe"])));
  };

  const clearAll = () => {
    setPending({});
    setSelectedAddressRepairs({});
  };

  const applyFixes = () => {
    const fixes: AppliedFix[] = [];
    const now = Date.now();
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
  const pendingCount = Object.keys(pending).length + addressChangeCount;
  const fixableCount = issues.filter(i => i.autoFixable).length;

  return (
    <main style={{ flex: 1, maxWidth: 960, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <button onClick={onBack} className="btn btn-ghost" style={{ marginBottom: 18, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Back to Issues
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Fix Data</h1>
          <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 13 }}>
            {fixableCount} auto-fixable issues · {pendingCount} fixes staged
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={clearAll} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>Clear All</button>
          <button onClick={autoFillAll} className="btn btn-secondary" style={{ fontSize: 12, padding: "6px 12px", gap: 5 }}>
            <Wand2 size={13} /> Auto-fill All Fixable
          </button>
        </div>
      </div>

      {/* Bulk action info */}
      <div style={{ borderLeft: "2px solid var(--color-info-text)", padding: "6px 0 6px 14px", marginBottom: 20, fontSize: 12, color: "var(--color-text-secondary)" }}>
        <strong style={{ color: "var(--color-info-text)" }}>Bulk-safe fixes</strong> are pre-filled automatically: whitespace trimming, grade/gender code normalization, deterministic date reformatting.
        Manual fields require you to type a correction. Use “Clear value” when an existing value should be removed.
      </div>

      {/* Filters */}
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
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--color-text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={onlyFixable} onChange={e => setOnlyFixable(e.target.checked)} />
          Show only editable issues (fields with suggested fixes or manual edits)
        </label>
      </div>

      {visibleAddressIssues.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
            <div>
              <h2 style={{ margin: "0 0 3px", fontSize: 16 }}>Address repairs</h2>
              <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: 11 }}>Review the complete address and apply coordinated field changes without returning to the source workbook.</p>
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
                    setSelectedAddressRepairs((current) => ({ ...current, [proposal.id]: proposal.confidence === "safe" }));
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
                const isEmptyGuardian = issue.ruleId === "EMPTY_GUARDIAN";
                const guardianContext = guardianRelationshipContext(issue, record);
                return (
                  <tr key={issue.id} style={{ opacity: !issue.field ? 0.5 : 1 }}>
                    <td><SeverityBadge severity={issue.severity} /></td>
                    <td style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 500 }}>{issue.studentName || "—"}</div>
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
                          {isEmptyGuardian ? (
                            <span style={{ color: "var(--color-info-text)", fontSize: 11, fontWeight: 600 }}>Remove empty Guardian placeholder</span>
                          ) : isGuardianRelationship ? (
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

      {/* Apply */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onBack} className="btn btn-secondary">
          <ArrowLeft size={14} /> Back
        </button>
        <button onClick={applyFixes} className="btn btn-primary" style={{ gap: 6 }}>
          <RefreshCw size={14} />
          Apply {pendingCount > 0 ? `${pendingCount} Fix${pendingCount !== 1 ? "es" : ""}` : "Fixes"} & Revalidate
          <ArrowRight size={14} />
        </button>
      </div>
    </main>
  );
}
