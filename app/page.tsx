"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Wand2, FileText,
  CheckCircle2, AlertCircle, Loader2, ArrowLeft,
  ArrowRight, AlertTriangle, MapPin, School,
  Download, Users, BarChart3,
  ShieldX, Search, Filter, Wrench, RefreshCw,
  ClipboardCheck, SlidersHorizontal, GitCompareArrows,
  Lock, X, FileCode,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { ZipWriter, BlobWriter, TextReader } from "@zip.js/zip.js";
import { cleanXml, applyReviewUpdates, prettyPrintXml } from "@/lib/cleaner";
import { compareStixFiles } from "@/lib/compare";
import { applyReviewCorrections, extractSchoolXml, safeExportPart } from "@/lib/stixExport";
import { processExport, buildSchoolCounts, buildGradeCounts } from "@/lib/pullInfo";
import { downloadText, downloadBlob, toCsv } from "@/lib/utils";
import {
  validateXml,
  parseStixXml,
  applyValidationFixes,
  applyFixesToRecords,
  generateIssueReportCsv,
  generateSchoolSummaryCsv,
  generateAgeGroupReportCsv,
} from "@/lib/validator";
import { applyCleaningProfile } from "@/lib/cleaning";
import type {
  Workflow, SessionData,
  ValidateSession, ValidationIssue, AppliedFix,
  ValidationSeverity, RulesProfile, StixComparison,
  StudentRecord, CleaningProfile, CleaningSummaryEntry,
} from "@/lib/types";
import { defaultRules, getActiveRules, getActiveCleaning, getActiveRulesetId, listCustomRulesets, saveCustomRuleset, BUILTIN_ID } from "@/lib/rulesets";
import RulesetSelector from "@/components/RulesetSelector";
import CleaningView from "@/components/CleaningView";
import CleaningSummaryView from "@/components/CleaningSummaryView";
import * as XLSX from "xlsx";
import { xlsmMetadata, xlsmToStixXml } from "@/lib/excel";
import type { XlsmMetadata } from "@/lib/excel";

// ─── Types ────────────────────────────────────────────────────────────────────

type View =
  | "home"
  | "review"
  | "result"
  | "clean-step"
  | "clean-summary"
  | "validate-issues"
  | "validate-fix"
  | "validate-revalidate"
  | "validate-download"
  | "compare";

// ─── NavBar ──────────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <span className="brand">PanoReady</span>
        <span className="privacy">Data never leaves your browser</span>
      </div>
    </header>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent = "default" }: { label: string; value: number | string; accent?: "green" | "teal" | "yellow" | "red" | "default" }) {
  // Counts are facts, not confirmations — verde is reserved for the page's
  // one real commitment moment, so plain quantities stay ink. Only warning
  // and error counts keep functional color, since that's a real signal.
  const colors = { green: "var(--color-text-primary)", teal: "var(--color-text-primary)", yellow: "var(--color-warning-text)", red: "var(--color-error-text)", default: "var(--color-text-primary)" };
  return (
    <div style={{ borderLeft: `2px solid ${accent === "yellow" || accent === "red" ? colors[accent] : "var(--color-border)"}`, padding: "2px 0 2px 14px" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-text-muted)", fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-serif), Georgia, serif", fontSize: 26, fontWeight: 600, color: colors[accent] }}>{value}</div>
    </div>
  );
}

// ─── SeverityBadge ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: ValidationSeverity }) {
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

function GateBadge({ gate }: { gate: string }) {
  const isReady = gate === "READY";
  const isPending = gate === "PENDING";
  const color  = isReady ? "var(--verde)" : isPending ? "var(--color-text-muted)" : "var(--color-error-text)";
  const icon   = isReady ? <CheckCircle2 size={14} /> : isPending ? <Loader2 size={14} />   : <ShieldX size={14} />;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${color}`, borderRadius: 3, padding: "4px 12px", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, letterSpacing: "0.03em", color }}>
      {icon}{gate}
    </span>
  );
}

// ─── Workflows config ────────────────────────────────────────────────────────

const WORKFLOWS: { id: Workflow; label: string; description: string }[] = [
  { id: "validate", label: "Validate & Fix",  description: "Full validation: required fields, code values, formats, duplicates. Apply safe fixes, revalidate, download." },
  { id: "clean",    label: "Clean XML",       description: "Fix phones, standardize units, flag bad street numbers for manual review." },
  { id: "export",   label: "Export Reports",  description: "Parse students into spreadsheet. Filter Gr7–8 born 2012–2013 with school summaries." },
  { id: "pretty",   label: "Pretty Print",    description: "Reformat the XML with consistent indentation." },
  { id: "compare",  label: "Compare Files",   description: "Compare two snapshots to measure record, field, and school-level changes." },
];

// ─── HomeView ─────────────────────────────────────────────────────────────────

function HomeView({ onDone, onParsed, onCompare, activeRules, onRulesChange }: {
  onDone: (data: SessionData, next: View) => void;
  onParsed: (xmlText: string, records: StudentRecord[], fileName: string, requiredFields?: string[]) => void;
  onCompare: (comparison: StixComparison) => void;
  activeRules: RulesProfile;
  onRulesChange: (rules: RulesProfile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const currentInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile]           = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [workflow, setWorkflow]   = useState<Workflow>("validate");
  const [dragging, setDragging]   = useState(false);
  const [currentDragging, setCurrentDragging] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [xlsmMeta, setXlsmMeta] = useState<XlsmMetadata | null>(null);

  const handleFile = useCallback((f: File) => {
    setError(null);
    setFile(f);
    setXlsmMeta(null);
  }, []);

  useEffect(() => {
    if (!file || !/\.xlsm?$/i.test(file.name)) return;
    let cancelled = false;
    const storageKey = `panoready:xlsm-metadata:${file.name}:${file.size}:${file.lastModified}`;
    file.arrayBuffer().then((data) => {
      if (cancelled) return;
      const workbookMeta = xlsmMetadata(data, file.name);
      try {
        const saved = window.localStorage.getItem(storageKey);
        setXlsmMeta(saved ? { ...workbookMeta, ...JSON.parse(saved) as Partial<XlsmMetadata> } : workbookMeta);
      } catch {
        setXlsmMeta(workbookMeta);
      }
    }).catch((err) => {
      if (!cancelled) setError(`Could not read workbook metadata: ${err instanceof Error ? err.message : String(err)}`);
    });
    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    if (!file || !xlsmMeta || !/\.xlsm?$/i.test(file.name)) return;
    try {
      window.localStorage.setItem(
        `panoready:xlsm-metadata:${file.name}:${file.size}:${file.lastModified}`,
        JSON.stringify(xlsmMeta),
      );
    } catch {
      // Storage may be disabled or full; workbook processing still works.
    }
  }, [file, xlsmMeta]);

  const handleNativeFileSelect = useCallback((target: HTMLInputElement) => {
    const selectedFile = target.files?.[0];
    if (!selectedFile) return;
    handleFile(selectedFile);
  }, [handleFile]);

  const handleCurrentFile = useCallback((f: File) => {
    setError(null);
    setCurrentFile(f);
  }, []);

  const handleCurrentFileSelect = useCallback((target: HTMLInputElement) => {
    const selectedFile = target.files?.[0];
    if (selectedFile) handleCurrentFile(selectedFile);
  }, [handleCurrentFile]);

  const onCurrentDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setCurrentDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleCurrentFile(f);
  }, [handleCurrentFile]);

  const syncFileFromInput = useCallback(() => {
    const input = inputRef.current;
    if (!input) {
      setError("File input is not available. Please refresh the page.");
      return null;
    }
    const selectedFile = input.files?.[0] ?? null;
    if (selectedFile) {
      handleFile(selectedFile);
      return selectedFile;
    }
    setError("No readable file found. Please choose the XML file again.");
    return null;
  }, [handleFile]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const syncSelectedFile = () => handleNativeFileSelect(input);
    input.addEventListener("change", syncSelectedFile);
    input.addEventListener("input", syncSelectedFile);
    return () => {
      input.removeEventListener("change", syncSelectedFile);
      input.removeEventListener("input", syncSelectedFile);
    };
  }, [handleNativeFileSelect]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const selectedFile = inputRef.current?.files?.[0];
      if (!selectedFile) return;
      const currentFile = file;
      if (
        currentFile &&
        currentFile.name === selectedFile.name &&
        currentFile.size === selectedFile.size &&
        currentFile.lastModified === selectedFile.lastModified
      ) return;
      handleFile(selectedFile);
    }, 300);
    return () => window.clearInterval(intervalId);
  }, [file, handleFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  const run = async () => {
    const selectedFile = inputRef.current?.files?.[0] ?? file ?? syncFileFromInput();
    if (!selectedFile) { setError("Please select a file first."); return; }
    setProcessing(true); setError(null);
    try {
      const xmlText = await readInputAsStixXml(selectedFile, xlsmMeta ?? undefined);

      if (workflow === "compare") {
        const selectedCurrentFile = currentInputRef.current?.files?.[0] ?? currentFile;
        if (!selectedCurrentFile) throw new Error("Please select the current XML file as well.");
        const currentXmlText = await readInputAsStixXml(selectedCurrentFile);
        onCompare(compareStixFiles(xmlText, currentXmlText, selectedFile.name, selectedCurrentFile.name));
        return;
      }

      if (workflow === "validate") {
        // Parse records first; errors throw and are caught below.
        const parsed = parseStixXml(xmlText);
        onParsed(xmlText, parsed, selectedFile.name, xlsmMeta?.requiredFields);
        return;
      }

      if (workflow === "clean") {
        const { cleanedXml, issues, stats } = cleanXml(xmlText);
        const session: SessionData = { workflow, fileName: selectedFile.name, xmlContent: xmlText, autoCleanXml: cleanedXml, issues, stats };
        if (issues.length > 0) { onDone(session, "review"); }
        else { onDone({ ...session, cleanXml: cleanedXml }, "result"); }
      } else if (workflow === "export") {
        const exportResult = processExport(xmlText);
        onDone({ workflow, fileName: selectedFile.name, xmlContent: xmlText, exportResult }, "result");
      } else {
        const prettyXml = prettyPrintXml(xmlText);
        onDone({ workflow, fileName: selectedFile.name, xmlContent: xmlText, cleanXml: prettyXml }, "result");
      }
    } catch (err) {
      setError(`Processing failed: ${err instanceof Error ? err.message : String(err)}`);
      setProcessing(false);
    }
  };

  const wLabel = workflow === "validate" ? "Validate & Fix"
    : workflow === "clean" ? "Clean XML"
    : workflow === "export" ? "Generate Reports"
    : workflow === "pretty" ? "Pretty Print XML"
    : "Compare Files";

  return (
    <main style={{ flex: 1, display: "flex", justifyContent: "center", padding: "72px 24px 100px" }}>
      <div className="rail-page" style={{ width: "100%", maxWidth: 620 }}>
        <div className="rail" />

        {/* Statement — the one decision on this page that isn't a workflow choice */}
        <section className="beat">
          <p className="eyebrow" style={{ marginBottom: 22 }}>In your browser, always</p>
          <h1 style={{ fontFamily: "var(--font-serif), Georgia, serif", fontWeight: 500, fontSize: "clamp(34px,5.5vw,58px)", lineHeight: 1.08, letterSpacing: "-0.01em", margin: 0, maxWidth: 480, color: "var(--ink)" }}>
            Validate, in confidence.
          </h1>
        </section>

        {/* Workflow — the tick on the spine registers the choice, nothing else needs to */}
        <section className="beat">
          <h2 className="beat-title">Workflow</h2>
          <div>
            {WORKFLOWS.map((w) => (
              <button
                key={w.id}
                onClick={() => setWorkflow(w.id)}
                className={`wf-row${workflow === w.id ? " selected" : ""}`}
              >
                <span className="wf-title">{w.label}</span>
                <span className="wf-desc">{w.description}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Ruleset — validate workflow only */}
        {workflow === "validate" && (
          <section className="beat">
            <h2 className="beat-title">Ruleset</h2>
            <RulesetSelector onRulesChange={onRulesChange} />
          </section>
        )}

        {/* File — a niche the file belongs in, not a placeholder. One target:
            click it to browse, or drag a file onto it. */}
        <section className="beat">
          <h2 className="beat-title">{workflow === "compare" ? "Previous file" : "File"}</h2>
          <input
            id="xml-upload"
            ref={inputRef}
            type="file"
            accept=".xml,.xlsm,text/xml,application/xml,application/vnd.ms-excel.sheet.macroEnabled.12"
            aria-describedby="xml-upload-help"
            onChange={(e) => handleNativeFileSelect(e.currentTarget)}
            onInput={(e) => handleNativeFileSelect(e.currentTarget)}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            className={`niche${dragging ? " dragging" : ""}`}
          >
            {file ? (
              <>
                <CheckCircle2 size={20} style={{ color: "var(--color-text-muted)", margin: "0 auto 16px" }} />
                <p style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 6px" }}>{file.name}</p>
                <p id="xml-upload-help" style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {(file.size / 1024).toFixed(1)} KB · click, or drop another file, to change
                </p>
              </>
            ) : (
              <>
                <span style={{ display: "block", fontSize: 20, color: "var(--color-text-muted)", marginBottom: 16 }}>↑</span>
                <p style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 6px" }}>Drop your XML file here</p>
                <p id="xml-upload-help" style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  or click to browse your device
                </p>
              </>
            )}
          </button>
        </section>

        {xlsmMeta && (
          <section className="beat">
            <h2 className="beat-title">File Info metadata</h2>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: "0 0 12px" }}>
              Review or update these values before the workbook is converted to STIX XML.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {([
                ["dateCreated", "Date created"], ["timeCreated", "Time created"], ["createdBy", "Created by"],
                ["contactPhone", "Contact phone"], ["phoneType", "Phone type"], ["contactEmail", "PHU contact email"],
                ["fullUpload", "Full upload"], ["boardNumber", "Board number"], ["boardName", "Board name"],
                ["schoolNumber", "School number"], ["schoolName", "School name"],
              ] as const).map(([key, label]) => (
                <label key={key} style={{ display: "grid", gap: 4, fontSize: 10, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {label}
                  {key === "fullUpload" ? (
                    <select className="input" value={xlsmMeta[key]} onChange={(event) => setXlsmMeta((current) => current ? { ...current, [key]: event.target.value } : current)}>
                      <option value="">Select</option><option value="YES">YES</option><option value="NO">NO</option>
                    </select>
                  ) : (
                    <input className="input" value={xlsmMeta[key]} onChange={(event) => setXlsmMeta((current) => current ? { ...current, [key]: event.target.value } : current)} />
                  )}
                </label>
              ))}
            </div>
          </section>
        )}

        {workflow === "compare" && (
          <section className="beat">
            <h2 className="beat-title">Current file</h2>
            <input
              id="xml-upload-current"
              ref={currentInputRef}
              type="file"
              accept=".xml,.xlsm,text/xml,application/xml,application/vnd.ms-excel.sheet.macroEnabled.12"
              aria-describedby="xml-upload-current-help"
              onChange={(e) => handleCurrentFileSelect(e.currentTarget)}
              onInput={(e) => handleCurrentFileSelect(e.currentTarget)}
              style={{ display: "none" }}
            />
            <button
              type="button"
              onClick={() => currentInputRef.current?.click()}
              onDrop={onCurrentDrop}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setCurrentDragging(true); }}
              onDragLeave={() => setCurrentDragging(false)}
              className={`niche${currentDragging ? " dragging" : ""}`}
            >
              {currentFile ? (
                <>
                  <CheckCircle2 size={20} style={{ color: "var(--color-text-muted)", margin: "0 auto 16px" }} />
                  <p style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 6px" }}>{currentFile.name}</p>
                  <p id="xml-upload-current-help" style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {(currentFile.size / 1024).toFixed(1)} KB · click, or drop another file, to change
                  </p>
                </>
              ) : (
                <>
                  <span style={{ display: "block", fontSize: 20, color: "var(--color-text-muted)", marginBottom: 16 }}>↑</span>
                  <p style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 6px" }}>Drop the current XML file here</p>
                  <p id="xml-upload-current-help" style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    or click to browse your device
                  </p>
                </>
              )}
            </button>
          </section>
        )}

        {error && (
          <section className="beat">
            <div style={{ borderLeft: "2px solid var(--color-error-text)", padding: "8px 0 8px 14px", display: "flex", alignItems: "center", gap: 9, color: "var(--color-error-text)", fontSize: 13 }}>
              <AlertCircle size={15} /> {error}
            </div>
          </section>
        )}

        {/* Commit — the only other place verde appears: the keystone above the final act */}
        <section className="beat">
          <div className="keystone-rule" />
          <button onClick={run} disabled={processing} className="cta">
            {processing ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Processing…</> : wLabel}
          </button>
        </section>

        <p className="colophon" style={{ fontSize: 11 }}>
          Built by Wellington-Dufferin-Guelph Public Health · MIT License
        </p>
      </div>
    </main>
  );
}

// ─── ReviewView ───────────────────────────────────────────────────────────────

function ReviewView({ session, onBack, onDone }: { session: SessionData; onBack: () => void; onDone: (updated: SessionData) => void }) {
  const issues = session.issues ?? [];
  const [updates, setUpdates] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const issue of issues) {
      init[issue.type === "street_number" ? `${issue.id}_number` : `${issue.id}_unit`] = issue.current;
    }
    return init;
  });
  const [applying, setApplying] = useState(false);

  const apply = () => {
    if (!session.autoCleanXml) return;
    setApplying(true);
    try {
      const cleanXmlResult = applyReviewUpdates(session.autoCleanXml, updates);
      onDone({ ...session, cleanXml: cleanXmlResult });
    } catch {
      setApplying(false);
    }
  };

  return (
    <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <button onClick={onBack} className="btn btn-ghost" style={{ marginBottom: 20, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Back
      </button>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 28 }}>
        <div style={{ flexShrink: 0, paddingTop: 2 }}>
          <AlertTriangle size={20} style={{ color: "var(--color-warning-text)" }} />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 5px" }}>Manual Review Required</h1>
          <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            {issues.length} issue{issues.length !== 1 ? "s" : ""} need your attention.
          </p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, marginBottom: 28, background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "12px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: "var(--color-warning-text)" }}>{issues.filter(i => i.type === "street_number").length}</span>
          <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>street numbers</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: "var(--color-warning-text)" }}>{issues.filter(i => i.type === "unit").length}</span>
          <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>unit fields</span>
        </div>
        <div style={{ marginLeft: "auto", color: "var(--color-text-muted)", fontSize: 11, alignSelf: "center" }}>
          {session.stats?.phones_cleaned ?? 0} phones fixed · {session.stats?.units_standardized ?? 0} units standardized
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {issues.map((issue, idx) => {
          const isStreet = issue.type === "street_number";
          const accent = "var(--color-warning-text)";
          const key = isStreet ? `${issue.id}_number` : `${issue.id}_unit`;
          return (
            <div key={issue.id} className="card" style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 500, color: accent, letterSpacing: "0.05em" }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: accent, flexShrink: 0 }} />
                    {isStreet ? "Street number" : "Unit field"}
                  </span>
                  <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{idx + 1}/{issues.length}</span>
                </div>
                <div style={{ display: "flex", gap: 12, color: "var(--color-text-muted)", fontSize: 11 }}>
                  {issue.school_name && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><School size={11} />{issue.school_name}</span>}
                  {issue.street_name && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><MapPin size={11} />{[issue.street_number, issue.street_name].filter(Boolean).join(" ")}</span>}
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 5 }}>Original Value</div>
                <code style={{ background: "var(--color-surface-2)", borderRadius: 5, padding: "6px 10px", fontSize: 12, color: "var(--color-error-text)", display: "inline-block" }}>{issue.current}</code>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 5 }}>Replacement (leave blank to clear)</div>
                <input className="input" value={updates[key] ?? ""} onChange={(e) => setUpdates((p) => ({ ...p, [key]: e.target.value }))} placeholder={`Corrected ${isStreet ? "street number" : "unit"}, or clear to remove`} style={{ fontFamily: "var(--font-mono)", fontSize: 13 }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 28, display: "flex", gap: 10 }}>
        <button onClick={onBack} className="btn btn-secondary" style={{ flexShrink: 0 }}><ArrowLeft size={15} /> Start Over</button>
        <button onClick={apply} disabled={applying} className="btn btn-primary" style={{ flex: 1, justifyContent: "center", opacity: applying ? 0.7 : 1 }}>
          {applying ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} /> : <ArrowRight size={15} />}
          {applying ? "Applying…" : "Apply & Download"}
        </button>
      </div>
    </main>
  );
}

// ─── ResultView ───────────────────────────────────────────────────────────────

function ResultView({ session, onStartOver }: { session: SessionData; onStartOver: () => void }) {
  const baseName = session.fileName.replace(/\.(xml|xlsm)$/i, "");

  const dlXml = (content: string, suffix: string) =>
    downloadText(content, `${baseName}_${suffix}.xml`, "application/xml");

  const dlCsv = (data: Record<string, unknown>[], name: string) =>
    downloadText(toCsv(data), `${baseName}_${name}.csv`, "text/csv");

  const dlExcel = () => {
    const exp = session.exportResult!;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exp.allStudents),      "All_Students");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exp.filteredStudents), "Filtered_Students");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exp.schoolCounts),     "School_Counts");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exp.gradeCounts),      "Grade_Counts");
    XLSX.writeFile(wb, `${baseName}_report.xlsx`);
  };

  // ── Custom report filter state (export workflow only) ─────────────────────
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectedGrades,  setSelectedGrades]  = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [minAge, setMinAge] = useState(0);
  const [maxAge, setMaxAge] = useState(99);
  const [ageBounds, setAgeBounds] = useState<[number, number]>([0, 99]);
  const [filterOpts, setFilterOpts] = useState({ schools: [] as string[], grades: [] as string[], genders: [] as string[] });

  useEffect(() => {
    const students = session.exportResult?.allStudents ?? [];
    const schoolsSet = new Set<string>();
    const gradesSet  = new Set<string>();
    const gendersSet = new Set<string>();
    let ageMin = Infinity, ageMax = -Infinity;
    for (const s of students) {
      if (s.SchoolName) schoolsSet.add(s.SchoolName);
      if (s.Grade)      gradesSet.add(s.Grade);
      if (s.Gender)     gendersSet.add(s.Gender);
      const age = computeAge(s.BirthDate);
      if (age !== null) { if (age < ageMin) ageMin = age; if (age > ageMax) ageMax = age; }
    }
    const schools = Array.from(schoolsSet).sort();
    const grades  = Array.from(gradesSet).sort();
    const genders = Array.from(gendersSet).sort();
    const lo = isFinite(ageMin) ? ageMin : 0;
    const hi = isFinite(ageMax) ? ageMax : 99;
    setFilterOpts({ schools, grades, genders });
    setSelectedSchools(schools);
    setSelectedGrades(grades);
    setSelectedGenders(genders);
    setAgeBounds([lo, hi]);
    setMinAge(lo);
    setMaxAge(hi);
  }, [session.exportResult]);

  const customStudents = (session.exportResult?.allStudents ?? []).filter((s) => {
    const age = computeAge(s.BirthDate);
    if (s.SchoolName && !selectedSchools.includes(s.SchoolName)) return false;
    if (s.Grade      && !selectedGrades.includes(s.Grade))       return false;
    if (s.Gender     && !selectedGenders.includes(s.Gender))     return false;
    if (age !== null && (age < minAge || age > maxAge))           return false;
    return true;
  });

  const dlCustomExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(customStudents),                                     "Students");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildSchoolCounts(customStudents) as unknown as Record<string,unknown>[]), "School_Counts");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildGradeCounts(customStudents)  as unknown as Record<string,unknown>[]), "Grade_Counts");
    XLSX.writeFile(wb, `${baseName}_custom_report.xlsx`);
  };

  return (
    <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <button onClick={onStartOver} className="btn btn-ghost" style={{ marginBottom: 22, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Process another file
      </button>
      <div style={{ borderLeft: "2px solid var(--verde)", padding: "6px 0 6px 18px", display: "flex", alignItems: "center", gap: 14, marginBottom: 34 }}>
        <CheckCircle2 size={26} style={{ color: "var(--color-brand-400)", flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-brand-400)", marginBottom: 2 }}>Processing Complete</div>
          <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
            {session.fileName} · {session.workflow === "clean" ? "XML cleaned" : session.workflow === "export" ? "Student data extracted" : "XML reformatted"}
          </div>
        </div>
      </div>

      {session.workflow === "clean" && session.stats && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>Cleaning Summary</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 28, marginBottom: 24 }}>
            <StatCard label="Phones Fixed"        value={session.stats.phones_cleaned}   accent="green" />
            <StatCard label="Phones Cleared"      value={session.stats.phones_blank}     accent="yellow" />
            <StatCard label="Units Standardized"  value={session.stats.units_standardized} accent="teal" />
            <StatCard label="Issues Reviewed"     value={(session.stats.street_review ?? 0) + (session.stats.units_review ?? 0)} />
          </div>
          <div className="card" style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: 9 }}><Wand2 size={18} style={{ color: "var(--color-text-muted)" }} /></div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{baseName}_clean.xml</div>
                <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Cleaned STIX XML</div>
              </div>
            </div>
            <button onClick={() => dlXml(session.cleanXml!, "clean")} className="btn btn-primary" style={{ gap: 7 }}><Download size={14} /> Download</button>
          </div>
        </>
      )}

      {session.workflow === "pretty" && (
        <div className="card" style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: 9 }}><FileText size={18} style={{ color: "var(--color-text-muted)" }} /></div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{baseName}_pretty.xml</div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Reformatted XML</div>
            </div>
          </div>
          <button onClick={() => dlXml(session.cleanXml!, "pretty")} className="btn btn-primary" style={{ gap: 7 }}><Download size={14} /> Download</button>
        </div>
      )}

      {session.workflow === "export" && session.exportResult && (() => {
        const exp = session.exportResult;
        const schoolCount = new Set(exp.allStudents.map((s) => s.SchoolName)).size;
        return (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>Export Summary</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 28, marginBottom: 24 }}>
              <StatCard label="Total Students"         value={exp.allStudents.length}      accent="green" />
              <StatCard label="Filtered (Gr7–8 12/13)" value={exp.filteredStudents.length} accent="teal" />
              <StatCard label="Schools"                value={schoolCount} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {([
                { icon: <Users size={16} style={{ color: "var(--color-text-muted)" }} />,  title: `${baseName}_all_students.csv`,   sub: `${exp.allStudents.length} students`,                       fn: () => dlCsv(exp.allStudents as unknown as Record<string,unknown>[],      "all_students") },
                { icon: <Users size={16} style={{ color: "var(--color-text-muted)" }} />,  title: `${baseName}_filtered.csv`,       sub: `${exp.filteredStudents.length} Gr7–8 born 2012–2013`,      fn: () => dlCsv(exp.filteredStudents as unknown as Record<string,unknown>[],  "filtered") },
                { icon: <School size={16} style={{ color: "var(--color-text-muted)" }} />, title: `${baseName}_school_counts.csv`,  sub: "Students per school per birth year",                       fn: () => dlCsv(exp.schoolCounts as unknown as Record<string,unknown>[],      "school_counts") },
                { icon: <BarChart3 size={16} style={{ color: "var(--color-warning-text)" }} />, title: `${baseName}_grade_counts.csv`, sub: "Students per school per grade",                        fn: () => dlCsv(exp.gradeCounts as unknown as Record<string,unknown>[],       "grade_counts") },
              ] as const).map(({ icon, title, sub, fn }) => (
                <div key={title} className="card" style={{ padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ background: "var(--color-surface-2)", borderRadius: 3, padding: 8 }}>{icon}</div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 12, fontFamily: "var(--font-mono)", marginBottom: 2 }}>{title}</div>
                      <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{sub}</div>
                    </div>
                  </div>
                  <button onClick={fn} className="btn btn-secondary" style={{ gap: 5, fontSize: 12, padding: "6px 13px" }}><Download size={12} /> CSV</button>
                </div>
              ))}
              <div style={{ background: "var(--color-surface-1)", border: "2px solid var(--color-brand-600)", borderRadius: 4, padding: "15px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: 9 }}><FileText size={18} style={{ color: "var(--color-text-muted)" }} /></div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{baseName}_report.xlsx</div>
                    <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>All 4 sheets in one Excel workbook</div>
                  </div>
                </div>
                <button onClick={dlExcel} className="btn btn-primary" style={{ gap: 7 }}><Download size={14} /> Excel</button>
              </div>
            </div>

            {/* ── Custom Filter & Export ───────────────────────────────────── */}
            <div style={{ marginTop: 40, paddingTop: 28, borderTop: "1px solid var(--color-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <SlidersHorizontal size={15} style={{ color: "var(--color-text-muted)" }} />
                <div>
                  <div style={{ fontFamily: "var(--font-serif), Georgia, serif", fontWeight: 600, fontSize: 16, color: "var(--color-text-primary)" }}>Filter &amp; Export Custom Report</div>
                  <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 2 }}>Narrow by school, grade, gender, or age — then download a targeted CSV or Excel</div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <FilterCheckboxGroup
                    label="School"
                    options={filterOpts.schools}
                    selected={selectedSchools}
                    onToggle={(v) => setSelectedSchools((s) => toggleItem(s, v))}
                    onAll={() => setSelectedSchools(filterOpts.schools)}
                    onNone={() => setSelectedSchools([])}
                  />
                  <FilterCheckboxGroup
                    label="Grade"
                    options={filterOpts.grades}
                    selected={selectedGrades}
                    onToggle={(v) => setSelectedGrades((s) => toggleItem(s, v))}
                    onAll={() => setSelectedGrades(filterOpts.grades)}
                    onNone={() => setSelectedGrades([])}
                  />
                  <FilterCheckboxGroup
                    label="Gender"
                    options={filterOpts.genders}
                    selected={selectedGenders}
                    onToggle={(v) => setSelectedGenders((s) => toggleItem(s, v))}
                    onAll={() => setSelectedGenders(filterOpts.genders)}
                    onNone={() => setSelectedGenders([])}
                  />
                  <AgeRangeFilter
                    minBound={ageBounds[0]} maxBound={ageBounds[1]}
                    minAge={minAge} maxAge={maxAge}
                    onChange={(min, max) => { setMinAge(min); setMaxAge(max); }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, background: "var(--color-surface-2)", borderRadius: 4, padding: "12px 16px", border: "1px solid var(--color-border)" }}>
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                    <span style={{ fontWeight: 800, color: "var(--color-text-primary)", fontSize: 22, lineHeight: 1 }}>{customStudents.length}</span>
                    <span style={{ marginLeft: 6 }}>of {exp.allStudents.length} students match</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => dlCsv(customStudents as unknown as Record<string,unknown>[], "custom")} className="btn btn-secondary" style={{ gap: 5, fontSize: 12, padding: "6px 13px" }}><Download size={12} /> Students CSV</button>
                    <button onClick={() => dlCsv(buildSchoolCounts(customStudents) as unknown as Record<string,unknown>[], "custom_schools")} className="btn btn-secondary" style={{ gap: 5, fontSize: 12, padding: "6px 13px" }}><Download size={12} /> School Counts CSV</button>
                    <button onClick={() => dlCsv(buildGradeCounts(customStudents) as unknown as Record<string,unknown>[], "custom_grades")} className="btn btn-secondary" style={{ gap: 5, fontSize: 12, padding: "6px 13px" }}><Download size={12} /> Grade Counts CSV</button>
                    <button onClick={dlCustomExcel} className="btn btn-primary" style={{ gap: 5, fontSize: 12, padding: "6px 13px" }}><Download size={12} /> Excel</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        );
      })()}
    </main>
  );
}

// ─── CompareView ──────────────────────────────────────────────────────────────

function CompareView({ comparison, onStartOver }: { comparison: StixComparison; onStartOver: () => void }) {
  const [viewMode, setViewMode] = useState<"schools" | "records" | "fields" | "transfers">("records");
  const [selectedSchool, setSelectedSchool] = useState("all");
  const [selectedRecordKey, setSelectedRecordKey] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "confirmed" | "needs-fix">>({});
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [fieldFilter, setFieldFilter] = useState<string[]>([]);
  const [encryptDialogOpen, setEncryptDialogOpen] = useState(false);
  const [zipPassword, setZipPassword] = useState("");
  const [zipPasswordConfirm, setZipPasswordConfirm] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const xmlBaseName = comparison.currentFileName.replace(/\.(xml|xlsm)$/i, "");
  const exportScope = selectedSchool === "all" ? "full" : safeExportPart(selectedSchool);
  const xmlDownloadName = `${xmlBaseName}_${exportScope}.xml`;
  const toggleFieldFilter = (label: string) =>
    setFieldFilter((current) => current.includes(label) ? current.filter((f) => f !== label) : [...current, label]);
  const selectSchool = (school: string) => {
    setSelectedSchool(school);
    setFieldFilter([]);
    setSelectedRecordKey(null);
  };
  const getExportXml = () => {
    const sourceXml = extractSchoolXml(comparison.currentXml, selectedSchool);
    const records = selectedSchool === "all"
      ? comparison.recordChanges
      : comparison.recordChanges.filter((record) => record.schoolName === selectedSchool);
    return applyReviewCorrections(sourceXml, records, corrections);
  };
  const downloadFullXml = () => {
    try {
      setExportError(null);
      downloadText(getExportXml(), xmlDownloadName, "application/xml");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The XML export could not be created.");
    }
  };
  const closeEncryptDialog = () => {
    setEncryptDialogOpen(false);
    setZipPassword("");
    setZipPasswordConfirm("");
    setZipError(null);
    setZipBusy(false);
  };
  const downloadEncryptedZip = async () => {
    if (!zipPassword) { setZipError("Enter a password."); return; }
    if (zipPassword.length < 8) { setZipError("Password must be at least 8 characters."); return; }
    if (zipPassword !== zipPasswordConfirm) { setZipError("Passwords do not match."); return; }
    setZipError(null);
    setZipBusy(true);
    try {
      const zipWriter = new ZipWriter(new BlobWriter("application/zip"), {
        password: zipPassword,
        encryptionStrength: 3, // AES-256
      });
      await zipWriter.add(xmlDownloadName, new TextReader(getExportXml()));
      const zipBlob = await zipWriter.close();
      downloadBlob(zipBlob, `${xmlBaseName}_${exportScope}.zip`);
      closeEncryptDialog();
    } catch (error) {
      setZipError(error instanceof Error ? error.message : "Encryption failed. Please try again.");
      setZipBusy(false);
    }
  };
  const signalColor = comparison.signal === "stable" ? "var(--color-brand-400)" : comparison.signal === "moderate" ? "var(--color-warning-text)" : "var(--color-error-text)";
  const signalBackground = comparison.signal === "stable" ? "var(--color-success-bg)" : comparison.signal === "moderate" ? "var(--color-warning-bg)" : "var(--color-error-bg)";
  const visibleRecords = comparison.recordChanges
    .filter((record) => selectedSchool === "all" || record.schoolName === selectedSchool)
    .filter((record) => fieldFilter.length === 0 || record.changedFields.some((field) => fieldFilter.includes(field)));
  const scopedFieldChanges = comparison.fieldChanges
    .map((field) => ({
      ...field,
      count: comparison.recordChanges.filter((record) =>
        (selectedSchool === "all" || record.schoolName === selectedSchool) && record.changedFields.includes(field.label)
      ).length,
    }))
    .filter((field) => field.count > 0);
  const selectedRecord = visibleRecords.find((record) => record.key === selectedRecordKey) ?? null;
  const decisionKey = (recordKey: string, field: string) => `${recordKey}::${field}`;
  const reviewedCount = Object.values(decisions).filter((decision) => decision === "confirmed").length;
  const needsFixCount = Object.values(decisions).filter((decision) => decision === "needs-fix").length;
  const selectedSchoolSummary = comparison.schoolChanges.find((school) => school.schoolName === selectedSchool);
  const downloadChanges = () => {
    const rows = comparison.schoolChanges.map((school) => ({
      School: school.schoolName,
      PreviousStudents: school.previousCount,
      CurrentStudents: school.currentCount,
      Added: school.added,
      Removed: school.removed,
      Changed: school.changed,
    }));
    downloadText(toCsv(rows), "stix_comparison_school_changes.csv", "text/csv");
  };
  const downloadReviewLog = () => {
    const rows = comparison.recordChanges.flatMap((record) => record.fieldDiffs.map((diff) => ({
      Record: record.key,
      Student: record.studentName,
      School: record.schoolName,
      Field: diff.label,
      PreviousValue: diff.previousValue,
      CurrentValue: diff.currentValue,
      ProposedCorrection: corrections[decisionKey(record.key, diff.field)] ?? "",
      Decision: decisions[decisionKey(record.key, diff.field)] ?? "Pending",
    })));
    downloadText(toCsv(rows), "stix_change_review_log.csv", "text/csv");
  };

  return (
    <main className="compare-results-main compare-dashboard" style={{ flex: 1, maxWidth: "none", width: "100%", margin: 0, padding: 0 }}>
      <button onClick={onStartOver} className="btn btn-ghost compare-back" style={{ marginBottom: 8, padding: "4px 8px", gap: 5, fontSize: 12 }}>
        <ArrowLeft size={13} /> Compare another pair
      </button>
      <div className="compare-dashboard-header" style={{ marginBottom: 12 }}>
        <div className="compare-dashboard-kicker">OPERATIONS / CHANGE INTELLIGENCE <span>LOCAL ANALYSIS</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <GitCompareArrows size={22} style={{ color: "#f59e0b" }} />
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>STIX file comparison</h1>
        </div>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>
          {comparison.previousFileName} <span style={{ color: "var(--color-text-muted)" }}>previous</span> · {comparison.currentFileName} <span style={{ color: "var(--color-text-muted)" }}>current</span>
        </p>
      </div>

      <div className="compare-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 12 }}>
        <StatCard label="Records added" value={comparison.addedCount} accent="green" />
        <StatCard label="Records removed" value={comparison.removedCount} accent="red" />
        <StatCard label="Records changed" value={comparison.changedCount} accent="yellow" />
        <StatCard label="No change" value={comparison.unchangedCount} accent="teal" />
        <StatCard label="Moved schools" value={comparison.movedCount} accent="teal" />
      </div>

      <div className="compare-signal" style={{ background: signalBackground, border: `1px solid ${signalColor}`, borderRadius: 9, padding: "9px 13px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: signalColor }}>{comparison.recommendation}</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: signalColor }}>{comparison.changeRate.toFixed(1)}%</div>
        </div>
        <div style={{ color: "var(--color-text-secondary)", fontSize: 11.5, lineHeight: 1.5 }}>{comparison.recommendationDetail}</div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 10.5, marginTop: 6 }}>Observed change rate = added + removed + changed records ÷ previous records. This is an operational signal, not a replacement for required reporting schedules.</div>
      </div>

      <div className="compare-context-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <StatCard label="Previous records" value={comparison.previousStudentCount} />
        <StatCard label="Current records" value={comparison.currentStudentCount} />
        <StatCard label="Matched records" value={comparison.matchedCount} />
        <StatCard label="Schools" value={`${comparison.previousSchoolCount} → ${comparison.currentSchoolCount}`} />
      </div>

      <details className="card compare-collapsible compare-top-detail" style={{ marginBottom: 12 }}>
        <summary><span><strong>What changed</strong><small>Field changes among matched records</small></span><span className="compare-collapsible-count">{comparison.fieldChanges.length} fields</span></summary>
        <div className="compare-collapsible-body">
        {comparison.fieldChanges.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>No field-level changes were detected.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {comparison.fieldChanges.map((field) => (
              <div key={field.field} style={{ display: "flex", justifyContent: "space-between", background: "var(--color-surface-2)", borderRadius: 7, padding: "9px 12px", fontSize: 12 }}>
                <span style={{ color: "var(--color-text-secondary)" }}>{field.label}</span>
                <strong>{field.count}</strong>
              </div>
            ))}
          </div>
        )}
        </div>
      </details>

      <details className="card compare-collapsible compare-top-detail" style={{ marginBottom: 18 }}>
        <summary><span><strong>Student transfers</strong><small>Students matched across both files whose school changed</small></span><span className="compare-collapsible-count">{comparison.movedCount} moves</span></summary>
        <div className="compare-collapsible-body">
        {comparison.schoolTransfers.length === 0 ? (
          <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>No student moves between schools were detected.</p>
        ) : (
          <div className="compare-table-scroll" style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>From school</th><th>To school</th><th>Students</th><th>Matched students</th></tr></thead>
              <tbody>{comparison.schoolTransfers.map((transfer) => <tr key={`${transfer.fromSchool}-${transfer.toSchool}`}><td style={{ color: "var(--color-text-primary)" }}>{transfer.fromSchool}</td><td style={{ color: "var(--color-text-primary)" }}>{transfer.toSchool}</td><td>{transfer.count}</td><td>{transfer.students.join(", ")}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        </div>
      </details>

      <div className="compare-tabs-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        <div className="compare-tabs" role="tablist" aria-label="Comparison detail view">
          <button className={viewMode === "schools" ? "compare-tab active" : "compare-tab"} onClick={() => setViewMode("schools")} role="tab" aria-selected={viewMode === "schools"}><School size={14} /> School overview</button>
          <button className={viewMode === "records" ? "compare-tab active" : "compare-tab"} onClick={() => setViewMode("records")} role="tab" aria-selected={viewMode === "records"}><Users size={14} /> Record details</button>
          <button className={viewMode === "fields" ? "compare-tab active" : "compare-tab"} onClick={() => setViewMode("fields")} role="tab" aria-selected={viewMode === "fields"}><SlidersHorizontal size={14} /> Field changes</button>
          <button className={viewMode === "transfers" ? "compare-tab active" : "compare-tab"} onClick={() => setViewMode("transfers")} role="tab" aria-selected={viewMode === "transfers"}><GitCompareArrows size={14} /> Transfers</button>
        </div>
        {viewMode === "records" && (
          <select className="input compare-school-filter" value={selectedSchool} onChange={(event) => selectSchool(event.target.value)} aria-label="Filter records by school">
            <option value="all">All schools</option>
            {comparison.schoolChanges.map((school) => <option key={school.schoolName} value={school.schoolName}>{school.schoolName}</option>)}
          </select>
        )}
      </div>

      {viewMode === "schools" ? (
        <section className="card compare-detail-card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div><h2 style={{ fontSize: 16, margin: "0 0 3px" }}>School-level impact</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>Select a school row to inspect its record-level changes.</p></div>
            <button onClick={downloadChanges} className="btn btn-secondary" style={{ gap: 5, fontSize: 12, padding: "6px 12px" }}><Download size={12} /> CSV</button>
          </div>
          <div className="compare-table-scroll" style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>School</th><th>Previous</th><th>Current</th><th>Added</th><th>Removed</th><th>Changed</th></tr></thead>
          <tbody>{comparison.schoolChanges.map((school) => <tr key={school.schoolName} onClick={() => { selectSchool(school.schoolName); setViewMode("records"); }} style={{ cursor: "pointer" }}><td style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{school.schoolName}</td><td>{school.previousCount}</td><td>{school.currentCount}</td><td>{school.added}</td><td>{school.removed}</td><td>{school.changed}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : viewMode === "fields" ? (
        <section className="card compare-detail-card" style={{ padding: "18px 20px" }}>
          <div style={{ marginBottom: 14 }}><h2 style={{ fontSize: 16, margin: "0 0 3px" }}>Field changes</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>Fields changed among matched student records, ordered by frequency.</p></div>
          <div className="compare-table-scroll"><table className="data-table"><thead><tr><th>Field</th><th>Changed records</th></tr></thead><tbody>{comparison.fieldChanges.map((field) => <tr key={field.field}><td style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{field.label}</td><td>{field.count}</td></tr>)}</tbody></table></div>
        </section>
      ) : viewMode === "transfers" ? (
        <section className="card compare-detail-card" style={{ padding: "18px 20px" }}>
          <div style={{ marginBottom: 14 }}><h2 style={{ fontSize: 16, margin: "0 0 3px" }}>Student transfers</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>Students matched across both files whose school changed.</p></div>
          <div className="compare-table-scroll"><table className="data-table"><thead><tr><th>From school</th><th>To school</th><th>Students</th><th>Matched students</th></tr></thead><tbody>{comparison.schoolTransfers.map((transfer) => <tr key={`${transfer.fromSchool}-${transfer.toSchool}`}><td style={{ color: "var(--color-text-primary)" }}>{transfer.fromSchool}</td><td style={{ color: "var(--color-text-primary)" }}>{transfer.toSchool}</td><td>{transfer.count}</td><td>{transfer.students.join(", ")}</td></tr>)}</tbody></table></div>
        </section>
      ) : (
        <div className="compare-record-layout">
        <section className="card compare-school-panel" style={{ padding: "16px" }}>
          <div style={{ marginBottom: 12 }}><h2 style={{ fontSize: 15, margin: "0 0 3px" }}>Schools</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>Select a school to focus the records.</p></div>
          <div className="compare-table-scroll" style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>School</th></tr></thead>
              <tbody>{comparison.schoolChanges.map((school) => <tr key={school.schoolName} onClick={() => selectSchool(school.schoolName)} style={{ cursor: "pointer" }}><td style={{ color: "var(--color-text-primary)", fontWeight: selectedSchool === school.schoolName ? 700 : 500 }}>{school.schoolName}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
        <section className="card compare-detail-card" style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div><h2 style={{ fontSize: 16, margin: "0 0 3px" }}>Record details</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>{selectedSchool === "all" ? "Specific records added, removed, or changed across all schools." : `Changes for ${selectedSchool}.`} Select a record to validate each before/after value.</p></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={downloadReviewLog} className="btn btn-secondary" style={{ gap: 5, fontSize: 11, padding: "6px 10px" }}><Download size={12} /> Review log</button>
              <button onClick={downloadFullXml} className="btn btn-secondary" style={{ gap: 5, fontSize: 11, padding: "6px 10px" }} title="Export the selected school with every original STIX field"><FileCode size={12} /> {selectedSchool === "all" ? "Download XML" : "School XML"}</button>
              <button onClick={() => { setExportError(null); setEncryptDialogOpen(true); }} className="btn btn-secondary" style={{ gap: 5, fontSize: 11, padding: "6px 10px" }} title="Password-protected AES-256 ZIP of the selected XML"><Lock size={12} /> Encrypted ZIP</button>
            </div>
          </div>
          {scopedFieldChanges.length > 0 && (
            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10, marginBottom: 12 }}>
              <details className="changed-fields-dropdown">
                <summary>
                  <span>Changed fields</span>
                  <span className="changed-fields-dropdown-count">{fieldFilter.length ? `${fieldFilter.length} selected` : "All fields"}</span>
                </summary>
                <div className="changed-fields-dropdown-menu">
                  <div className="changed-fields-dropdown-heading">Filter records by changed field</div>
                  {scopedFieldChanges.map((field) => (
                    <label
                      key={field.field}
                      className="changed-fields-dropdown-option"
                    >
                      <input
                        type="checkbox"
                        checked={fieldFilter.includes(field.label)}
                        onChange={() => toggleFieldFilter(field.label)}
                      />
                      <span>{field.label}</span>
                      <small>{field.count}</small>
                    </label>
                  ))}
                  {fieldFilter.length > 0 && <button className="btn btn-ghost changed-fields-dropdown-clear" onClick={() => setFieldFilter([])}>Clear filter</button>}
                </div>
              </details>
            </div>
          )}
          {exportError && <div role="alert" style={{ color: "var(--color-error-text)", fontSize: 11.5, marginBottom: 10 }}>{exportError}</div>}
          <div className="compare-review-summary"><span>{reviewedCount} confirmed</span><span>{needsFixCount} needs fix</span><span>{visibleRecords.filter((record) => record.kind === "changed").length} changed records</span></div>
          {visibleRecords.length === 0 ? <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>No record-level differences were detected{selectedSchool === "all" ? "." : " for this school."}</p> : <div className="compare-table-scroll" style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Change</th><th>Student</th><th>School</th><th>Changed fields</th><th>Review</th></tr></thead><tbody>{visibleRecords.map((record) => <tr key={`${record.kind}-${record.key}`} onClick={() => setSelectedRecordKey(record.key)} style={{ cursor: "pointer", background: selectedRecordKey === record.key ? "var(--color-surface-2)" : undefined }}><td><span className={`change-badge change-badge--${record.kind}`}>{record.kind}</span></td><td style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{record.studentName}</td><td>{record.schoolName}</td><td>{record.changedFields.length ? <div className="field-tag-list">{record.changedFields.map((field) => <span key={field} className="field-tag">{field}</span>)}</div> : <span style={{ color: "var(--color-text-muted)" }}>—</span>}</td><td style={{ color: "var(--color-teal-400)", fontSize: 11 }}>Inspect →</td></tr>)}</tbody></table></div>}
        </section>
        {selectedRecord ? (
          <aside className="card compare-school-summary compare-record-review">
            <div style={{ marginBottom: 14 }}><div style={{ color: "var(--color-text-muted)", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5 }}>Reviewing record</div><h2 style={{ fontSize: 17, margin: "0 0 4px" }}>{selectedRecord.studentName}</h2><p style={{ color: "var(--color-text-secondary)", fontSize: 11, margin: 0 }}>{selectedRecord.schoolName} · {selectedRecord.kind}</p></div>
            {selectedRecord.kind === "changed" ? <div className="compare-diff-list">{selectedRecord.fieldDiffs.map((diff) => { const key = decisionKey(selectedRecord.key, diff.field); const decision = decisions[key]; return <div key={diff.field} className="compare-diff-row"><div className="compare-diff-label"><strong>{diff.label}</strong><span>{diff.field}</span></div><div className="compare-diff-values"><div><small>Previous</small><code>{diff.previousValue || "(blank)"}</code></div><div className="compare-diff-arrow">→</div><div><small>Current</small><code className={decision === "needs-fix" ? "compare-value-alert" : ""}>{diff.currentValue || "(blank)"}</code></div></div><div style={{ display: "flex", gap: 5, marginTop: 8 }}><button className={`compare-decision ${decision === "confirmed" ? "active-confirm" : ""}`} onClick={() => setDecisions((current) => ({ ...current, [key]: "confirmed" }))}><CheckCircle2 size={12} /> Confirm</button><button className={`compare-decision ${decision === "needs-fix" ? "active-fix" : ""}`} onClick={() => setDecisions((current) => ({ ...current, [key]: "needs-fix" }))}><Wrench size={12} /> Needs fix</button></div>{decision === "needs-fix" && <input className="input" value={corrections[key] ?? diff.currentValue} onChange={(event) => setCorrections((current) => ({ ...current, [key]: event.target.value }))} placeholder="Enter corrected value" style={{ marginTop: 7, fontSize: 11, padding: "6px 8px" }} />}</div>; })}</div> : <p style={{ color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.5 }}>{selectedRecord.kind === "added" ? "This record is new in the current file. Validate it against your source system before accepting it." : "This record is missing from the current file. Confirm whether it should be removed or restored."}</p>}
            <button className="btn btn-ghost" onClick={() => setSelectedRecordKey(null)} style={{ marginTop: 12, padding: "5px 0", fontSize: 12 }}>Close record review</button>
          </aside>
        ) : selectedSchoolSummary && (
          <aside className="card compare-school-summary">
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
              <div><div style={{ color: "var(--color-text-muted)", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 5 }}>Selected school</div><h2 style={{ fontSize: 17, margin: 0 }}>{selectedSchoolSummary.schoolName}</h2></div>
              <School size={18} style={{ color: "var(--color-teal-400)" }} />
            </div>
            <div className="compare-school-stat-grid">
              <StatCard label="Previous" value={selectedSchoolSummary.previousCount} />
              <StatCard label="Current" value={selectedSchoolSummary.currentCount} />
              <StatCard label="Added" value={selectedSchoolSummary.added} accent="green" />
              <StatCard label="Removed" value={selectedSchoolSummary.removed} accent="red" />
              <StatCard label="Changed" value={selectedSchoolSummary.changed} accent="yellow" />
              <StatCard label="Net movement" value={selectedSchoolSummary.currentCount - selectedSchoolSummary.previousCount} />
            </div>
            <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 16, paddingTop: 14, color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.5 }}>
              School change rate: <strong style={{ color: "var(--color-text-primary)" }}>{((selectedSchoolSummary.added + selectedSchoolSummary.removed + selectedSchoolSummary.changed) / Math.max(selectedSchoolSummary.previousCount, 1) * 100).toFixed(1)}%</strong>
            </div>
            <button className="btn btn-ghost" onClick={() => selectSchool("all")} style={{ marginTop: 10, padding: "5px 0", fontSize: 12 }}>Clear school filter</button>
          </aside>
        )}
        </div>
      )}

      <Dialog.Root open={encryptDialogOpen} onOpenChange={(open) => { if (!open) closeEncryptDialog(); }}>
        <Dialog.Portal>
          <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 50 }} />
          <Dialog.Content
            aria-describedby={undefined}
            style={{
              position: "fixed", top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              background: "var(--color-surface-1)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              width: "min(92vw, 420px)",
              zIndex: 51,
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-sans)",
              padding: "20px 22px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <Dialog.Title style={{ fontSize: 15, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 6 }}><Lock size={14} /> Encrypted ZIP download</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--color-text-muted)", display: "flex" }}><X size={16} /></button>
              </Dialog.Close>
            </div>
            <p style={{ color: "var(--color-text-muted)", fontSize: 11.5, lineHeight: 1.5, margin: "0 0 14px" }}>
              Zips {xmlDownloadName} (every original field from {comparison.currentFileName}{selectedSchool === "all" ? "" : `, limited to ${selectedSchool}`}) with AES-256 encryption. Anyone opening the ZIP will need this password — it is not saved anywhere.
            </p>
            <p style={{ color: "var(--color-warning-text)", fontSize: 11, lineHeight: 1.45, margin: "-4px 0 14px" }}>
              Use 7-Zip, WinRAR, or PeaZip to extract AES-256 ZIPs. Windows File Explorer does not support AES-encrypted ZIP files.
            </p>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 5 }}>Password</div>
              <input
                className="input"
                type="password"
                value={zipPassword}
                onChange={(event) => setZipPassword(event.target.value)}
                placeholder="At least 8 characters"
                autoFocus
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--color-text-muted)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 5 }}>Confirm password</div>
              <input
                className="input"
                type="password"
                value={zipPasswordConfirm}
                onChange={(event) => setZipPasswordConfirm(event.target.value)}
                placeholder="Re-enter password"
                onKeyDown={(event) => { if (event.key === "Enter") downloadEncryptedZip(); }}
                style={{ width: "100%" }}
              />
            </div>
            {zipError && <div style={{ color: "var(--color-error-text)", fontSize: 11.5, marginBottom: 12 }}>{zipError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={closeEncryptDialog} style={{ fontSize: 12 }}>Cancel</button>
              <button className="btn btn-primary" onClick={downloadEncryptedZip} disabled={zipBusy} style={{ fontSize: 12, gap: 5, opacity: zipBusy ? 0.7 : 1 }}>
                {zipBusy ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Lock size={13} />}
                {zipBusy ? "Encrypting…" : "Encrypt & download"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

// ─── ValidateIssuesView ───────────────────────────────────────────────────────
// Screen 2: Review Issues

function ValidateIssuesView({
  session,
  onBack,
  onFix,
  onSkipToDownload,
}: {
  session: ValidateSession;
  onBack: () => void;
  onFix: () => void;
  onSkipToDownload: () => void;
}) {
  const { initialResult } = session;
  const allIssues = initialResult.issues;

  const [severityFilter, setSeverityFilter] = useState<"all" | ValidationSeverity>("all");
  const [fixableOnly, setFixableOnly] = useState(false);
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [search, setSearch] = useState("");

  const schools = Array.from(new Set(allIssues.map(i => i.schoolNumber).filter(Boolean))) as string[];

  const filtered = allIssues.filter(i => {
    if (severityFilter !== "all" && i.severity !== severityFilter) return false;
    if (fixableOnly && !i.autoFixable) return false;
    if (schoolFilter !== "all" && i.schoolNumber !== schoolFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !i.message.toLowerCase().includes(q) &&
        !(i.studentName ?? "").toLowerCase().includes(q) &&
        !(i.field ?? "").toLowerCase().includes(q) &&
        !(i.ruleId ?? "").toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const errorCount   = allIssues.filter(i => i.severity === "error").length;
  const warningCount = allIssues.filter(i => i.severity === "warning").length;
  const infoCount    = allIssues.filter(i => i.severity === "info").length;
  const fixableCount = allIssues.filter(i => i.autoFixable).length;

  return (
    <main style={{ flex: 1, maxWidth: 960, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <button onClick={onBack} className="btn btn-ghost" style={{ marginBottom: 18, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Open another file
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Issue Review</h1>
          <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 13 }}>
            {session.fileName} · {initialResult.schoolCount} school{initialResult.schoolCount !== 1 ? "s" : ""} · {initialResult.studentCount} students
          </p>
        </div>
        <GateBadge gate={initialResult.gate} />
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 28, marginBottom: 22 }}>
        <StatCard label="Total Issues" value={allIssues.length} />
        <StatCard label="Errors"       value={errorCount}       accent="red" />
        <StatCard label="Warnings"     value={warningCount}     accent="yellow" />
        <StatCard label="Auto-fixable" value={fixableCount}     accent="teal" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)", pointerEvents: "none" }} />
          <input className="input" placeholder="Search issues…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>

        <select
          className="input"
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value as typeof severityFilter)}
          style={{ flex: "0 0 140px" }}
        >
          <option value="all">All severities</option>
          <option value="error">Errors only</option>
          <option value="warning">Warnings only</option>
          <option value="info">Info only</option>
        </select>

        {schools.length > 0 && (
          <select
            className="input"
            value={schoolFilter}
            onChange={e => setSchoolFilter(e.target.value)}
            style={{ flex: "0 0 160px" }}
          >
            <option value="all">All schools</option>
            {schools.map(s => <option key={s} value={s}>School {s}</option>)}
          </select>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--color-text-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={fixableOnly} onChange={e => setFixableOnly(e.target.checked)} />
          <Filter size={12} /> Auto-fixable only
        </label>
      </div>

      {/* Issue table */}
      <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--color-text-muted)" }}>
            {allIssues.length === 0 ? "No issues found — file looks clean!" : "No issues match the current filters."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Severity</th>
                  <th>Student</th>
                  <th>School</th>
                  <th>Field</th>
                  <th>Current Value</th>
                  <th>Issue</th>
                  <th>Suggested Fix</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(issue => {
                  const record = initialResult.records.find(r => r.id === issue.recordId);
                  const currentValue = issue.field && record ? (record.fields[issue.field] ?? "") : "";
                  return (
                    <tr key={issue.id}>
                      <td><SeverityBadge severity={issue.severity} /></td>
                      <td style={{ fontWeight: 500, color: "var(--color-text-primary)", maxWidth: 160 }}>{issue.studentName || "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{issue.schoolNumber || "—"}</td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-secondary)" }}>{issue.field || "—"}</td>
                      <td>
                        {currentValue ? (
                          <code style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>{currentValue}</code>
                        ) : <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ maxWidth: 280, fontSize: 12, lineHeight: 1.5 }}>{issue.message}</td>
                      <td>
                        {issue.suggestedFix ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <code style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "var(--color-text-primary)" }}>{issue.suggestedFix}</code>
                            {issue.autoFixable && (
                              <span style={{ fontSize: 9, border: "1px solid var(--color-border)", color: "var(--color-text-muted)", borderRadius: 3, padding: "1px 5px", fontWeight: 600, letterSpacing: "0.03em" }}>AUTO</span>
                            )}
                          </span>
                        ) : <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>Manual</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length < allIssues.length && (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16, textAlign: "right" }}>
          Showing {filtered.length} of {allIssues.length} issues
        </p>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        {initialResult.gate === "READY" && (
          <button onClick={onSkipToDownload} className="btn btn-secondary" style={{ gap: 6 }}>
            <Download size={14} /> Skip to Download
          </button>
        )}
        <button onClick={onFix} className="btn btn-primary" style={{ gap: 6 }}>
          <Wrench size={14} />
          {fixableCount > 0 ? `Fix Issues (${fixableCount} auto-fixable)` : "Review & Edit"}
          <ArrowRight size={14} />
        </button>
      </div>
    </main>
  );
}

// ─── ValidateFixView ──────────────────────────────────────────────────────────
// Screen 3: Fix Data

function ValidateFixView({
  session,
  onBack,
  onApply,
}: {
  session: ValidateSession;
  onBack: () => void;
  onApply: (fixes: AppliedFix[]) => void;
}) {
  const issues = session.initialResult.issues;
  const records = session.initialResult.records;

  // pending: issueId → new value (empty = skip)
  const [pending, setPending] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const issue of issues) {
      if (issue.autoFixable && issue.suggestedFix !== undefined) {
        init[issue.id] = issue.suggestedFix;
      }
    }
    return init;
  });

  const [onlyFixable, setOnlyFixable] = useState(true);

  const visibleIssues = onlyFixable
    ? issues.filter(i => i.autoFixable || i.field)
    : issues;

  const autoFillAll = () => {
    const next: Record<string, string> = { ...pending };
    for (const issue of issues) {
      if (issue.autoFixable && issue.suggestedFix !== undefined) {
        next[issue.id] = issue.suggestedFix;
      }
    }
    setPending(next);
  };

  const clearAll = () => setPending({});

  const applyFixes = () => {
    const fixes: AppliedFix[] = [];
    const now = Date.now();
    for (const issue of issues) {
      const newValue = pending[issue.id];
      if (newValue === undefined || newValue === "") continue;
      if (!issue.recordId || !issue.field) continue;
      const record = records.find(r => r.id === issue.recordId);
      if (!record) continue;
      const oldValue = record.fields[issue.field] ?? "";
      fixes.push({
        issueId: issue.id,
        recordId: issue.recordId,
        field: issue.field,
        oldValue,
        newValue,
        ruleId: issue.ruleId,
        appliedAt: now,
      });
    }
    onApply(fixes);
  };

  const pendingCount = Object.values(pending).filter(v => v !== "").length;
  const fixableCount = issues.filter(i => i.autoFixable).length;

  return (
    <main style={{ flex: 1, maxWidth: 960, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <button onClick={onBack} className="btn btn-ghost" style={{ marginBottom: 18, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Back to Issues
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Fix Data</h1>
          <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 13 }}>
            {fixableCount} auto-fixable issues · {pendingCount} fixes staged
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={clearAll} className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>Clear All</button>
          <button onClick={autoFillAll} className="btn btn-secondary" style={{ fontSize: 12, padding: "6px 12px", gap: 5 }}>
            <Wand2 size={13} /> Auto-fill All Fixable
          </button>
        </div>
      </div>

      {/* Bulk action info */}
      <div style={{ borderLeft: "2px solid var(--color-info-text)", padding: "6px 0 6px 14px", marginBottom: 20, fontSize: 12, color: "var(--color-text-secondary)" }}>
        <strong style={{ color: "var(--color-info-text)" }}>Bulk-safe fixes</strong> are pre-filled automatically: whitespace trimming, grade/gender code normalization, deterministic date reformatting.
        Manual fields require you to type a correction — leave blank to skip.
      </div>

      {/* Filter toggle */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--color-text-secondary)", cursor: "pointer" }}>
          <input type="checkbox" checked={onlyFixable} onChange={e => setOnlyFixable(e.target.checked)} />
          Show only editable issues (fields with suggested fixes or manual edits)
        </label>
      </div>

      {/* Fix table */}
      <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Severity</th>
                <th>Student</th>
                <th>Field</th>
                <th>Current Value</th>
                <th>New Value</th>
              </tr>
            </thead>
            <tbody>
              {visibleIssues.map(issue => {
                const record = records.find(r => r.id === issue.recordId);
                const currentValue = issue.field && record ? (record.fields[issue.field] ?? "") : "";
                const pendingVal = pending[issue.id] ?? "";
                return (
                  <tr key={issue.id} style={{ opacity: !issue.field ? 0.5 : 1 }}>
                    <td><SeverityBadge severity={issue.severity} /></td>
                    <td style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 500 }}>{issue.studentName || "—"}</div>
                      <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{issue.schoolNumber}</div>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-secondary)" }}>{issue.field || <span style={{ color: "var(--color-text-muted)", fontFamily: "inherit" }}>—</span>}</td>
                    <td>
                      {currentValue ? (
                        <code style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>{currentValue}</code>
                      ) : <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ minWidth: 200 }}>
                      {issue.field ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            className="input"
                            value={pendingVal}
                            onChange={e => setPending(p => ({ ...p, [issue.id]: e.target.value }))}
                            placeholder={issue.suggestedFix ?? "Enter corrected value…"}
                            style={{ fontSize: 12, padding: "5px 8px" }}
                          />
                          {issue.suggestedFix && pendingVal !== issue.suggestedFix && (
                            <button
                              onClick={() => setPending(p => ({ ...p, [issue.id]: issue.suggestedFix! }))}
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: "4px 7px", whiteSpace: "nowrap" as const }}
                              title={`Use suggested: ${issue.suggestedFix}`}
                            >
                              Use suggested
                            </button>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>No field — review manually</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Apply */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onBack} className="btn btn-secondary">
          <ArrowLeft size={14} /> Back
        </button>
        <button onClick={applyFixes} className="btn btn-primary" style={{ gap: 6 }}>
          <RefreshCw size={14} />
          Apply {pendingCount > 0 ? `${pendingCount} Fix${pendingCount !== 1 ? "es" : ""}` : "Fixes"} & Revalidate
          <ArrowRight size={14} />
        </button>
      </div>
    </main>
  );
}

// ─── ValidateRevalidateView ───────────────────────────────────────────────────
// Screen 4: Revalidate

function ValidateRevalidateView({
  session,
  onBack,
  onContinue,
}: {
  session: ValidateSession;
  onBack: () => void;
  onContinue: (result: ValidateSession) => void;
}) {
  const [result, setResult] = useState<ValidateSession | null>(null);

  useEffect(() => {
    const fixedXml = applyValidationFixes(session.originalXml, session.fixes);
    const revalidated = validateXml(fixedXml, session.validationRules);
    setResult({
      ...session,
      revalidatedResult: revalidated,
      finalXml: fixedXml,
    });
  }, [session]);

  if (!result) {
    return (
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--color-text-secondary)" }}>
          <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Revalidating…
        </div>
      </main>
    );
  }

  const prev = session.initialResult;
  const next = result.revalidatedResult!;
  const fixCount = session.fixes.length;
  const prevErrors   = prev.issues.filter(i => i.severity === "error").length;
  const prevWarnings = prev.issues.filter(i => i.severity === "warning").length;
  const nextErrors   = next.issues.filter(i => i.severity === "error").length;
  const nextWarnings = next.issues.filter(i => i.severity === "warning").length;
  const resolvedCount = prev.issues.length - next.issues.length;

  return (
    <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <button onClick={onBack} className="btn btn-ghost" style={{ marginBottom: 18, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Back to Fix
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Revalidation Results</h1>
          <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 13 }}>
            {fixCount} fix{fixCount !== 1 ? "es" : ""} applied · {resolvedCount > 0 ? `${resolvedCount} issue${resolvedCount !== 1 ? "s" : ""} resolved` : "No issues resolved"}
          </p>
        </div>
        <GateBadge gate={next.gate} />
      </div>

      {/* Before / After comparison */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        <div className="card" style={{ padding: "18px 22px" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 14 }}>Before</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Total issues</span>
              <span style={{ fontWeight: 700 }}>{prev.issues.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-error-text)", fontSize: 13 }}>Errors</span>
              <span style={{ fontWeight: 700, color: "var(--color-error-text)" }}>{prevErrors}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-warning-text)", fontSize: 13 }}>Warnings</span>
              <span style={{ fontWeight: 700, color: "var(--color-warning-text)" }}>{prevWarnings}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Gate</span>
              <GateBadge gate={prev.gate} />
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: "18px 22px" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 14 }}>After {fixCount} Fix{fixCount !== 1 ? "es" : ""}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Total issues</span>
              <span style={{ fontWeight: 700 }}>{next.issues.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-error-text)", fontSize: 13 }}>Errors</span>
              <span style={{ fontWeight: 700, color: nextErrors > 0 ? "var(--color-error-text)" : "var(--color-brand-400)" }}>{nextErrors}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-warning-text)", fontSize: 13 }}>Warnings</span>
              <span style={{ fontWeight: 700, color: "var(--color-warning-text)" }}>{nextWarnings}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--color-text-secondary)", fontSize: 13 }}>Gate</span>
              <GateBadge gate={next.gate} />
            </div>
          </div>
        </div>
      </div>

      {/* Applied fixes audit */}
      {session.fixes.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 10 }}>Applied Fixes</div>
          <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 4, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Field</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {session.fixes.map(fix => {
                    const record = session.initialResult.records.find(r => r.id === fix.recordId);
                    const studentName = record ? `${record.fields.FirstName ?? ""} ${record.fields.LastName ?? ""}`.trim() : fix.recordId;
                    return (
                      <tr key={fix.issueId}>
                        <td style={{ fontSize: 12, fontWeight: 500 }}>{studentName || fix.recordId}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-secondary)" }}>{fix.field}</td>
                        <td><code style={{ background: "var(--color-error-bg)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>{fix.oldValue || "(empty)"}</code></td>
                        <td><code style={{ background: "var(--color-success-bg)", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "var(--color-brand-400)" }}>{fix.newValue}</code></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Remaining blocking issues */}
      {nextErrors > 0 && (
        <div style={{ borderLeft: "2px solid var(--color-error-text)", padding: "6px 0 6px 14px", marginBottom: 20, fontSize: 13, color: "var(--color-error-text)" }}>
          <strong>{nextErrors} blocking error{nextErrors !== 1 ? "s" : ""} remain.</strong> The file is still <strong>BLOCKED</strong>. You can download it for reference but it may not pass submission.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onBack} className="btn btn-secondary">
          <ArrowLeft size={14} /> Back to Fix
        </button>
        <button onClick={() => onContinue(result)} className="btn btn-primary" style={{ gap: 6 }}>
          <Download size={14} /> Continue to Download
          <ArrowRight size={14} />
        </button>
      </div>
    </main>
  );
}

// ─── Report filter helpers ─────────────────────────────────────────────────────

function computeAge(birthDate: string): number | null {
  if (!birthDate) return null;
  const now = new Date();
  const m = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dob = m
    ? new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]))
    : new Date(birthDate);
  if (isNaN(dob.getTime())) return null;
  let age = now.getFullYear() - dob.getFullYear();
  const md = now.getMonth() - dob.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < dob.getDate())) age--;
  return age < 0 ? null : age;
}

function toggleItem(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

function FilterCheckboxGroup({
  label,
  options,
  selected,
  onToggle,
  onAll,
  onNone,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onAll: () => void;
  onNone: () => void;
}) {
  return (
    <div style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "12px 14px", flex: "1 1 150px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: "var(--color-text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{label}</span>
        <div style={{ display: "flex", gap: 5 }}>
          {(["All", "None"] as const).map((lbl) => (
            <button key={lbl} onClick={lbl === "All" ? onAll : onNone} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--color-surface-4)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)", cursor: "pointer" }}>{lbl}</button>
          ))}
        </div>
      </div>
      <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
        {options.length === 0
          ? <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>No values</span>
          : options.map((opt) => (
            <label key={opt} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 4px", borderRadius: 4, cursor: "pointer", fontSize: 12, color: "var(--color-text-primary)", background: selected.includes(opt) ? "var(--color-success-bg)" : "transparent" }}>
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => onToggle(opt)} style={{ accentColor: "var(--color-brand-500)", cursor: "pointer" }} />
              {opt}
            </label>
          ))}
      </div>
      <div style={{ marginTop: 5, fontSize: 10, color: "var(--color-text-muted)" }}>{selected.length}/{options.length}</div>
    </div>
  );
}

function AgeRangeFilter({
  minBound, maxBound, minAge, maxAge,
  onChange,
}: {
  minBound: number; maxBound: number; minAge: number; maxAge: number;
  onChange: (min: number, max: number) => void;
}) {
  return (
    <div style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "12px 14px", flex: "1 1 180px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 12, color: "var(--color-text-secondary)", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Age Range</span>
        <button onClick={() => onChange(minBound, maxBound)} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--color-surface-4)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)", cursor: "pointer" }}>Reset</button>
      </div>
      {minBound === maxBound
        ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>All students same age ({minBound})</div>
        : <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-muted)", marginBottom: 3 }}>
              <span>Min age</span>
              <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{minAge}</span>
            </div>
            <input type="range" min={minBound} max={maxBound} value={minAge} onChange={(e) => onChange(parseInt(e.target.value), Math.max(parseInt(e.target.value), maxAge))} style={{ width: "100%", accentColor: "var(--color-brand-500)" }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-muted)", marginBottom: 3 }}>
              <span>Max age</span>
              <span style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{maxAge}</span>
            </div>
            <input type="range" min={minBound} max={maxBound} value={maxAge} onChange={(e) => onChange(Math.min(minAge, parseInt(e.target.value)), parseInt(e.target.value))} style={{ width: "100%", accentColor: "var(--color-brand-500)" }} />
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: "var(--color-text-primary)", background: "var(--color-surface-3)", borderRadius: 5, padding: "3px 8px" }}>
            {minAge === maxAge ? `Age ${minAge}` : `Ages ${minAge}–${maxAge}`}
          </div>
        </>}
    </div>
  );
}

// ─── ValidateDownloadView ─────────────────────────────────────────────────────
// Screen 5: Download

function ValidateDownloadView({
  session,
  onStartOver,
}: {
  session: ValidateSession;
  onStartOver: () => void;
}) {
  const baseName = session.fileName.replace(/\.xml$/i, "");
  const result = session.revalidatedResult ?? session.initialResult;
  const gate = result.gate;
  const xml = session.finalXml ?? session.originalXml;

  const dlXml = () => downloadText(xml, `${baseName}_validated.xml`, "application/xml");
  const [encryptOpen, setEncryptOpen] = useState(false);
  const [zipPassword, setZipPassword] = useState("");
  const [zipConfirm, setZipConfirm] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const closeEncrypt = () => { setEncryptOpen(false); setZipPassword(""); setZipConfirm(""); setZipError(null); setZipBusy(false); };
  const dlEncryptedZip = async () => {
    if (zipPassword.length < 8) { setZipError("Password must be at least 8 characters."); return; }
    if (zipPassword !== zipConfirm) { setZipError("Passwords do not match."); return; }
    setZipBusy(true); setZipError(null);
    try {
      const writer = new ZipWriter(new BlobWriter("application/zip"), { password: zipPassword, encryptionStrength: 3 });
      await writer.add(`${baseName}_validated.xml`, new TextReader(xml));
      const blob = await writer.close();
      downloadBlob(blob, `${baseName}_validated.zip`);
      closeEncrypt();
    } catch (error) { setZipError(error instanceof Error ? error.message : "Encryption failed. Please try again."); setZipBusy(false); }
  };

  const dlReport = () => {
    const csv = generateIssueReportCsv(session.initialResult.issues, session.fixes);
    downloadText(csv, `${baseName}_issue_report.csv`, "text/csv");
  };

  const errorCount   = result.issues.filter(i => i.severity === "error").length;
  const warningCount = result.issues.filter(i => i.severity === "warning").length;

  // ── Filter state ──────────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(true);
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectedGrades,  setSelectedGrades]  = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [minAge, setMinAge] = useState(0);
  const [maxAge, setMaxAge] = useState(99);
  const [ageBounds, setAgeBounds] = useState<[number, number]>([0, 99]);
  const [filterOpts, setFilterOpts] = useState({ schools: [] as string[], grades: [] as string[], genders: [] as string[] });

  useEffect(() => {
    const records = result.records ?? [];
    const schoolsSet = new Set<string>();
    const gradesSet  = new Set<string>();
    const gendersSet = new Set<string>();
    let ageMin = Infinity, ageMax = -Infinity;
    for (const r of records) {
      const sn = (r.fields.SchoolNumber || r.fields.SchoolName || "").trim() || "(unknown)";
      schoolsSet.add(sn);
      if (r.fields.Grade)  gradesSet.add(String(r.fields.Grade).trim());
      if (r.fields.Gender) gendersSet.add(String(r.fields.Gender).trim());
      const age = computeAge((r.fields.BirthDate || "").trim());
      if (age !== null) { if (age < ageMin) ageMin = age; if (age > ageMax) ageMax = age; }
    }
    const schools = Array.from(schoolsSet).sort();
    const grades  = Array.from(gradesSet).sort();
    const genders = Array.from(gendersSet).sort();
    const lo = isFinite(ageMin) ? ageMin : 0;
    const hi = isFinite(ageMax) ? ageMax : 99;
    setFilterOpts({ schools, grades, genders });
    setSelectedSchools(schools);
    setSelectedGrades(grades);
    setSelectedGenders(genders);
    setAgeBounds([lo, hi]);
    setMinAge(lo);
    setMaxAge(hi);
  }, [result]);

  const filteredRecords = (result.records ?? []).filter((r) => {
    const sn     = (r.fields.SchoolNumber || r.fields.SchoolName || "").trim() || "(unknown)";
    const grade  = (r.fields.Grade  || "").trim();
    const gender = (r.fields.Gender || "").trim();
    const age    = computeAge((r.fields.BirthDate || "").trim());
    if (!selectedSchools.includes(sn)) return false;
    if (grade  && !selectedGrades.includes(grade))   return false;
    if (gender && !selectedGenders.includes(gender)) return false;
    if (age !== null && (age < minAge || age > maxAge)) return false;
    return true;
  });

  const filteredIds = new Set(filteredRecords.map((r: any) => r.id));
  const filteredIssues = result.issues.filter((i: any) => {
    if (i.recordId && filteredIds.has(i.recordId)) return true;
    const sn = i.schoolNumber || "";
    return selectedSchools.includes(sn || "(unknown)");
  });

  const dlFilteredSchools = () => downloadText(generateSchoolSummaryCsv(filteredRecords), `${baseName}_filtered_schools.csv`, "text/csv");
  const dlFilteredAges    = () => downloadText(generateAgeGroupReportCsv(filteredRecords), `${baseName}_filtered_ages.csv`, "text/csv");
  const dlFilteredIssues  = () => downloadText(generateIssueReportCsv(filteredIssues, session.fixes), `${baseName}_filtered_issues.csv`, "text/csv");

  return (
    <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "56px 24px 100px" }}>
      <button onClick={onStartOver} className="btn btn-ghost" style={{ marginBottom: 22, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Process another file
      </button>

      {/* Gate banner */}
      <div style={{
        borderLeft: `2px solid ${gate === "READY" ? "var(--verde)" : "var(--color-error-text)"}`,
        padding: "6px 0 6px 22px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 34,
      }}>
        {gate === "READY" ? <CheckCircle2 size={28} style={{ color: "var(--color-brand-400)", flexShrink: 0 }} /> : <ShieldX size={28} style={{ color: "var(--color-error-text)", flexShrink: 0 }} />}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: gate === "READY" ? "var(--color-brand-400)" : "var(--color-error-text)" }}>
              {gate === "READY" ? "File is READY" : "File is BLOCKED"}
            </span>
            <GateBadge gate={gate} />
          </div>
          <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
            {gate === "READY"
              ? `No blocking errors · ${warningCount > 0 ? `${warningCount} warning${warningCount !== 1 ? "s" : ""} for review` : "All clear"}`
              : `${errorCount} blocking error${errorCount !== 1 ? "s" : ""} must be resolved before submission`}
          </div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginTop: 4 }}>
            {(() => {
              const id   = getActiveRulesetId();
              const name = id === BUILTIN_ID
                ? "Built-in (WDG)"
                : (listCustomRulesets().find((r) => r.id === id)?.name ?? "Built-in (WDG)");
              return `Validated against: ${name}`;
            })()}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 28, marginBottom: 28 }}>
        <StatCard label="Fixes Applied"    value={session.fixes.length}  accent="teal" />
        <StatCard label="Remaining Issues" value={result.issues.length}  />
        <StatCard label="Students"         value={result.studentCount}   accent="green" />
      </div>

      {/* Downloads */}
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12 }}>Downloads</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Cleaned XML */}
        <div className="card" style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: gate === "READY" ? "var(--color-success-bg)" : "var(--color-error-bg)", borderRadius: 4, padding: 9 }}>
              <FileText size={18} style={{ color: gate === "READY" ? "var(--color-brand-400)" : "var(--color-error-text)" }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{baseName}_validated.xml</div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
                {session.fixes.length > 0 ? `Cleaned STIX XML with ${session.fixes.length} fix${session.fixes.length !== 1 ? "es" : ""} applied` : "Original STIX XML (no fixes applied)"}
              </div>
            </div>
          </div>
          <button onClick={dlXml} className="btn btn-primary" style={{ gap: 7 }}><Download size={14} /> Download</button>
        </div>

        {/* Encrypted XML */}
        <div className="card" style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: 9 }}><Lock size={18} style={{ color: "var(--color-text-muted)" }} /></div>
            <div><div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{baseName}_validated.zip</div><div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>AES-256 encrypted ZIP containing the validated XML</div></div>
          </div>
          <button onClick={() => setEncryptOpen(true)} className="btn btn-secondary" style={{ gap: 7 }}><Lock size={14} /> Encrypt &amp; ZIP</button>
        </div>

        {/* Issue report CSV */}
        <div className="card" style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: 9 }}>
              <BarChart3 size={18} style={{ color: "var(--color-text-muted)" }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{baseName}_issue_report.csv</div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
                {session.initialResult.issues.length} issue{session.initialResult.issues.length !== 1 ? "s" : ""} · includes fixed/unfixed status
              </div>
            </div>
          </div>
          <button onClick={dlReport} className="btn btn-secondary" style={{ gap: 7 }}><Download size={14} /> CSV</button>
        </div>
      </div>

      <Dialog.Root open={encryptOpen} onOpenChange={(open) => { if (!open) closeEncrypt(); }}>
        <Dialog.Portal><Dialog.Overlay style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 50 }} />
          <Dialog.Content aria-describedby={undefined} style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 8, width: "min(92vw, 420px)", zIndex: 51, padding: "20px 22px" }}>
            <Dialog.Title style={{ fontSize: 15, fontWeight: 700, margin: "0 0 12px" }}>Encrypted ZIP download</Dialog.Title>
            <p style={{ color: "var(--color-text-muted)", fontSize: 11.5, lineHeight: 1.5, margin: "0 0 14px" }}>The password is not saved. Use 7-Zip, WinRAR, or PeaZip to open the AES-256 ZIP.</p>
            <input className="input" type="password" value={zipPassword} onChange={(event) => setZipPassword(event.target.value)} placeholder="Password (8+ characters)" style={{ width: "100%", marginBottom: 8 }} autoFocus />
            <input className="input" type="password" value={zipConfirm} onChange={(event) => setZipConfirm(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") dlEncryptedZip(); }} placeholder="Confirm password" style={{ width: "100%", marginBottom: 10 }} />
            {zipError && <div style={{ color: "var(--color-error-text)", fontSize: 11.5, marginBottom: 10 }}>{zipError}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button className="btn btn-ghost" onClick={closeEncrypt}>Cancel</button><button className="btn btn-primary" onClick={dlEncryptedZip} disabled={zipBusy} style={{ gap: 5 }}>{zipBusy ? "Encrypting…" : "Encrypt & download"}</button></div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Filter & Report section ─────────────────────────────────────────── */}
      <div style={{ marginTop: 40, paddingTop: 28, borderTop: "1px solid var(--color-border)" }}>
        {/* Section header */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 0, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" as const }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SlidersHorizontal size={15} style={{ color: "var(--color-text-muted)" }} />
            <div>
              <div style={{ fontFamily: "var(--font-serif), Georgia, serif", fontWeight: 600, fontSize: 16, color: "var(--color-text-primary)" }}>Filter &amp; Export Reports</div>
              <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 2 }}>
                Narrow by school, grade, gender, or age — then download targeted CSVs
              </div>
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-muted)", fontWeight: 500, flexShrink: 0, marginLeft: 12 }}>
            {showFilters ? "Collapse" : "Expand"}
          </span>
        </button>

        {showFilters && (
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Filter controls */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <FilterCheckboxGroup
                label="School"
                options={filterOpts.schools}
                selected={selectedSchools}
                onToggle={(v) => setSelectedSchools((s) => toggleItem(s, v))}
                onAll={() => setSelectedSchools(filterOpts.schools)}
                onNone={() => setSelectedSchools([])}
              />
              <FilterCheckboxGroup
                label="Grade"
                options={filterOpts.grades}
                selected={selectedGrades}
                onToggle={(v) => setSelectedGrades((s) => toggleItem(s, v))}
                onAll={() => setSelectedGrades(filterOpts.grades)}
                onNone={() => setSelectedGrades([])}
              />
              <FilterCheckboxGroup
                label="Gender"
                options={filterOpts.genders}
                selected={selectedGenders}
                onToggle={(v) => setSelectedGenders((s) => toggleItem(s, v))}
                onAll={() => setSelectedGenders(filterOpts.genders)}
                onNone={() => setSelectedGenders([])}
              />
              <AgeRangeFilter
                minBound={ageBounds[0]} maxBound={ageBounds[1]}
                minAge={minAge} maxAge={maxAge}
                onChange={(min, max) => { setMinAge(min); setMaxAge(max); }}
              />
            </div>

            {/* Result bar + export buttons */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, background: "var(--color-surface-2)", borderRadius: 4, padding: "12px 16px", border: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                <span style={{ fontWeight: 800, color: "var(--color-text-primary)", fontSize: 22, lineHeight: 1 }}>{filteredRecords.length}</span>
                <span style={{ marginLeft: 6 }}>of {result.studentCount} students match</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={dlFilteredSchools} className="btn btn-secondary" style={{ gap: 5, fontSize: 12, padding: "6px 13px" }}><Download size={12} /> Schools CSV</button>
                <button onClick={dlFilteredAges}    className="btn btn-secondary" style={{ gap: 5, fontSize: 12, padding: "6px 13px" }}><Download size={12} /> Age Groups CSV</button>
                <button onClick={dlFilteredIssues}  className="btn btn-secondary" style={{ gap: 5, fontSize: 12, padding: "6px 13px" }}><Download size={12} /> Issues CSV</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ─── File read helper ─────────────────────────────────────────────────────────

async function readInputAsStixXml(f: File, metadata?: Partial<XlsmMetadata>): Promise<string> {
  if (/\.xlsm?$/i.test(f.name)) {
    const data = await f.arrayBuffer();
    return xlsmToStixXml(data, f.name, metadata);
  }
  const xmlText = await readFileText(f);
  if (!xmlText.trim().startsWith("<")) throw new Error("Selected file is neither XML nor a supported Excel workbook.");
  return xmlText;
}

async function readFileText(f: File): Promise<string> {
  try {
    if (typeof f.text === "function") return await f.text();
  } catch {
    // Fall through to FileReader path.
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") { resolve(reader.result); return; }
      if (reader.result instanceof ArrayBuffer) { resolve(new TextDecoder().decode(reader.result)); return; }
      reject(new Error("Unable to read file as text."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsText(f);
  });
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView]                   = useState<View>("home");
  const [session, setSession]             = useState<SessionData | null>(null);
  const [validateSess, setValidateSess]   = useState<ValidateSession | null>(null);
  const [comparison, setComparison]       = useState<StixComparison | null>(null);
  // Lifted so CleaningView and validation both see the same ruleset
  const [activeRules, setActiveRules]     = useState<RulesProfile>(defaultRules);
  // Cleaning pipeline state
  const [pendingFile, setPendingFile]     = useState<{ xml: string; fileName: string; validationRules?: RulesProfile } | null>(null);
  const [parsedRecords, setParsedRecords] = useState<StudentRecord[] | null>(null);
  const [cleanedRecords, setCleanedRecords] = useState<StudentRecord[] | null>(null);
  const [cleaningSummary, setCleaningSummary] = useState<CleaningSummaryEntry[] | null>(null);

  // Sync activeRules from localStorage on mount
  useEffect(() => { setActiveRules(getActiveRules()); }, []);

  const goHome = () => {
    setView("home");
    setSession(null);
    setValidateSess(null);
    setComparison(null);
    setPendingFile(null);
    setParsedRecords(null);
    setCleanedRecords(null);
    setCleaningSummary(null);
  };

  /** Run validateXml and transition to validate-issues. Used by both skip and apply paths. */
  function runValidation(xmlText: string, fileName: string, validationRules = activeRules) {
    const result = validateXml(xmlText, validationRules);
    setValidateSess({ fileName, originalXml: xmlText, initialResult: result, fixes: [], validationRules });
    setPendingFile(null);
    setParsedRecords(null);
    setCleanedRecords(null);
    setCleaningSummary(null);
    setView("validate-issues");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <NavBar />

      {view === "home" && (
        <HomeView
          onDone={(data, next) => { setSession(data); setView(next); }}
          onCompare={(result) => { setComparison(result); setView("compare"); }}
          activeRules={activeRules}
          onRulesChange={setActiveRules}
          onParsed={(xmlText, records, fileName, requiredFields) => {
            const validationRules = requiredFields?.length ? { ...activeRules, requiredFields } : activeRules;
            setPendingFile({ xml: xmlText, fileName, validationRules });
            setParsedRecords(records);
            setView("clean-step");
          }}
        />
      )}

      {view === "review" && session && (
        <ReviewView
          session={session}
          onBack={() => setView("home")}
          onDone={(updated) => { setSession(updated); setView("result"); }}
        />
      )}

      {view === "result" && session && (
        <ResultView session={session} onStartOver={goHome} />
      )}

      {view === "compare" && comparison && (
        <CompareView comparison={comparison} onStartOver={goHome} />
      )}

      {/* ── Cleaning step ── */}

      {view === "clean-step" && parsedRecords && pendingFile && (
        <CleaningView
          records={parsedRecords}
          activeRules={activeRules}
          initialProfile={getActiveCleaning()}
          onApply={(cleaned, summary, _profile) => {
            setCleanedRecords(cleaned);
            setCleaningSummary(summary);
            setView("clean-summary");
          }}
          onSkip={() => runValidation(pendingFile.xml, pendingFile.fileName, pendingFile.validationRules)}
          onBack={goHome}
          onSaveToRuleset={(profile) => {
            const id = getActiveRulesetId();
            if (id === BUILTIN_ID) {
              alert("Switch to a custom ruleset first before saving cleaning rules.");
              return false;
            }
            const all = listCustomRulesets();
            const rs = all.find((r) => r.id === id);
            if (!rs) return false;
            const { cleaning: _omit, ...rsBase } = rs;
            const updated = profile.enabledFields.length === 0
              ? rsBase
              : { ...rsBase, cleaning: profile };
            saveCustomRuleset(updated);
            return true;
          }}
        />
      )}

      {view === "clean-summary" && cleaningSummary && cleanedRecords && parsedRecords && pendingFile && (
        <CleaningSummaryView
          summary={cleaningSummary}
          onBack={() => setView("clean-step")}
          onContinue={() => {
            const fixes: AppliedFix[] = [];
            let fixIndex = 0;
            // Dedup by (recordId, field) — a field can only be changed to one canonical
            // value per record (first-match-wins). The third condition disambiguates which
            // summary entry to attribute the fix to when multiple entries share a field.
            const fixed = new Set<string>();
            for (const entry of cleaningSummary) {
              if (entry.count === 0) continue;
              for (let i = 0; i < parsedRecords.length; i++) {
                const original = parsedRecords[i];
                const cleaned = cleanedRecords[i];
                const key = `${original.id}\0${entry.field}`;
                if (!fixed.has(key) &&
                    original.fields[entry.field] !== cleaned.fields[entry.field] &&
                    cleaned.fields[entry.field] === entry.canonical) {
                  fixes.push({
                    issueId: `cleaning-${fixIndex++}`,
                    recordId: original.id,
                    field: entry.field,
                    oldValue: original.fields[entry.field] ?? "",
                    newValue: entry.canonical,
                    ruleId: "cleaning",
                    appliedAt: Date.now(),
                  });
                  fixed.add(key);
                }
              }
            }
            const xmlToValidate = fixes.length > 0
              ? applyValidationFixes(pendingFile.xml, fixes)
              : pendingFile.xml;
            runValidation(xmlToValidate, pendingFile.fileName, pendingFile.validationRules);
          }}
        />
      )}

      {/* ── Validate workflow ── */}

      {view === "validate-issues" && validateSess && (
        <ValidateIssuesView
          session={validateSess}
          onBack={goHome}
          onFix={() => setView("validate-fix")}
          onSkipToDownload={() => setView("validate-download")}
        />
      )}

      {view === "validate-fix" && validateSess && (
        <ValidateFixView
          session={validateSess}
          onBack={() => setView("validate-issues")}
          onApply={(fixes) => {
            setValidateSess({ ...validateSess, fixes });
            setView("validate-revalidate");
          }}
        />
      )}

      {view === "validate-revalidate" && validateSess && (
        <ValidateRevalidateView
          session={validateSess}
          onBack={() => setView("validate-fix")}
          onContinue={(updated) => { setValidateSess(updated); setView("validate-download"); }}
        />
      )}

      {view === "validate-download" && validateSess && (
        <ValidateDownloadView
          session={validateSess}
          onStartOver={goHome}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
