"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, ChevronRight, FileText, Loader2 } from "lucide-react";
import { decodeWorkbook, importDecodedWorkbook, workbookMetadata, workbookSetupChanges } from "@/lib/excel";
import type { DecodedWorkbook, XlsmMetadata } from "@/lib/excel";
import type { CanonicalUpload } from "@/lib/canonical";
import type { AppliedFix, ImportPreview, STIXComparison, Workflow } from "@/lib/types";
import type { DateConvention, DateFieldAnalysis } from "@/lib/calendar";
import StatCard from "@/components/StatCard";
import { compareSTIXFiles } from "@/lib/compare";

export interface ValidateWorkflowInput {
  xml: string;
  fileName: string;
  dateAssumption?: string;
  document?: CanonicalUpload;
  inputFormat?: "STIX XML" | "XLSM workbook";
  importTransformationCount?: number;
  initialSetupChanges?: AppliedFix[];
  originalCreatedBy?: string;
}

// ─── Workflows config ────────────────────────────────────────────────────────

const WORKFLOWS: { id: Workflow; label: string; description: string }[] = [
  { id: "validate", label: "Validate & Fix",  description: "Find STIX issues, review automatic corrections, and download your corrected file." },
  { id: "compare",  label: "Compare Files",   description: "Compare two files and inspect record, field, and school-level changes." },
];

const FILE_ACCEPT = ".xml,.xlsm,text/xml,application/xml,application/vnd.ms-excel.sheet.macroEnabled.12";

function FileDropZone({
  id,
  label,
  emptyLabel,
  file,
  inputRef,
  dragging,
  onSelect,
  onDrop,
  onDraggingChange,
}: {
  id: string;
  label?: string;
  emptyLabel: string;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  dragging: boolean;
  onSelect: (target: HTMLInputElement) => void;
  onDrop: (event: React.DragEvent) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const helpId = `${id}-help`;

  return (
    <section className="file-field">
      {label && <h2>{label}</h2>}
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={FILE_ACCEPT}
        aria-describedby={helpId}
        onChange={(event) => onSelect(event.currentTarget)}
        hidden
      />
      <div
        className={`file-dropzone${dragging ? " dragging" : ""}`}
        onDrop={onDrop}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDraggingChange(true);
        }}
        onDragLeave={() => onDraggingChange(false)}
      >
        <FileText className="file-dropzone-icon" size={34} strokeWidth={1.4} aria-hidden="true" />
        <div className="file-dropzone-copy">
          <p>{file?.name ?? emptyLabel}</p>
          <span id={helpId}>
            {file ? `${(file.size / 1024).toFixed(1)} KB · drop another file to change` : "or click Browse"}
          </span>
        </div>
        <button type="button" className="file-browse" onClick={() => {
          if (!inputRef.current) return;
          inputRef.current.value = "";
          inputRef.current.click();
        }}>
          Browse
        </button>
      </div>
    </section>
  );
}

// ─── HomeView ─────────────────────────────────────────────────────────────────

export default function STIXIntake({ onValidate, onCompare }: {
  onValidate: (input: ValidateWorkflowInput) => void;
  onCompare: (comparison: STIXComparison) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const currentInputRef = useRef<HTMLInputElement>(null);
  const fileRevision = useRef(0);
  const currentFileRevision = useRef(0);
  const [file, setFile]           = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [workflow, setWorkflow]   = useState<Workflow>("validate");
  const [dragging, setDragging]   = useState(false);
  const [pageDragging, setPageDragging] = useState(false);
  const [currentDragging, setCurrentDragging] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<string | null>(null);
  const activeOperation = useRef<AbortController | null>(null);
  const [xlsmMeta, setXlsmMeta] = useState<XlsmMetadata | null>(null);
  const [detectedXlsmMeta, setDetectedXlsmMeta] = useState<XlsmMetadata | null>(null);
  const [decodedWorkbook, setDecodedWorkbook] = useState<DecodedWorkbook | null>(null);
  const [xlsmPreview, setXlsmPreview] = useState<ImportPreview | null>(null);
  const [currentXlsmMeta, setCurrentXlsmMeta] = useState<XlsmMetadata | null>(null);
  const [decodedCurrentWorkbook, setDecodedCurrentWorkbook] = useState<DecodedWorkbook | null>(null);
  const [dateConvention, setDateConvention] = useState<DateConvention | undefined>();
  const [dateAnalysis, setDateAnalysis] = useState<DateFieldAnalysis | null>(null);
  const [currentDateConvention, setCurrentDateConvention] = useState<DateConvention | undefined>();
  const [currentDateAnalysis, setCurrentDateAnalysis] = useState<DateFieldAnalysis | null>(null);
  const [previousSourceSystem, setPreviousSourceSystem] = useState("");
  const [currentSourceSystem, setCurrentSourceSystem] = useState("");
  const [comparisonReviewer, setComparisonReviewer] = useState("");

  const handleFile = useCallback((f: File) => {
    fileRevision.current += 1;
    setError(null);
    setFile(f);
    setXlsmMeta(null);
    setDetectedXlsmMeta(null);
    setDecodedWorkbook(null);
    setXlsmPreview(null);
    setDateConvention(undefined);
    setDateAnalysis(null);
  }, []);

  useEffect(() => {
    if (!file || !/\.xlsm$/i.test(file.name)) return;
    let cancelled = false;
    file.arrayBuffer().then((data) => {
      if (cancelled) return;
      const decoded = decodeWorkbook(data, file.name);
      const detected = workbookMetadata(decoded);
      setDecodedWorkbook(decoded);
      setDetectedXlsmMeta(detected);
      setXlsmMeta(detected);
    }).catch((err) => {
      if (!cancelled) setError(`Could not read workbook metadata: ${err instanceof Error ? err.message : String(err)}`);
    });
    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    if (!decodedWorkbook || !detectedXlsmMeta) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const imported = importDecodedWorkbook(decodedWorkbook, detectedXlsmMeta, dateConvention);
      setXlsmPreview(imported.preview);
      setDateAnalysis(imported.dateAnalysis);
    }).catch((err) => {
      if (!cancelled) setError(`Could not read workbook: ${err instanceof Error ? err.message : String(err)}`);
    });
    return () => { cancelled = true; };
  }, [decodedWorkbook, detectedXlsmMeta, dateConvention]);

  const handleNativeFileSelect = useCallback((target: HTMLInputElement) => {
    const selectedFile = target.files?.[0];
    if (!selectedFile) return;
    handleFile(selectedFile);
    target.value = "";
  }, [handleFile]);

  const handleCurrentFile = useCallback((f: File) => {
    currentFileRevision.current += 1;
    setError(null);
    setCurrentFile(f);
    setCurrentXlsmMeta(null);
    setDecodedCurrentWorkbook(null);
    setCurrentDateConvention(undefined);
    setCurrentDateAnalysis(null);
  }, []);

  useEffect(() => {
    if (!currentFile || !/\.xlsm$/i.test(currentFile.name)) return;
    let cancelled = false;
    currentFile.arrayBuffer().then((data) => {
      if (cancelled) return;
      const decoded = decodeWorkbook(data, currentFile.name);
      setDecodedCurrentWorkbook(decoded);
      setCurrentXlsmMeta(workbookMetadata(decoded));
    }).catch((err) => {
      if (!cancelled) setError(`Could not read current workbook metadata: ${err instanceof Error ? err.message : String(err)}`);
    });
    return () => { cancelled = true; };
  }, [currentFile]);

  useEffect(() => {
    if (!decodedCurrentWorkbook) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      setCurrentDateAnalysis(importDecodedWorkbook(decodedCurrentWorkbook, workbookMetadata(decodedCurrentWorkbook), currentDateConvention).dateAnalysis);
    }).catch((err) => {
      if (!cancelled) setError(`Could not inspect current workbook dates: ${err instanceof Error ? err.message : String(err)}`);
    });
    return () => { cancelled = true; };
  }, [decodedCurrentWorkbook, currentDateConvention]);

  const handleCurrentFileSelect = useCallback((target: HTMLInputElement) => {
    const selectedFile = target.files?.[0];
    if (selectedFile) {
      handleCurrentFile(selectedFile);
      target.value = "";
    }
  }, [handleCurrentFile]);

  const onCurrentDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setCurrentDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleCurrentFile(f);
  }, [handleCurrentFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const enter = (event: DragEvent) => {
      if (!hasFiles(event) || workflow !== "validate" || processing) return;
      depth += 1;
      setPageDragging(true);
    };
    const over = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (workflow === "validate" && event.dataTransfer) event.dataTransfer.dropEffect = processing ? "none" : "copy";
    };
    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setPageDragging(false);
    };
    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setPageDragging(false);
      if (workflow !== "validate") return; // Comparison keeps its explicit previous/current targets.
      event.stopPropagation();
      setDragging(false);
      if (processing) return;
      const files = event.dataTransfer?.files;
      if (!files?.length) return;
      if (files.length !== 1) { setError("Drop one XML or XLSM file at a time."); return; }
      handleFile(files[0]);
    };
    window.addEventListener("dragenter", enter, true);
    window.addEventListener("dragover", over, true);
    window.addEventListener("dragleave", leave, true);
    window.addEventListener("drop", drop, true);
    return () => {
      window.removeEventListener("dragenter", enter, true);
      window.removeEventListener("dragover", over, true);
      window.removeEventListener("dragleave", leave, true);
      window.removeEventListener("drop", drop, true);
    };
  }, [handleFile, processing, workflow]);

  const run = async () => {
    const selectedFile = file;
    if (!selectedFile) { setError("Please select a file first."); return; }
    const selectedRevision = fileRevision.current;
    const operation = new AbortController();
    activeOperation.current?.abort();
    activeOperation.current = operation;
    setProcessing(true); setError(null);
    setProcessingProgress("Reading selected input");
    try {
      const selectedInput = await readInputAsSTIX(selectedFile, xlsmMeta ?? undefined, dateConvention, decodedWorkbook ?? undefined);
      if (operation.signal.aborted) throw new DOMException("The operation was cancelled.", "AbortError");
      const xmlText = selectedInput.xml;
      if (selectedRevision !== fileRevision.current) throw new Error("The selected file changed while it was being read. Run the current selection again.");

      if (workflow === "compare") {
        if (selectedInput.document?.diagnostics.some((finding) => finding.severity === "error")) throw new Error("The previous workbook has unresolved import findings. Validate and repair it before comparison.");
        const selectedCurrentFile = currentFile;
        if (!selectedCurrentFile) throw new Error("Please select the current XML file as well.");
        const selectedCurrentRevision = currentFileRevision.current;
        const currentInput = await readInputAsSTIX(selectedCurrentFile, currentXlsmMeta ?? undefined, currentDateConvention, decodedCurrentWorkbook ?? undefined);
        if (operation.signal.aborted) throw new DOMException("The operation was cancelled.", "AbortError");
        if (currentInput.document?.diagnostics.some((finding) => finding.severity === "error")) throw new Error("The current workbook has unresolved import findings. Validate and repair it before comparison.");
        const currentXmlText = currentInput.xml;
        if (selectedRevision !== fileRevision.current || selectedCurrentRevision !== currentFileRevision.current) throw new Error("A selected file changed while it was being read. Run the current selections again.");
        setProcessingProgress("Comparing records");
        const comparison = compareSTIXFiles(xmlText, currentXmlText, selectedFile.name, selectedCurrentFile.name);
        if (operation.signal.aborted) throw new DOMException("The operation was cancelled.", "AbortError");
        if (selectedRevision !== fileRevision.current || selectedCurrentRevision !== currentFileRevision.current) throw new Error("A selected file changed while comparison was running. Run the current selections again.");
        onCompare({ ...comparison, previousSourceSystem: previousSourceSystem.trim() || undefined, currentSourceSystem: currentSourceSystem.trim() || undefined, reviewer: comparisonReviewer.trim() || undefined });
        return;
      }

      const document = selectedInput.document;
      if (operation.signal.aborted) throw new DOMException("The operation was cancelled.", "AbortError");
      onValidate({
        xml: xmlText, fileName: selectedFile.name,
        dateAssumption: dateAnalysis ? `${dateAnalysis.classification}; ${dateConvention ?? "no text convention selected"}; canonical output YYYY-MM-DD` : undefined,
        document,
        inputFormat: selectedInput.inputFormat,
        importTransformationCount: selectedInput.transformationCount,
        initialSetupChanges: selectedInput.document && detectedXlsmMeta ? workbookSetupChanges(detectedXlsmMeta, selectedInput.document) : undefined,
        originalCreatedBy: detectedXlsmMeta?.createdBy ?? document?.metadata.createdBy,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") { setProcessing(false); setProcessingProgress(null); return; }
      setError(`Processing failed: ${err instanceof Error ? err.message : String(err)}`);
      setProcessing(false);
      setProcessingProgress(null);
    }
  };
  const cancelProcessing = () => {
    activeOperation.current?.abort();
    activeOperation.current = null;
    setProcessing(false);
    setProcessingProgress(null);
  };

  const wLabel = workflow === "validate" ? "Validate & Fix" : "Compare Files";

  return (
    <main className="intake-main">
      {pageDragging && workflow === "validate" && !processing && <div className="page-file-drop" role="status"><span>Drop your XML or XLSM file anywhere</span></div>}
      <div className="intake-shell">
        <header className="landing-intro" id="intro">
          <div>
            <h1>Better data in.<br />Fewer problems later.</h1>
          </div>
          <p className="landing-lede">A workspace for preparing data for Panorama. Check school-enrolment files, review automatic corrections, and compare changes before import.</p>
        </header>
        <section id="tools" aria-label="File tools">
        <header className="workflow-context">
          <div className="workflow-tabs" role="group" aria-label="Workflow">
            {WORKFLOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                aria-pressed={workflow === w.id}
                onClick={() => {
                  setWorkflow(w.id);
                  setPageDragging(false);
                  setError(null);
                }}
                className={`workflow-tab${workflow === w.id ? " selected" : ""}`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <p>{WORKFLOWS.find((candidate) => candidate.id === workflow)?.description}</p>
        </header>

        <div className={`file-fields${workflow === "compare" ? " compare" : ""}`}>
          <FileDropZone
            id="xml-upload"
            label={workflow === "compare" ? "Previous file" : undefined}
            emptyLabel="Drop a supported XML or XLSM file here"
            file={file}
            inputRef={inputRef}
            dragging={dragging}
            onSelect={handleNativeFileSelect}
            onDrop={onDrop}
            onDraggingChange={setDragging}
          />

          {workflow === "compare" && (
            <FileDropZone
              id="xml-upload-current"
              label="Current file"
              emptyLabel="Drop a supported XML or XLSM file here"
              file={currentFile}
              inputRef={currentInputRef}
              dragging={currentDragging}
              onSelect={handleCurrentFileSelect}
              onDrop={onCurrentDrop}
              onDraggingChange={setCurrentDragging}
            />
          )}
        </div>

        {workflow === "compare" && (file || currentFile) && <details className="advanced-options" open>
          <summary><ChevronRight size={16} aria-hidden="true" /> Comparison context</summary>
          <div className="advanced-options-content"><section className="advanced-section">
            <h2>Source and reviewer context</h2>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Optional local labels for the previous source, current source, and comparison review log. They remain in memory and never enter STIX XML.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 11 }}>Previous source system<input className="input" value={previousSourceSystem} onChange={(event) => setPreviousSourceSystem(event.target.value)} /></label>
              <label style={{ display: "grid", gap: 4, fontSize: 11 }}>Current source system<input className="input" value={currentSourceSystem} onChange={(event) => setCurrentSourceSystem(event.target.value)} /></label>
              <label style={{ display: "grid", gap: 4, fontSize: 11 }}>Comparison reviewer<input className="input" value={comparisonReviewer} onChange={(event) => setComparisonReviewer(event.target.value)} /></label>
            </div>
          </section></div>
        </details>}



        {(xlsmMeta || xlsmPreview || (workflow === "compare" && currentXlsmMeta)) && (
          <details className="advanced-options">
            <summary><ChevronRight size={16} aria-hidden="true" /> Workbook import settings</summary>
            <div className="advanced-options-content">

        {xlsmMeta && (
          <section className="advanced-section">
          <h2>{workflow === "compare" ? "Previous file details" : "File details"}</h2>
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

        {dateAnalysis && <DateSetup analysis={dateAnalysis} convention={dateConvention} onChange={setDateConvention} label={workflow === "compare" ? "Previous file birth dates" : "Birth dates"} />}

        {xlsmPreview && (
          <section className="advanced-section">
            <h2>Import preview</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
              <StatCard label="Worksheet" value={xlsmPreview.worksheet} />
              <StatCard label="Student rows" value={xlsmPreview.canonicalStudentCount} />
              <StatCard label="Import findings" value={xlsmPreview.diagnostics.length} accent={xlsmPreview.diagnostics.some((finding) => finding.severity === "error") ? "red" : "default"} />
            </div>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>
              Header row {xlsmPreview.headerRow}; data starts at row {xlsmPreview.firstDataRow}. Populated unknown or duplicate columns are outside the supported contract and block processing.
            </p>
            <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 4 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr><th style={{ textAlign: "left", padding: 7 }}>Source column</th><th style={{ textAlign: "left", padding: 7 }}>Canonical field</th><th style={{ textAlign: "left", padding: 7 }}>Status</th><th style={{ textAlign: "right", padding: 7 }}>Values</th></tr></thead>
                <tbody>{xlsmPreview.columns.map((column) => {
                  return (
                    <tr key={column.column} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td style={{ padding: 7 }}>{column.sourceHeader || `(column ${column.column})`}</td>
                      <td style={{ padding: 7, fontFamily: "var(--font-mono)" }}>{column.canonicalField || "—"}</td>
                      <td style={{ padding: 7, color: column.status === "MAPPED" ? "var(--color-text-secondary)" : column.populatedCount ? "var(--color-error-text)" : "var(--color-text-muted)" }}>{column.status}</td>
                      <td style={{ padding: 7, textAlign: "right" }}>{column.populatedCount}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            {xlsmPreview.diagnostics.map((finding) => <p key={finding.id} style={{ fontSize: 11, color: finding.severity === "error" ? "var(--color-error-text)" : "var(--color-warning-text)", margin: "8px 0 0" }}>{finding.message}</p>)}
          </section>
        )}

        {workflow === "compare" && currentXlsmMeta && (
            <section className="advanced-section">
              <h2>Current file details</h2>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.5, margin: "0 0 12px" }}>
                Review or update these values before the current workbook is converted for comparison.
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
                      <select className="input" value={currentXlsmMeta[key]} onChange={(event) => setCurrentXlsmMeta((current) => current ? { ...current, [key]: event.target.value } : current)}>
                        <option value="">Select</option><option value="YES">YES</option><option value="NO">NO</option>
                      </select>
                    ) : (
                      <input className="input" value={currentXlsmMeta[key]} onChange={(event) => setCurrentXlsmMeta((current) => current ? { ...current, [key]: event.target.value } : current)} />
                    )}
                  </label>
                ))}
              </div>
            </section>
        )}
        {workflow === "compare" && currentDateAnalysis && <DateSetup analysis={currentDateAnalysis} convention={currentDateConvention} onChange={setCurrentDateConvention} label="Current file birth dates" />}

            </div>
          </details>
        )}

        {error && (
          <section className="intake-error">
            <div style={{ borderLeft: "2px solid var(--color-error-text)", padding: "8px 0 8px 14px", display: "flex", alignItems: "center", gap: 9, color: "var(--color-error-text)", fontSize: 13 }}>
              <AlertCircle size={15} /> {error}
            </div>
          </section>
        )}

        <section className="intake-action">
          <button onClick={run} disabled={processing} className="cta">
            {processing ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> {processingProgress ?? "Processing…"}</> : <>{wLabel}<ArrowRight size={16} /></>}
          </button>
          {processing && <button type="button" className="btn btn-secondary" onClick={cancelProcessing}>Cancel</button>}
        </section>

        </section>
        <footer className="intake-footer">
          Built by Wellington-Dufferin-Guelph Public Health · MIT License
        </footer>
      </div>
    </main>
  );
}

function DateSetup({ analysis, convention, onChange, label }: {
  analysis: DateFieldAnalysis;
  convention?: DateConvention;
  onChange: (convention: DateConvention | undefined) => void;
  label: string;
}) {
  const counts = analysis.evidenceCounts;
  const examples = analysis.sample.filter((entry) => entry.classification === "ambiguous").slice(0, 2);
  return <section className="advanced-section">
    <h2>{label}</h2>
    <p style={{ fontSize: 12, color: analysis.ready ? "var(--color-text-secondary)" : "var(--color-error-text)", lineHeight: 1.5 }}>{analysis.explanation}</p>
    <p style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
      Source field BirthDate · {analysis.totalPopulated} populated · {counts.canonical} year-first · {counts["typed-workbook-date"]} typed workbook · {counts["day-first"]} day-first · {counts["month-first"]} month-first · {counts.ambiguous} ambiguous · {counts.invalid} invalid
      {analysis.sampled ? ` · suggestion sampled across ${analysis.sampleSize} values; all values validated` : " · all values inspected"}
    </p>
    {(analysis.conventionRequired || convention) && !analysis.conflict && <fieldset style={{ border: 0, padding: 0, margin: "12px 0" }}>
      <legend style={{ fontSize: 12, fontWeight: 600 }}>Confirm the source convention</legend>
      {(["day-first", "month-first"] as const).map((value) => <label key={value} style={{ display: "inline-flex", gap: 6, marginRight: 18, fontSize: 12 }}>
        <input type="radio" name={`date-convention-${label}`} checked={convention === value} onChange={() => onChange(value)} />
        {value === "day-first" ? "Day / month / year" : "Month / day / year"}
      </label>)}
    </fieldset>}
    {examples.map((entry) => <p key={entry.location} style={{ fontSize: 11, margin: "4px 0" }}>{entry.location}: {entry.explanation}</p>)}
  </section>;
}

async function readInputAsSTIX(f: File, metadata?: Partial<XlsmMetadata>, dateConvention?: DateConvention, decodedWorkbook?: DecodedWorkbook): Promise<{ xml: string; document?: CanonicalUpload; inputFormat: "STIX XML" | "XLSM workbook"; transformationCount?: number }> {
  if (/\.xlsm$/i.test(f.name)) {
    const decoded = decodedWorkbook ?? decodeWorkbook(await f.arrayBuffer(), f.name);
    const result = importDecodedWorkbook(decoded, metadata, dateConvention);
    const structuralRules = new Set(["IMPORT_UNKNOWN_SHEET", "IMPORT_FORMULA", "IMPORT_HIDDEN_CONTENT", "IMPORT_UNRECOGNIZED_ROW", "IMPORT_UNMAPPED_COLUMN", "IMPORT_DUPLICATE_COLUMN", "IMPORT_UNKNOWN_REGION", "RECONCILIATION_COUNT"]);
    const blockers = result.preview.diagnostics.filter((finding) => finding.severity === "error" && structuralRules.has(finding.ruleId));
    if (blockers.length) throw new Error(`Workbook import is blocked: ${blockers[0].message}${blockers.length > 1 ? ` (+${blockers.length - 1} more)` : ""}`);
    return { xml: result.xml, document: result.upload, inputFormat: "XLSM workbook", transformationCount: result.preview.transformationCount };
  }
  if (!/\.xml$/i.test(f.name)) throw new Error("Supported files use the .xml or .xlsm extension. See Supported inputs and outputs.");
  const xmlText = await readFileText(f);
  if (!xmlText.trim().startsWith("<")) throw new Error("Selected file is neither XML nor a supported Excel workbook.");
  return { xml: xmlText, inputFormat: "STIX XML" };
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
