"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, FileText, Loader2 } from "lucide-react";
import { validatePhix } from "@/lib/phixValidator";
import { readFileText } from "@/lib/utils";
import type { PhixValidationResult } from "@/lib/types";
import defaultPhixRules from "@/config/rules.phix.default.json";

export interface PHIXWorkflowInput {
  result: PhixValidationResult;
  fileName: string;
  csvText: string;
}

const FILE_ACCEPT = ".csv,text/csv";

export default function PHIXIntake({ onResult }: { onResult: (input: PHIXWorkflowInput) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile]           = useState<File | null>(null);
  const [dragging, setDragging]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleFile = useCallback((f: File) => {
    setError(null);
    setFile(f);
  }, []);

  const handleNativeFileSelect = useCallback((target: HTMLInputElement) => {
    const selected = target.files?.[0];
    if (selected) handleFile(selected);
  }, [handleFile]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const sync = () => handleNativeFileSelect(input);
    input.addEventListener("change", sync);
    input.addEventListener("input", sync);
    return () => {
      input.removeEventListener("change", sync);
      input.removeEventListener("input", sync);
    };
  }, [handleNativeFileSelect]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const selected = inputRef.current?.files?.[0];
      if (!selected) return;
      if (
        file &&
        file.name === selected.name &&
        file.size === selected.size &&
        file.lastModified === selected.lastModified
      ) return;
      handleFile(selected);
    }, 300);
    return () => window.clearInterval(intervalId);
  }, [file, handleFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false);
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  const run = async () => {
    const selected = inputRef.current?.files?.[0] ?? file;
    if (!selected) { setError("Please select a CSV file first."); return; }
    setProcessing(true); setError(null);
    try {
      const csvText = await readFileText(selected);
      const result = validatePhix(csvText, defaultPhixRules as Parameters<typeof validatePhix>[1]);
      onResult({ result, fileName: selected.name, csvText });
    } catch (err) {
      setError(`Processing failed: ${err instanceof Error ? err.message : String(err)}`);
      setProcessing(false);
    }
  };

  return (
    <main className="intake-main">
      <div className="intake-shell">
        <header className="landing-intro" id="intro">
          <div>
            <h1>PHIX immunization check.</h1>
          </div>
          <p className="landing-lede">Validate a PHIX immunization CSV.</p>
        </header>

        <section id="tools" aria-label="File tools">
          <div className="file-fields">
            <section className="file-field">
              <input
                id="phix-upload"
                ref={inputRef}
                type="file"
                accept={FILE_ACCEPT}
                aria-describedby="phix-upload-help"
                onChange={(e) => handleNativeFileSelect(e.currentTarget)}
                onInput={(e) => handleNativeFileSelect(e.currentTarget)}
                hidden
              />
              <div
                className={`file-dropzone${dragging ? " dragging" : ""}`}
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
              >
                <FileText className="file-dropzone-icon" size={34} strokeWidth={1.4} aria-hidden="true" />
                <div className="file-dropzone-copy">
                  <p>{file?.name ?? "Drop a CSV file here"}</p>
                  <span id="phix-upload-help">
                    {file ? `${(file.size / 1024).toFixed(1)} KB · drop another file to change` : "or click Browse"}
                  </span>
                </div>
                <button type="button" className="file-browse" onClick={() => inputRef.current?.click()}>
                  Browse
                </button>
              </div>
            </section>
          </div>

          {error && (
            <section className="intake-error">
              <div style={{ borderLeft: "2px solid var(--color-error-text)", padding: "8px 0 8px 14px", display: "flex", alignItems: "center", gap: 9, color: "var(--color-error-text)", fontSize: 13 }}>
                <AlertCircle size={15} /> {error}
              </div>
            </section>
          )}

          <section className="intake-action">
            <button onClick={run} disabled={processing} className="cta">
              {processing
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Processing…</>
                : <>Validate PHIX CSV <ArrowRight size={16} /></>}
            </button>
          </section>
        </section>

        <footer className="intake-footer">
          Built by Wellington-Dufferin-Guelph Public Health · MIT License
        </footer>
      </div>
    </main>
  );
}
