import type { ValidationSeverity } from "@/lib/types";

export const severityHelp = {
  error: "Blocks submission. Correct this before importing the file.",
  warning: "Does not block submission, but something may be incorrect. Review it before importing.",
  info: "Does not block submission. Double-check this information for correctness.",
};

export function SeverityLabel({ severity, label }: { severity: ValidationSeverity; label: string }) {
  return <span tabIndex={0} title={severityHelp[severity]} aria-label={`${label}: ${severityHelp[severity]}`} style={{ cursor: "help", textDecoration: "underline dotted", textUnderlineOffset: 3 }}>{label}</span>;
}

export function SeveritySummary({ counts }: { counts: { errors: number; warnings: number; info: number } }) {
  const levels = ([ ["error", counts.errors], ["warning", counts.warnings], ["info", counts.info] ] as const).filter(([, count]) => count > 0);
  return <>{levels.map(([severity, count], index) => <span key={severity}>
    {index > 0 && " · "}
    <SeverityLabel severity={severity} label={levels.length === 1 ? severity[0].toUpperCase() + severity.slice(1) : `${count} ${severity}${count !== 1 && severity !== "info" ? "s" : ""}`} />
  </span>)}</>;
}

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
      <SeverityLabel severity={severity} label={severity === "warning" ? "Warning" : config.label} />
    </span>
  );
}
