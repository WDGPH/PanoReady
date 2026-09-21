"use client";

import { ArrowLeft, ClipboardCheck, Download, FileText } from "lucide-react";
import { downloadText, toCsv } from "@/lib/utils";
import type { PhixSession } from "@/lib/types";
import { GateBadge } from "./shared";

export default function DownloadView({
  session,
  onStartOver,
}: {
  session: PhixSession;
  onStartOver: () => void;
}) {
  const baseName = session.fileName.replace(/\.csv$/i, "");
  const result = session.revalidatedResult ?? session.initialResult;
  const csv = session.finalCsv ?? session.originalCsv;

  const dlCsv = () => downloadText(csv, `${baseName}_fixed.csv`, "text/csv");

  const dlIssueReport = () => {
    const fixedIds = new Set(session.fixes.map(f => f.issueId));
    const rows = session.initialResult.issues.map(i => ({
      Severity: i.severity,
      Row: i.rowPath ?? "",
      Field: i.field ?? "",
      RuleId: i.ruleId,
      Message: i.message,
      SuggestedFix: i.suggestedFix ?? "",
      Fixed: fixedIds.has(i.id) ? "yes" : "no",
    }));
    downloadText(toCsv(rows), `${baseName}_phix_issue_report.csv`, "text/csv");
  };

  return (
    <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <button onClick={onStartOver} className="btn btn-ghost" style={{ marginBottom: 18, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Open another file
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Download Fixed CSV</h1>
          <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 13 }}>
            {session.fixes.length} fix{session.fixes.length !== 1 ? "es" : ""} applied · {result.recordCount} records
          </p>
        </div>
        <GateBadge gate={result.gate} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="card" style={{ padding: "15px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ background: "var(--color-surface-2)", borderRadius: 3, padding: 8 }}>
              <FileText size={16} style={{ color: "var(--color-text-muted)" }} />
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 12, fontFamily: "var(--font-mono)", marginBottom: 2 }}>{baseName}_fixed.csv</div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>PHIX CSV with {session.fixes.length} fix{session.fixes.length !== 1 ? "es" : ""} applied</div>
            </div>
          </div>
          <button onClick={dlCsv} className="btn btn-primary" style={{ gap: 7 }}>
            <Download size={14} /> CSV
          </button>
        </div>

        <div className="card" style={{ padding: "15px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <div style={{ background: "var(--color-surface-2)", borderRadius: 3, padding: 8 }}>
              <ClipboardCheck size={16} style={{ color: "var(--color-text-muted)" }} />
            </div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 12, fontFamily: "var(--font-mono)", marginBottom: 2 }}>{baseName}_phix_issue_report.csv</div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Issue report with fix status</div>
            </div>
          </div>
          <button onClick={dlIssueReport} className="btn btn-secondary" style={{ gap: 5, fontSize: 12, padding: "6px 13px" }}>
            <Download size={12} /> CSV
          </button>
        </div>
      </div>
    </main>
  );
}
