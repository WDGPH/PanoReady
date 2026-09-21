"use client";

import { Check, PenLine, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PhixRepairProposal, PhixRecord } from "@/lib/types";

function SearchableSelect({
  value,
  options,
  onChange,
  style,
  allowBlank,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  style?: React.CSSProperties;
  allowBlank?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Keep query in sync when value changes externally (e.g. reset)
  useEffect(() => { setQuery(value); }, [value]);

  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const isInvalid = query.length > 0 && filtered.length === 0;

  function commit(opt: string) {
    setQuery(opt);
    onChange(opt);
    setOpen(false);
  }

  // Close on outside click
  useEffect(() => {
    function close(e: MouseEvent) {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        // If blank is allowed and query is empty, commit the blank; otherwise reset to last valid value
        if (query === "" && allowBlank) {
          onChange("");
        } else if (!options.includes(query)) {
          setQuery(value);
        }
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [query, value, options, allowBlank, onChange]);

  // Reposition dropdown on scroll/resize so it tracks the input element
  useEffect(() => {
    if (!open) return;
    function reposition() {
      if (inputRef.current) {
        const r = inputRef.current.getBoundingClientRect();
        setDropdownRect({ top: r.bottom + 2, left: r.left, width: r.width });
      }
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  function openDropdown() {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setDropdownRect({ top: r.bottom + 2, left: r.left, width: r.width });
    }
    setOpen(true);
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); openDropdown(); }}
        onFocus={openDropdown}
        placeholder="Type to search…"
        style={{
          ...style,
          border: `1px solid ${isInvalid ? "var(--color-error-border)" : style?.border ?? "var(--color-border)"}`,
        }}
      />
      {open && dropdownRect && (
        <div ref={dropdownRef} style={{
          position: "fixed",
          zIndex: 9999,
          top: dropdownRect.top,
          left: dropdownRect.left,
          width: dropdownRect.width,
          marginTop: 0,
          background: "var(--color-surface-0)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          maxHeight: 220,
          overflowY: "auto",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          {isInvalid ? (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--color-error-text, var(--color-text-muted))", fontStyle: "italic" }}>
              No valid options match "{query}"
            </div>
          ) : filtered.length === 0 && !allowBlank ? (
            <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic" }}>
              No options
            </div>
          ) : (
            <>
              {allowBlank && (
                <div
                  onMouseDown={() => commit("")}
                  style={{
                    padding: "7px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    fontStyle: "italic",
                    borderBottom: "1px solid var(--color-border)",
                    background: value === "" ? "var(--color-success-bg)" : undefined,
                    fontWeight: value === "" ? 600 : undefined,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2, var(--color-surface-1))")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = value === "" ? "var(--color-success-bg)" : "")}
                >
                  — leave blank —
                </div>
              )}
              {filtered.map((opt) => (
                <div
                  key={opt}
                  onMouseDown={() => commit(opt)}
                  style={{
                    padding: "7px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                    background: opt === value ? "var(--color-success-bg)" : undefined,
                    fontWeight: opt === value ? 600 : undefined,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-surface-2, var(--color-surface-1))")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = opt === value ? "var(--color-success-bg)" : "")}
                >
                  {opt}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function PhixRepairCard({
  proposal,
  record,
  draftValue,
  selected,
  onDraftChange,
  onSelectedChange,
  onReset,
  requiredFields = [],
}: {
  proposal: PhixRepairProposal;
  record: PhixRecord;
  draftValue: string;
  selected: boolean;
  onDraftChange: (value: string) => void;
  onSelectedChange: (selected: boolean) => void;
  onReset: () => void;
  requiredFields?: string[];
}) {
  const isOptionalField = !requiredFields.map(f => f.toUpperCase()).includes(proposal.field.toUpperCase());
  const changed = draftValue !== (record.fields[proposal.field] ?? "");
  const tone =
    proposal.confidence === "safe"
      ? { border: "var(--color-success-border)", bg: "var(--color-success-bg)", text: "var(--color-success-text)", badge: "SAFE SUGGESTION", Icon: ShieldCheck }
      : proposal.confidence === "manual"
        ? { border: "var(--color-info-border)", bg: "var(--color-info-bg)", text: "var(--color-info-text)", badge: "MANUAL REVIEW", Icon: PenLine }
        : { border: "var(--color-warning-border)", bg: "var(--color-warning-bg)", text: "var(--color-warning-text)", badge: "REVIEW CONFLICT", Icon: TriangleAlert };

  const clientName = [
    record.fields["FIRST NAME"],
    record.fields["LAST NAME"],
  ].filter(Boolean).join(" ") || record.rowPath;

  const controlStyle: React.CSSProperties = {
    width: "100%",
    fontSize: 12,
    padding: "6px 8px",
    borderRadius: 3,
    border: `1px solid ${changed ? "var(--color-success-border)" : "var(--color-border)"}`,
    color: "var(--color-text-primary)",
    background: changed ? "var(--color-success-bg)" : "var(--color-surface-0)",
  };

  return (
    <article style={{
      border: `1px solid ${tone.border}`,
      borderRadius: 7,
      background: "var(--color-surface-1)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--color-border)", background: tone.bg }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              <tone.Icon size={16} style={{ color: tone.text }} />
              <strong style={{ fontSize: 14 }}>{proposal.title}</strong>
              <span style={{ border: "1px solid var(--color-border)", borderRadius: 99, padding: "2px 7px", fontSize: 9, fontWeight: 700, letterSpacing: "0.05em", color: tone.text, background: "var(--color-surface-1)" }}>
                {tone.badge}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, color: "var(--color-text-muted)", fontSize: 11, marginBottom: 6 }}>
              <span>{clientName}</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>{record.rowPath}</span>
            </div>
            <p style={{ margin: 0, maxWidth: 680, color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.55 }}>{proposal.explanation}</p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            <input type="checkbox" checked={selected} onChange={(e) => onSelectedChange(e.target.checked)} />
            Apply
          </label>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "14px 18px" }}>
        {/* Before / After */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, marginBottom: 14 }}>
          <div style={{ borderLeft: "2px solid var(--color-error-border)", padding: "6px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>CURRENT VALUE</div>
            {record.fields[proposal.field]
              ? <code style={{ fontSize: 12 }}>{record.fields[proposal.field]}</code>
              : <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>(empty)</span>}
          </div>
          <div style={{ borderLeft: `2px solid ${selected ? "var(--color-success-border)" : "var(--color-border)"}`, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>CORRECTED VALUE</div>
            {draftValue
              ? <code style={{ fontSize: 12 }}>{draftValue}</code>
              : <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>(empty)</span>}
          </div>
        </div>

        {/* Edit control */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {proposal.field}
              {proposal.additionalChanges && proposal.additionalChanges.length > 0 && (
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, marginLeft: 6, color: "var(--color-text-muted)" }}>
                  — select a valid value, or leave blank to save as comment
                </span>
              )}
            </span>
            {proposal.additionalChanges && proposal.additionalChanges.length > 0 && draftValue !== "" && (
              <button
                type="button"
                onClick={() => { onDraftChange(""); onSelectedChange(true); }}
                style={{ fontSize: 10, color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
              >
                Clear (use comment fallback)
              </button>
            )}
          </div>
          <label style={{ display: "block" }}>
            {proposal.options && proposal.options.length > 0 ? (
              <SearchableSelect
                value={draftValue}
                options={proposal.options}
                onChange={(v) => { onDraftChange(v); onSelectedChange(true); }}
                style={controlStyle}
                allowBlank={isOptionalField}
              />
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={draftValue}
                  onChange={(e) => { onDraftChange(e.target.value); onSelectedChange(true); }}
                  placeholder={record.fields[proposal.field] || "Enter corrected value…"}
                  style={{ ...controlStyle, flex: 1 }}
                />
                {isOptionalField && record.fields[proposal.field] !== "" && draftValue !== "" && (
                  <button
                    type="button"
                    onClick={() => { onDraftChange(""); onSelectedChange(true); }}
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: "4px 7px", whiteSpace: "nowrap" }}
                  >
                    Clear value
                  </button>
                )}
                {isOptionalField && draftValue === "" && record.fields[proposal.field] !== "" && !proposal.additionalChanges?.length && (
                  <button
                    type="button"
                    onClick={() => { onDraftChange(record.fields[proposal.field] ?? ""); onSelectedChange(true); }}
                    className="btn btn-ghost"
                    style={{ fontSize: 11, padding: "4px 7px", whiteSpace: "nowrap" }}
                  >
                    Undo
                  </button>
                )}
              </div>
            )}
          </label>
        </div>

        {/* Comment fallback preview — shown only when no valid value is selected */}
        {proposal.additionalChanges && proposal.additionalChanges.length > 0 && draftValue === "" && (
          <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 5, border: "1px dashed var(--color-warning-border)", background: "var(--color-warning-bg)", fontSize: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--color-warning-text)", letterSpacing: "0.06em", marginBottom: 6, textTransform: "uppercase" }}>
              Comment fallback — will be applied
            </div>
            {proposal.additionalChanges.map((change) => (
              <div key={change.field} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 2 }}>{change.field} — CURRENT</div>
                  {change.currentValue
                    ? <code style={{ fontSize: 11 }}>{change.currentValue}</code>
                    : <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>(empty)</span>}
                </div>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 2 }}>{change.field} — NEW VALUE</div>
                  <code style={{ fontSize: 11 }}>{change.proposedValue}</code>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: changed ? "var(--color-success-text)" : "var(--color-text-muted)", fontSize: 11 }}>
            {changed ? <Check size={12} /> : null}
            {changed ? "Change staged" : "No change staged"}
          </span>
          <button type="button" onClick={onReset} className="btn btn-ghost" style={{ padding: "4px 8px", fontSize: 11, gap: 5 }}>
            <RotateCcw size={11} /> Reset
          </button>
        </div>
      </div>
    </article>
  );
}
