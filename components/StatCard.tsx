interface Props {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "green" | "teal" | "yellow" | "red" | "default";
}

const accentMap = {
  green: { color: "var(--color-brand-400)", bg: "var(--color-success-bg)" },
  teal: { color: "var(--color-teal-400)", bg: "rgba(20,184,166,0.08)" },
  yellow: { color: "var(--color-warning-text)", bg: "var(--color-warning-bg)" },
  red: { color: "var(--color-error-text)", bg: "var(--color-error-bg)" },
  default: { color: "var(--color-text-primary)", bg: "var(--color-surface-2)" },
};

export default function StatCard({ label, value, sub, accent = "default" }: Props) {
  const { color, bg } = accentMap[accent];
  return (
    <div
      className="card"
      style={{ padding: "20px 24px", background: bg, borderColor: "transparent" }}
    >
      <div style={{ color: "var(--color-text-muted)", fontSize: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ color, fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      {sub && (
        <div style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 6 }}>{sub}</div>
      )}
    </div>
  );
}
