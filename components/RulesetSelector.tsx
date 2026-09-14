"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, FileUp, AlertCircle, Pencil, Plus, Copy, X } from "lucide-react";
import type { CleaningProfile, CustomRuleset, RulesProfile } from "@/lib/types";
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
import RulesetEditor from "./RulesetEditor";

interface RulesetSelectorProps {
  onRulesChange: (rules: RulesProfile, cleaning: CleaningProfile | null, id: string) => void;
  compact?: boolean;
  notifyOnMount?: boolean;
  initialId?: string;
}

/** Extract a field name from a validator error message of the form `'fieldName' …` */
function parseErrorField(msg: string): string | null {
  const m = msg.match(/^'([\w.]+)'/);
  return m ? m[1] : null;
}

export default function RulesetSelector({ onRulesChange, compact = false, notifyOnMount = true, initialId }: RulesetSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeId, setActiveId]           = useState<string>(BUILTIN_ID);
  const [rulesets, setRulesets]           = useState<CustomRuleset[]>([]);
  const [importError, setImportError]     = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[] | null>(null);
  const [editorOpen, setEditorOpen]       = useState(false);
  const [editingRuleset, setEditingRuleset] = useState<CustomRuleset | undefined>(undefined);
  const [managerOpen, setManagerOpen]     = useState(false);

  // Initialise from the workflow's in-memory profile registry on mount.
  useEffect(() => {
    const id  = initialId ?? getActiveRulesetId();
    const all = listCustomRulesets();
    setActiveId(id);
    setRulesets(all);
    const active = id === BUILTIN_ID ? defaultRules : (all.find((r) => r.id === id)?.rules ?? defaultRules);
    if (notifyOnMount) onRulesChange(active, all.find((r) => r.id === id)?.cleaning ?? null, id);
    // onRulesChange intentionally excluded — we only want to sync once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applySelection(id: string, all: CustomRuleset[]) {
    setActiveId(id);
    setActiveRulesetId(id);
    const rules = id === BUILTIN_ID ? defaultRules : (all.find((r) => r.id === id)?.rules ?? defaultRules);
    onRulesChange(rules, all.find((r) => r.id === id)?.cleaning ?? null, id);
  }

  function refreshAndSelect(id: string) {
    const all = listCustomRulesets();
    setRulesets(all);
    applySelection(id, all);
  }

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    setImportError(null);
    setImportWarnings(null);
    applySelection(e.target.value, rulesets);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-imported after a fix
    e.target.value = "";
    setImportError(null);
    setImportWarnings(null);
    try {
      const text = await file.text();
      const rs   = importRulesetFromJson(text);
      if (rs.warnings && rs.warnings.length > 0) {
        setImportWarnings(rs.warnings);
      }
      // Strip transient import warnings before the session copy can be exported.
      const rsToSave = { ...rs };
      delete rsToSave.warnings;
      saveCustomRuleset(rsToSave);
      refreshAndSelect(rsToSave.id);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleDelete() {
    if (activeId === BUILTIN_ID) return;
    deleteCustomRuleset(activeId);
    refreshAndSelect(BUILTIN_ID);
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
    downloadText(JSON.stringify(toExport, null, 2), `${safeName}_ruleset.json`, "application/json");
  }

  function handleNew() {
    setImportError(null);
    setImportWarnings(null);
    setEditingRuleset(undefined);
    setEditorOpen(true);
  }

  function handleEdit() {
    if (activeId === BUILTIN_ID) return;
    const found = rulesets.find((r) => r.id === activeId);
    if (!found) return;
    setImportError(null);
    setImportWarnings(null);
    setEditingRuleset(found);
    setEditorOpen(true);
  }

  function handleDuplicate() {
    const source: CustomRuleset | null =
      activeId === BUILTIN_ID
        ? { id: BUILTIN_ID, name: "STIX Default (built-in)", createdAt: new Date().toISOString(), rules: defaultRules }
        : rulesets.find((r) => r.id === activeId) ?? null;
    if (!source) return;
    const copy: CustomRuleset = {
      id: crypto.randomUUID(),
      name: `Copy of ${source.name}`,
      ...(source.description ? { description: source.description } : {}),
      createdAt: new Date().toISOString(),
      rules: JSON.parse(JSON.stringify(source.rules)) as RulesProfile,
      ...(source.cleaning ? { cleaning: structuredClone(source.cleaning) } : {}),
    };
    saveCustomRuleset(copy);
    refreshAndSelect(copy.id);
  }

  function handleEditorSave(rs: CustomRuleset) {
    setEditorOpen(false);
    refreshAndSelect(rs.id);
  }

  // ── Error display helpers ────────────────────────────────────────────────────

  const errorField = importError ? parseErrorField(importError) : null;
  // Strip the leading 'fieldName' token from the message body when showing inline
  const errorBody  = importError && errorField
    ? importError.replace(/^'[\w.]+'/, "").trimStart()
    : importError;

  // ── Styles ───────────────────────────────────────────────────────────────────

  const selectStyle: React.CSSProperties = {
    border: 0,
    borderBottom: "1px solid var(--ink)",
    background: "transparent",
    borderRadius: 0,
    color: "var(--color-text-primary)",
    fontSize: 14,
    padding: "8px 0",
    cursor: "pointer",
    outline: "none",
    minWidth: 220,
  };

  const linkStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: 0,
    fontSize: 11,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    cursor: "pointer",
    border: "none",
    borderBottom: "1px solid transparent",
    background: "transparent",
    color: "var(--color-text-muted)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  };

  const activeName = activeId === BUILTIN_ID
    ? "STIX Default"
    : rulesets.find((ruleset) => ruleset.id === activeId)?.name ?? "STIX Default";

  const managementControls = (
    <div>
      <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
        <select aria-label="Saved profile" value={activeId} onChange={handleSelect} style={selectStyle}>
          <option value={BUILTIN_ID}>STIX Default (built-in)</option>
          {rulesets.map((rs) => (
            <option key={rs.id} value={rs.id}>{rs.name}</option>
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

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <button type="button" onClick={handleNew} style={linkStyle} title="Create a new ruleset">
            <Plus size={12} />
            New
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={linkStyle}
            title="Import a ruleset from a .json file"
          >
            <FileUp size={12} />
            Import
          </button>

          <button type="button" onClick={handleExport} style={linkStyle} title="Export the active ruleset as a .json file">
            <Download size={12} />
            Export
          </button>

          <button type="button" onClick={handleDuplicate} style={linkStyle} title="Duplicate the active ruleset">
            <Copy size={12} />
            Duplicate
          </button>

          {activeId !== BUILTIN_ID && (
            <button type="button" onClick={handleEdit} style={linkStyle} title="Edit this ruleset">
              <Pencil size={12} />
              Edit
            </button>
          )}

          {activeId !== BUILTIN_ID && (
            <button
              type="button"
              onClick={handleDelete}
              style={{ ...linkStyle, color: "var(--color-error-text)" }}
              title="Remove this custom ruleset"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Import error — field name shown as an inline badge when parseable */}
      {importError && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            background: "var(--color-error-bg)",
            border: "1px solid var(--color-error-border)",
            borderRadius: 3,
            padding: "9px 12px",
            color: "var(--color-error-text)",
            fontSize: 12,
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Import failed:</strong>{" "}
            {errorField && (
              <code
                style={{
                  background: "var(--color-error-bg)",
                  border: "1px solid var(--color-error-border)",
                  borderRadius: 4,
                  padding: "1px 5px",
                  fontSize: 11,
                  marginRight: 5,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {errorField}
              </code>
            )}
            {errorBody}
          </span>
        </div>
      )}

      {/* Non-blocking import warnings */}
      {importWarnings && importWarnings.length > 0 && (
        <div
          style={{
            marginTop: 8,
            background: "var(--color-warning-bg)",
            border: "1px solid var(--color-warning-border)",
            borderRadius: 3,
            padding: "9px 12px",
            color: "var(--color-warning-text)",
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Import succeeded with warnings:</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
            {importWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
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

      {/* In-app editor modal */}
      {editorOpen && (
        <RulesetEditor
          initial={editingRuleset}
          onSave={handleEditorSave}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );

  if (!compact) return managementControls;

  return (
    <div className="ruleset-compact">
      <span className="ruleset-compact-label">Profile:</span>
      <strong>{activeName}</strong>
      <span aria-hidden="true">·</span>
      <button type="button" className="ruleset-change" onClick={() => setManagerOpen(true)}>
        Change
      </button>

      <Dialog.Root open={managerOpen} onOpenChange={setManagerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="ruleset-dialog-overlay" />
          <Dialog.Content className="ruleset-dialog" aria-describedby={undefined}>
            <div className="ruleset-dialog-header">
              <Dialog.Title>Cleaning and validation profile</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="ruleset-dialog-close" aria-label="Close profiles">
                  <X size={18} />
                </button>
              </Dialog.Close>
            </div>
            <div className="ruleset-dialog-body"><p>Switching profiles replaces both validation rules and cleaning mappings, including unsaved mappings for this file.</p>{managementControls}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
