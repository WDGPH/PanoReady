"use client";
import WorkflowNavigation from "@/components/WorkflowNavigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { applyValidationFixes, validateXml } from "@/lib/validator";
import type { ValidateSession } from "@/lib/types";

// ─── ValidateRevalidateView ───────────────────────────────────────────────────
// Screen 4: Revalidate

export default function RevalidateView({
  session,
  onContinue,
  onReturnToFixes,
  onBack,
}: {
  onBack: () => void;
  session: ValidateSession;
  onContinue: (result: ValidateSession) => void;
  onReturnToFixes: (result: ValidateSession, view: "fix" | "manual") => void;
}) {
  const [result, setResult] = useState<ValidateSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const started = performance.now();
    let validationTimer: number;
    let completionTimer: number;
    // Paint each completed stage before starting the next synchronous operation.
    const timer = window.setTimeout(() => {
      try {
        const fixedXml = applyValidationFixes(session.finalXml ?? session.originalXml, session.fixes.slice(session.appliedFixCount ?? 0));
        setProgress(50);
        validationTimer = window.setTimeout(() => {
          try {
            const revalidated = validateXml(fixedXml, session.validationRules);
            setProgress(100);
            completionTimer = window.setTimeout(() => setResult({
              ...session,
              revalidatedResult: revalidated,
              finalXml: fixedXml,
              appliedFixCount: session.fixes.length,
            }), Math.max(200, 1000 - (performance.now() - started)));
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Unable to recheck corrections.");
          }
        }, 80);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Unable to apply corrections.");
      }
    }, 80);
    return () => { window.clearTimeout(timer); window.clearTimeout(validationTimer); window.clearTimeout(completionTimer); };
  }, [session]);

  if (error) return <main className="fix-operation"><WorkflowNavigation onBack={onBack} nextLabel="Output" /><p role="alert">Corrections could not be completed: {error}</p><p>Return to Review &amp; fix to adjust your selections.</p></main>;
  if (!result) return <main className="fix-operation">
    <WorkflowNavigation onBack={onBack} nextLabel="Output" nextDescription="Recheck in progress" />
    <div role="status" aria-live="polite">
      <p>{session.fixes.length ? "Applying corrections and rechecking…" : "Rechecking your file…"}</p>
      <div className="fix-operation-track" role="progressbar" aria-label="Corrections and recheck" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
    </div>
  </main>;

  const prev = session.initialResult;
  const next = result.revalidatedResult!;
  const fixCount = session.fixes.length;
  const prevErrors   = prev.issues.filter(i => i.severity === "error").length;
  const prevWarnings = prev.issues.filter(i => i.severity === "warning").length;
  const nextErrors   = next.issues.filter(i => i.severity === "error").length;
  const nextWarnings = next.issues.filter(i => i.severity === "warning").length;

  return (
    <main style={{ flex: 1, maxWidth: "var(--page-width)", width: "100%", margin: "0 auto", padding: "56px var(--page-gutter) 100px" }}>

      <WorkflowNavigation onBack={() => onReturnToFixes(result, "manual")} backActions={<div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 10 }}>
        <button type="button" onClick={() => onReturnToFixes(result, "fix")} className="btn btn-secondary"><ArrowLeft size={16} /> Return to automatic fixes</button>
        <button type="button" onClick={() => onReturnToFixes(result, "manual")} className="btn btn-secondary"><ArrowLeft size={16} /> Return to manual fixes</button>
      </div>} onNext={() => onContinue(result)} nextLabel="Output" nextDescription="Continue to output" />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
        <div>
          <h1 className="fix-complete" style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Summary</h1>

        </div>
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
              <span style={{ color: "var(--color-error-text)", fontSize: 13 }}>Blocking errors</span>
              <span style={{ fontWeight: 700, color: "var(--color-error-text)" }}>{prevErrors}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-warning-text)", fontSize: 13 }}>Warnings</span>
              <span style={{ fontWeight: 700, color: "var(--color-warning-text)" }}>{prevWarnings}</span>
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
              <span style={{ color: "var(--color-error-text)", fontSize: 13 }}>Blocking errors</span>
              <span style={{ fontWeight: 700, color: nextErrors > 0 ? "var(--color-error-text)" : "var(--color-brand-400)" }}>{nextErrors}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-warning-text)", fontSize: 13 }}>Warnings</span>
              <span style={{ fontWeight: 700, color: "var(--color-warning-text)" }}>{nextWarnings}</span>
            </div>
          </div>
        </div>
      </div>

    </main>
  );
}
