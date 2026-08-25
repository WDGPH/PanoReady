"use client";

import { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, ChevronDown, ChevronRight, Plus } from "lucide-react";
import type { CustomRuleset, RulesProfile, CleaningProfile, CleaningMapping } from "@/lib/types";
import { BUILTIN_ID, defaultRules, listCustomRulesets, saveCustomRuleset } from "@/lib/rulesets";
import { getCleanableFields } from "@/lib/cleaning";

// Known STIX field names: union of requiredFields + fieldLengths keys from default JSON
const KNOWN_FIELDS = [
  "FirstName", "LastName", "BirthDate", "Grade", "SchoolNumber",
  "MiddleName", "AliasFirstName", "AliasMiddleName", "AliasLastName",
  "OEN", "PostalCode", "City", "StreetName", "StreetNumber",
  "StreetNumberSuffix", "Unit",
];

const FIELD_LENGTH_KEYS = [
  "FirstName", "LastName", "MiddleName", "AliasFirstName",
  "AliasMiddleName", "AliasLastName", "OEN", "PostalCode",
  "City", "StreetName", "StreetNumber", "StreetNumberSuffix", "Unit",
];

type TabId = "general" | "required" | "values" | "lengths" | "format" | "duplication" | "cleaning";

export interface RulesetEditorProps {
  initial?: CustomRuleset;
  onSave: (rs: CustomRuleset) => void;
  onClose: () => void;
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "var(--color-surface-0)",
  border: "1px solid var(--color-border)",
  borderRadius: 3,
  color: "var(--color-text-primary)",
  fontSize: 13,
  padding: "6px 10px",
  outline: "none",
  minWidth: 0,
};

const smallBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 10px",
  borderRadius: 3,
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
  border: "1px solid var(--color-border)",
  background: "var(--color-surface-2)",
  color: "var(--color-text-secondary)",
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 600,
  color: "var(--color-text-muted)",
  marginBottom: 6,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
};

// ── TagList ────────────────────────────────────────────────────────────────────

function TagList({
  values,
  onAdd,
  onRemove,
  placeholder,
}: {
  values: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  function commit() {
    const v = input.trim();
    if (v && !values.includes(v)) { onAdd(v); }
    setInput("");
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8, minHeight: 28 }}>
        {values.length === 0 && (
          <span style={{ fontSize: 12, color: "var(--color-text-muted)", lineHeight: "26px" }}>None</span>
        )}
        {values.map((v) => (
          <span
            key={v}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "var(--color-surface-3)", border: "1px solid var(--color-border)",
              borderRadius: 99, padding: "2px 8px 2px 10px", fontSize: 12,
              color: "var(--color-text-primary)",
            }}
          >
            {v}
            <button
              type="button"
              onClick={() => onRemove(v)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--color-text-muted)", lineHeight: 1, display: "flex" }}
            >
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          placeholder={placeholder ?? "Add value…"}
          style={inputStyle}
        />
        <button type="button" onClick={commit} style={smallBtnStyle} title="Add">
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

// ── AllowedValuesSection ───────────────────────────────────────────────────────

function AllowedValuesSection({
  label,
  values,
  aliases,
  hasAliases,
  onValuesChange,
  onAliasesChange,
}: {
  label: string;
  values: string[];
  aliases?: Record<string, string>;
  hasAliases: boolean;
  onValuesChange: (v: string[]) => void;
  onAliasesChange?: (a: Record<string, string>) => void;
}) {
  const [aliasOpen, setAliasOpen] = useState(false);
  const [aliasRaw, setAliasRaw] = useState("");
  const [aliasCanon, setAliasCanon] = useState("");

  return (
    <div style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "14px 16px" }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--color-text-primary)" }}>
        {label}
      </div>
      <TagList
        values={values}
        onAdd={(v) => onValuesChange([...values, v])}
        onRemove={(v) => onValuesChange(values.filter((x) => x !== v))}
      />
      {hasAliases && aliases && onAliasesChange && (
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setAliasOpen(!aliasOpen)}
            style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500 }}
          >
            {aliasOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            Aliases ({Object.keys(aliases).length})
          </button>
          {aliasOpen && (
            <div style={{ marginTop: 10 }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--color-text-muted)", fontWeight: 600 }}>Raw</th>
                    <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--color-text-muted)", fontWeight: 600 }}>Canonical</th>
                    <th style={{ width: 32 }} />
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(aliases).map(([raw, canon]) => (
                    <tr key={raw}>
                      <td style={{ padding: "4px 8px", fontFamily: "var(--font-mono)" }}>{raw}</td>
                      <td style={{ padding: "4px 8px", fontFamily: "var(--font-mono)" }}>{canon}</td>
                      <td style={{ padding: "4px 4px" }}>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = { ...aliases };
                            delete updated[raw];
                            onAliasesChange(updated);
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: 2, display: "flex" }}
                        >
                          <X size={11} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {Object.keys(aliases).length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: "4px 8px", fontSize: 12, color: "var(--color-text-muted)" }}>No aliases defined</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                <input
                  type="text"
                  value={aliasRaw}
                  onChange={(e) => setAliasRaw(e.target.value)}
                  placeholder="Raw value"
                  style={{ ...inputStyle, width: 130, flex: "none" }}
                />
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>→</span>
                <input
                  type="text"
                  value={aliasCanon}
                  onChange={(e) => setAliasCanon(e.target.value)}
                  placeholder="Canonical"
                  style={{ ...inputStyle, width: 130, flex: "none" }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const r = aliasRaw.trim();
                    const c = aliasCanon.trim();
                    if (r && c) {
                      onAliasesChange({ ...aliases, [r]: c });
                      setAliasRaw("");
                      setAliasCanon("");
                    }
                  }}
                  style={smallBtnStyle}
                  title="Add alias"
                >
                  <Plus size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── RulesetEditor (main export) ───────────────────────────────────────────────

export default function RulesetEditor({ initial, onSave, onClose }: RulesetEditorProps) {
  const isNew = !initial;

  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [name, setName]             = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [cloneFrom, setCloneFrom]   = useState<string>(BUILTIN_ID);
  const [cloneOptions, setCloneOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [rules, setRules] = useState<RulesProfile>(() =>
    JSON.parse(JSON.stringify(initial?.rules ?? defaultRules))
  );
  const [cleaning, setCleaning] = useState<CleaningProfile>(
    () => JSON.parse(JSON.stringify(initial?.cleaning ?? { enabledFields: [], mappings: {} }))
  );
  const [regexError, setRegexError] = useState<string | null>(null);

  // Populate clone options (client-only)
  useEffect(() => {
    const all = listCustomRulesets();
    setCloneOptions([
      { id: BUILTIN_ID, name: "STIX Default (built-in)" },
      ...all.map((r) => ({ id: r.id, name: r.name })),
    ]);
  }, []);

  // When cloneFrom changes (new mode only), reset rules and cleaning
  useEffect(() => {
    if (!isNew) return;
    if (cloneFrom === BUILTIN_ID) {
      setRules(JSON.parse(JSON.stringify(defaultRules)));
      setCleaning({ enabledFields: [], mappings: {} });
    } else {
      const found = listCustomRulesets().find((r) => r.id === cloneFrom);
      if (found) {
        setRules(JSON.parse(JSON.stringify(found.rules)));
        setCleaning(JSON.parse(JSON.stringify(found.cleaning ?? { enabledFields: [], mappings: {} })));
      }
    }
  }, [cloneFrom, isNew]);

  // Validate regex on mount for existing rulesets
  useEffect(() => {
    try { new RegExp(rules.postalCodePattern); setRegexError(null); }
    catch (e) { setRegexError(e instanceof Error ? e.message : "Invalid regex"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePatternChange(v: string) {
    setRules((r) => ({ ...r, postalCodePattern: v }));
    try { new RegExp(v); setRegexError(null); }
    catch (e) { setRegexError(e instanceof Error ? e.message : "Invalid regex"); }
  }

  const canSave = name.trim() !== "" && regexError === null;

  function handleSave() {
    if (!canSave) return;
    const rs: CustomRuleset = {
      id: initial?.id ?? crypto.randomUUID(),
      name: name.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      rules,
      ...(cleaning.enabledFields.length > 0 ? { cleaning } : {}),
    };
    saveCustomRuleset(rs);
    onSave(rs);
  }

  const allowedFieldsConfig: Array<{
    key: keyof Pick<RulesProfile,
      "allowedGradeValues" | "allowedGenderValues" | "allowedProvinceValues" |
      "allowedLanguageValues" | "allowedCountryValues" | "allowedStreetTypeValues" |
      "allowedRelationshipValues" | "allowedPhoneTypeValues" |
      "allowedStreetDirectionValues" | "allowedFullLoadTypeValues"
    >;
    label: string;
    aliasKey?: "gradeAliases" | "genderAliases";
  }> = [
    { key: "allowedGradeValues",        label: "Grade",          aliasKey: "gradeAliases" },
    { key: "allowedGenderValues",       label: "Gender",         aliasKey: "genderAliases" },
    { key: "allowedProvinceValues",     label: "Province" },
    { key: "allowedLanguageValues",     label: "Language" },
    { key: "allowedCountryValues",      label: "Country" },
    { key: "allowedStreetTypeValues",   label: "Street Type" },
    { key: "allowedRelationshipValues", label: "Relationship" },
    { key: "allowedPhoneTypeValues",    label: "Phone Type" },
    { key: "allowedStreetDirectionValues", label: "Street Direction" },
    { key: "allowedFullLoadTypeValues", label: "Full Load Type" },
  ];

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "general",     label: "General" },
    { id: "required",    label: "Required Fields" },
    { id: "values",      label: "Allowed Values" },
    { id: "lengths",     label: "Field Lengths" },
    { id: "format",      label: "Format Rules" },
    { id: "duplication", label: "Duplicate Detection" },
    { id: "cleaning",    label: "Cleaning" },
  ];

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 50,
          }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            background: "var(--color-surface-1)",
            border: "1px solid var(--color-border)",
            borderRadius: 4,
            width: "min(92vw, 740px)",
            maxHeight: "88vh",
            display: "flex",
            flexDirection: "column",
            zIndex: 51,
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid var(--color-border)", flexShrink: 0 }}>
            <Dialog.Title style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              {isNew ? "New Ruleset" : `Edit: ${initial.name}`}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--color-text-muted)", display: "flex" }}>
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", padding: "0 24px", borderBottom: "1px solid var(--color-border)", flexShrink: 0, overflowX: "auto" }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "11px 14px", fontSize: 13, fontWeight: 500, whiteSpace: "nowrap",
                  color: activeTab === tab.id ? "var(--color-brand-400)" : "var(--color-text-secondary)",
                  borderBottom: activeTab === tab.id ? "2px solid var(--color-brand-400)" : "2px solid transparent",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

            {/* ── General ── */}
            {activeTab === "general" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={labelStyle}>
                    Name <span style={{ color: "var(--color-error-text)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Board Ruleset"
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" as const }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Optional note about this ruleset"
                    style={{ ...inputStyle, width: "100%", boxSizing: "border-box" as const, resize: "vertical", fontFamily: "inherit" }}
                  />
                </div>
                {isNew && (
                  <div>
                    <label style={labelStyle}>Clone from</label>
                    <select
                      value={cloneFrom}
                      onChange={(e) => setCloneFrom(e.target.value)}
                      style={{ ...inputStyle, width: "100%", boxSizing: "border-box" as const, cursor: "pointer" }}
                    >
                      {cloneOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 5 }}>
                      Start with a deep copy of the selected ruleset's settings.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Required Fields ── */}
            {activeTab === "required" && (
              <div>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 14 }}>
                  Fields that must be non-empty on every student record.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {KNOWN_FIELDS.map((field) => {
                    const checked = rules.requiredFields.includes(field);
                    return (
                      <label
                        key={field}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 10px", borderRadius: 3, cursor: "pointer",
                          background: checked ? "var(--color-success-bg)" : "transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setRules((r) => ({
                              ...r,
                              requiredFields: e.target.checked
                                ? [...r.requiredFields, field]
                                : r.requiredFields.filter((f) => f !== field),
                            }));
                          }}
                          style={{ accentColor: "var(--color-brand-500)", cursor: "pointer" }}
                        />
                        <span style={{ fontSize: 13, fontFamily: "var(--font-mono)" }}>{field}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Allowed Values ── */}
            {activeTab === "values" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {allowedFieldsConfig.map(({ key, label, aliasKey }) => (
                  <AllowedValuesSection
                    key={key}
                    label={label}
                    values={rules[key] as string[]}
                    aliases={aliasKey ? rules[aliasKey] : undefined}
                    hasAliases={!!aliasKey}
                    onValuesChange={(vals) => setRules((r) => ({ ...r, [key]: vals }))}
                    onAliasesChange={
                      aliasKey
                        ? (aliases) => setRules((r) => ({ ...r, [aliasKey]: aliases }))
                        : undefined
                    }
                  />
                ))}
              </div>
            )}

            {/* ── Field Lengths ── */}
            {activeTab === "lengths" && (
              <div>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 14 }}>
                  Maximum character length for each field (minimum 1).
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {FIELD_LENGTH_KEYS.map((field) => (
                    <div key={field} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", minWidth: 180 }}>
                        {field}
                      </span>
                      <input
                        type="number"
                        min={1}
                        value={rules.fieldLengths[field] ?? ""}
                        onChange={(e) => {
                          const v = parseInt(e.target.value, 10);
                          if (!isNaN(v) && v >= 1) {
                            setRules((r) => ({ ...r, fieldLengths: { ...r.fieldLengths, [field]: v } }));
                          }
                        }}
                        style={{ ...inputStyle, width: 100, flex: "none" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Format Rules ── */}
            {activeTab === "format" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <label style={labelStyle}>Postal Code Pattern</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="text"
                      value={rules.postalCodePattern}
                      onChange={(e) => handlePatternChange(e.target.value)}
                      style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}
                    />
                    <span style={{ fontSize: 18, flexShrink: 0, color: regexError === null ? "var(--color-brand-400)" : "var(--color-error-text)" }}>
                      {regexError === null ? "✓" : "✗"}
                    </span>
                  </div>
                  {regexError && (
                    <div style={{ fontSize: 12, color: "var(--color-error-text)", marginTop: 5 }}>
                      {regexError}
                    </div>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Placeholder Phone Numbers</label>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
                    Phone numbers that are flagged as placeholders during validation.
                  </div>
                  <TagList
                    values={rules.phoneConfig.placeholderNumbers}
                    onAdd={(v) => setRules((r) => ({ ...r, phoneConfig: { ...r.phoneConfig, placeholderNumbers: [...r.phoneConfig.placeholderNumbers, v] } }))}
                    onRemove={(v) => setRules((r) => ({ ...r, phoneConfig: { ...r.phoneConfig, placeholderNumbers: r.phoneConfig.placeholderNumbers.filter((x) => x !== v) } }))}
                    placeholder="e.g. 000-000-0000"
                  />
                </div>

                <div>
                  <label style={labelStyle}>Date Fields</label>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
                    Fields that must contain a valid YYYY-MM-DD date.
                  </div>
                  <TagList
                    values={rules.dateFields}
                    onAdd={(v) => setRules((r) => ({ ...r, dateFields: [...r.dateFields, v] }))}
                    onRemove={(v) => setRules((r) => ({ ...r, dateFields: r.dateFields.filter((x) => x !== v) }))}
                    placeholder="e.g. BirthDate"
                  />
                </div>
              </div>
            )}

            {/* ── Duplicate Detection ── */}
            {activeTab === "duplication" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 4 }}>
                  Control which duplicate detection checks are active.
                </div>
                {(
                  [
                    { key: "checkOen" as const, label: "Check for duplicate OEN", desc: "Flag records that share an OEN value." },
                    { key: "checkNameDobSchool" as const, label: "Check for duplicate Name + DOB + School", desc: "Flag records with matching first name, last name, date of birth, and school number." },
                  ] as const
                ).map(({ key, label, desc }) => (
                  <label
                    key={key}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 12,
                      padding: "12px 14px",
                      background: "var(--color-surface-2)", border: "1px solid var(--color-border)",
                      borderRadius: 4, cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={rules.duplicateDetection[key]}
                      onChange={(e) =>
                        setRules((r) => ({ ...r, duplicateDetection: { ...r.duplicateDetection, [key]: e.target.checked } }))
                      }
                      style={{ accentColor: "var(--color-brand-500)", cursor: "pointer", marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* ── Cleaning ── */}
            {activeTab === "cleaning" && (
              <CleaningTabPanel
                profile={cleaning}
                rules={rules}
                onChange={setCleaning}
              />
            )}

          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 24px", borderTop: "1px solid var(--color-border)", flexShrink: 0 }}>
            <button type="button" onClick={onClose} style={{ ...smallBtnStyle, padding: "8px 18px" }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave}
              style={{
                padding: "8px 20px", borderRadius: 3, fontSize: 13, fontWeight: 600,
                cursor: canSave ? "pointer" : "not-allowed",
                background: canSave ? "var(--color-brand-600)" : "var(--color-surface-3)",
                color: canSave ? "var(--marble)" : "var(--color-text-muted)",
                border: "none",
              }}
            >
              Save Ruleset
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── CleaningTabPanel ──────────────────────────────────────────────────────────

function CleaningTabPanel({
  profile,
  rules,
  onChange,
}: {
  profile: CleaningProfile;
  rules: RulesProfile;
  onChange: (p: CleaningProfile) => void;
}) {
  const [selectedField, setSelectedField] = useState<string>(profile.enabledFields[0] ?? "");
  const [showPicker, setShowPicker] = useState(false);
  const [newRaw, setNewRaw] = useState("");
  const [newCanon, setNewCanon] = useState("");

  const pickable = getCleanableFields(rules);
  const available = pickable.filter((f) => !profile.enabledFields.includes(f));

  function addField(field: string) {
    onChange({
      ...profile,
      enabledFields: [...profile.enabledFields, field],
      mappings: { ...profile.mappings, [field]: profile.mappings[field] ?? [] },
    });
    setSelectedField(field);
    setShowPicker(false);
  }

  function removeField(field: string) {
    const { [field]: _m, ...restMappings } = profile.mappings;
    onChange({
      enabledFields: profile.enabledFields.filter((f) => f !== field),
      mappings: restMappings,
    });
    if (selectedField === field) {
      const remaining = profile.enabledFields.filter((f) => f !== field);
      setSelectedField(remaining[0] ?? "");
    }
  }

  function removeMapping(field: string, raw: string) {
    onChange({
      ...profile,
      mappings: {
        ...profile.mappings,
        [field]: (profile.mappings[field] ?? []).filter((m) => m.raw !== raw),
      },
    });
  }

  function addMapping() {
    const r = newRaw.trim();
    const c = newCanon.trim();
    if (!r || !c || !selectedField) return;
    const existing = profile.mappings[selectedField] ?? [];
    if (existing.some((m) => m.raw === r)) return; // duplicate raw
    onChange({
      ...profile,
      mappings: {
        ...profile.mappings,
        [selectedField]: [...existing, { raw: r, canonical: c }],
      },
    });
    setNewRaw("");
    setNewCanon("");
  }

  function toggleMappingMatchCase(field: string, raw: string) {
    const existing = profile.mappings[field] ?? [];
    onChange({
      ...profile,
      mappings: {
        ...profile.mappings,
        [field]: existing.map((m) => m.raw === raw ? { ...m, matchCase: !m.matchCase } : m),
      },
    });
  }

  const fieldMappings = selectedField ? (profile.mappings[selectedField] ?? []) : [];

  if (profile.enabledFields.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-text-muted)" }}>
        <div style={{ fontSize: 13, marginBottom: 14 }}>
          No cleaning fields defined. Add a field to pre-configure mappings.
        </div>
        <div style={{ position: "relative", display: "inline-block" }}>
          <button type="button" onClick={() => setShowPicker(true)} style={smallBtnStyle}>
            <Plus size={13} /> Add field
          </button>
          {showPicker && available.length > 0 && (
            <EditorFieldPicker fields={available} onPick={addField} onClose={() => setShowPicker(false)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 16, minHeight: 300 }}>
      {/* Field list */}
      <div style={{ width: 160, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Fields</div>
        {profile.enabledFields.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setSelectedField(f)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 8px", borderRadius: 6, fontSize: 12, cursor: "pointer",
              border: `1px solid ${selectedField === f ? "var(--color-brand-400)" : "var(--color-border)"}`,
              background: selectedField === f ? "color-mix(in srgb,var(--color-brand-400) 10%,var(--color-surface-2))" : "var(--color-surface-2)",
              color: selectedField === f ? "var(--color-brand-400)" : "var(--color-text-primary)",
              fontWeight: selectedField === f ? 600 : 400,
            }}
          >
            <span>{f}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeField(f); }}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--color-text-muted)", display: "flex" }}
            >
              <X size={11} />
            </button>
          </button>
        ))}
        <div style={{ position: "relative" }}>
          {available.length > 0 && (
            <button type="button" onClick={() => setShowPicker(true)} style={{ ...smallBtnStyle, width: "100%", justifyContent: "center", fontSize: 11, padding: "5px 8px" }}>
              <Plus size={11} /> Add
            </button>
          )}
          {showPicker && available.length > 0 && (
            <EditorFieldPicker fields={available} onPick={addField} onClose={() => setShowPicker(false)} />
          )}
        </div>
      </div>

      {/* Mapping table */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {selectedField ? (
          <>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedField}</div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 10 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--color-text-muted)", fontWeight: 600, borderBottom: "1px solid var(--color-border)" }}>Raw</th>
                  <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--color-text-muted)", fontWeight: 600, borderBottom: "1px solid var(--color-border)" }}>Canonical</th>
                  <th style={{ textAlign: "center", padding: "4px 8px", color: "var(--color-text-muted)", fontWeight: 600, borderBottom: "1px solid var(--color-border)", width: 72 }}>Match case</th>
                  <th style={{ width: 28, borderBottom: "1px solid var(--color-border)" }} />
                </tr>
              </thead>
              <tbody>
                {fieldMappings.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: "8px", color: "var(--color-text-muted)", fontSize: 12 }}>No mappings yet.</td></tr>
                )}
                {fieldMappings.map((m: CleaningMapping) => (
                  <tr key={m.raw} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: "5px 8px", fontFamily: "var(--font-mono)" }}>{m.raw}</td>
                    <td style={{ padding: "5px 8px", fontFamily: "var(--font-mono)" }}>{m.canonical}</td>
                    <td style={{ padding: "3px 8px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={!!m.matchCase}
                        onChange={() => toggleMappingMatchCase(selectedField, m.raw)}
                        title="Match case for this rule only"
                      />
                    </td>
                    <td style={{ padding: "3px 4px" }}>
                      <button type="button" onClick={() => removeMapping(selectedField, m.raw)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--color-text-muted)", display: "flex" }}>
                        <X size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="text" value={newRaw} onChange={(e) => setNewRaw(e.target.value)} placeholder="Raw value" style={{ ...inputStyle, flex: 1 }} />
              <span style={{ fontSize: 12, color: "var(--color-text-muted)", flexShrink: 0 }}>→</span>
              <input type="text" value={newCanon} onChange={(e) => setNewCanon(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addMapping(); } }} placeholder="Canonical" style={{ ...inputStyle, flex: 1 }} />
              <button type="button" onClick={addMapping} style={smallBtnStyle} title="Add mapping">
                <Plus size={13} />
              </button>
            </div>
          </>
        ) : (
          <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Select a field to edit mappings.</div>
        )}
      </div>
    </div>
  );
}

function EditorFieldPicker({ fields, onPick, onClose }: { fields: string[]; onPick: (f: string) => void; onClose: () => void }) {
  return (
    <div style={{
      position: "absolute", top: "100%", left: 0, zIndex: 20, marginTop: 4,
      background: "var(--color-surface-1)", border: "1px solid var(--color-border)",
      borderRadius: 8, padding: 8, minWidth: 160, boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
    }}>
      {fields.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onPick(f)}
          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "5px 8px", borderRadius: 4, fontSize: 12, color: "var(--color-text-primary)" }}
        >
          {f}
        </button>
      ))}
      <button
        type="button"
        onClick={onClose}
        style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 4, fontSize: 11, color: "var(--color-text-muted)", marginTop: 4 }}
      >
        Cancel
      </button>
    </div>
  );
}
