interface Props {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "green" | "teal" | "yellow" | "red" | "default";
}

// Counts are facts, not confirmations — verde is reserved for real commitment
// moments elsewhere in the app, so plain quantities stay ink. Only warning and
// error counts keep functional color, since that's a real signal.
const accentMap = {
  green: { color: "var(--color-text-primary)", border: "var(--color-border)" },
  teal: { color: "var(--color-text-primary)", border: "var(--color-border)" },
  yellow: { color: "var(--color-warning-text)", border: "var(--color-warning-text)" },
  red: { color: "var(--color-error-text)", border: "var(--color-error-text)" },
  default: { color: "var(--color-text-primary)", border: "var(--color-border)" },
};

export default function StatCard({ label, value, sub, accent = "default" }: Props) {
  const { color, border } = accentMap[accent];
  return (
    <div style={{ borderLeft: `2px solid ${border}`, padding: "2px 0 2px 14px" }}>
      <div style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-sans), sans-serif", color, fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{value}</div>
      {sub && (
        <div style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 6 }}>{sub}</div>
      )}
    </div>
  );
}
