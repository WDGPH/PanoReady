"use client";

import { useState } from "react";
import { Download, Search } from "lucide-react";
import PagedTable from "@/components/PagedTable";
import WorkflowNavigation from "@/components/WorkflowNavigation";
import WorkflowHeading from "@/components/WorkflowHeading";
import { downloadText, toCsv } from "@/lib/utils";
import type { PhixRepairProposal, PhixValidationResult, ValidationSeverity } from "@/lib/types";
import StatCard from "@/components/StatCard";
import { GateBadge, SeverityBadge } from "./shared";

function ConfidencePill({ confidence }: { confidence: PhixRepairProposal["confidence"] }) {
  const styles: Record<string, React.CSSProperties> = {
    safe:   { background: "var(--color-success-bg)", color: "var(--color-success-text)",  border: "1px solid var(--color-success-border)" },
    review: { background: "var(--color-info-bg)",    color: "var(--color-info-text)",     border: "1px solid var(--color-info-border)" },
    manual: { background: "var(--color-surface-2)",  color: "var(--color-text-secondary)", border: "1px solid var(--color-border)" },
  };
  const labels = { safe: "Auto-fixable", review: "Needs review", manual: "Manual fix" };
  return (
    <span style={{ display: "inline-block", borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 600, ...styles[confidence] }}>
      {labels[confidence]}
    </span>
  );
}

export default function IssuesView({
  result,
  fileName,
  onStartOver,
  onFix,
}: {
  result: PhixValidationResult;
  fileName: string;
  onStartOver: () => void;
  onFix: () => void;
}) {
  const baseName = fileName.replace(/\.csv$/i, "");
  const [severityFilter, setSeverityFilter] = useState<"all" | ValidationSeverity>("all");
  const [search, setSearch] = useState("");

  const allIssues = result.issues;
  const errorCount   = allIssues.filter(i => i.severity === "error").length;
  const warningCount = allIssues.filter(i => i.severity === "warning").length;
  const hasRepairs   = allIssues.some(i => i.repairProposal?.kind === "phix");

  const filtered = allIssues.filter(i => {
    if (severityFilter !== "all" && i.severity !== severityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !i.message.toLowerCase().includes(q) &&
        !(i.field ?? "").toLowerCase().includes(q) &&
        !(i.rowPath ?? "").toLowerCase().includes(q) &&
        !(i.ruleId ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const dlIssuesCsv = () => {
    const rows = allIssues.map(i => ({
      Severity: i.severity,
      Row: i.rowPath ?? "",
      Field: i.field ?? "",
      RuleId: i.ruleId,
      Message: i.message,
      SuggestedFix: i.suggestedFix ?? "",
    }));
    downloadText(toCsv(rows), `${baseName}_phix_issues.csv`, "text/csv");
  };

  return (
    <main style={{ flex: 1, maxWidth: 960, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <WorkflowNavigation
        onBack={onStartOver}
        backActions={<button type="button" className="btn btn-secondary" onClick={onStartOver}>Open another file</button>}
        onNext={hasRepairs ? onFix : undefined}
        nextLabel={hasRepairs ? "Fix Issues" : undefined}
        nextDescription="Proceed to fix detected issues"
      />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
        <WorkflowHeading title="PHIX Validation Results" />
        <GateBadge gate={result.gate} />
      </div>

      <p style={{ color: "var(--color-text-secondary)", margin: "-16px 0 20px", fontSize: 13 }}>
        {fileName} · {result.recordCount} record{result.recordCount !== 1 ? "s" : ""} · {result.clientCount} client{result.clientCount !== 1 ? "s" : ""}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 28, marginBottom: 22 }}>
        <StatCard label="Total Issues" value={allIssues.length} />
        <StatCard label="Errors"       value={errorCount}       accent="red" />
        <StatCard label="Warnings"     value={warningCount}     accent="yellow" />
        <StatCard label="Records"      value={result.recordCount} accent="teal" />
      </div>

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
        </select>
        {allIssues.length > 0 && (
          <button onClick={dlIssuesCsv} className="btn btn-secondary" style={{ gap: 5, fontSize: 12, padding: "6px 12px" }}>
            <Download size={12} /> Issues CSV
          </button>
        )}
      </div>

      <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--color-text-muted)" }}>
            {allIssues.length === 0 ? "No issues found — file looks clean!" : "No issues match the current filters."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <PagedTable className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Severity</th>
                  <th style={{ width: 80 }}>Row</th>
                  <th>Field</th>
                  <th>Issue</th>
                  <th data-sortable={false}>Suggested Fix</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(issue => {
                  const hasRepair = issue.repairProposal?.kind === "phix";
                  return (
                    <tr key={issue.id} data-row-id={issue.id}>
                      <td data-sort-value={issue.severity === "error" ? 0 : issue.severity === "warning" ? 1 : 2}><SeverityBadge severity={issue.severity} /></td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-muted)" }}>{issue.rowPath ?? "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-secondary)" }}>{issue.field ?? "—"}</td>
                      <td style={{ maxWidth: 360, fontSize: 12, lineHeight: 1.5 }}>{issue.message}</td>
                      <td>
                        {hasRepair ? (
                          <ConfidencePill confidence={(issue.repairProposal as PhixRepairProposal).confidence} />
                        ) : issue.suggestedFix ? (
                          <code style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "var(--color-text-primary)" }}>{issue.suggestedFix}</code>
                        ) : <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </PagedTable>
          </div>
        )}
      </div>
    </main>
  );
}
