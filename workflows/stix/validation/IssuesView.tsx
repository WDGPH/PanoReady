"use client";
import { Fragment, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronDown, Download, Filter, MapPin, RefreshCw, Search, Wrench } from "lucide-react";
import AddressRepairCard from "@/components/AddressRepairCard";
import StatCard from "@/components/StatCard";
import { ADDRESS_REPAIR_FIELDS } from "@/lib/addressRepair";
import { defaultRules } from "@/lib/rulesets";
import type { AppliedFix, ValidateSession, ValidationSeverity } from "@/lib/types";
import { guardianRelationshipContext, suggestedAddressDraft } from "./helpers";
import { GateBadge, SeverityBadge } from "./ValidationBadges";

// ─── ValidateIssuesView ───────────────────────────────────────────────────────
// Screen 2: Review Issues

export default function IssuesView({
  session,
  onBack,
  onFix,
  onApply,
  onSkipToDownload,
}: {
  session: ValidateSession;
  onBack: () => void;
  onFix: (stagedFixes: AppliedFix[]) => void;
  onApply: (fixes: AppliedFix[]) => void;
  onSkipToDownload: () => void;
}) {
  const { initialResult } = session;
  const allIssues = initialResult.issues;
  const records = initialResult.records;
  const rules = session.validationRules ?? defaultRules;

  const [openAddressIssueId, setOpenAddressIssueId] = useState<string | null>(null);
  const [addressDrafts, setAddressDrafts] = useState<Record<string, Record<string, string>>>({});
  const [addressSelected, setAddressSelected] = useState<Record<string, boolean>>({});
  // Seed from session.fixes so fixes staged here survive a round trip through Fix Data and back.
  const [stagedAddressFixes, setStagedAddressFixes] = useState<Record<string, AppliedFix[]>>(() => {
    const byIssue: Record<string, AppliedFix[]> = {};
    for (const fix of session.fixes) {
      if (!fix.repairId) continue;
      (byIssue[fix.issueId] ??= []).push(fix);
    }
    return byIssue;
  });

  const [severityFilter, setSeverityFilter] = useState<"all" | ValidationSeverity>("error");
  const [fixableOnly, setFixableOnly] = useState(false);
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [search, setSearch] = useState("");

  const schools = Array.from(new Set(allIssues.map(i => i.schoolNumber).filter(Boolean))) as string[];

  const filtered = allIssues.filter(i => {
    if (severityFilter !== "all" && i.severity !== severityFilter) return false;
    if (fixableOnly && !i.autoFixable) return false;
    if (schoolFilter !== "all" && i.schoolNumber !== schoolFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !i.message.toLowerCase().includes(q) &&
        !(i.studentName ?? "").toLowerCase().includes(q) &&
        !(i.field ?? "").toLowerCase().includes(q) &&
        !(i.ruleId ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const errorCount   = allIssues.filter(i => i.severity === "error").length;
  const warningCount = allIssues.filter(i => i.severity === "warning").length;
  const fixableCount = allIssues.filter(i => i.autoFixable).length;

  const openIssue = openAddressIssueId ? allIssues.find(i => i.id === openAddressIssueId) : undefined;
  const openProposal = openIssue?.repairProposal;
  const openRecord = openIssue ? records.find(r => r.id === openIssue.recordId) : undefined;
  const openDraft = openIssue ? (addressDrafts[openIssue.repairProposal!.id] ?? suggestedAddressDraft(openIssue, records)) : undefined;

  const applyAddressFix = () => {
    if (!openIssue || !openProposal || !openRecord || !openDraft) return;
    const now = Date.now();
    const fixes: AppliedFix[] = ADDRESS_REPAIR_FIELDS
      .filter((field) => (openDraft[field] ?? "") !== (openRecord.fields[field] ?? ""))
      .map((field) => ({
        issueId: openIssue.id,
        recordId: openIssue.recordId!,
        field,
        oldValue: openRecord.fields[field] ?? "",
        newValue: openDraft[field] ?? "",
        ruleId: openIssue.ruleId,
        repairId: openProposal.id,
        appliedAt: now,
      }));
    setStagedAddressFixes((current) => ({ ...current, [openIssue.id]: fixes }));
    setOpenAddressIssueId(null);
  };

  const removeStagedAddressFix = (issueId: string) => {
    setStagedAddressFixes((current) => {
      const next = { ...current };
      delete next[issueId];
      return next;
    });
  };

  const stagedFixes = Object.values(stagedAddressFixes).flat();
  const emptyGuardianIssues = allIssues.filter((issue) => issue.ruleId === "EMPTY_GUARDIAN" && issue.recordId && issue.field);
  const removeEmptyGuardianPlaceholders = () => {
    const now = Date.now();
    const fixes: AppliedFix[] = emptyGuardianIssues.map((issue) => ({
      issueId: issue.id,
      recordId: issue.recordId!,
      field: issue.field!,
      oldValue: "Empty Guardian placeholder",
      newValue: "",
      ruleId: issue.ruleId,
      appliedAt: now,
    }));
    onApply([...stagedFixes, ...fixes]);
  };
  const canSkip = stagedFixes.length === 0 && (initialResult.gate === "READY" || initialResult.gate === "REVIEW_REQUIRED");

  return (
    <main style={{ flex: 1, maxWidth: 1400, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <button onClick={onBack} className="btn btn-ghost" style={{ marginBottom: 18, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Open another file
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Issue Review</h1>
          <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 13 }}>
            {session.fileName} · {initialResult.schoolCount} school{initialResult.schoolCount !== 1 ? "s" : ""} · {initialResult.studentCount} students
          </p>
        </div>
        <GateBadge gate={initialResult.gate} />
      </div>

      {/* Summary stats */}
      <div className="summary-stats summary-stats--four" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 28, marginBottom: 22 }}>
        <StatCard label="Total Issues" value={allIssues.length} />
        <StatCard label="Errors"       value={errorCount}       accent="red" />
        <StatCard label="Warnings"     value={warningCount}     accent="yellow" />
        <StatCard label="Auto-fixable" value={fixableCount}     accent="teal" />
      </div>

      {emptyGuardianIssues.length > 0 && (
        <div className="card" style={{ padding: "16px 18px", marginBottom: 18, borderColor: "var(--color-warning-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 3 }}>
                {emptyGuardianIssues.length} empty Guardian placeholder{emptyGuardianIssues.length === 1 ? "" : "s"}
              </div>
              <div style={{ color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.5 }}>
                These elements contain no Guardian name, phone, or relationship. Only these fully empty placeholders will be removed.
              </div>
            </div>
            <button type="button" onClick={removeEmptyGuardianPlaceholders} className="btn btn-primary" style={{ gap: 6, whiteSpace: "nowrap" }}>
              <Wrench size={13} /> Remove {emptyGuardianIssues.length} &amp; Revalidate
            </button>
          </div>
        </div>
      )}

      <div>
          {/* Filters */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "center" }}>
            <div style={{ position: "relative", flex: "1 1 220px" }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", pointerEvents: "none" }} />
              <input className="input" placeholder="Search issues…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
            </div>

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

            {schools.length > 0 && (
              <select
                className="input"
                value={schoolFilter}
                onChange={e => setSchoolFilter(e.target.value)}
                style={{ flex: "0 0 160px" }}
              >
                <option value="all">All schools</option>
                {schools.map(s => <option key={s} value={s}>School {s}</option>)}
              </select>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--color-text-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={fixableOnly} onChange={e => setFixableOnly(e.target.checked)} />
              <Filter size={12} /> Auto-fixable only
            </label>
          </div>

          {severityFilter === "error" && warningCount > 0 && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "-8px 0 14px" }}>
              Hiding {warningCount} warning{warningCount !== 1 ? "s" : ""} — warnings don&apos;t block submission. Switch the severity filter to see them.
            </p>
          )}

          {/* Issue table */}
          <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--color-text-muted)" }}>
                {allIssues.length === 0 ? "No issues found — file looks clean!" : "No issues match the current filters."}
              </div>
            ) : (
              <table className="data-table" style={{ width: "100%", tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: 76 }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: 84 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: "13%" }} />
                  <col />
                  <col style={{ width: "22%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Student</th>
                    <th>School</th>
                    <th>Field</th>
                    <th>Current Value</th>
                    <th>Issue</th>
                    <th>Suggested Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(issue => {
                    const record = records.find(r => r.id === issue.recordId);
                    const currentValue = issue.currentValue ?? (issue.field && record ? (record.fields[issue.field] ?? "") : "");
                    const guardianContext = guardianRelationshipContext(issue, record);
                    const staged = !!stagedAddressFixes[issue.id];
                    const isOpen = openAddressIssueId === issue.id;
                    const proposal = issue.repairProposal;
                    const draft = isOpen ? (addressDrafts[proposal?.id ?? ""] ?? (issue ? suggestedAddressDraft(issue, records) : undefined)) : undefined;
                    return (
                      <Fragment key={issue.id}>
                        <tr style={{ background: isOpen ? "var(--color-info-bg)" : undefined }}>
                          <td><SeverityBadge severity={issue.severity} /></td>
                          <td style={{ fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{issue.studentName || "—"}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{issue.schoolNumber || "—"}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-secondary)" }}>{issue.field || "—"}</td>
                          <td>
                            {currentValue ? (
                              <code style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>{currentValue}</code>
                            ) : <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>}
                          </td>
                          <td style={{ fontSize: 12, lineHeight: 1.5 }}>
                            <div>{issue.message}</div>
                            {guardianContext && (
                              <div style={{ marginTop: 5, color: "var(--color-text-secondary)" }}>
                                <strong>{guardianContext.label}:</strong>{guardianContext.hasDetails
                                  ? <>{guardianContext.name ? ` ${guardianContext.name}` : ""}{guardianContext.name && guardianContext.phone ? " · " : ""}{guardianContext.phone}</>
                                  : " Empty in source XML"}
                                {guardianContext.oen && <div>Student OEN: {guardianContext.oen}</div>}
                              </div>
                            )}
                          </td>
                          <td>
                            {proposal ? (
                              <button
                                type="button"
                                onClick={() => setOpenAddressIssueId(isOpen ? null : issue.id)}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600,
                                  padding: "3px 8px", borderRadius: 99, cursor: "pointer",
                                  border: `1px solid ${staged ? "var(--color-success-border)" : "var(--color-border)"}`,
                                  background: staged ? "var(--color-success-bg)" : "var(--color-surface-1)",
                                  color: staged ? "var(--color-success-text)" : proposal.confidence === "safe" ? "var(--color-success-text)" : proposal.confidence === "manual" ? "var(--color-info-text)" : "var(--color-warning-text)",
                                }}
                              >
                                {staged ? <CheckCircle2 size={12} /> : <MapPin size={12} />}
                                {staged
                                  ? "Fix staged — edit"
                                  : proposal.confidence === "safe" ? "Address repair ready"
                                  : proposal.confidence === "manual" ? "Review manually"
                                  : "Review complete address"}
                                <ChevronDown size={12} style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
                              </button>
                            ) : issue.ruleId === "EMPTY_GUARDIAN" ? (
                              <span style={{ color: "var(--color-info-text)", fontSize: 11, fontWeight: 600 }}>Bulk removal available</span>
                            ) : issue.suggestedFix ? (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                <code style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "var(--color-text-primary)" }}>{issue.suggestedFix}</code>
                                {issue.autoFixable && (
                                  <span style={{ fontSize: 9, border: "1px solid var(--color-border)", color: "var(--color-text-muted)", borderRadius: 3, padding: "1px 5px", fontWeight: 600, letterSpacing: "0.03em" }}>AUTO</span>
                                )}
                              </span>
                            ) : guardianContext ? (
                              <span style={{ color: "var(--color-info-text)", fontSize: 11, fontWeight: 600 }}>Choose in Fix Data</span>
                            ) : <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>Manual</span>}
                          </td>
                        </tr>
                        {isOpen && proposal && record && draft && (
                          <tr style={{ background: "var(--color-info-bg)" }}>
                            <td colSpan={7} style={{ padding: "0 16px 16px" }}>
                              <AddressRepairCard
                                proposal={proposal}
                                record={record}
                                studentName={issue.studentName}
                                schoolNumber={issue.schoolNumber}
                                rules={rules}
                                draft={draft}
                                selected={addressSelected[proposal.id] ?? (proposal.confidence === "safe")}
                                onDraftChange={(field, value) => setAddressDrafts((current) => ({
                                  ...current,
                                  [proposal.id]: { ...(current[proposal.id] ?? suggestedAddressDraft(issue, records)), [field]: value },
                                }))}
                                onSelectedChange={(selected) => setAddressSelected((current) => ({ ...current, [proposal.id]: selected }))}
                                onReset={() => setAddressDrafts((current) => ({ ...current, [proposal.id]: suggestedAddressDraft(issue, records) }))}
                              />
                              <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                                {stagedAddressFixes[issue.id] && (
                                  <button
                                    type="button"
                                    onClick={() => { removeStagedAddressFix(issue.id); setOpenAddressIssueId(null); }}
                                    className="btn btn-ghost"
                                    style={{ fontSize: 12, color: "var(--color-error-text)", marginRight: "auto" }}
                                  >
                                    Remove staged fix
                                  </button>
                                )}
                                <button type="button" onClick={() => setOpenAddressIssueId(null)} className="btn btn-ghost" style={{ fontSize: 12 }}>Close</button>
                                <button type="button" onClick={applyAddressFix} className="btn btn-primary" style={{ fontSize: 12, gap: 5 }}>
                                  <CheckCircle2 size={13} /> Apply this fix
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {filtered.length < allIssues.length && (
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16, textAlign: "right" }}>
              Showing {filtered.length} of {allIssues.length} issues
            </p>
          )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
        {canSkip && (
          <button onClick={onSkipToDownload} className="btn btn-secondary" style={{ gap: 6 }}>
            <Download size={14} /> Skip to Download
          </button>
        )}
        {stagedFixes.length > 0 && (
          <button onClick={() => onApply(stagedFixes)} className="btn btn-primary" style={{ gap: 6 }}>
            <RefreshCw size={14} /> Apply {stagedFixes.length} Fix{stagedFixes.length !== 1 ? "es" : ""} & Revalidate
            <ArrowRight size={14} />
          </button>
        )}
        <button onClick={() => onFix(stagedFixes)} className={stagedFixes.length > 0 ? "btn btn-secondary" : "btn btn-primary"} style={{ gap: 6 }}>
          <Wrench size={14} />
          {fixableCount > 0 ? `Fix Issues (${fixableCount} auto-fixable)` : "Review & Edit"}
          <ArrowRight size={14} />
        </button>
      </div>
    </main>
  );
}
