"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import type { CleaningSummaryEntry } from "@/lib/types";

export interface CleaningSummaryViewProps {
  summary: CleaningSummaryEntry[];
  onBack: () => void;
  onContinue: () => void;
}

export default function CleaningSummaryView({ summary, onBack, onContinue }: CleaningSummaryViewProps) {
  const totalChanged = summary.reduce((acc, e) => acc + e.count, 0);
  const zeroMatches  = summary.filter((e) => e.count === 0);
  const fired        = summary.filter((e) => e.count > 0);

  // Group by field for display
  const fields = Array.from(new Set(summary.map((e) => e.field)));

  return (
    <main style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: "var(--page-width)", margin: "0 auto", width: "100%", padding: "32px var(--page-gutter) 80px" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px" }}>
          Preview cleaning changes
        </h2>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>
          {totalChanged === 0
            ? "No values would change."
            : `${totalChanged} record field${totalChanged !== 1 ? "s" : ""} will change across ${fired.length} mapping${fired.length !== 1 ? "s" : ""}.`
          }
        </p>
      </div>

      {/* Zero-match global warning */}
      {zeroMatches.length > 0 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)",
          borderRadius: 8, padding: "10px 14px", marginBottom: 20,
          color: "var(--color-warning-text)", fontSize: 13,
        }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {zeroMatches.length} mapping{zeroMatches.length !== 1 ? "s" : ""} would make no changes.
            Check spelling or the case-sensitivity setting.
          </span>
        </div>
      )}

      {/* Per-field sections */}
      {fields.map((field) => {
        const entries = summary.filter((e) => e.field === field);
        return (
          <div key={field} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--color-text-primary)", marginBottom: 8 }}>
              {field}
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "5px 10px", color: "var(--color-text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--color-border)" }}>Raw value</th>
                  <th style={{ textAlign: "left", padding: "5px 10px", color: "var(--color-text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--color-border)" }}>Maps to</th>
                  <th style={{ textAlign: "right", padding: "5px 10px", color: "var(--color-text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--color-border)", width: 120 }}>Records changed</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--color-border)", opacity: entry.count === 0 ? 0.55 : 1 }}>
                    <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", fontSize: 12 }}>{entry.raw}</td>
                    <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", fontSize: 12 }}>{entry.canonical}</td>
                    <td style={{ padding: "7px 10px", textAlign: "right" }}>
                      {entry.count === 0 ? (
                        <span style={{ fontSize: 11, color: "var(--color-warning-text)" }}>
                          <AlertTriangle size={11} style={{ verticalAlign: "middle", marginRight: 3 }} />
                          no changes
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--color-brand-400)", fontWeight: 600 }}>
                          <CheckCircle2 size={12} />
                          {entry.count}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {summary.length === 0 && (
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>No mappings were defined.</p>
      )}

      {/* Footer buttons */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
        <button
          onClick={onBack}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "9px 16px", borderRadius: 7, fontSize: 13, fontWeight: 500,
            cursor: "pointer", border: "1px solid var(--color-border)",
            background: "var(--color-surface-2)", color: "var(--color-text-secondary)",
          }}
        >
          <ArrowLeft size={14} /> Back to cleaning
        </button>
        <button
          onClick={onContinue}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: "pointer", border: "none",
            background: "var(--color-brand-400)", color: "var(--color-black)",
          }}
        >
          Apply cleaning and validate <ArrowRight size={15} />
        </button>
      </div>
    </main>
  );
}
