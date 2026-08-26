"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Upload, Wand2, FileSpreadsheet, FileText,
  CheckCircle2, AlertCircle, Loader2, ArrowLeft,
  ArrowRight, AlertTriangle, MapPin, School,
  Download, Users, BarChart3, ShieldCheck,
  ShieldX, Search, Filter, Wrench, RefreshCw,
  ClipboardCheck, SlidersHorizontal, GitCompareArrows,
} from "lucide-react";
import { cleanXml, applyReviewUpdates, prettyPrintXml } from "@/lib/cleaner";
import { compareStixFiles } from "@/lib/compare";
import { processExport, buildSchoolCounts, buildGradeCounts } from "@/lib/pullInfo";
import { downloadText, toCsv } from "@/lib/utils";
import {
  validateXml,
  applyValidationFixes,
  applyFixesToRecords,
  generateIssueReportCsv,
  generateSchoolSummaryCsv,
  generateAgeGroupReportCsv,
} from "@/lib/validator";
import type {
  Workflow, SessionData,
  ValidateSession, ValidationIssue, AppliedFix,
  ValidationSeverity, RulesProfile, StixComparison,
} from "@/lib/types";
import { defaultRules, getActiveRules, getActiveRulesetId, listCustomRulesets, BUILTIN_ID } from "@/lib/rulesets";
import RulesetSelector from "@/components/RulesetSelector";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type View =
  | "home"
  | "review"
  | "result"
  | "validate-issues"
  | "validate-fix"
  | "validate-revalidate"
  | "validate-download"
  | "compare";

// ─── NavBar ──────────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <header style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: "linear-gradient(135deg,#22c55e,#14b8a6)", borderRadius: 7, padding: "3px 9px", fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: "0.05em", fontFamily: "var(--font-mono)" }}>
            PanoReady
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-muted)", fontSize: 12 }}>
          <ShieldCheck size={13} style={{ color: "var(--color-brand-400)" }} />
          Data never leaves your browser
        </div>
      </div>
    </header>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent = "default" }: { label: string; value: number | string; accent?: "green" | "teal" | "yellow" | "red" | "default" }) {
  const colors = { green: "var(--color-brand-400)", teal: "var(--color-teal-400)", yellow: "var(--color-warning-text)", red: "var(--color-error-text)", default: "var(--color-text-primary)" };
  const bgs = { green: "var(--color-success-bg)", teal: "rgba(20,184,166,0.08)", yellow: "var(--color-warning-bg)", red: "var(--color-error-bg)", default: "var(--color-surface-2)" };
  return (
    <div style={{ background: bgs[accent], borderRadius: 10, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: colors[accent] }}>{value}</div>
    </div>
  );
}

// ─── SeverityBadge ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: ValidationSeverity }) {
  const config = {
    error:   { bg: "var(--color-error-bg)",   border: "var(--color-error-border)",   text: "var(--color-error-text)",   label: "ERROR" },
    warning: { bg: "var(--color-warning-bg)", border: "var(--color-warning-border)", text: "var(--color-warning-text)", label: "WARN" },
    info:    { bg: "rgba(99,102,241,0.1)",     border: "rgba(99,102,241,0.3)",        text: "#818cf8",                   label: "INFO" },
  }[severity];
  return (
    <span style={{ background: config.bg, border: `1px solid ${config.border}`, borderRadius: 99, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: config.text, letterSpacing: "0.05em", whiteSpace: "nowrap" as const }}>
      {config.label}
    </span>
  );
}

// ─── GateBadge ───────────────────────────────────────────────────────────────

function GateBadge({ gate }: { gate: string }) {
  const isReady = gate === "READY";
  const isPending = gate === "PENDING";
  const bg     = isReady ? "var(--color-success-bg)"  : isPending ? "var(--color-surface-2)"  : "var(--color-error-bg)";
  const border = isReady ? "var(--color-success-border)" : isPending ? "var(--color-border)" : "var(--color-error-border)";
  const color  = isReady ? "var(--color-brand-400)"   : isPending ? "var(--color-text-muted)" : "var(--color-error-text)";
  const icon   = isReady ? <CheckCircle2 size={14} /> : isPending ? <Loader2 size={14} />   : <ShieldX size={14} />;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: bg, border: `1px solid ${border}`, borderRadius: 99, padding: "5px 14px", fontSize: 13, fontWeight: 700, color }}>
      {icon}{gate}
    </span>
  );
}

// ─── Workflows config ────────────────────────────────────────────────────────

const WORKFLOWS: { id: Workflow; icon: React.ReactNode; label: string; description: string; color: string }[] = [
  { id: "validate", icon: <ClipboardCheck size={20} />, label: "Validate & Fix",    description: "Full validation: required fields, code values, formats, duplicates. Apply safe fixes, revalidate, download.", color: "#818cf8" },
  { id: "clean",    icon: <Wand2 size={20} />,          label: "Clean XML",         description: "Fix phones, standardize units, flag bad street numbers for manual review.", color: "var(--color-brand-400)" },
  { id: "export",   icon: <FileSpreadsheet size={20} />, label: "Export Reports",   description: "Parse students into spreadsheet. Filter Gr7–8 born 2012–2013 with school summaries.", color: "var(--color-teal-400)" },
  { id: "pretty",   icon: <FileText size={20} />,        label: "Pretty Print",     description: "Reformat the XML with consistent indentation.", color: "#a78bfa" },
  { id: "compare",  icon: <GitCompareArrows size={20} />, label: "Compare Files",    description: "Compare two snapshots to measure record, field, and school-level changes.", color: "#f59e0b" },
];

// ─── HomeView ─────────────────────────────────────────────────────────────────

function HomeView({ onDone, onValidate, onCompare }: {
  onDone: (data: SessionData, next: View) => void;
  onValidate: (session: ValidateSession) => void;
  onCompare: (comparison: StixComparison) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const currentInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile]           = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [currentSelectedName, setCurrentSelectedName] = useState("");
  const [workflow, setWorkflow]   = useState<Workflow>("validate");
  const [dragging, setDragging]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeRules, setActiveRules] = useState<RulesProfile>(defaultRules);

  useEffect(() => { setActiveRules(getActiveRules()); }, []);

  const handleFile = useCallback((f: File) => {
    setError(null);
    setFile(f);
    setSelectedName(f.name || "selected file");
  }, []);

  const handleNativeFileSelect = useCallback((target: HTMLInputElement) => {
    const selectedFile = target.files?.[0];
    if (!selectedFile) return;
    handleFile(selectedFile);
  }, [handleFile]);

  const handleCurrentFile = useCallback((f: File) => {
    setError(null);
    setCurrentFile(f);
    setCurrentSelectedName(f.name || "current file");
  }, []);

  const handleCurrentFileSelect = useCallback((target: HTMLInputElement) => {
    const selectedFile = target.files?.[0];
    if (selectedFile) handleCurrentFile(selectedFile);
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
    if (input.value) {
      const fallbackName = input.value.split(/[/\\]/).pop() ?? input.value;
      setSelectedName(fallbackName);
    }
    setError("No readable file found. Re-select the XML file, then click Use Selected File.");
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
      const xmlText = await readFileText(selectedFile);
      if (!xmlText.trim().startsWith("<")) throw new Error("Selected file is not XML text.");

      if (workflow === "compare") {
        const selectedCurrentFile = currentInputRef.current?.files?.[0] ?? currentFile;
        if (!selectedCurrentFile) throw new Error("Please select the current XML file as well.");
        const currentXmlText = await readFileText(selectedCurrentFile);
        if (!currentXmlText.trim().startsWith("<")) throw new Error("The current file is not XML text.");
        onCompare(compareStixFiles(xmlText, currentXmlText, selectedFile.name, selectedCurrentFile.name));
        return;
      }

      if (workflow === "validate") {
        const result = validateXml(xmlText, activeRules);
        onValidate({
          fileName: selectedFile.name,
          originalXml: xmlText,
          initialResult: result,
          fixes: [],
        });
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
  const wIcon = workflow === "validate" ? <ClipboardCheck size={16} />
    : workflow === "clean" ? <Wand2 size={16} />
    : workflow === "export" ? <FileSpreadsheet size={16} />
    : workflow === "pretty" ? <FileText size={16} />
    : <GitCompareArrows size={16} />;

  return (
    <main className="grid-bg" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 24px 80px" }}>
      <div style={{ textAlign: "center", marginBottom: 48, maxWidth: 560 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)", borderRadius: 99, padding: "4px 14px", fontSize: 12, color: "var(--color-success-text)", marginBottom: 18, fontWeight: 500 }}>
          <CheckCircle2 size={12} /> 100% in-browser · No server · No data upload
        </div>
        <h1 style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1, margin: "0 0 14px" }}>
          <span className="gradient-text">PanoReady</span>
        </h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 15, lineHeight: 1.7, margin: 0 }}>
          Clean, validate, and export Ontario school enrollment data. Student records never leave your device.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 720, display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Workflow selector */}
        <div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>1 · Choose workflow</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
            {WORKFLOWS.map((w) => (
              <button key={w.id} onClick={() => setWorkflow(w.id)} style={{ background: workflow === w.id ? `color-mix(in srgb,${w.color} 12%,var(--color-surface-2))` : "var(--color-surface-1)", border: `1px solid ${workflow === w.id ? w.color : "var(--color-border)"}`, borderRadius: 10, padding: "16px 14px", textAlign: "left", cursor: "pointer", transition: "all 0.15s", outline: "none", position: "relative", overflow: "hidden" }}>
                {workflow === w.id && <div style={{ position: "absolute", top: 0, right: 0, background: w.color, borderRadius: "0 10px 0 7px", padding: "2px 8px", fontSize: 9, fontWeight: 800, color: "#000", letterSpacing: "0.06em" }}>SELECTED</div>}
                <div style={{ color: w.color, marginBottom: 8 }}>{w.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)", marginBottom: 5 }}>{w.label}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)", lineHeight: 1.5 }}>{w.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Ruleset selector — validate workflow only */}
        {workflow === "validate" && (
          <RulesetSelector onRulesChange={setActiveRules} />
        )}

        {/* Drop zone */}
        <div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>2 · Upload XML file</div>
          <div
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            style={{ display: "block", border: `2px dashed ${dragging ? "var(--color-brand-400)" : file ? "var(--color-brand-600)" : "var(--color-border)"}`, borderRadius: 12, padding: "36px 24px", textAlign: "center", background: dragging ? "var(--color-success-bg)" : file ? "rgba(34,197,94,0.04)" : "var(--color-surface-1)", transition: "all 0.2s" }}
          >
            {file ? (
              <div>
                <CheckCircle2 size={28} style={{ color: "var(--color-brand-400)", margin: "0 auto 10px" }} />
                <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{file.name}</div>
                <div id="xml-upload-help" style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB · Drop another file below to change</div>
              </div>
            ) : (
              <div>
                <Upload size={28} style={{ color: "var(--color-text-muted)", margin: "0 auto 10px" }} />
                <div style={{ fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 5 }}>Drop your XML file here</div>
                <div id="xml-upload-help" style={{ color: "var(--color-text-muted)", fontSize: 12 }}>or choose one from your device below</div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <input
              id="xml-upload"
              ref={inputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              aria-describedby="xml-upload-help"
              onChange={(e) => handleNativeFileSelect(e.currentTarget)}
              onInput={(e) => handleNativeFileSelect(e.currentTarget)}
              style={{ minWidth: 280, color: "var(--color-text-secondary)", fontSize: 13 }}
            />
            <button type="button" onClick={syncFileFromInput} className="btn btn-secondary" style={{ padding: "7px 12px", fontSize: 12 }}>
              Use Selected File
            </button>
            <div style={{ color: selectedName ? "var(--color-text-primary)" : "var(--color-text-muted)", fontSize: 13 }}>
              {selectedName || "No file selected"}
            </div>
          </div>
        </div>

        {workflow === "compare" && (
          <div>
            <div style={{ color: "var(--color-text-muted)", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>3 · Upload current XML file</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 10, padding: "16px 18px" }}>
              <input
                ref={currentInputRef}
                type="file"
                accept=".xml,text/xml,application/xml"
                onChange={(e) => handleCurrentFileSelect(e.currentTarget)}
                onInput={(e) => handleCurrentFileSelect(e.currentTarget)}
                style={{ minWidth: 280, color: "var(--color-text-secondary)", fontSize: 13 }}
              />
              <div style={{ color: currentSelectedName ? "var(--color-text-primary)" : "var(--color-text-muted)", fontSize: 13 }}>
                {currentSelectedName || "No current file selected"}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: "var(--color-error-bg)", border: "1px solid var(--color-error-border)", borderRadius: 9, padding: "11px 15px", display: "flex", alignItems: "center", gap: 9, color: "var(--color-error-text)", fontSize: 13 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <button onClick={run} disabled={processing} className="btn btn-primary" style={{ width: "100%", padding: "13px", fontSize: 14, borderRadius: 10, opacity: processing ? 0.5 : 1, cursor: processing ? "not-allowed" : "pointer" }}>
          {processing ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Processing…</> : <>{wIcon} {wLabel}</>}
        </button>
      </div>

      <p style={{ color: "var(--color-text-muted)", fontSize: 11, marginTop: 36, textAlign: "center" }}>
        Built by Wellington-Dufferin-Guelph Public Health · MIT License
      </p>
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
    <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "36px 24px 80px" }}>
      <button onClick={onBack} className="btn btn-ghost" style={{ marginBottom: 20, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Back
      </button>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 28 }}>
        <div style={{ background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)", borderRadius: 9, padding: 9, flexShrink: 0 }}>
          <AlertTriangle size={20} style={{ color: "var(--color-warning-text)" }} />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 5px" }}>Manual Review Required</h1>
          <p style={{ color: "var(--color-text-secondary)", margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            {issues.length} issue{issues.length !== 1 ? "s" : ""} need your attention.
          </p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, marginBottom: 28, background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 9, padding: "12px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: "var(--color-warning-text)" }}>{issues.filter(i => i.type === "street_number").length}</span>
          <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>street numbers</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: "var(--color-teal-400)" }}>{issues.filter(i => i.type === "unit").length}</span>
          <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>unit fields</span>
        </div>
        <div style={{ marginLeft: "auto", color: "var(--color-text-muted)", fontSize: 11, alignSelf: "center" }}>
          {session.stats?.phones_cleaned ?? 0} phones fixed · {session.stats?.units_standardized ?? 0} units standardized
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {issues.map((issue, idx) => {
          const isStreet = issue.type === "street_number";
          const accent = isStreet ? "var(--color-warning-text)" : "var(--color-teal-400)";
          const accentBg = isStreet ? "var(--color-warning-bg)" : "rgba(20,184,166,0.08)";
          const accentBorder = isStreet ? "var(--color-warning-border)" : "rgba(20,184,166,0.3)";
          const key = isStreet ? `${issue.id}_number` : `${issue.id}_unit`;
          return (
            <div key={issue.id} className="card" style={{ padding: "18px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ background: accentBg, border: `1px solid ${accentBorder}`, borderRadius: 99, padding: "2px 9px", fontSize: 10, fontWeight: 700, color: accent, letterSpacing: "0.05em" }}>
                    {isStreet ? "STREET NUMBER" : "UNIT FIELD"}
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
  const baseName = session.fileName.replace(/\.xml$/i, "");

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
    <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "36px 24px 80px" }}>
      <button onClick={onStartOver} className="btn btn-ghost" style={{ marginBottom: 22, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Process another file
      </button>
      <div style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)", borderRadius: 11, padding: "18px 22px", display: "flex", alignItems: "center", gap: 14, marginBottom: 30 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 24 }}>
            <StatCard label="Phones Fixed"        value={session.stats.phones_cleaned}   accent="green" />
            <StatCard label="Phones Cleared"      value={session.stats.phones_blank}     accent="yellow" />
            <StatCard label="Units Standardized"  value={session.stats.units_standardized} accent="teal" />
            <StatCard label="Issues Reviewed"     value={(session.stats.street_review ?? 0) + (session.stats.units_review ?? 0)} />
          </div>
          <div className="card" style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ background: "var(--color-success-bg)", borderRadius: 8, padding: 9 }}><Wand2 size={18} style={{ color: "var(--color-brand-400)" }} /></div>
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
            <div style={{ background: "rgba(167,139,250,0.1)", borderRadius: 8, padding: 9 }}><FileText size={18} style={{ color: "#a78bfa" }} /></div>
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 24 }}>
              <StatCard label="Total Students"         value={exp.allStudents.length}      accent="green" />
              <StatCard label="Filtered (Gr7–8 12/13)" value={exp.filteredStudents.length} accent="teal" />
              <StatCard label="Schools"                value={schoolCount} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {([
                { icon: <Users size={16} style={{ color: "var(--color-brand-400)" }} />,   title: `${baseName}_all_students.csv`,   sub: `${exp.allStudents.length} students`,                       fn: () => dlCsv(exp.allStudents as unknown as Record<string,unknown>[],      "all_students") },
                { icon: <Users size={16} style={{ color: "var(--color-teal-400)" }} />,    title: `${baseName}_filtered.csv`,       sub: `${exp.filteredStudents.length} Gr7–8 born 2012–2013`,      fn: () => dlCsv(exp.filteredStudents as unknown as Record<string,unknown>[],  "filtered") },
                { icon: <School size={16} style={{ color: "#a78bfa" }} />,                 title: `${baseName}_school_counts.csv`,  sub: "Students per school per birth year",                       fn: () => dlCsv(exp.schoolCounts as unknown as Record<string,unknown>[],      "school_counts") },
                { icon: <BarChart3 size={16} style={{ color: "var(--color-warning-text)" }} />, title: `${baseName}_grade_counts.csv`, sub: "Students per school per grade",                        fn: () => dlCsv(exp.gradeCounts as unknown as Record<string,unknown>[],       "grade_counts") },
              ] as const).map(({ icon, title, sub, fn }) => (
                <div key={title} className="card" style={{ padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                    <div style={{ background: "var(--color-surface-2)", borderRadius: 7, padding: 8 }}>{icon}</div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 12, fontFamily: "var(--font-mono)", marginBottom: 2 }}>{title}</div>
                      <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{sub}</div>
                    </div>
                  </div>
                  <button onClick={fn} className="btn btn-secondary" style={{ gap: 5, fontSize: 12, padding: "6px 13px" }}><Download size={12} /> CSV</button>
                </div>
              ))}
              <div style={{ background: "var(--color-surface-1)", border: "2px solid var(--color-brand-600)", borderRadius: 11, padding: "15px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ background: "var(--color-success-bg)", borderRadius: 8, padding: 9 }}><FileText size={18} style={{ color: "var(--color-brand-400)" }} /></div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{baseName}_report.xlsx</div>
                    <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>All 4 sheets in one Excel workbook</div>
                  </div>
                </div>
                <button onClick={dlExcel} className="btn btn-primary" style={{ gap: 7 }}><Download size={14} /> Excel</button>
              </div>
            </div>

            {/* ── Custom Filter & Export ───────────────────────────────────── */}
            <div style={{ marginTop: 32, borderRadius: 12, border: "1px solid rgba(45,212,191,0.3)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "rgba(45,212,191,0.06)", borderBottom: "1px solid rgba(45,212,191,0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ background: "rgba(45,212,191,0.15)", borderRadius: 7, padding: 7, display: "flex" }}>
                    <SlidersHorizontal size={16} style={{ color: "var(--color-teal-400)" }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--color-text-primary)" }}>Filter &amp; Export Custom Report</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>Narrow by school, grade, gender, or age — then download a targeted CSV or Excel</div>
                  </div>
                </div>
              </div>

              <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16, background: "var(--color-surface-1)" }}>
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

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, background: "var(--color-surface-2)", borderRadius: 9, padding: "12px 16px", border: "1px solid var(--color-border)" }}>
                  <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                    <span style={{ fontWeight: 800, color: "var(--color-teal-400)", fontSize: 22, lineHeight: 1 }}>{customStudents.length}</span>
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
  const [viewMode, setViewMode] = useState<"schools" | "records">("records");
  const [selectedSchool, setSelectedSchool] = useState("all");
  const signalColor = comparison.signal === "stable" ? "var(--color-brand-400)" : comparison.signal === "moderate" ? "var(--color-warning-text)" : "var(--color-error-text)";
  const signalBackground = comparison.signal === "stable" ? "var(--color-success-bg)" : comparison.signal === "moderate" ? "var(--color-warning-bg)" : "var(--color-error-bg)";
  const visibleRecords = selectedSchool === "all" ? comparison.recordChanges : comparison.recordChanges.filter((record) => record.schoolName === selectedSchool);
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

  return (
    <main className="compare-results-main compare-dashboard" style={{ flex: 1, maxWidth: "none", width: "100%", margin: 0, padding: "16px 4vw 24px" }}>
      <button onClick={onStartOver} className="btn btn-ghost" style={{ marginBottom: 8, padding: "4px 8px", gap: 5, fontSize: 12 }}>
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

      <div className="compare-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 18 }}>
        <StatCard label="Records added" value={comparison.addedCount} accent="green" />
        <StatCard label="Records removed" value={comparison.removedCount} accent="red" />
        <StatCard label="Records changed" value={comparison.changedCount} accent="yellow" />
        <StatCard label="No change" value={comparison.unchangedCount} accent="teal" />
        <StatCard label="Moved schools" value={comparison.movedCount} accent="teal" />
      </div>

      <div className="compare-signal" style={{ background: signalBackground, border: `1px solid ${signalColor}`, borderRadius: 11, padding: "12px 16px", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: signalColor }}>{comparison.recommendation}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: signalColor }}>{comparison.changeRate.toFixed(1)}%</div>
        </div>
        <div style={{ color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.55 }}>{comparison.recommendationDetail}</div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 11, marginTop: 9 }}>Observed change rate = added + removed + changed records ÷ previous records. This is an operational signal, not a replacement for required reporting schedules.</div>
      </div>

      <div className="compare-context-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <StatCard label="Previous records" value={comparison.previousStudentCount} />
        <StatCard label="Current records" value={comparison.currentStudentCount} />
        <StatCard label="Matched records" value={comparison.matchedCount} />
        <StatCard label="Schools" value={`${comparison.previousSchoolCount} → ${comparison.currentSchoolCount}`} />
      </div>

      <details className="card compare-collapsible" style={{ marginBottom: 12 }}>
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

      <details className="card compare-collapsible" style={{ marginBottom: 18 }}>
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
        </div>
        {viewMode === "records" && (
          <select className="input compare-school-filter" value={selectedSchool} onChange={(event) => setSelectedSchool(event.target.value)} aria-label="Filter records by school">
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
              <tbody>{comparison.schoolChanges.map((school) => <tr key={school.schoolName} onClick={() => { setSelectedSchool(school.schoolName); setViewMode("records"); }} style={{ cursor: "pointer" }}><td style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{school.schoolName}</td><td>{school.previousCount}</td><td>{school.currentCount}</td><td>{school.added}</td><td>{school.removed}</td><td>{school.changed}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="compare-record-layout">
        <section className="card compare-school-panel" style={{ padding: "16px" }}>
          <div style={{ marginBottom: 12 }}><h2 style={{ fontSize: 15, margin: "0 0 3px" }}>Schools</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>Select a school to focus the records.</p></div>
          <div className="compare-table-scroll" style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>School</th><th>Δ</th></tr></thead>
              <tbody>{comparison.schoolChanges.map((school) => <tr key={school.schoolName} onClick={() => setSelectedSchool(school.schoolName)} style={{ cursor: "pointer" }}><td style={{ color: "var(--color-text-primary)", fontWeight: selectedSchool === school.schoolName ? 700 : 500 }}>{school.schoolName}</td><td style={{ color: school.added + school.removed + school.changed > 0 ? "var(--color-warning-text)" : "var(--color-text-muted)" }}>{school.added + school.removed + school.changed}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
        <section className="card compare-detail-card" style={{ padding: "18px 20px" }}>
          <div style={{ marginBottom: 14 }}><h2 style={{ fontSize: 16, margin: "0 0 3px" }}>Record details</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>{selectedSchool === "all" ? "Specific records added, removed, or changed across all schools." : `Changes for ${selectedSchool}.`} Records are matched by OEN when available.</p></div>
          {visibleRecords.length === 0 ? <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>No record-level differences were detected{selectedSchool === "all" ? "." : " for this school."}</p> : <div className="compare-table-scroll" style={{ overflowX: "auto" }}><table className="data-table"><thead><tr><th>Change</th><th>Student</th><th>School</th><th>Changed fields</th></tr></thead><tbody>{visibleRecords.map((record) => { const color = record.kind === "added" ? "var(--color-brand-400)" : record.kind === "removed" ? "var(--color-error-text)" : "var(--color-warning-text)"; return <tr key={`${record.kind}-${record.key}`}><td><span style={{ color, fontWeight: 700, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.05em" }}>{record.kind}</span></td><td style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{record.studentName}</td><td>{record.schoolName}</td><td>{record.changedFields.length ? record.changedFields.join(", ") : "—"}</td></tr>; })}</tbody></table></div>}
        </section>
        {selectedSchoolSummary && (
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
            <button className="btn btn-ghost" onClick={() => setSelectedSchool("all")} style={{ marginTop: 10, padding: "5px 0", fontSize: 12 }}>Clear school filter</button>
          </aside>
        )}
        </div>
      )}
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
    <main style={{ flex: 1, maxWidth: 960, width: "100%", margin: "0 auto", padding: "32px 24px 80px" }}>
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 22 }}>
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
      <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
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
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-teal-400)" }}>{issue.field || "—"}</td>
                      <td>
                        {currentValue ? (
                          <code style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: "2px 6px", fontSize: 11 }}>{currentValue}</code>
                        ) : <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ maxWidth: 280, fontSize: 12, lineHeight: 1.5 }}>{issue.message}</td>
                      <td>
                        {issue.suggestedFix ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <code style={{ background: "rgba(20,184,166,0.1)", borderRadius: 4, padding: "2px 6px", fontSize: 11, color: "var(--color-teal-400)" }}>{issue.suggestedFix}</code>
                            {issue.autoFixable && (
                              <span style={{ fontSize: 9, background: "rgba(20,184,166,0.15)", color: "var(--color-teal-400)", borderRadius: 3, padding: "1px 5px", fontWeight: 700 }}>AUTO</span>
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
    <main style={{ flex: 1, maxWidth: 960, width: "100%", margin: "0 auto", padding: "32px 24px 80px" }}>
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
      <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 9, padding: "10px 16px", marginBottom: 20, fontSize: 12, color: "#a5b4fc" }}>
        <strong>Bulk-safe fixes</strong> are pre-filled automatically: whitespace trimming, grade/gender code normalization, deterministic date reformatting.
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
      <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
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
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-teal-400)" }}>{issue.field || <span style={{ color: "var(--color-text-muted)", fontFamily: "inherit" }}>—</span>}</td>
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
    const revalidated = validateXml(fixedXml);
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
    <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "32px 24px 80px" }}>
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
          <div style={{ background: "var(--color-surface-1)", border: "1px solid var(--color-border)", borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
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
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-teal-400)" }}>{fix.field}</td>
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
        <div style={{ background: "var(--color-error-bg)", border: "1px solid var(--color-error-border)", borderRadius: 9, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "var(--color-error-text)" }}>
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
    <div style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "12px 14px", flex: "1 1 150px", minWidth: 0 }}>
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
            <label key={opt} style={{ display: "flex", alignItems: "center", gap: 7, padding: "3px 4px", borderRadius: 4, cursor: "pointer", fontSize: 12, color: "var(--color-text-primary)", background: selected.includes(opt) ? "rgba(34,197,94,0.08)" : "transparent" }}>
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
    <div style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "12px 14px", flex: "1 1 180px", minWidth: 0 }}>
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
              <span style={{ fontWeight: 700, color: "var(--color-brand-400)" }}>{minAge}</span>
            </div>
            <input type="range" min={minBound} max={maxBound} value={minAge} onChange={(e) => onChange(parseInt(e.target.value), Math.max(parseInt(e.target.value), maxAge))} style={{ width: "100%", accentColor: "var(--color-brand-500)" }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--color-text-muted)", marginBottom: 3 }}>
              <span>Max age</span>
              <span style={{ fontWeight: 700, color: "var(--color-brand-400)" }}>{maxAge}</span>
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
    <main style={{ flex: 1, maxWidth: 780, width: "100%", margin: "0 auto", padding: "36px 24px 80px" }}>
      <button onClick={onStartOver} className="btn btn-ghost" style={{ marginBottom: 22, padding: "5px 9px", gap: 5, fontSize: 13 }}>
        <ArrowLeft size={13} /> Process another file
      </button>

      {/* Gate banner */}
      <div style={{
        background: gate === "READY" ? "var(--color-success-bg)" : "var(--color-error-bg)",
        border: `1px solid ${gate === "READY" ? "var(--color-success-border)" : "var(--color-error-border)"}`,
        borderRadius: 12,
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 28,
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 28 }}>
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
            <div style={{ background: gate === "READY" ? "var(--color-success-bg)" : "var(--color-error-bg)", borderRadius: 8, padding: 9 }}>
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

        {/* Issue report CSV */}
        <div className="card" style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: "var(--color-surface-2)", borderRadius: 8, padding: 9 }}>
              <BarChart3 size={18} style={{ color: "var(--color-teal-400)" }} />
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

      {/* ── Filter & Report section ─────────────────────────────────────────── */}
      <div style={{ marginTop: 32, borderRadius: 12, border: "1px solid rgba(45,212,191,0.3)", overflow: "hidden" }}>
        {/* Section header */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "rgba(45,212,191,0.06)", border: "none", borderBottom: showFilters ? "1px solid rgba(45,212,191,0.2)" : "none", cursor: "pointer", textAlign: "left" as const }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "rgba(45,212,191,0.15)", borderRadius: 7, padding: 7, display: "flex" }}>
              <SlidersHorizontal size={16} style={{ color: "var(--color-teal-400)" }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--color-text-primary)" }}>Filter &amp; Export Reports</div>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 1 }}>
                Narrow by school, grade, gender, or age — then download targeted CSVs
              </div>
            </div>
          </div>
          <span style={{ fontSize: 12, color: "var(--color-teal-400)", fontWeight: 600, flexShrink: 0, marginLeft: 12 }}>
            {showFilters ? "▲ Collapse" : "▼ Expand"}
          </span>
        </button>

        {showFilters && (
          <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16, background: "var(--color-surface-1)" }}>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, background: "var(--color-surface-2)", borderRadius: 9, padding: "12px 16px", border: "1px solid var(--color-border)" }}>
              <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                <span style={{ fontWeight: 800, color: "var(--color-teal-400)", fontSize: 22, lineHeight: 1 }}>{filteredRecords.length}</span>
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

  const goHome = () => { setView("home"); setSession(null); setValidateSess(null); setComparison(null); };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <NavBar />

      {view === "home" && (
        <HomeView
          onDone={(data, next) => { setSession(data); setView(next); }}
          onValidate={(vs) => { setValidateSess(vs); setView("validate-issues"); }}
          onCompare={(result) => { setComparison(result); setView("compare"); }}
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
