"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Download, Loader2 } from "lucide-react";
import { applyValidationFixes, validateXml } from "@/lib/validator";
import type { ValidateSession } from "@/lib/types";
import { GateBadge } from "./ValidationBadges";

// ─── ValidateRevalidateView ───────────────────────────────────────────────────
// Screen 4: Revalidate

export default function RevalidateView({
  session,
  onContinue,
}: {
  session: ValidateSession;
  onContinue: (result: ValidateSession) => void;
}) {
  const [result, setResult] = useState<ValidateSession | null>(null);

  useEffect(() => {
    const fixedXml = applyValidationFixes(session.originalXml, session.fixes);
    const revalidated = validateXml(fixedXml, session.validationRules);
    /* eslint-disable react-hooks/set-state-in-effect -- Revalidation is the mounted screen's one-time transition from pending to complete. */
    setResult({
      ...session,
      revalidatedResult: revalidated,
      finalXml: fixedXml,
    });
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [session]);

  if (!result) {
    return (
      <main style={{ flex: 1, width: "100%", maxWidth: "var(--page-width)", margin: "0 auto", padding: "0 var(--page-gutter)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--color-text-secondary)" }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Rechecking your changes…
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
    <main style={{ flex: 1, maxWidth: "var(--page-width)", width: "100%", margin: "0 auto", padding: "56px var(--page-gutter) 100px" }}>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Results after corrections</h1>
          <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 13 }}>
            {fixCount} fix{fixCount !== 1 ? "es" : ""} applied · {resolvedCount > 0 ? `${resolvedCount} issue${resolvedCount !== 1 ? "s" : ""} resolved` : "No issues resolved"}
          </p>
        </div>
        <GateBadge gate={next.gate} />
      </div>

      {/* Before / After comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        <div className="card" style={{ padding: "18px 22px" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 14 }}>Before</div>
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
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 14 }}>After {fixCount} Fix{fixCount !== 1 ? "es" : ""}</div>
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

      {/* Applied fixes audit */}
      {session.fixes.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 10 }}>Applied Fixes</div>
          <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Field</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {session.fixes.map(fix => {
                    const record = session.initialResult.records.find(r => r.id === fix.recordId);
                    const studentName = record ? `${record.fields.FirstName ?? ""} ${record.fields.LastName ?? ""}`.trim() : fix.recordId;
                    return (
                      <tr key={fix.issueId}>
                        <td style={{ fontSize: 12, fontWeight: 500 }}>{studentName || fix.recordId}</td>
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

      {/* Remaining blocking issues */}
      {nextErrors > 0 && (
        <div style={{ borderLeft: "2px solid var(--color-error-text)", padding: "6px 0 6px 14px", marginBottom: 20, fontSize: 13, color: "var(--color-error-text)" }}>
          <strong>{nextErrors} blocking error{nextErrors !== 1 ? "s" : ""} remain.</strong> The file is still <strong>BLOCKED</strong>. You can download it for reference but it may not pass submission.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={() => onContinue(result)} className="btn btn-primary" style={{ gap: 6 }}>
          <Download size={14} /> Continue to Download
          <ArrowRight size={14} />
        </button>
      </div>
    </main>
  );
}
