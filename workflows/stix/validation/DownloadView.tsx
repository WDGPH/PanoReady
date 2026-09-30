"use client";
import { ageOnDate } from "@/lib/calendarDate";
import WorkflowNavigation from "@/components/WorkflowNavigation";
import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import * as XLSX from "xlsx";
import { AlertTriangle, ArrowLeft, BarChart3, CheckCircle2, Download, FileCode, FileText, Lock, School, ShieldX, SlidersHorizontal, Users } from "lucide-react";
import { prettyPrintXml } from "@/lib/cleaner";
import { birthYearFromDate, processExport, studentFromRecord } from "@/lib/pullInfo";
import { downloadBlob, downloadText, toCsv } from "@/lib/utils";
import { generateAgeGroupReportCsv, generateIssueReportCsv, generateSchoolSummaryCsv } from "@/lib/validator";
import { summarizeAppliedCorrections } from "@/lib/fixSummary";
import type { ValidateSession } from "@/lib/types";
import StatCard from "@/components/StatCard";

// ─── Report filter helpers ─────────────────────────────────────────────────────

function computeAge(birthDate: string): number | null {
  return ageOnDate(birthDate, new Date().toISOString().slice(0, 10));
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

export default function DownloadView({
  session,
  onStartOver,
  onOpenReports,
  onReturnToFixes,
}: {
  onReturnToFixes: (view: "fix" | "manual") => void;
  session: ValidateSession;
  onStartOver: () => void;
  onOpenReports?: (xml: string) => void;
}) {
  const baseName = session.fileName.replace(/\.xml$/i, "");
  const result = session.revalidatedResult ?? session.initialResult;
  const gate = result.gate;
  const needsReview = gate === "REVIEW_REQUIRED";
  const xml = session.finalXml ?? session.originalXml;
  const corrections = summarizeAppliedCorrections(session.fixes, session.history);
  const correctionBreakdown = [
    `${corrections.automatic} automatic`,
    `${corrections.manual} manual`,
    corrections.cleaning > 0 ? `${corrections.cleaning} cleaning` : "",
    corrections.uncategorized > 0 ? `${corrections.uncategorized} earlier` : "",
  ].filter(Boolean).join(" · ");

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

  const dlPretty = () => downloadText(prettyPrintXml(xml), `${baseName}_pretty.xml`, "application/xml");

  const exportResult = useMemo(() => processExport(xml), [xml]);
  const dlExportCsv = (data: Record<string, unknown>[], name: string) =>
    downloadText(toCsv(data), `${baseName}_${name}.csv`, "text/csv");
  const dlExportExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportResult.allStudents),      "All_Students");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportResult.filteredStudents), "Filtered_Students");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportResult.schoolCounts),     "School_Counts");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exportResult.gradeCounts),      "Grade_Counts");
    XLSX.writeFile(wb, `${baseName}_report.xlsx`);
  };

  const errorCount   = result.issues.filter(i => i.severity === "error").length;
  const warningCount = result.issues.filter(i => i.severity === "warning").length;

  // ── Filter state ──────────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(true);
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectedGrades,  setSelectedGrades]  = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [selectedBirthYears, setSelectedBirthYears] = useState<string[]>([]);
  const [minAge, setMinAge] = useState(0);
  const [maxAge, setMaxAge] = useState(99);
  const [ageBounds, setAgeBounds] = useState<[number, number]>([0, 99]);
  const [filterOpts, setFilterOpts] = useState({ schools: [] as string[], grades: [] as string[], genders: [] as string[], birthYears: [] as string[] });

  useEffect(() => {
    const records = result.records ?? [];
    const schoolsSet = new Set<string>();
    const gradesSet  = new Set<string>();
    const gendersSet = new Set<string>();
    const birthYearsSet = new Set<string>();
    let ageMin = Infinity, ageMax = -Infinity;
    for (const r of records) {
      const sn = (r.fields.SchoolNumber || r.fields.SchoolName || "").trim() || "(unknown)";
      schoolsSet.add(sn);
      if (r.fields.Grade)  gradesSet.add(String(r.fields.Grade).trim());
      if (r.fields.Gender) gendersSet.add(String(r.fields.Gender).trim());
      const birthYear = birthYearFromDate((r.fields.BirthDate || "").trim());
      birthYearsSet.add(birthYear === null ? "(unknown)" : String(birthYear));
      const age = computeAge((r.fields.BirthDate || "").trim());
      if (age !== null) { if (age < ageMin) ageMin = age; if (age > ageMax) ageMax = age; }
    }
    const schools = Array.from(schoolsSet).sort();
    const grades  = Array.from(gradesSet).sort();
    const genders = Array.from(gendersSet).sort();
    const birthYears = Array.from(birthYearsSet).sort((a, b) => a === "(unknown)" ? 1 : b === "(unknown)" ? -1 : Number(a) - Number(b));
    const lo = isFinite(ageMin) ? ageMin : 0;
    const hi = isFinite(ageMax) ? ageMax : 99;
    /* eslint-disable react-hooks/set-state-in-effect -- Reset all filter controls atomically when validation results change. */
    setFilterOpts({ schools, grades, genders, birthYears });
    setSelectedSchools(schools);
    setSelectedGrades(grades);
    setSelectedGenders(genders);
    setSelectedBirthYears(birthYears);
    setAgeBounds([lo, hi]);
    setMinAge(lo);
    setMaxAge(hi);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [result]);

  const filteredRecords = (result.records ?? []).filter((r) => {
    const sn     = (r.fields.SchoolNumber || r.fields.SchoolName || "").trim() || "(unknown)";
    const grade  = (r.fields.Grade  || "").trim();
    const gender = (r.fields.Gender || "").trim();
    const birthYear = birthYearFromDate((r.fields.BirthDate || "").trim());
    const birthYearOption = birthYear === null ? "(unknown)" : String(birthYear);
    const age    = computeAge((r.fields.BirthDate || "").trim());
    if (!selectedSchools.includes(sn)) return false;
    if (grade  && !selectedGrades.includes(grade))   return false;
    if (gender && !selectedGenders.includes(gender)) return false;
    if (!selectedBirthYears.includes(birthYearOption)) return false;
    if (age !== null && (age < minAge || age > maxAge)) return false;
    return true;
  });

  const filteredIds = new Set(filteredRecords.map((r) => r.id));
  const filteredIssues = result.issues.filter((i) => {
    if (i.recordId && filteredIds.has(i.recordId)) return true;
    const sn = i.schoolNumber || "";
    return selectedSchools.includes(sn || "(unknown)");
  });

  const dlFilteredSchools = () => downloadText(generateSchoolSummaryCsv(filteredRecords), `${baseName}_filtered_schools.csv`, "text/csv");
  const dlFilteredAges    = () => downloadText(generateAgeGroupReportCsv(filteredRecords), `${baseName}_filtered_ages.csv`, "text/csv");
  const dlFilteredIssues  = () => downloadText(generateIssueReportCsv(filteredIssues, session.fixes), `${baseName}_filtered_issues.csv`, "text/csv");
  const dlFilteredStudents = () => downloadText(
    toCsv(filteredRecords.map(studentFromRecord) as unknown as Record<string, unknown>[]),
    `${baseName}_filtered_students_custom.csv`,
    "text/csv",
  );

  return (
    <main style={{ flex: 1, maxWidth: "var(--page-width)", width: "100%", margin: "0 auto", padding: "56px var(--page-gutter) 100px" }}>
      <WorkflowNavigation onBack={() => onReturnToFixes("manual")} backActions={<div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 10 }}>
        <button type="button" onClick={() => onReturnToFixes("fix")} className="btn btn-secondary"><ArrowLeft size={16} /> Return to automatic fixes</button>
        <button type="button" onClick={() => onReturnToFixes("manual")} className="btn btn-secondary"><ArrowLeft size={16} /> Return to manual fixes</button>
      </div>} onNext={onStartOver} nextLabel="Process another file" />
      {onOpenReports && <button type="button" className="btn btn-secondary" onClick={() => onOpenReports(xml)} style={{ marginBottom: 20 }}>Create reports from this file</button>}

      {/* Gate banner */}
      <h1 style={{ fontSize: 22, margin: "0 0 24px" }}>Output</h1>
      <div style={{
        borderLeft: `2px solid ${gate === "READY" ? "var(--verde)" : "var(--color-error-text)"}`,
        padding: "6px 0 6px 22px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        marginBottom: 34,
      }}>
        {gate === "READY" ? <CheckCircle2 size={28} style={{ color: "var(--color-brand-400)", flexShrink: 0 }} /> : needsReview ? <AlertTriangle size={28} style={{ color: "var(--color-warning-text)", flexShrink: 0 }} /> : <ShieldX size={28} style={{ color: "var(--color-error-text)", flexShrink: 0 }} />}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 16, color: gate === "READY" ? "var(--color-brand-400)" : "var(--color-error-text)" }}>
              {gate === "READY" ? "File is READY" : needsReview ? "File requires review" : "File is BLOCKED"}
            </span>
          </div>
          <div style={{ color: "var(--color-text-secondary)", fontSize: 12 }}>
            {gate === "READY"
              ? `No blocking errors · ${warningCount > 0 ? `${warningCount} warning${warningCount !== 1 ? "s" : ""} for review` : "All clear"}`
              : needsReview ? "STIX/Panorama checks passed; the remaining warnings require review before submission."
              : `${errorCount} error${errorCount !== 1 ? "s" : ""} must be resolved before submission`}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="summary-stats summary-stats--four" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 28, marginBottom: 28 }}>
        <StatCard label="Corrections Applied" value={corrections.total} sub={correctionBreakdown} accent="teal" />
        <StatCard label="Field Changes" value={corrections.fieldChanges} />
        <StatCard label="Remaining Issues" value={result.issues.length}  />
        <StatCard label="Students"         value={result.studentCount}   accent="green" />
      </div>

      {/* Downloads */}
      <div className="section-label" style={{ fontSize: 11, color: "var(--color-text-muted)", fontWeight: 600, marginBottom: 12 }}>Downloads</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Cleaned XML */}
        <div className="card download-row" style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: gate === "READY" ? "var(--color-success-bg)" : "var(--color-error-bg)", borderRadius: 4, padding: 9 }}>
              <FileText size={18} style={{ color: gate === "READY" ? "var(--color-brand-400)" : "var(--color-error-text)" }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{baseName}_validated.xml</div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
                {corrections.fieldChanges > 0
                  ? `Cleaned STIX XML with ${corrections.total} correction${corrections.total !== 1 ? "s" : ""} applied across ${corrections.fieldChanges} field change${corrections.fieldChanges !== 1 ? "s" : ""}`
                  : "Original STIX XML (no corrections applied)"}
              </div>
            </div>
          </div>
          <button onClick={dlXml} className="btn btn-primary" style={{ gap: 7 }}><Download size={14} /> Download</button>
        </div>

        {/* Encrypted XML */}
        <div className="card download-row" style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: 9 }}><Lock size={18} style={{ color: "var(--color-text-muted)" }} /></div>
            <div><div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{baseName}_validated.zip</div><div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>AES-256 encrypted ZIP containing the validated XML</div></div>
          </div>
          <button onClick={() => setEncryptOpen(true)} className="btn btn-secondary" style={{ gap: 7 }}><Lock size={14} /> Encrypt &amp; ZIP</button>
        </div>

        {/* Issue report CSV */}
        <div className="card download-row" style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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

        {/* Pretty-printed XML */}
        <div className="card download-row" style={{ padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: "var(--color-surface-2)", borderRadius: 4, padding: 9 }}>
              <FileCode size={18} style={{ color: "var(--color-text-muted)" }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{baseName}_pretty.xml</div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 11 }}>Reformatted for easier review — not for submission</div>
            </div>
          </div>
          <button onClick={dlPretty} className="btn btn-secondary" style={{ gap: 7 }}><Download size={14} /> Download</button>
        </div>
      </div>

      <Dialog.Root open={encryptOpen} onOpenChange={(open) => { if (!open) closeEncrypt(); }}>
        <Dialog.Portal><Dialog.Overlay style={{ position: "fixed", inset: 0, background: "var(--color-overlay)", zIndex: 50 }} />
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

      {/* ── Export Reports section ──────────────────────────────────────────── */}
      <div style={{ marginTop: 40, paddingTop: 28, borderTop: "1px solid var(--color-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <BarChart3 size={15} style={{ color: "var(--color-text-muted)" }} />
          <div>
            <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 16, color: "var(--color-text-primary)" }}>Export Reports</div>
            <div style={{ fontSize: 11.5, color: "var(--color-text-muted)", marginTop: 2 }}>
              CSV and Excel reports built from every student record in this file
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {([
            { icon: <Users size={16} style={{ color: "var(--color-text-muted)" }} />,  title: `${baseName}_all_students.csv`,   sub: `${exportResult.allStudents.length} students`,                       fn: () => dlExportCsv(exportResult.allStudents as unknown as Record<string,unknown>[],      "all_students") },
            { icon: <Users size={16} style={{ color: "var(--color-text-muted)" }} />,  title: `${baseName}_filtered_students.csv`, sub: `${exportResult.filteredStudents.length} Gr7–8 born 2012–2013`,   fn: () => dlExportCsv(exportResult.filteredStudents as unknown as Record<string,unknown>[],  "filtered_students") },
            { icon: <School size={16} style={{ color: "var(--color-text-muted)" }} />, title: `${baseName}_school_counts.csv`,  sub: "Students per school per birth year",                                fn: () => dlExportCsv(exportResult.schoolCounts as unknown as Record<string,unknown>[],      "school_counts") },
            { icon: <BarChart3 size={16} style={{ color: "var(--color-warning-text)" }} />, title: `${baseName}_grade_counts.csv`, sub: "Students per school per grade",                                 fn: () => dlExportCsv(exportResult.gradeCounts as unknown as Record<string,unknown>[],       "grade_counts") },
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
            <button onClick={dlExportExcel} className="btn btn-primary" style={{ gap: 7 }}><Download size={14} /> Excel</button>
          </div>
        </div>
      </div>

      {/* ── Filter & Custom Report section ──────────────────────────────────── */}
      <div style={{ marginTop: 40, paddingTop: 28, borderTop: "1px solid var(--color-border)" }}>
        {/* Section header */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: 0, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" as const }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SlidersHorizontal size={15} style={{ color: "var(--color-text-muted)" }} />
            <div>
              <div style={{ fontFamily: "var(--font-sans), sans-serif", fontWeight: 600, fontSize: 16, color: "var(--color-text-primary)" }}>Filter &amp; Custom Report</div>
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
              <FilterCheckboxGroup
                label="Birth year"
                options={filterOpts.birthYears}
                selected={selectedBirthYears}
                onToggle={(v) => setSelectedBirthYears((s) => toggleItem(s, v))}
                onAll={() => setSelectedBirthYears(filterOpts.birthYears)}
                onNone={() => setSelectedBirthYears([])}
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
                <button onClick={dlFilteredStudents} className="btn btn-primary" style={{ gap: 5, fontSize: 12, padding: "6px 13px" }}><Download size={12} /> Students CSV</button>
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
