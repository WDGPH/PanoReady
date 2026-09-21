"use client";
import PagedTable from "@/components/PagedTable";

import { useCallback, useEffect, useState } from "react";
import type { SaveProgressRegistration } from "@/components/SaveProgress";
import * as Dialog from "@radix-ui/react-dialog";
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { ArrowLeft, CheckCircle2, Download, FileCode, GitCompareArrows, Loader2, Lock, School, SlidersHorizontal, Users, Wrench, X } from "lucide-react";
import { applyReviewCorrections, extractSchoolXml, safeExportPart } from "@/lib/stixExport";
import { downloadBlob, downloadText, toCsv } from "@/lib/utils";
import type { STIXComparison } from "@/lib/types";
import StatCard from "@/components/StatCard";
import { downloadProgress } from "@/components/SaveProgress";

// ─── CompareView ──────────────────────────────────────────────────────────────

export default function CompareWorkflow({ comparison, onStartOver, onSaveProgressChange }: {
  comparison: STIXComparison;
  onStartOver: () => void;
  onSaveProgressChange: SaveProgressRegistration;
}) {
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
  const getExportXml = useCallback(() => {
    const sourceXml = extractSchoolXml(comparison.currentXml, selectedSchool);
    const records = selectedSchool === "all"
      ? comparison.recordChanges
      : comparison.recordChanges.filter((record) => record.schoolName === selectedSchool);
    return applyReviewCorrections(sourceXml, records, corrections);
  }, [comparison, corrections, selectedSchool]);
  useEffect(() => {
    onSaveProgressChange(() => downloadProgress(
      comparison.currentFileName,
      applyReviewCorrections(comparison.currentXml, comparison.recordChanges, corrections),
    ));
    return () => onSaveProgressChange(null);
  }, [comparison, corrections, onSaveProgressChange]);
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
    <main className="compare-results-main compare-dashboard" style={{ flex: 1, maxWidth: "var(--page-width)", width: "100%", margin: "0 auto", padding: "24px var(--page-gutter)" }}>
      <button onClick={onStartOver} className="btn btn-ghost compare-back" style={{ marginBottom: 8, padding: "4px 8px", gap: 5, fontSize: 12 }}>
        <ArrowLeft size={13} /> Compare another pair
      </button>
      <div className="compare-dashboard-header" style={{ marginBottom: 12 }}>
        <div className="compare-dashboard-kicker">OPERATIONS / CHANGE INTELLIGENCE <span>LOCAL ANALYSIS</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <GitCompareArrows size={22} style={{ color: "var(--color-accent-amber)" }} />
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
            <PagedTable className="data-table">
              <thead><tr><th>From school</th><th>To school</th><th>Students</th><th>Matched students</th></tr></thead>
              <tbody>{comparison.schoolTransfers.map((transfer) => <tr key={`${transfer.fromSchool}-${transfer.toSchool}`}><td style={{ color: "var(--color-text-primary)" }}>{transfer.fromSchool}</td><td style={{ color: "var(--color-text-primary)" }}>{transfer.toSchool}</td><td>{transfer.count}</td><td>{transfer.students.join(", ")}</td></tr>)}</tbody>
            </PagedTable>
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
            <PagedTable className="data-table">
              <thead><tr><th>School</th><th>Previous</th><th>Current</th><th>Added</th><th>Removed</th><th>Changed</th></tr></thead>
          <tbody>{comparison.schoolChanges.map((school) => <tr key={school.schoolName} onClick={() => { selectSchool(school.schoolName); setViewMode("records"); }} style={{ cursor: "pointer" }}><td style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{school.schoolName}</td><td>{school.previousCount}</td><td>{school.currentCount}</td><td>{school.added}</td><td>{school.removed}</td><td>{school.changed}</td></tr>)}</tbody>
            </PagedTable>
          </div>
        </section>
      ) : viewMode === "fields" ? (
        <section className="card compare-detail-card" style={{ padding: "18px 20px" }}>
          <div style={{ marginBottom: 14 }}><h2 style={{ fontSize: 16, margin: "0 0 3px" }}>Field changes</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>Fields changed among matched student records, ordered by frequency.</p></div>
          <div className="compare-table-scroll"><PagedTable className="data-table"><thead><tr><th>Field</th><th>Changed records</th></tr></thead><tbody>{comparison.fieldChanges.map((field) => <tr key={field.field}><td style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{field.label}</td><td>{field.count}</td></tr>)}</tbody></PagedTable></div>
        </section>
      ) : viewMode === "transfers" ? (
        <section className="card compare-detail-card" style={{ padding: "18px 20px" }}>
          <div style={{ marginBottom: 14 }}><h2 style={{ fontSize: 16, margin: "0 0 3px" }}>Student transfers</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>Students matched across both files whose school changed.</p></div>
          <div className="compare-table-scroll"><PagedTable className="data-table"><thead><tr><th>From school</th><th>To school</th><th>Students</th><th>Matched students</th></tr></thead><tbody>{comparison.schoolTransfers.map((transfer) => <tr key={`${transfer.fromSchool}-${transfer.toSchool}`}><td style={{ color: "var(--color-text-primary)" }}>{transfer.fromSchool}</td><td style={{ color: "var(--color-text-primary)" }}>{transfer.toSchool}</td><td>{transfer.count}</td><td>{transfer.students.join(", ")}</td></tr>)}</tbody></PagedTable></div>
        </section>
      ) : (
        <div className="compare-record-layout">
        <section className="card compare-school-panel" style={{ padding: "16px" }}>
          <div style={{ marginBottom: 12 }}><h2 style={{ fontSize: 15, margin: "0 0 3px" }}>Schools</h2><p style={{ color: "var(--color-text-muted)", fontSize: 11, margin: 0 }}>Select a school to focus the records.</p></div>
          <div className="compare-table-scroll" style={{ overflowX: "auto" }}>
            <PagedTable className="data-table">
              <thead><tr><th>School</th></tr></thead>
              <tbody>{comparison.schoolChanges.map((school) => <tr key={school.schoolName} onClick={() => selectSchool(school.schoolName)} style={{ cursor: "pointer" }}><td style={{ color: "var(--color-text-primary)", fontWeight: selectedSchool === school.schoolName ? 700 : 500 }}>{school.schoolName}</td></tr>)}</tbody>
            </PagedTable>
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
          {visibleRecords.length === 0 ? <p style={{ color: "var(--color-text-secondary)", fontSize: 13, margin: 0 }}>No record-level differences were detected{selectedSchool === "all" ? "." : " for this school."}</p> : <div className="compare-table-scroll" style={{ overflowX: "auto" }}><PagedTable className="data-table"><thead><tr><th>Change</th><th>Student</th><th>School</th><th>Changed fields</th><th data-sortable={false}>Review</th></tr></thead><tbody>{visibleRecords.map((record) => <tr key={`${record.kind}-${record.key}`} onClick={() => setSelectedRecordKey(record.key)} style={{ cursor: "pointer", background: selectedRecordKey === record.key ? "var(--color-surface-2)" : undefined }}><td><span className={`change-badge change-badge--${record.kind}`}>{record.kind}</span></td><td style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>{record.studentName}</td><td>{record.schoolName}</td><td>{record.changedFields.length ? <div className="field-tag-list">{record.changedFields.map((field) => <span key={field} className="field-tag">{field}</span>)}</div> : <span style={{ color: "var(--color-text-muted)" }}>—</span>}</td><td style={{ color: "var(--color-teal-400)", fontSize: 11 }}>Inspect →</td></tr>)}</tbody></PagedTable></div>}
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
          <Dialog.Overlay style={{ position: "fixed", inset: 0, background: "var(--color-overlay)", zIndex: 50 }} />
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
