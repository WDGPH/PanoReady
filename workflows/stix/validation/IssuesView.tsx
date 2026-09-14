"use client";
import WorkflowHeading from "@/components/WorkflowHeading";
import WorkflowNavigation from "@/components/WorkflowNavigation";
import PagedTable from "@/components/PagedTable";
import { type ReactNode, useMemo, useState } from "react";
import { Download } from "lucide-react";
import StatCard from "@/components/StatCard";
import type { ValidateSession } from "@/lib/types";
import { issueTypeLabel, percentage, summarizeValidation } from "./overview";
import { SeverityLabel, SeveritySummary, severityHelp } from "./ValidationBadges";
import type { ReviewFilter, ReviewExclusion } from "./overview";

export default function IssuesView({ saveProgress, advancedOptions, onBack, session, onFix, onSkipToDownload, exclusions, onExclusionsChange }: {
  saveProgress?: ReactNode;
  onBack: () => void;
  advancedOptions?: ReactNode;
  session: ValidateSession;
  onFix: (filter?: ReviewFilter, view?: "automatic" | "manual") => void;
  onSkipToDownload: () => void;
  exclusions: ReviewExclusion[];
  onExclusionsChange: (exclusions: ReviewExclusion[]) => void;
}) {
  const result = session.currentResult;
  const summary = useMemo(() => summarizeValidation(result, session.document.schools), [result, session.document.schools]);
  const canSkip = result.gate === "READY" || result.gate === "REVIEW_REQUIRED";
  const setupCount = result.issues.filter((issue) => issue.recordId === "metadata" || issue.recordId?.startsWith("school") === true && !issue.recordId.includes(":student")).length;
  const [overviewView, setOverviewView] = useState<"types" | "schools">("types");
  const excluded = (candidate: ReviewExclusion) => exclusions.some(entry => JSON.stringify(entry) === JSON.stringify(candidate));
  const toggle = (candidate: ReviewExclusion) => onExclusionsChange(excluded(candidate)
    ? exclusions.filter(entry => JSON.stringify(entry) !== JSON.stringify(candidate)) : [...exclusions, candidate]);
  const exclusionControl = (candidate: ReviewExclusion, label: string) => <button type="button" className="btn btn-ghost" aria-label={`${excluded(candidate) ? "Restore" : "Exclude from review"}: ${label}`} onClick={() => toggle(candidate)}>{excluded(candidate) ? "Excluded · Restore" : "Exclude from review"}</button>;
  return (
    <main style={{ flex: 1, maxWidth: "var(--page-width)", width: "100%", margin: "0 auto", padding: "56px var(--page-gutter) 100px" }}>
      <WorkflowNavigation secondaryAction={saveProgress} onBack={onBack} onNext={() => onFix()} nextLabel="Automatic fixes" nextDescription="Continue to automatic fixes" />
      <WorkflowHeading title="Quality assessment" advancedOptions={advancedOptions} />
      {setupCount > 0 && <div style={{ marginBottom: 18 }}><button type="button" className="btn btn-secondary" onClick={() => onFix({ scope: "setup" }, "manual")}>Edit {setupCount} file or school setup finding{setupCount === 1 ? "" : "s"}</button></div>}
      <div className="summary-stats summary-stats--four" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 28, marginBottom: 24 }}>
        <button className="stat-filter" title={severityHelp.error} onClick={() => onFix({ severity: "error" })}><StatCard label="Blocking errors" value={summary.errors} accent="red" /></button>
        <div tabIndex={0} title={severityHelp.warning} aria-label={`Warnings: ${summary.warnings}. ${severityHelp.warning}`}><StatCard label="Warnings" value={summary.warnings} accent="yellow" /></div>
        <StatCard label="Affected students" value={summary.affected} sub={`of ${summary.students.toLocaleString()} students (${percentage(summary.affected, summary.students)})`} />
        <StatCard label="Auto-fixable issues" value={summary.automatic} sub={`of ${summary.total.toLocaleString()} issues (${percentage(summary.automatic, summary.total)})`} />
      </div>
      {exclusions.length > 0 && <details className="review-exclusions">
        <summary>Review exclusions: {exclusions.filter(entry => "ruleId" in entry).length} issue types · {exclusions.filter(entry => "schoolNumber" in entry).length} schools</summary>
        <p>Excluded issues stay in validation totals, and errors still block submission. Students remain in the output; their excluded issues won’t appear in correction review.</p>
        <ul>{exclusions.map((entry) => <li key={JSON.stringify(entry)}>{exclusionControl(entry, "ruleId" in entry ? issueTypeLabel(entry.ruleId, entry.field) : summary.schools.find(row => row.schoolNumber === entry.schoolNumber)?.name || entry.schoolNumber || "File / unassigned")} <span>{"ruleId" in entry ? issueTypeLabel(entry.ruleId, entry.field) : `School ${entry.schoolNumber || "File / unassigned"}`}</span></li>)}</ul>
        <button type="button" className="btn btn-secondary" onClick={() => onExclusionsChange([])}>Clear all exclusions</button>
      </details>}
      <div className="review-view-tabs" role="group" aria-label="Quality summary view">
        <button type="button" aria-pressed={overviewView === "types"} className={overviewView === "types" ? "btn btn-secondary" : "btn btn-ghost"} onClick={() => setOverviewView("types")}>By issue type</button>
        <button type="button" aria-pressed={overviewView === "schools"} className={overviewView === "schools" ? "btn btn-secondary" : "btn btn-ghost"} onClick={() => setOverviewView("schools")}>By school</button>
      </div>
      {overviewView === "types" && <section className="fix-group" style={{ borderTop: 0 }} aria-label="By issue type">
        {summary.types.length ? <div className="overview-table"><PagedTable className="data-table">
          <thead><tr><th>Issue type</th><th>Severity</th><th>Issues</th><th>Affected students</th><th>Auto-fixable issues</th><th data-sortable={false}>Review</th></tr></thead>
          <tbody>{summary.types.map(row => <tr key={JSON.stringify([row.ruleId, row.field])}>
            <td><button className="overview-link" onClick={() => onFix({ ruleId: row.ruleId, field: row.field })}>{issueTypeLabel(row.ruleId, row.field)}</button></td>
            <td data-sort-value={row.errors ? 0 : row.warnings ? 1 : 2}><SeveritySummary counts={row} /></td><td>{row.total}</td><td>{row.affected}</td><td>{row.automatic} / {row.total} ({percentage(row.automatic, row.total)})</td>
            <td>{exclusionControl({ ruleId: row.ruleId, field: row.field }, issueTypeLabel(row.ruleId, row.field))}</td>
          </tr>)}</tbody>
          <tfoot><tr>
            <th scope="row">Total</th><td><SeveritySummary counts={summary} /></td>
            <td>{summary.total}</td><td>{summary.affected}</td><td>{summary.automatic} / {summary.total} ({percentage(summary.automatic, summary.total)})</td>
            <td />
          </tr></tfoot>
        </PagedTable></div> : <p className="cleaning-description">No issues found.</p>}
      </section>}
      {overviewView === "schools" && <section className="fix-group" style={{ borderTop: 0 }} aria-label="By school">
        <div className="overview-table">
          <PagedTable className="data-table">
            <thead><tr><th>School</th><th>Students checked</th><th>Students with issues</th><th data-sort-value="Severity"><SeverityLabel severity="error" label="Blocking errors" /></th><th data-sort-value="Severity"><SeverityLabel severity="warning" label="Warnings" /></th><th>Auto-fixable issues</th><th data-sortable={false}>Review</th></tr></thead>
            <tbody>{summary.schools.map(row => <tr key={row.schoolNumber}>
              <td><button className="overview-link" disabled={!row.total} onClick={() => onFix({ schoolNumber: row.schoolNumber })}>{row.schoolNumber ? `${row.name || "School"} · ${row.schoolNumber}` : "File / unassigned"}</button></td>
              <td>{row.students.toLocaleString()}</td>
              <td>{row.affected.toLocaleString()} ({percentage(row.affected, row.students)})</td>
              <td>{row.errors}</td><td>{row.warnings}</td><td>{row.automatic} / {row.total} ({percentage(row.automatic, row.total)})</td>
              <td>{row.total > 0 && exclusionControl({ schoolNumber: row.schoolNumber }, `${row.name || "School"} · ${row.schoolNumber || "File / unassigned"}`)}</td>
            </tr>)}</tbody>
          </PagedTable>
        </div>
      </section>}
      {canSkip && <div style={{ display: "flex", justifyContent: "flex-end" }}><button onClick={onSkipToDownload} className="btn btn-secondary"><Download size={14} /> Continue without fixes</button></div>}
    </main>
  );
}
