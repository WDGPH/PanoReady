"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileUp, AlertCircle } from "lucide-react";
import type { CustomRuleset, RulesProfile } from "@/lib/types";
import {
  BUILTIN_ID,
  defaultRules,
  deleteCustomRuleset,
  getActiveRulesetId,
  importRulesetFromJson,
  listCustomRulesets,
  saveCustomRuleset,
  setActiveRulesetId,
} from "@/lib/rulesets";
import { downloadText } from "@/lib/utils";

interface RulesetSelectorProps {
  onRulesChange: (rules: RulesProfile) => void;
}

export default function RulesetSelector({ onRulesChange }: RulesetSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeId, setActiveId] = useState<string>(BUILTIN_ID);
  const [rulesets, setRulesets] = useState<CustomRuleset[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  // Initialise from localStorage on mount (safe — this is a client component)
  useEffect(() => {
    const id = getActiveRulesetId();
    const all = listCustomRulesets();
    setActiveId(id);
    setRulesets(all);
    const active = id === BUILTIN_ID ? defaultRules : (all.find((r) => r.id === id)?.rules ?? defaultRules);
    onRulesChange(active);
    // onRulesChange intentionally excluded — we only want to sync once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applySelection(id: string, all: CustomRuleset[]) {
    setActiveId(id);
    setActiveRulesetId(id);
    const rules = id === BUILTIN_ID ? defaultRules : (all.find((r) => r.id === id)?.rules ?? defaultRules);
    onRulesChange(rules);
  }

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    setImportError(null);
    applySelection(e.target.value, rulesets);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-imported after a fix
    e.target.value = "";
    setImportError(null);
    try {
      const text = await file.text();
      const rs = importRulesetFromJson(text);
      saveCustomRuleset(rs);
      const all = listCustomRulesets();
      setRulesets(all);
      applySelection(rs.id, all);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDelete() {
    if (activeId === BUILTIN_ID) return;
    deleteCustomRuleset(activeId);
    const all = listCustomRulesets();
    setRulesets(all);
    applySelection(BUILTIN_ID, all);
  }

  function handleExport() {
    let toExport: CustomRuleset;
    if (activeId === BUILTIN_ID) {
      toExport = {
        id: crypto.randomUUID(),
        name: "STIX Default (exported)",
        description: "Exported copy of the built-in STIX Default ruleset. Edit and re-import to create a custom ruleset.",
        createdAt: new Date().toISOString(),
        rules: defaultRules,
      };
    } else {
      const found = rulesets.find((r) => r.id === activeId);
      if (!found) return;
      toExport = found;
    }
    const safeName = toExport.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    downloadText(
      JSON.stringify(toExport, null, 2),
      `${safeName}_ruleset.json`,
      "application/json"
    );
  }

  const selectStyle: React.CSSProperties = {
    flex: 1,
    background: "var(--color-surface-2)",
    border: "1px solid var(--color-border)",
    borderRadius: 7,
    color: "var(--color-text-primary)",
    fontSize: 13,
    padding: "7px 10px",
    cursor: "pointer",
    outline: "none",
    minWidth: 0,
  };

  const iconBtnStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "7px 11px",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    border: "1px solid var(--color-border)",
    background: "var(--color-surface-2)",
    color: "var(--color-text-secondary)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  };

  return (
    <div>
      <div
        style={{
          color: "var(--color-text-muted)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        Validation ruleset
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={activeId} onChange={handleSelect} style={selectStyle}>
          <option value={BUILTIN_ID}>STIX Default (built-in)</option>
          {rulesets.map((rs) => (
            <option key={rs.id} value={rs.id}>
              {rs.name}
            </option>
          ))}
        </select>

        {/* Hidden file input triggered by the Import button */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportFile}
          style={{ display: "none" }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={iconBtnStyle}
          title="Import a ruleset from a .json file"
        >
          <FileUp size={13} />
          Import
        </button>

        <button
          type="button"
          onClick={handleExport}
          style={iconBtnStyle}
          title="Export the active ruleset as a .json file"
        >
          <Download size={13} />
          Export
        </button>

        {activeId !== BUILTIN_ID && (
          <button
            type="button"
            onClick={handleDelete}
            style={{
              ...iconBtnStyle,
              color: "var(--color-error-text)",
              borderColor: "var(--color-error-border)",
              background: "var(--color-error-bg)",
            }}
            title="Remove this custom ruleset"
          >
            Remove
          </button>
        )}
      </div>

      {importError && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            background: "var(--color-error-bg)",
            border: "1px solid var(--color-error-border)",
            borderRadius: 7,
            padding: "9px 12px",
            color: "var(--color-error-text)",
            fontSize: 12,
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Import failed:</strong> {importError}
          </span>
        </div>
      )}

      {activeId !== BUILTIN_ID && (() => {
        const rs = rulesets.find((r) => r.id === activeId);
        return rs ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "var(--color-text-muted)",
              lineHeight: 1.5,
            }}
          >
            {rs.description && <span>{rs.description} · </span>}
            Added {new Date(rs.createdAt).toLocaleDateString()}
          </div>
        ) : null;
      })()}
    </div>
  );
}
