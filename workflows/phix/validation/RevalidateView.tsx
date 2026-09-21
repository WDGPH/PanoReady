"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Download, Loader2 } from "lucide-react";
import { validatePhix } from "@/lib/phixValidator";
import { applyPhixFixes } from "@/lib/phixFixer";
import type { PhixSession } from "@/lib/types";
import { GateBadge } from "./shared";
import defaultPhixRules from "@/config/rules.phix.default.json";

export default function RevalidateView({
  session,
  onBack,
  onContinue,
}: {
  session: PhixSession;
  onBack: (updated: PhixSession) => void;
  onContinue: (updated: PhixSession) => void;
}) {
  const [result, setResult] = useState<PhixSession | null>(null);

  useEffect(() => {
    const fixedCsv = applyPhixFixes(session.originalCsv, session.fixes);
    const revalidated = validatePhix(fixedCsv, defaultPhixRules as Parameters<typeof validatePhix>[1]);
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setResult({ ...session, revalidatedResult: revalidated, finalCsv: fixedCsv });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!result) {
    return (
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--color-text-secondary)" }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Revalidating…
        </div>
      </main>
    );
  }

  const prev = session.initialResult;
  const next = result.revalidatedResult!;
  const fixCount = session.fixes.length;
  const prevErrors   = prev.issues.filter(i => i.severity === "error").length;
  const prevWarnings = prev.issues.filter(i => i.severity === "warning").length;
  const nextErrors   = next.issues.filter(i => i.severity === "error").length;
  const nextWarnings = next.issues.filter(i => i.severity === "warning").length;
  const resolvedCount = prev.issues.length - next.issues.length;

  return (
    <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <button onClick={() => onBack(result)} className="btn btn-ghost" style={{ marginBottom: 18, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Back to Manual Fix
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Revalidation Results</h1>
          <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 13 }}>
            {fixCount} fix{fixCount !== 1 ? "es" : ""} applied · {resolvedCount > 0 ? `${resolvedCount} issue${resolvedCount !== 1 ? "s" : ""} resolved` : "No issues resolved"}
          </p>
        </div>
        <GateBadge gate={next.gate} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        <div className="card" style={{ padding: "18px 22px" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Before</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Total issues</span>
              <span style={{ fontWeight: 700 }}>{prev.issues.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-error-text)", fontSize: 13 }}>Errors</span>
              <span style={{ fontWeight: 700, color: "var(--color-error-text)" }}>{prevErrors}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-warning-text)", fontSize: 13 }}>Warnings</span>
              <span style={{ fontWeight: 700, color: "var(--color-warning-text)" }}>{prevWarnings}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Gate</span>
              <GateBadge gate={prev.gate} />
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: "18px 22px" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>After {fixCount} Fix{fixCount !== 1 ? "es" : ""}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Total issues</span>
              <span style={{ fontWeight: 700 }}>{next.issues.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-error-text)", fontSize: 13 }}>Errors</span>
              <span style={{ fontWeight: 700, color: nextErrors > 0 ? "var(--color-error-text)" : "var(--color-brand-400)" }}>{nextErrors}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-warning-text)", fontSize: 13 }}>Warnings</span>
              <span style={{ fontWeight: 700, color: "var(--color-warning-text)" }}>{nextWarnings}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Gate</span>
              <GateBadge gate={next.gate} />
            </div>
          </div>
        </div>
      </div>

      {session.fixes.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Applied Fixes</div>
          <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Field</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {session.fixes.map(fix => {
                    const rec = session.initialResult.records.find(r => r.id === fix.recordId);
                    const clientName = rec
                      ? [rec.fields["FIRST NAME"], rec.fields["LAST NAME"]].filter(Boolean).join(" ")
                      : fix.recordId;
                    return (
                      <tr key={`${fix.issueId}-${fix.field}`}>
                        <td style={{ fontSize: 12, fontWeight: 500 }}>
                          {rec?.rowPath ?? fix.recordId}
                          {clientName && <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{clientName}</div>}
                        </td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-secondary)" }}>{fix.field}</td>
                        <td><code style={{ background: "var(--color-error-bg)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>{fix.oldValue || "(empty)"}</code></td>
                        <td><code style={{ background: "var(--color-success-bg)", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "var(--color-brand-400)" }}>{fix.newValue}</code></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {nextErrors > 0 && (
        <div style={{ borderLeft: "2px solid var(--color-error-text)", padding: "6px 0 6px 14px", marginBottom: 20, fontSize: 13, color: "var(--color-error-text)" }}>
          <strong>{nextErrors} blocking error{nextErrors !== 1 ? "s" : ""} remain.</strong> The CSV is still <strong>BLOCKED</strong>.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={() => onBack(result)} className="btn btn-secondary"><ArrowLeft size={14} /> Back to Manual Fix</button>
        <button onClick={() => onContinue(result)} className="btn btn-primary" style={{ gap: 6 }}>
          <Download size={14} /> Continue to Download <ArrowRight size={14} />
        </button>
      </div>
    </main>
  );
}
