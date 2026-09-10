"use client";
import { useMemo } from "react";
import { ArrowRight, Download } from "lucide-react";
import StatCard from "@/components/StatCard";
import { parseCanonicalXml } from "@/lib/canonical";
import type { ValidateSession } from "@/lib/types";
import { issueTypeLabel, percentage, severityLabel, summarizeValidation } from "./overview";
import type { ReviewFilter } from "./overview";

export default function IssuesView({ session, onFix, onSkipToDownload }: {
  session: ValidateSession;
  onFix: (filter?: ReviewFilter) => void;
  onSkipToDownload: () => void;
}) {
  const { initialResult } = session;
  const summary = useMemo(() => summarizeValidation(initialResult, parseCanonicalXml(session.originalXml).schools), [initialResult, session.originalXml]);
  const canSkip = initialResult.gate === "READY" || initialResult.gate === "REVIEW_REQUIRED";
  return (
    <main style={{ flex: 1, maxWidth: "var(--page-width)", width: "100%", margin: "0 auto", padding: "56px var(--page-gutter) 100px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Import readiness</h1>
          <p className="cleaning-description">{session.fileName} · {initialResult.schoolCount} schools · {summary.students.toLocaleString()} students</p>
        </div>
        <button onClick={() => onFix()} className="btn btn-primary">Review &amp; fix <ArrowRight size={14} /></button>
      </div>
      <div className="summary-stats summary-stats--four" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 28, marginBottom: 24 }}>
        <button className="stat-filter" onClick={() => onFix({ severity: "error" })}><StatCard label="Blocking errors" value={summary.errors} accent="red" /></button>
        <StatCard label="Warnings" value={summary.warnings} accent="yellow" />
        <StatCard label="Affected students" value={summary.affected} sub={`of ${summary.students.toLocaleString()} students (${percentage(summary.affected, summary.students)})`} />
        <StatCard label="Auto-fixable issues" value={summary.automatic} sub={`of ${summary.total.toLocaleString()} issues (${percentage(summary.automatic, summary.total)})`} />
      </div>
      <section className="fix-group" aria-label="By issue type">
        <h2>By issue type</h2>
        {summary.types.length ? <div className="overview-table"><table className="data-table">
          <thead><tr><th>Issue type</th><th>Severity</th><th>Issues</th><th>Affected students</th><th>Auto-fixable issues</th></tr></thead>
          <tbody>{summary.types.map(row => <tr key={JSON.stringify([row.ruleId, row.field])}>
            <td><button className="overview-link" onClick={() => onFix({ ruleId: row.ruleId, field: row.field })}>{issueTypeLabel(row.ruleId, row.field)}</button></td>
            <td>{severityLabel(row)}</td><td>{row.total}</td><td>{row.affected}</td><td>{row.automatic} / {row.total} ({percentage(row.automatic, row.total)})</td>
          </tr>)}</tbody>
        </table></div> : <p className="cleaning-description">No issues found.</p>}
      </section>
      <section className="fix-group" aria-label="By school">
        <h2>By school</h2>
        <div className="overview-table">
          <table className="data-table">
            <thead><tr><th>School</th><th>Students checked</th><th>Students with issues</th><th>Blocking errors</th><th>Warnings</th><th>Auto-fixable issues</th></tr></thead>
            <tbody>{summary.schools.map(row => <tr key={row.schoolNumber}>
              <td><button className="overview-link" disabled={!row.total} onClick={() => onFix({ schoolNumber: row.schoolNumber })}>{row.schoolNumber ? `${row.name || "School"} · ${row.schoolNumber}` : "File / unassigned"}</button></td>
              <td>{row.students.toLocaleString()}</td>
              <td>{row.affected.toLocaleString()} ({percentage(row.affected, row.students)})</td>
              <td>{row.errors}</td><td>{row.warnings}</td><td>{row.automatic} / {row.total} ({percentage(row.automatic, row.total)})</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <p className="cleaning-description">Students are counted once per row; a student may have multiple issue types. File-level issues do not count as affected students.</p>
      {canSkip && <div style={{ display: "flex", justifyContent: "flex-end" }}><button onClick={onSkipToDownload} className="btn btn-secondary"><Download size={14} /> Continue without fixes</button></div>}
    </main>
  );
}
