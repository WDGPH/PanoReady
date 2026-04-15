"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Upload, Wand2, FileSpreadsheet, FileText,
  CheckCircle2, AlertCircle, Loader2, ArrowLeft,
  ArrowRight, AlertTriangle, MapPin, School,
  Download, Users, BarChart3, ShieldCheck,
} from "lucide-react";
import { cleanXml, applyReviewUpdates, prettyPrintXml } from "@/lib/cleaner";
import { processExport } from "@/lib/pullInfo";
import { downloadText, toCsv } from "@/lib/utils";
import type { Workflow, SessionData } from "@/lib/types";
import * as XLSX from "xlsx";

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "home" | "review" | "result";

// ─── NavBar ──────────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <header style={{ background: "var(--color-surface-1)", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ maxWidth: 840, margin: "0 auto", padding: "0 24px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: "linear-gradient(135deg,#22c55e,#14b8a6)", borderRadius: 7, padding: "3px 9px", fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: "0.05em", fontFamily: "var(--font-mono)" }}>
            TWIG
          </span>
          <span style={{ color: "var(--color-text-secondary)", fontSize: 14, fontWeight: 500 }}>STIX Cleaner</span>
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

function StatCard({ label, value, accent = "default" }: { label: string; value: number | string; accent?: "green"|"teal"|"yellow"|"default" }) {
  const colors = { green: "var(--color-brand-400)", teal: "var(--color-teal-400)", yellow: "var(--color-warning-text)", default: "var(--color-text-primary)" };
  const bgs   = { green: "var(--color-success-bg)", teal: "rgba(20,184,166,0.08)", yellow: "var(--color-warning-bg)", default: "var(--color-surface-2)" };
  return (
    <div style={{ background: bgs[accent], borderRadius: 10, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: colors[accent] }}>{value}</div>
    </div>
  );
}

// ─── Workflows config ────────────────────────────────────────────────────────

const WORKFLOWS: { id: Workflow; icon: React.ReactNode; label: string; description: string; color: string }[] = [
  { id: "clean",  icon: <Wand2 size={20} />,          label: "Clean XML",       description: "Fix phones, standardize units, flag bad street numbers for manual review.", color: "var(--color-brand-400)" },
  { id: "export", icon: <FileSpreadsheet size={20} />, label: "Export Reports",  description: "Parse students into spreadsheet. Filter Gr7–8 born 2012–2013 with school summaries.", color: "var(--color-teal-400)" },
  { id: "pretty", icon: <FileText size={20} />,        label: "Pretty Print",    description: "Reformat the XML with consistent indentation.", color: "#a78bfa" },
];

// ─── HomeView ─────────────────────────────────────────────────────────────────

function HomeView({ onDone }: { onDone: (data: SessionData, next: View) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile]           = useState<File | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [workflow, setWorkflow]   = useState<Workflow>("clean");
  const [dragging, setDragging]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

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
    // Fallback sync for environments where file input events can be flaky.
    const intervalId = window.setInterval(() => {
      const selectedFile = inputRef.current?.files?.[0];
      if (!selectedFile) return;

      const currentFile = file;
      if (
        currentFile &&
        currentFile.name === selectedFile.name &&
        currentFile.size === selectedFile.size &&
        currentFile.lastModified === selectedFile.lastModified
      ) {
        return;
      }

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
      const xmlText = await (async (f: File) => {
        try {
          if (typeof f.text === "function") {
            return await f.text();
          }
        } catch {
          // Fall through to FileReader path.
        }

        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
              return;
            }
            if (reader.result instanceof ArrayBuffer) {
              resolve(new TextDecoder().decode(reader.result));
              return;
            }
            reject(new Error("Unable to read file as text."));
          };
          reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
          reader.readAsText(f);
        });
      })(selectedFile);

      if (!xmlText.trim().startsWith("<")) {
        throw new Error("Selected file is not XML text.");
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

  return (
    <main className="grid-bg" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 24px 80px" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 48, maxWidth: 560 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)", borderRadius: 99, padding: "4px 14px", fontSize: 12, color: "var(--color-success-text)", marginBottom: 18, fontWeight: 500 }}>
          <CheckCircle2 size={12} /> 100% in-browser · No server · No data upload
        </div>
        <h1 style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.1, margin: "0 0 14px" }}>
          <span className="gradient-text">STIX XML</span> Cleaner
        </h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 15, lineHeight: 1.7, margin: 0 }}>
          Clean, validate, and export Ontario school enrollment data. Student records never leave your device.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Workflow selector */}
        <div>
          <div style={{ color: "var(--color-text-muted)", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>1 · Choose workflow</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
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

        {error && (
          <div style={{ background: "var(--color-error-bg)", border: "1px solid var(--color-error-border)", borderRadius: 9, padding: "11px 15px", display: "flex", alignItems: "center", gap: 9, color: "var(--color-error-text)", fontSize: 13 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <button onClick={run} disabled={processing} className="btn btn-primary" style={{ width: "100%", padding: "13px", fontSize: 14, borderRadius: 10, opacity: processing ? 0.5 : 1, cursor: processing ? "not-allowed" : "pointer" }}>
          {processing ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Processing…</> : <><Wand2 size={16} />{workflow === "clean" ? "Clean XML" : workflow === "export" ? "Generate Reports" : "Pretty Print XML"}</>}
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
      const cleanXml = applyReviewUpdates(session.autoCleanXml, updates);
      onDone({ ...session, cleanXml });
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
            {issues.length} issue{issues.length !== 1 ? "s" : ""} need your attention. Correct each one below, or clear the field to leave it blank.
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

      {/* Clean workflow */}
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

      {/* Pretty print */}
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

      {/* Export workflow */}
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

              {/* Excel bundle */}
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
          </>
        );
      })()}
    </main>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView]       = useState<View>("home");
  const [session, setSession] = useState<SessionData | null>(null);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <NavBar />
      {view === "home" && (
        <HomeView
          onDone={(data, next) => { setSession(data); setView(next); }}
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
        <ResultView
          session={session}
          onStartOver={() => { setSession(null); setView("home"); }}
        />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
