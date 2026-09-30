"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, ChevronRight, FileText, Loader2 } from "lucide-react";
import { compareSTIXFiles } from "@/lib/compare";
import { importWorkbook, xlsmMetadata, CANONICAL_FIELDS } from "@/lib/excel";
import type { XlsmMetadata, ColumnOverrides, CanonicalField } from "@/lib/excel";
import { parseSTIXXml } from "@/lib/validator";
import type { ImportPreview, STIXComparison, StudentRecord, Workflow } from "@/lib/types";
import StatCard from "@/components/StatCard";
import WorkbookDateReview from "@/components/WorkbookDateReview";
import type { DateConvention, WorkbookDateAnalysis } from "@/lib/workbookDates";

export interface ValidateWorkflowInput {
  xml: string;
  records: StudentRecord[];
  fileName: string;
}

// ─── Workflows config ────────────────────────────────────────────────────────

const WORKFLOWS: { id: Workflow; label: string; description: string }[] = [
  { id: "validate", label: "Validate & Fix",  description: "Find STIX issues, review automatic corrections, and download your corrected file." },
  { id: "compare",  label: "Compare Files",   description: "Compare two files and inspect record, field, and school-level changes." },
];

const FILE_ACCEPT = ".xml,.xls,.xlsm,text/xml,application/xml,application/vnd.ms-excel,application/vnd.ms-excel.sheet.macroEnabled.12";

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
        onInput={(event) => onSelect(event.currentTarget)}
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
        <button type="button" className="file-browse" onClick={() => inputRef.current?.click()}>
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
  const [file, setFile]           = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [workflow, setWorkflow]   = useState<Workflow>("validate");
  const [dragging, setDragging]   = useState(false);
  const [currentDragging, setCurrentDragging] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [xlsmMeta, setXlsmMeta] = useState<XlsmMetadata | null>(null);
  const [xlsmPreview, setXlsmPreview] = useState<ImportPreview | null>(null);
  const [dateConvention, setDateConvention] = useState<DateConvention>();
  const [dateAnalysis, setDateAnalysis] = useState<WorkbookDateAnalysis | null>(null);
  const [currentDateConvention, setCurrentDateConvention] = useState<DateConvention>();
  const [currentDateAnalysis, setCurrentDateAnalysis] = useState<WorkbookDateAnalysis | null>(null);
  const [columnOverrides, setColumnOverrides] = useState<ColumnOverrides>({});
  const [currentXlsmMeta, setCurrentXlsmMeta] = useState<XlsmMetadata | null>(null);

  const handleFile = useCallback((f: File) => {
    setError(null);
    setFile(f);
    setXlsmMeta(null);
    setXlsmPreview(null);
    setDateConvention(undefined);
    setDateAnalysis(null);
    setColumnOverrides({});
  }, []);

  useEffect(() => {
    if (!file || !/\.xlsm?$/i.test(file.name)) return;
    let cancelled = false;
    // v2 invalidates metadata cached by the pre-canonical-header importer,
    // which stored required fields such as "gender" instead of "Gender".
    const storageKey = `panoready:xlsm-metadata:v2:${file.name}:${file.size}:${file.lastModified}`;
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

  // Recomputes on every column-override change so resolving an unmapped/duplicate
  // column immediately clears its blocking diagnostic in the preview.
  useEffect(() => {
    if (!file || !xlsmMeta || !/\.xlsm?$/i.test(file.name)) return;
    let cancelled = false;
    file.arrayBuffer().then((data) => {
      if (cancelled) return;
      const imported = importWorkbook(data, file.name, xlsmMeta, columnOverrides, dateConvention);
      setXlsmPreview(imported.preview);
      setDateAnalysis(imported.dateAnalysis);
    }).catch((err) => {
      if (!cancelled) setError(`Could not read workbook: ${err instanceof Error ? err.message : String(err)}`);
    });
    return () => { cancelled = true; };
  }, [file, xlsmMeta, columnOverrides, dateConvention]);

  useEffect(() => {
    if (!file || !xlsmMeta || !/\.xlsm?$/i.test(file.name)) return;
    try {
      window.localStorage.setItem(
        `panoready:xlsm-metadata:v2:${file.name}:${file.size}:${file.lastModified}`,
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
    setCurrentXlsmMeta(null);
    setCurrentDateConvention(undefined);
    setCurrentDateAnalysis(null);
  }, []);

  useEffect(() => {
    if (!currentFile || !/\.xlsm?$/i.test(currentFile.name)) return;
    let cancelled = false;
    const storageKey = `panoready:xlsm-metadata:v2:${currentFile.name}:${currentFile.size}:${currentFile.lastModified}`;
    currentFile.arrayBuffer().then((data) => {
      if (cancelled) return;
      const workbookMeta = xlsmMetadata(data, currentFile.name);
      try {
        const saved = window.localStorage.getItem(storageKey);
        setCurrentXlsmMeta(saved ? { ...workbookMeta, ...JSON.parse(saved) as Partial<XlsmMetadata> } : workbookMeta);
      } catch {
        setCurrentXlsmMeta(workbookMeta);
      }
    }).catch((err) => {
      if (!cancelled) setError(`Could not read current workbook metadata: ${err instanceof Error ? err.message : String(err)}`);
    });
    return () => { cancelled = true; };
  }, [currentFile]);

  useEffect(() => {
    if (!currentFile || !currentXlsmMeta || !/\.xlsm?$/i.test(currentFile.name)) return;
    try {
      window.localStorage.setItem(
        `panoready:xlsm-metadata:v2:${currentFile.name}:${currentFile.size}:${currentFile.lastModified}`,
        JSON.stringify(currentXlsmMeta),
      );
    } catch {
      // Storage may be disabled or full; workbook processing still works.
    }
  }, [currentFile, currentXlsmMeta]);

  useEffect(() => {
    if (!currentFile || !currentXlsmMeta || !/\.xlsm?$/i.test(currentFile.name)) return;
    let cancelled = false;
    currentFile.arrayBuffer().then(data => {
      if (!cancelled) setCurrentDateAnalysis(importWorkbook(data, currentFile.name, currentXlsmMeta, undefined, currentDateConvention).dateAnalysis);
    }).catch(() => { if (!cancelled) setError("Could not inspect current workbook dates."); });
    return () => { cancelled = true; };
  }, [currentFile, currentXlsmMeta, currentDateConvention]);

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
      const xmlText = await readInputAsSTIXXml(selectedFile, xlsmMeta ?? undefined, columnOverrides, dateConvention);

      if (workflow === "compare") {
        const selectedCurrentFile = currentInputRef.current?.files?.[0] ?? currentFile;
        if (!selectedCurrentFile) throw new Error("Please select the current XML file as well.");
        const currentXmlText = await readInputAsSTIXXml(selectedCurrentFile, currentXlsmMeta ?? undefined, undefined, currentDateConvention);
        onCompare(compareSTIXFiles(xmlText, currentXmlText, selectedFile.name, selectedCurrentFile.name));
        return;
      }

      // workflow === "validate"
      // Parse records first; errors throw and are caught below.
      const parsed = parseSTIXXml(xmlText);
      onValidate({ xml: xmlText, records: parsed, fileName: selectedFile.name });
    } catch (err) {
      setError(`Processing failed: ${err instanceof Error ? err.message : String(err)}`);
      setProcessing(false);
    }
  };

  const wLabel = workflow === "validate" ? "Validate & Fix" : "Compare Files";

  return (
    <main className="intake-main">
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
            emptyLabel="Drop an XML, XLS, or XLSM file here"
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
              emptyLabel="Drop an XML, XLS, or XLSM file here"
              file={currentFile}
              inputRef={currentInputRef}
              dragging={currentDragging}
              onSelect={handleCurrentFileSelect}
              onDrop={onCurrentDrop}
              onDraggingChange={setCurrentDragging}
            />
          )}
        </div>



        {dateAnalysis && <WorkbookDateReview label={workflow === "compare" ? "Previous file" : "File"} analysis={dateAnalysis} convention={dateConvention} onChange={value => { setDateConvention(value); setError(null); }} />}
        {workflow === "compare" && currentDateAnalysis && <WorkbookDateReview label="Current file" analysis={currentDateAnalysis} convention={currentDateConvention} onChange={value => { setCurrentDateConvention(value); setError(null); }} />}

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

        {xlsmPreview && (
          <section className="advanced-section">
            <h2>Import preview</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginBottom: 12 }}>
              <StatCard label="Worksheet" value={xlsmPreview.worksheet} />
              <StatCard label="Student rows" value={xlsmPreview.canonicalStudentCount} />
              <StatCard label="Import findings" value={xlsmPreview.diagnostics.length} accent={xlsmPreview.diagnostics.some((finding) => finding.severity === "error") ? "red" : "default"} />
            </div>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>
              Header row {xlsmPreview.headerRow}; data starts at row {xlsmPreview.firstDataRow}. Populated unmapped or duplicate columns block processing — resolve them below.
            </p>
            <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 4 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead><tr><th style={{ textAlign: "left", padding: 7 }}>Source column</th><th style={{ textAlign: "left", padding: 7 }}>Canonical field</th><th style={{ textAlign: "left", padding: 7 }}>Status</th><th style={{ textAlign: "right", padding: 7 }}>Values</th><th style={{ textAlign: "left", padding: 7 }}>Fix</th></tr></thead>
                <tbody>{xlsmPreview.columns.map((column) => {
                  const needsFix = column.status === "UNMAPPED" || column.status === "DUPLICATE" || column.status === "IGNORED";
                  return (
                    <tr key={column.column} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td style={{ padding: 7 }}>{column.sourceHeader || `(column ${column.column})`}</td>
                      <td style={{ padding: 7, fontFamily: "var(--font-mono)" }}>{column.canonicalField || "—"}</td>
                      <td style={{ padding: 7, color: column.status === "MAPPED" ? "var(--color-text-secondary)" : column.status === "IGNORED" ? "var(--color-text-muted)" : column.populatedCount ? "var(--color-error-text)" : "var(--color-text-muted)" }}>{column.status}</td>
                      <td style={{ padding: 7, textAlign: "right" }}>{column.populatedCount}</td>
                      <td style={{ padding: 7 }}>
                        {needsFix ? (
                          <select
                            className="input"
                            style={{ fontSize: 11, padding: "3px 6px" }}
                            value={columnOverrides[column.column] ?? ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              setColumnOverrides((prev) => {
                                const next = { ...prev };
                                if (!value) delete next[column.column];
                                else next[column.column] = value as CanonicalField | "IGNORE";
                                return next;
                              });
                            }}
                          >
                            <option value="">{column.status === "IGNORED" ? "Undo ignore" : "Leave as-is (blocks import)"}</option>
                            <option value="IGNORE">Ignore this column</option>
                            {CANONICAL_FIELDS.map((f) => <option key={f} value={f}>Map to {f}</option>)}
                          </select>
                        ) : (
                          <span style={{ color: "var(--color-text-muted)" }}>—</span>
                        )}
                      </td>
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
          <a className="btn btn-secondary" href={`${process.env.NEXT_PUBLIC_PAGES_BASE_PATH || "/PanoReady"}/reports/`}>Open Reports utility</a>
          <button onClick={run} disabled={processing} className="cta">
            {processing ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Processing…</> : <>{wLabel}<ArrowRight size={16} /></>}
          </button>
        </section>

        </section>
        <footer className="intake-footer">
          Built by Wellington-Dufferin-Guelph Public Health · MIT License
          {process.env.NEXT_PUBLIC_BUILD_VERSION && (
            <div style={{ marginTop: 6 }}>
              {process.env.NEXT_PUBLIC_BUILD_VERSION} · {process.env.NEXT_PUBLIC_BUILD_SHA}
            </div>
          )}
        </footer>
      </div>
    </main>
  );
}

async function readInputAsSTIXXml(f: File, metadata?: Partial<XlsmMetadata>, columnOverrides?: ColumnOverrides, dateConvention?: DateConvention): Promise<string> {
  if (/\.xlsm?$/i.test(f.name)) {
    const data = await f.arrayBuffer();
    const result = importWorkbook(data, f.name, metadata, columnOverrides, dateConvention);
    const structuralBlockers = new Set(["IMPORT_UNMAPPED_COLUMN", "IMPORT_DUPLICATE_COLUMN", "IMPORT_DATE_AMBIGUOUS", "IMPORT_DATE_INVALID", "IMPORT_DATE_CONFLICT", "IMPORT_PHONE_AMBIGUOUS", "IMPORT_FORMULA", "RECONCILIATION_COUNT"]);
    const blockers = result.preview.diagnostics.filter((finding) => finding.severity === "error" && structuralBlockers.has(finding.ruleId));
    if (blockers.length) throw new Error(`Workbook import is blocked: ${blockers[0].message}${blockers.length > 1 ? ` (+${blockers.length - 1} more)` : ""}`);
    return result.xml;
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
