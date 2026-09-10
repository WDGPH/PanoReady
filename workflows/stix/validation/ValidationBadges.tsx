import { CheckCircle2, Loader2, ShieldX } from "lucide-react";
import type { ValidationSeverity } from "@/lib/types";

// ─── SeverityBadge ────────────────────────────────────────────────────────────

export function SeverityBadge({ severity }: { severity: ValidationSeverity }) {
  const config = {
    error:   { color: "var(--color-error-text)",   label: "Error" },
    warning: { color: "var(--color-warning-text)", label: "Warn" },
    info:    { color: "var(--color-info-text)",    label: "Info" },
  }[severity];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: config.color, letterSpacing: "0.02em", whiteSpace: "nowrap" as const }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: config.color, flexShrink: 0 }} />
      {config.label}
    </span>
  );
}

// ─── GateBadge ───────────────────────────────────────────────────────────────

export function GateBadge({ gate }: { gate: string }) {
  const isReady = gate === "READY";
  const isPending = gate === "PENDING" || gate === "REVIEW_REQUIRED";
  const color  = isReady ? "var(--verde)" : isPending ? "var(--color-text-muted)" : "var(--color-error-text)";
  const icon   = isReady ? <CheckCircle2 size={14} /> : isPending ? <Loader2 size={14} />   : <ShieldX size={14} />;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${color}`, borderRadius: 3, padding: "4px 12px", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, letterSpacing: "0.03em", color }}>
      {icon}{gate}
    </span>
  );
}
