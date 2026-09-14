"use client";

import { useState, useMemo } from "react";
import { Plus, X, ArrowRight, Save } from "lucide-react";
import type { StudentRecord, CleaningProfile, CleaningMapping, CleaningSummaryEntry } from "@/lib/types";
import { applyCleaningProfile, discoverFieldValues, getCleanableFields } from "@/lib/cleaning";

// ─── Shared styles ────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: "var(--color-surface-0)",
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  color: "var(--color-text-primary)",
  fontSize: 13,
  padding: "5px 8px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const btnSecondary: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 5,
  padding: "7px 12px", borderRadius: 7, fontSize: 13, fontWeight: 500,
  cursor: "pointer", border: "1px solid var(--color-border)",
  background: "var(--color-surface-2)", color: "var(--color-text-secondary)",
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface CleaningViewProps {
  records: StudentRecord[];
  initialProfile: CleaningProfile | null;
  onApply: (cleaned: StudentRecord[], summary: CleaningSummaryEntry[], profile: CleaningProfile) => void;
  onSaveToRuleset: (profile: CleaningProfile, name?: string) => boolean;
  onProfileChange: (profile: CleaningProfile) => void;
  isBuiltin: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CleaningView({
  records,
  initialProfile,
  onApply,
  onSaveToRuleset,
  onProfileChange,
  isBuiltin,
}: CleaningViewProps) {
  const [workingProfile, updateWorkingProfile] = useState<CleaningProfile>(
    initialProfile ?? { enabledFields: [], mappings: {} }
  );
  function setWorkingProfile(update: (current: CleaningProfile) => CleaningProfile) {
    const next = update(workingProfile);
    updateWorkingProfile(next);
    onProfileChange(next);
  }
  const [enabled, setEnabled] = useState(true);
  const [profileName, setProfileName] = useState("");
  const [selectedField, setSelectedField] = useState<string>(
    initialProfile?.enabledFields[0] ?? ""
  );
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const pickableFields = useMemo(() => getCleanableFields(), []);

  // Fields not yet added
  const availableToAdd = pickableFields.filter(
    (f) => !workingProfile.enabledFields.includes(f)
  );

  const hasFields = workingProfile.enabledFields.length > 0;

  // ── Mapping mutations ──────────────────────────────────────────────────────

  function addField(field: string) {
    setWorkingProfile((p) => ({
      ...p,
      enabledFields: [...p.enabledFields, field],
      mappings: { ...p.mappings, [field]: p.mappings[field] ?? [] },
    }));
    setSelectedField(field);
    setShowFieldPicker(false);
  }

  function removeField(field: string) {
    setWorkingProfile((p) => {
      const restMappings = { ...p.mappings };
      delete restMappings[field];
      return {
        enabledFields: p.enabledFields.filter((f) => f !== field),
        mappings: restMappings,
      };
    });
    if (selectedField === field) {
      const remaining = workingProfile.enabledFields.filter((f) => f !== field);
      setSelectedField(remaining[0] ?? "");
    }
  }

  function setCanonical(field: string, raw: string, canonical: string) {
    setWorkingProfile((p) => {
      const existing = p.mappings[field] ?? [];
      const idx = existing.findIndex((m) => m.raw === raw);
      let updated: CleaningMapping[];
      if (canonical === "") {
        // Remove mapping
        updated = existing.filter((m) => m.raw !== raw);
      } else if (idx >= 0) {
        updated = existing.map((m, i) => (i === idx ? { ...m, raw, canonical } : m));
      } else {
        updated = [...existing, { raw, canonical }];
      }
      return { ...p, mappings: { ...p.mappings, [field]: updated } };
    });
  }

  function toggleMappingMatchCase(field: string, raw: string) {
    setWorkingProfile((p) => {
      const existing = p.mappings[field] ?? [];
      const updated = existing.map((m) =>
        m.raw === raw ? { ...m, matchCase: !m.matchCase } : m
      );
      return { ...p, mappings: { ...p.mappings, [field]: updated } };
    });
  }

  // ── Apply & Save ───────────────────────────────────────────────────────────

  function handleApply() {
    const profile = normalizeProfile(workingProfile);
    const { records: cleaned, summary } = applyCleaningProfile(records, profile);
    onApply(cleaned, summary, profile);
  }

  function handleSave() {
    const profile = normalizeProfile(workingProfile);
    const saved = onSaveToRuleset(profile, profileName.trim());
    if (saved) {
      setSaveMsg("Saved to profile");
      setTimeout(() => setSaveMsg(null), 2000);
    }
  }

  // Strip empty mappings before applying / saving
  function normalizeProfile(p: CleaningProfile): CleaningProfile {
    const mappings: Record<string, CleaningMapping[]> = {};
    for (const field of p.enabledFields) {
      const active = (p.mappings[field] ?? []).filter((m) => m.canonical.trim() !== "");
      if (active.length > 0) mappings[field] = active;
    }
    const enabledFields = p.enabledFields.filter((f) => (mappings[f]?.length ?? 0) > 0);
    return { enabledFields, mappings };
  }

  const fieldValues = useMemo(
    () => (selectedField ? discoverFieldValues(records, selectedField) : []),
    [records, selectedField]
  );

  // ── Render: empty state ────────────────────────────────────────────────────

  if (!hasFields) {
    return (
      <section className="cleaning-pane">
        <h2>Cleaning mappings <span className="optional-label">(optional)</span></h2>
        <p className="cleaning-description">Replace values, then recheck file quality.</p>
        <div className="cleaning-empty">
          <span>No mappings configured.</span>
          <button style={btnSecondary} onClick={() => setShowFieldPicker(true)}>
            <Plus size={14} /> Add mapping
          </button>
        </div>
        {showFieldPicker && availableToAdd.length > 0 && (
          <FieldPicker fields={availableToAdd} onPick={addField} onClose={() => setShowFieldPicker(false)} />
        )}
        <div className="preparation-actions">
          {saveMsg && <span role="status">{saveMsg}</span>}
          {!isBuiltin && <button style={btnSecondary} onClick={handleSave}>Save mappings to profile</button>}

        </div>
      </section>
    );
  }

  // ── Render: active state ───────────────────────────────────────────────────

  const fieldMappings = selectedField ? (workingProfile.mappings[selectedField] ?? []) : [];

  // Mappings whose raw value doesn't appear in the current file
  const inFile = new Set(fieldValues.map(({ value }) => value));
  const predefinedMappings = fieldMappings.filter((m) => !inFile.has(m.raw));

  return (
    <section className="cleaning-pane">
      <h2>Cleaning mappings <span className="optional-label">(optional)</span></h2>
      <p className="cleaning-description">Replace values, then recheck file quality.</p>
      <details className="cleaning-help">
        <summary>Matching details</summary>
        <p>Whole-value matching; case-insensitive unless “Match case” is selected. First match wins. Regex is not supported.</p>
        <p>Example: SchoolName “St. Marys” → “St. Mary’s”.</p>
      </details>

      <label style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        Apply mappings
      </label>
      {!enabled && <p>Mappings will be skipped.</p>}
      <div className="cleaning-editor" style={{ display: "flex", gap: 20, minHeight: 0 }}>
        {/* Left: field list */}
        <div style={{ width: 180, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Fields</div>
          {workingProfile.enabledFields.map((f) => (
            <div
              key={f}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "7px 10px", borderRadius: 7, fontSize: 13, cursor: "pointer",
                border: `1px solid ${selectedField === f ? "var(--color-brand-400)" : "var(--color-border)"}`,
                background: selectedField === f ? "color-mix(in srgb,var(--color-brand-400) 10%,var(--color-surface-2))" : "var(--color-surface-1)",
                color: selectedField === f ? "var(--color-brand-400)" : "var(--color-text-primary)",
                fontWeight: selectedField === f ? 600 : 400,
              }}
            >
              <button type="button" onClick={() => setSelectedField(f)} style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", textAlign: "left", flex: 1 }}>{f}</button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); removeField(f); }}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--color-text-muted)", display: "flex" }}
                title={`Remove ${f}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          {availableToAdd.length > 0 && (
            <button style={{ ...btnSecondary, justifyContent: "center", fontSize: 12, padding: "6px 10px" }} onClick={() => setShowFieldPicker(true)}>
              <Plus size={12} /> Add field
            </button>
          )}
          {showFieldPicker && availableToAdd.length > 0 && (
            <FieldPicker fields={availableToAdd} onPick={addField} onClose={() => setShowFieldPicker(false)} />
          )}
        </div>

        {/* Right: mapping table */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selectedField ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{selectedField}</div>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--color-text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--color-border)" }}>
                      Raw value
                    </th>
                    <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--color-text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--color-border)" }}>
                      Maps to (leave blank = no change)
                    </th>
                    <th style={{ textAlign: "center", padding: "6px 10px", color: "var(--color-text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--color-border)", width: 80 }}>
                      Match case
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fieldValues.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: "14px 10px", color: "var(--color-text-muted)", fontSize: 13 }}>
                        No values found for this field in the loaded file.
                      </td>
                    </tr>
                  )}
                  {fieldValues.map(({ value, count }) => {
                    const existing = fieldMappings.find((m) => m.raw === value);
                    return (
                      <tr key={value} style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "8px 10px" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{value}</span>
                          <span style={{ marginLeft: 8, fontSize: 11, color: "var(--color-text-muted)" }}>({count})</span>
                        </td>
                        <td style={{ padding: "6px 10px" }}>
                          <input
                            type="text"
                            value={existing?.canonical ?? ""}
                            onChange={(e) => setCanonical(selectedField, value, e.target.value)}
                            placeholder="No change"
                            aria-label={`Replace ${selectedField} value ${value}`}
                            style={inputStyle}
                          />
                        </td>
                        <td style={{ padding: "6px 10px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={!!(existing?.matchCase)}
                            disabled={!existing}
                            onChange={() => toggleMappingMatchCase(selectedField, value)}
                            title="Match case for this rule only"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {predefinedMappings.length > 0 && (
                <details style={{ marginTop: 20 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--color-text-muted)", userSelect: "none", marginBottom: 8 }}>
                    Pre-defined (not in this file) — {predefinedMappings.length} mapping{predefinedMappings.length !== 1 ? "s" : ""}
                  </summary>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--color-text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--color-border)" }}>Raw value</th>
                        <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--color-text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--color-border)" }}>Maps to</th>
                        <th style={{ textAlign: "center", padding: "6px 10px", color: "var(--color-text-muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", borderBottom: "1px solid var(--color-border)", width: 80 }}>Match case</th>
                        <th style={{ width: 40, borderBottom: "1px solid var(--color-border)" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {predefinedMappings.map(({ raw, canonical, matchCase }) => (
                        <tr key={raw} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "8px 10px" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{raw}</span>
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{canonical}</span>
                          </td>
                          <td style={{ padding: "6px 10px", textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={!!matchCase}
                              onChange={() => toggleMappingMatchCase(selectedField, raw)}
                              title="Match case for this rule only"
                            />
                          </td>
                          <td style={{ padding: "6px 10px" }}>
                            <button
                              type="button"
                              onClick={() => setCanonical(selectedField, raw, "")}
                              title="Remove mapping"
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--color-text-muted)", display: "flex" }}
                            >
                              <X size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </>
          ) : (
            <div style={{ color: "var(--color-text-muted)", fontSize: 13, padding: 16 }}>Select a field on the left.</div>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="preparation-actions">
        {saveMsg && <span style={{ fontSize: 12, color: "var(--color-brand-400)" }}>{saveMsg}</span>}
        {isBuiltin && <label style={{ fontSize: 12 }}>New profile name
          <input style={inputStyle} value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="My STIX profile" />
        </label>}
        <button style={btnSecondary} onClick={handleSave}>
          <Save size={14} /> {isBuiltin ? "Save as new profile" : "Save mappings to profile"}
        </button>
        <button className="btn btn-primary" style={{ gap: 6 }} disabled={!enabled || normalizeProfile(workingProfile).enabledFields.length === 0} onClick={handleApply}>
          Preview cleaning changes <ArrowRight size={15} />
        </button>
      </div>
    </section>
  );
}

// ─── FieldPicker popover ──────────────────────────────────────────────────────

function FieldPicker({ fields, onPick, onClose }: { fields: string[]; onPick: (f: string) => void; onClose: () => void }) {
  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          position: "absolute", top: 4, left: 0, zIndex: 20,
          background: "var(--color-surface-1)", border: "1px solid var(--color-border)",
          borderRadius: 8, padding: 8, minWidth: 160, boxShadow: "0 4px 16px var(--color-shadow)",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 6, padding: "0 6px" }}>Add field</div>
        {fields.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onPick(f)}
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "6px 8px", borderRadius: 5, fontSize: 13, color: "var(--color-text-primary)" }}
          >
            {f}
          </button>
        ))}
        <button
          type="button"
          onClick={onClose}
          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 5, fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
