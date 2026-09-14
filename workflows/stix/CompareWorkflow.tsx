"use client";
import PagedTable from "@/components/PagedTable";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, GitCompareArrows, School, SlidersHorizontal, Users } from "lucide-react";
import { downloadText, toCsv } from "@/lib/utils";
import type { STIXComparison } from "@/lib/types";
import StatCard from "@/components/StatCard";

// ─── CompareView ──────────────────────────────────────────────────────────────

export default function CompareWorkflow({ comparison, onStartOver }: { comparison: STIXComparison; onStartOver: () => void }) {
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  const [viewMode, setViewMode] = useState<"schools" | "records" | "fields" | "transfers">("records");
  const [selectedSchool, setSelectedSchool] = useState("all");
  const [selectedRecordKey, setSelectedRecordKey] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "confirmed" | "needs-fix">>({});
  const [decisionReviewers, setDecisionReviewers] = useState<Record<string, string>>({});
  const [fieldFilter, setFieldFilter] = useState<string[]>([]);
  const [currentReviewer, setCurrentReviewer] = useState(comparison.reviewer ?? "");
  const selectedSchoolSummary = comparison.schoolChanges.find((school) => school.schoolId === selectedSchool);
  const toggleFieldFilter = (label: string) =>
    setFieldFilter((current) => current.includes(label) ? current.filter((f) => f !== label) : [...current, label]);
  const selectSchool = (school: string) => {
    setSelectedSchool(school);
    setFieldFilter([]);
    setSelectedRecordKey(null);
  };
  const signalColor = comparison.signal === "stable" ? "var(--color-brand-400)" : comparison.signal === "moderate" ? "var(--color-warning-text)" : "var(--color-error-text)";
  const signalBackground = comparison.signal === "stable" ? "var(--color-success-bg)" : comparison.signal === "moderate" ? "var(--color-warning-bg)" : "var(--color-error-bg)";
  const visibleRecords = comparison.recordChanges
    .filter((record) => selectedSchool === "all" || record.schoolId === selectedSchool)
    .filter((record) => fieldFilter.length === 0 || record.changedFields.some((field) => fieldFilter.includes(field)));
  const scopedFieldChanges = comparison.fieldChanges
    .map((field) => ({
      ...field,
      count: comparison.recordChanges.filter((record) =>
        (selectedSchool === "all" || record.schoolId === selectedSchool) && record.changedFields.includes(field.label)
      ).length,
    }))
    .filter((field) => field.count > 0);
  const selectedRecord = visibleRecords.find((record) => record.key === selectedRecordKey) ?? null;
  const decisionKey = (recordKey: string, field: string) => `${recordKey}::${field}`;
  const recordDecision = (key: string, decision: "confirmed" | "needs-fix") => {
    setDecisions((current) => ({ ...current, [key]: decision }));
    setDecisionReviewers((current) => ({ ...current, [key]: currentReviewer }));
  };
  const reviewedCount = Object.values(decisions).filter((decision) => decision === "confirmed").length;
  const needsFixCount = Object.values(decisions).filter((decision) => decision === "needs-fix").length;
  const downloadReviewLog = () => {
    const rows = comparison.recordChanges.flatMap((record) => record.fieldDiffs.map((diff) => ({
      Record: record.key,
      Student: record.studentName,
      School: record.schoolName,
      Field: diff.label,
      PreviousValue: diff.previousValue,
      CurrentValue: diff.currentValue,
      Decision: decisions[decisionKey(record.key, diff.field)] ?? "Pending",
      PreviousSource: comparison.previousSourceSystem ?? "",
      CurrentSource: comparison.currentSourceSystem ?? "",
      PriorReviewer: comparison.reviewer ?? "",
      Reviewer: decisionReviewers[decisionKey(record.key, diff.field)] ?? "",
    })));
    downloadText(toCsv(rows), "stix_change_review_log.csv", "text/csv");
  };

  return (
    <main className="compare-results-main compare-dashboard" style={{ flex: 1, maxWidth: "var(--page-width)", width: "100%", margin: "0 auto", padding: "24px var(--page-gutter)" }}>
      <button onClick={onStartOver} className="btn btn-ghost compare-back" style={{ marginBottom: 8, padding: "4px 8px", gap: 5, fontSize: 12 }}>
        <ArrowLeft size={13} /> Compare another pair
      </button>
      <div className="compare-dashboard-header" style={{ marginBottom: 12 }}>
        <div className="compare-dashboard-kicker">OPERATIONS / CHANGE INTELLIGENCE <span>LOCAL ANALYSIS</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <GitCompareArrows size={22} style={{ color: "var(--color-accent-amber)" }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>STIX file comparison</h1>
        </div>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>
          {comparison.previousFileName} <span style={{ color: "var(--color-text-muted)" }}>previous</span> · {comparison.currentFileName} <span style={{ color: "var(--color-text-muted)" }}>current</span>
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
          <input className="input" aria-label="Reviewer for comparison decisions" value={currentReviewer} onChange={(event) => setCurrentReviewer(event.target.value)} placeholder="Reviewer for comparison decisions" style={{ minWidth: 0 }} />
        </div>
        {comparison.reviewer && <p style={{ color: "var(--color-text-muted)", fontSize: 10.5, margin: "5px 0 0" }}>Prior reviewer label: {comparison.reviewer}</p>}
      </div>

      <div className="compare-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 12 }}>
        <StatCard label="Records added" value={comparison.addedCount} accent="green" />
        <StatCard label="Records removed" value={comparison.removedCount} accent="red" />
        {comparison.ambiguousCount > 0 && <StatCard label="Ambiguous identity records" value={comparison.ambiguousCount} accent="yellow" />}
        <StatCard label="Records changed" value={comparison.changedCount} accent="yellow" />
        <StatCard label="No change" value={comparison.unchangedCount} accent="teal" />
        <StatCard label="Moved schools" value={comparison.movedCount} accent="teal" />
      </div>

      <div className="compare-signal" style={{ background: signalBackground, border: `1px solid ${signalColor}`, borderRadius: 9, padding: "9px 13px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: signalColor }}>{comparison.recommendation}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: signalColor }}>{comparison.changeRate.toFixed(1)}%</div>
        </div>
        <div style={{ color: "var(--color-text-secondary)", fontSize: 11.5, lineHeight: 1.5 }}>{comparison.recommendationDetail}</div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 10.5, marginTop: 6 }}>Observed change rate = confirmed added + removed + changed records ÷ previous records. Ambiguous identities are excluded. This is an operational signal, not a replacement for required reporting schedules.</div>
      </div>

      <div className="compare-context-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <StatCard label="Previous records" value={comparison.previousStudentCount} />
        <StatCard label="Current records" value={comparison.currentStudentCount} />
        <StatCard label="Matched records" value={comparison.matchedCount} />
        <StatCard label="Schools" value={`${comparison.previousSchoolCount} → ${comparison.currentSchoolCount}`} />
      </div>

      <details className="card compare-collapsible compare-top-detail" style={{ marginBottom: 12 }}>
        <summary><span><strong>What changed</strong><small>Field changes among matched records</small></span><span className="compare-collapsible-count">{comparison.fieldChanges.length} fields</span></summary>
        <div className="compare-collapsible-body">
        {comparison.fieldChanges.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>No field-level changes were detected.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {comparison.fieldChanges.map((field) => (
              <div key={field.field} style={{ display: "flex", justifyContent: "space-between", background: "var(--color-surface-2)", borderRadius: 7, padding: "9px 12px", fontSize: 12 }}>
                <span style={{ color: "var(--color-text-secondary)" }}>{field.label}</span>
                <strong>{field.count}</strong>
              </div>
            ))}
          </div>
        )}
        </div>
      </details>

      <details className="card compare-collapsible compare-top-detail" style={{ marginBottom: 18 }}>
        <summary><span><strong>Student transfers</strong><small>Students matched across both files whose school changed</small></span><span className="compare-collapsible-count">{comparison.movedCount} moves</span></summary>
        <div className="compare-collapsible-body">
        {comparison.schoolTransfers.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>No student moves between schools were detected.</p>
        ) : (
          <div className="compare-table-scroll" style={{ overflowX: "auto" }}>
            <PagedTable className="data-table">
              <thead><tr><th>From school</th><th>To school</th><th>Students</th><th>Matched students</th></tr></thead>
              <tbody>{comparison.schoolTransfers.map((transfer) => <tr key={`${transfer.fromSchool}-${transfer.toSchool}`}><td style={{ color: "var(--color-text-primary)" }}>{transfer.fromSchool}</td><td style={{ color: "var(--color-text-primary)" }}>{transfer.toSchool}</td><td>{transfer.count}</td><td>{transfer.students.join(", ")}</td></tr>)}</tbody>
            </PagedTable>
          </div>
        )}
        </div>
      </details>

      <div className="compare-tabs-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="compare-tabs" role="tablist" aria-label="Comparison detail view">
          <button className={viewMode === "schools" ? "compare-tab active" : "compare-tab"} onClick={() => setViewMode("schools")} role="tab" aria-selected={viewMode === "schools"}><School size={14} /> School overview</button>
          <button className={viewMode === "records" ? "compare-tab active" : "compare-tab"} onClick={() => setViewMode("records")} role="tab" aria-selected={viewMode === "records"}><Users size={14} /> Record details</button>
          <button className={viewMode === "fields" ? "compare-tab active" : "compare-tab"} onClick={() => setViewMode("fields")} role="tab" aria-selected={viewMode === "fields"}><SlidersHorizontal size={14} /> Field changes</button>
          <button className={viewMode === "transfers" ? "compare-tab active" : "compare-tab"} onClick={() => setViewMode("transfers")} role="tab" aria-selected={viewMode === "transfers"}><GitCompareArrows size={14} /> Transfers</button>
        </div>
        {viewMode === "records" && (
          <select className="input compare-school-filter" value={selectedSchool} onChange={(event) => selectSchool(event.target.value)} aria-label="Filter records by school">
            <option value="all">All schools</option>
            {comparison.schoolChanges.map((school) => <option key={school.schoolId} value={school.schoolId}>{school.schoolName}</option>)}
          </select>
        )}
      </div>

      {viewMode === "schools" ? (
        <section className="card compare-detail-card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div><h2 style={{ fontSize: 16, margin: "0 0 3px" }}>School-level impact</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>Select a school row to inspect its record-level changes.</p></div>
          </div>
          <div className="compare-table-scroll" style={{ overflowX: "auto" }}>
            <PagedTable className="data-table">
              <thead><tr><th>School</th><th>Previous</th><th>Current</th><th>Added</th><th>Removed</th><th>Changed</th></tr></thead>
          <tbody>{comparison.schoolChanges.map((school) => <tr key={school.schoolId} onClick={() => { selectSchool(school.schoolId); setViewMode("records"); }} style={{ cursor: "pointer" }}><td style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{school.schoolName}</td><td>{school.previousCount}</td><td>{school.currentCount}</td><td>{school.added}</td><td>{school.removed}</td><td>{school.changed}</td></tr>)}</tbody>
            </PagedTable>
          </div>
        </section>
      ) : viewMode === "fields" ? (
        <section className="card compare-detail-card" style={{ padding: "18px 20px" }}>
          <div style={{ marginBottom: 14 }}><h2 style={{ fontSize: 16, margin: "0 0 3px" }}>Field changes</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>Fields changed among matched student records, ordered by frequency.</p></div>
          <div className="compare-table-scroll"><PagedTable className="data-table"><thead><tr><th>Field</th><th>Changed records</th></tr></thead><tbody>{comparison.fieldChanges.map((field) => <tr key={field.field}><td style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{field.label}</td><td>{field.count}</td></tr>)}</tbody></PagedTable></div>
        </section>
      ) : viewMode === "transfers" ? (
        <section className="card compare-detail-card" style={{ padding: "18px 20px" }}>
          <div style={{ marginBottom: 14 }}><h2 style={{ fontSize: 16, margin: "0 0 3px" }}>Student transfers</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>Students matched across both files whose school changed.</p></div>
          <div className="compare-table-scroll"><PagedTable className="data-table"><thead><tr><th>From school</th><th>To school</th><th>Students</th><th>Matched students</th></tr></thead><tbody>{comparison.schoolTransfers.map((transfer) => <tr key={`${transfer.fromSchool}-${transfer.toSchool}`}><td style={{ color: "var(--color-text-primary)" }}>{transfer.fromSchool}</td><td style={{ color: "var(--color-text-primary)" }}>{transfer.toSchool}</td><td>{transfer.count}</td><td>{transfer.students.join(", ")}</td></tr>)}</tbody></PagedTable></div>
        </section>
      ) : (
        <div className="compare-record-layout">
        <section className="card compare-school-panel" style={{ padding: "16px" }}>
          <div style={{ marginBottom: 12 }}><h2 style={{ fontSize: 15, margin: "0 0 3px" }}>Schools</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>Select a school to focus the records.</p></div>
          <div className="compare-table-scroll" style={{ overflowX: "auto" }}>
            <PagedTable className="data-table">
              <thead><tr><th>School</th></tr></thead>
              <tbody>{comparison.schoolChanges.map((school) => <tr key={school.schoolId} onClick={() => selectSchool(school.schoolId)} style={{ cursor: "pointer" }}><td style={{ color: "var(--color-text-primary)", fontWeight: selectedSchool === school.schoolId ? 700 : 500 }}>{school.schoolName}</td></tr>)}</tbody>
            </PagedTable>
          </div>
        </section>
        <section className="card compare-detail-card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div><h2 style={{ fontSize: 16, margin: "0 0 3px" }}>Record details</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>{selectedSchool === "all" ? "Specific records added, removed, or changed across all schools." : `Changes for ${selectedSchoolSummary?.schoolName ?? "the selected school"}.`} Review each before/after value here; make corrections in Validate &amp; Fix.</p></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={downloadReviewLog} className="btn btn-secondary" style={{ gap: 5, fontSize: 11, padding: "6px 10px" }}><Download size={12} /> Review log</button>
            </div>
          </div>
          {scopedFieldChanges.length > 0 && (
            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10, marginBottom: 12 }}>
              <details className="changed-fields-dropdown">
                <summary>
                  <span>Changed fields</span>
                  <span className="changed-fields-dropdown-count">{fieldFilter.length ? `${fieldFilter.length} selected` : "All fields"}</span>
                </summary>
                <div className="changed-fields-dropdown-menu">
                  <div className="changed-fields-dropdown-heading">Filter records by changed field</div>
                  {scopedFieldChanges.map((field) => (
                    <label
                      key={field.field}
                      className="changed-fields-dropdown-option"
                    >
                      <input
                        type="checkbox"
                        checked={fieldFilter.includes(field.label)}
                        onChange={() => toggleFieldFilter(field.label)}
                      />
                      <span>{field.label}</span>
                      <small>{field.count}</small>
                    </label>
                  ))}
                  {fieldFilter.length > 0 && <button className="btn btn-ghost changed-fields-dropdown-clear" onClick={() => setFieldFilter([])}>Clear filter</button>}
                </div>
              </details>
            </div>
          )}
          <div className="compare-review-summary"><span>{reviewedCount} confirmed</span><span>{needsFixCount} needs fix</span><span>{visibleRecords.filter((record) => record.kind === "changed").length} changed records</span></div>
          {visibleRecords.length === 0 ? <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>No record-level differences were detected{selectedSchool === "all" ? "." : " for this school."}</p> : <div className="compare-table-scroll" style={{ overflowX: "auto" }}><PagedTable className="data-table" rows={visibleRecords} rowKey={(record) => `${record.kind}-${record.key}`} sortValue={(record, column) => [record.kind, record.studentName, record.schoolName, record.changedFields.join(" ")][column] ?? ""} renderRow={(record) => <tr key={`${record.kind}-${record.key}`} style={{ background: selectedRecordKey === record.key ? "var(--color-surface-2)" : undefined }}><td><span className={`change-badge change-badge--${record.kind}`}>{record.matchStatus === "ambiguous" ? "ambiguous identity" : record.kind}</span></td><td style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{record.studentName}</td><td>{record.schoolName}</td><td>{record.changedFields.length ? <div className="field-tag-list">{record.changedFields.map((field) => <span key={field} className="field-tag">{field}</span>)}</div> : <span style={{ color: "var(--color-text-muted)" }}>—</span>}</td><td><button type="button" className="overview-link" aria-label={`Inspect ${record.studentName}`} onClick={() => setSelectedRecordKey(record.key)}>Inspect →</button></td></tr>}><thead><tr><th>Change</th><th>Student</th><th>School</th><th>Changed fields</th><th data-sortable={false}>Review</th></tr></thead></PagedTable></div>}
        </section>
        {selectedRecord ? (
          <aside className="card compare-school-summary compare-record-review">
            <div style={{ marginBottom: 14 }}><div style={{ color: "var(--color-text-muted)", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5 }}>Reviewing record</div><h2 style={{ fontSize: 17, margin: "0 0 4px" }}>{selectedRecord.studentName}</h2><p style={{ color: "var(--color-text-secondary)", fontSize: 11, margin: 0 }}>{selectedRecord.schoolName} · {selectedRecord.kind}</p></div>
            {selectedRecord.kind === "changed" ? <div className="compare-diff-list">{selectedRecord.fieldDiffs.map((diff) => {
              const key = decisionKey(selectedRecord.key, diff.field);
              const decision = decisions[key];
              return <div key={diff.field} className="compare-diff-row">
                <div className="compare-diff-label"><strong>{diff.label}</strong><span>{diff.field}</span></div>
                <div className="compare-diff-values"><div><small>Previous</small><code>{diff.previousValue || "(blank)"}</code></div><div className="compare-diff-arrow">→</div><div><small>Current</small><code className={decision === "needs-fix" ? "compare-value-alert" : ""}>{diff.currentValue || "(blank)"}</code></div></div>
                <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                  <button className={`compare-decision ${decision === "confirmed" ? "active-confirm" : ""}`} onClick={() => recordDecision(key, "confirmed")}><CheckCircle2 size={12} /> Keep current</button>
                  <button className={`compare-decision ${decision === "needs-fix" ? "active-fix" : ""}`} onClick={() => recordDecision(key, "needs-fix")}>Needs fix in Validate &amp; Fix</button>
                </div>
                {decision === "needs-fix" && <p style={{ fontSize: 11, margin: "7px 0 0", color: "var(--color-warning-text)" }}>Marked for correction in Validate &amp; Fix.</p>}
              </div>;
            })}</div> : <p style={{ color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.5 }}>{selectedRecord.kind === "added" ? "This record is new in the current file. Validate it against your source system before accepting it." : "This record is missing from the current file. Confirm whether it should be removed or restored."}</p>}
            <button className="btn btn-ghost" onClick={() => setSelectedRecordKey(null)} style={{ marginTop: 12, padding: "5px 0", fontSize: 12 }}>Close record review</button>
          </aside>
        ) : selectedSchoolSummary && (
          <aside className="card compare-school-summary">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
              <div><div style={{ color: "var(--color-text-muted)", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5 }}>Selected school</div><h2 style={{ fontSize: 17, margin: 0 }}>{selectedSchoolSummary.schoolName}</h2></div>
              <School size={18} style={{ color: "var(--color-teal-400)" }} />
            </div>
            <div className="compare-school-stat-grid">
              <StatCard label="Previous" value={selectedSchoolSummary.previousCount} />
              <StatCard label="Current" value={selectedSchoolSummary.currentCount} />
              <StatCard label="Added" value={selectedSchoolSummary.added} accent="green" />
              <StatCard label="Removed" value={selectedSchoolSummary.removed} accent="red" />
              <StatCard label="Changed" value={selectedSchoolSummary.changed} accent="yellow" />
              <StatCard label="Net movement" value={selectedSchoolSummary.currentCount - selectedSchoolSummary.previousCount} />
            </div>
            <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 16, paddingTop: 14, color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.5 }}>
              School change rate: <strong style={{ color: "var(--color-text-primary)" }}>{((selectedSchoolSummary.added + selectedSchoolSummary.removed + selectedSchoolSummary.changed) / Math.max(selectedSchoolSummary.previousCount, 1) * 100).toFixed(1)}%</strong>
            </div>
            <button className="btn btn-ghost" onClick={() => selectSchool("all")} style={{ marginTop: 10, padding: "5px 0", fontSize: 12 }}>Clear school filter</button>
          </aside>
        )}
        </div>
      )}

    </main>
  );
}
