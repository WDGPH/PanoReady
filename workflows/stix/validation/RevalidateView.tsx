"use client";
import WorkflowNavigation from "@/components/WorkflowNavigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { applyReviewChanges } from "@/lib/reviewHistory";
import { summarizeAppliedCorrections } from "@/lib/fixSummary";
import type { ValidateSession } from "@/lib/types";

// ─── ValidateRevalidateView ───────────────────────────────────────────────────
// Screen 4: Revalidate

export default function RevalidateView({
  session,
  onContinue,
  onReturnToFixes,
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: (result: ValidateSession) => void;
  session: ValidateSession;
  onContinue: (result: ValidateSession) => void;
  onReturnToFixes: (result: ValidateSession, view: "fix" | "manual") => void;
}) {
  const result = session.revalidatedResult && session.appliedFixCount === session.fixes.length ? session : null;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The parent owns committed results, so history and navigation see the same file.
    if (result) return;
    // Yield once so the browser can paint before synchronous XML processing.
    const timer = window.setTimeout(() => {
      try {
        const completed = applyReviewChanges(session, "Manual fixes");
        onComplete(completed);
      } catch {
        setError("Unable to apply and recheck corrections.");
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [session, result, onComplete]);

  if (error) return <main className="fix-operation"><WorkflowNavigation onBack={onBack} nextLabel="Output" /><p role="alert">Corrections could not be completed: {error}</p><p>Return to Review &amp; fix to adjust your selections.</p></main>;
  if (!result) return <main className="fix-operation">
    <WorkflowNavigation onBack={onBack} nextLabel="Output" nextDescription="Recheck in progress" />
    <div role="status" aria-live="polite">
      <p>{session.fixes.length ? "Applying corrections and rechecking…" : "Rechecking your file…"}</p>
      <progress aria-label="Corrections and recheck" style={{ width: "100%" }} />
    </div>
  </main>;

  const prev = session.initialResult;
  const next = result.revalidatedResult!;
  const corrections = summarizeAppliedCorrections(session.fixes, session.history);
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
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 14 }}>After {corrections.total} Correction{corrections.total !== 1 ? "s" : ""} · {corrections.fieldChanges} Field Change{corrections.fieldChanges !== 1 ? "s" : ""}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Automatic fixes</span>
              <span style={{ fontWeight: 700 }}>{corrections.automatic}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Manual fixes</span>
              <span style={{ fontWeight: 700 }}>{corrections.manual}</span>
            </div>
            {corrections.cleaning > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Cleaning mappings</span>
              <span style={{ fontWeight: 700 }}>{corrections.cleaning}</span>
            </div>}
            {corrections.uncategorized > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Earlier corrections</span>
              <span style={{ fontWeight: 700 }}>{corrections.uncategorized}</span>
            </div>}
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
