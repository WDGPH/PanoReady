"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  validateXml,
  generateSchoolSummaryCsv,
  generateAgeGroupReportCsv,
  generateIssueReportCsv,
} from "../../lib/validator";
import type { RulesProfile } from "../../lib/types";
import { defaultRules, getActiveRules } from "../../lib/rulesets";
import RulesetSelector from "../../components/RulesetSelector";

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

function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

function CheckboxGroup({
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
    <div
      style={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        padding: "12px 14px",
        minWidth: 160,
        flex: "1 1 160px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: "var(--color-text-primary)",
          }}
        >
          {label}
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={onAll}
            style={{
              fontSize: 11,
              padding: "2px 7px",
              borderRadius: 4,
              background: "var(--color-surface-4)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
              cursor: "pointer",
            }}
          >
            All
          </button>
          <button
            onClick={onNone}
            style={{
              fontSize: 11,
              padding: "2px 7px",
              borderRadius: 4,
              background: "var(--color-surface-4)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
              cursor: "pointer",
            }}
          >
            None
          </button>
        </div>
      </div>

      <div
        style={{
          maxHeight: 160,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        {options.length === 0 && (
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            No values
          </span>
        )}
        {options.map((opt) => (
          <label
            key={opt}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "3px 4px",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 13,
              color: "var(--color-text-primary)",
              background: selected.includes(opt)
                ? "rgba(34,197,94,0.08)"
                : "transparent",
            }}
          >
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => onToggle(opt)}
              style={{ accentColor: "var(--color-brand-500)", cursor: "pointer" }}
            />
            {opt}
          </label>
        ))}
      </div>

      <div
        style={{
          marginTop: 6,
          fontSize: 11,
          color: "var(--color-text-muted)",
        }}
      >
        {selected.length} / {options.length} selected
      </div>
    </div>
  );
}

function AgeRangeFilter({
  minBound,
  maxBound,
  minAge,
  maxAge,
  onChange,
}: {
  minBound: number;
  maxBound: number;
  minAge: number;
  maxAge: number;
  onChange: (min: number, max: number) => void;
}) {
  return (
    <div
      style={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        padding: "12px 14px",
        minWidth: 180,
        flex: "1 1 180px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: "var(--color-text-primary)",
          }}
        >
          Age Range
        </span>
        <button
          onClick={() => onChange(minBound, maxBound)}
          style={{
            fontSize: 11,
            padding: "2px 7px",
            borderRadius: 4,
            background: "var(--color-surface-4)",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border)",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Min age
          </label>
          <input
            type="range"
            min={minBound}
            max={maxBound}
            value={minAge}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              onChange(v, Math.max(v, maxAge));
            }}
            style={{ width: "100%", accentColor: "var(--color-brand-500)" }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--color-text-secondary)",
            }}
          >
            <span>{minBound}</span>
            <span style={{ fontWeight: 600, color: "var(--color-brand-400)" }}>
              {minAge}
            </span>
            <span>{maxBound}</span>
          </div>
        </div>

        <div>
          <label
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              display: "block",
              marginBottom: 4,
            }}
          >
            Max age
          </label>
          <input
            type="range"
            min={minBound}
            max={maxBound}
            value={maxAge}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              onChange(Math.min(minAge, v), v);
            }}
            style={{ width: "100%", accentColor: "var(--color-brand-500)" }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 11,
              color: "var(--color-text-secondary)",
            }}
          >
            <span>{minBound}</span>
            <span style={{ fontWeight: 600, color: "var(--color-brand-400)" }}>
              {maxAge}
            </span>
            <span>{maxBound}</span>
          </div>
        </div>

        <div
          style={{
            textAlign: "center",
            fontSize: 13,
            color: "var(--color-text-primary)",
            background: "var(--color-surface-3)",
            borderRadius: 3,
            padding: "4px 8px",
          }}
        >
          {minAge === maxAge ? `Age ${minAge}` : `Ages ${minAge} – ${maxAge}`}
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [xml, setXml] = useState("");
  const [activeRules, setActiveRules] = useState<RulesProfile>(defaultRules);
  const [rawRecords, setRawRecords] = useState<any[] | null>(null);
  const [rawIssues, setRawIssues] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<{
    schoolCount?: number;
    studentCount?: number;
    gate?: string;
  } | null>(null);
  const [filteredSummary, setFilteredSummary] = useState<{
    schoolCsv?: string;
    ageCsv?: string;
    issueCsv?: string;
  } | null>(null);
  const [errors, setErrors] = useState<string | null>(null);

  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [selectedGenders, setSelectedGenders] = useState<string[]>([]);
  const [minAge, setMinAge] = useState(0);
  const [maxAge, setMaxAge] = useState(99);
  const [ageBounds, setAgeBounds] = useState<[number, number]>([0, 99]);

  useEffect(() => { setActiveRules(getActiveRules()); }, []);

  const [options, setOptions] = useState({
    schools: [] as string[],
    grades: [] as string[],
    genders: [] as string[],
  });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const txt = await f.text();
    setXml(txt);
  }

  function runValidation() {
    try {
      const result = validateXml(xml, activeRules);
      setRawRecords(result.records);
      setRawIssues(result.issues);
      setSummary({
        schoolCount: result.schoolCount,
        studentCount: result.studentCount,
        gate: result.gate,
      });
      setErrors(null);
    } catch (err) {
      setErrors(String(err));
      setSummary(null);
      setRawRecords(null);
      setRawIssues(null);
    }
  }

  function clearAll() {
    setXml("");
    setSummary(null);
    setRawRecords(null);
    setRawIssues(null);
    setErrors(null);
    setFilteredSummary(null);
  }

  // Derive filter options from records
  useEffect(() => {
    if (!rawRecords) return;
    const schoolsSet = new Set<string>();
    const gradesSet = new Set<string>();
    const gendersSet = new Set<string>();
    let ageMin = Infinity;
    let ageMax = -Infinity;

    for (const r of rawRecords) {
      const sn = (r.fields.SchoolNumber || r.fields.SchoolName || "").trim();
      schoolsSet.add(sn || "(unknown)");
      if (r.fields.Grade) gradesSet.add(String(r.fields.Grade).trim());
      if (r.fields.Gender) gendersSet.add(String(r.fields.Gender).trim());

      const age = computeAge((r.fields.BirthDate || "").trim());
      if (age !== null) {
        if (age < ageMin) ageMin = age;
        if (age > ageMax) ageMax = age;
      }
    }

    const schools = Array.from(schoolsSet).sort();
    const grades = Array.from(gradesSet).sort();
    const genders = Array.from(gendersSet).sort();

    const resolvedMin = isFinite(ageMin) ? ageMin : 0;
    const resolvedMax = isFinite(ageMax) ? ageMax : 99;

    setOptions({ schools, grades, genders });
    setSelectedSchools(schools);
    setSelectedGrades(grades);
    setSelectedGenders(genders);
    setAgeBounds([resolvedMin, resolvedMax]);
    setMinAge(resolvedMin);
    setMaxAge(resolvedMax);
  }, [rawRecords]);

  // Recompute filtered CSVs on any filter change
  useEffect(() => {
    if (!rawRecords || !rawIssues) return;

    const recs = rawRecords.filter((r) => {
      const sn =
        (r.fields.SchoolNumber || r.fields.SchoolName || "").trim() ||
        "(unknown)";
      const grade = (r.fields.Grade || "").trim();
      const gender = (r.fields.Gender || "").trim();
      const age = computeAge((r.fields.BirthDate || "").trim());

      if (!selectedSchools.includes(sn)) return false;
      if (grade && !selectedGrades.includes(grade)) return false;
      if (gender && !selectedGenders.includes(gender)) return false;
      if (age !== null && (age < minAge || age > maxAge)) return false;
      return true;
    });

    const recordIds = new Set(recs.map((r: any) => r.id));
    const issues = rawIssues.filter((i: any) => {
      if (i.recordId && recordIds.has(i.recordId)) return true;
      const sn = i.schoolNumber || "";
      return selectedSchools.includes(sn || "(unknown)");
    });

    setFilteredSummary({
      schoolCsv: generateSchoolSummaryCsv(recs),
      ageCsv: generateAgeGroupReportCsv(recs),
      issueCsv: generateIssueReportCsv(issues, []),
    });
  }, [rawRecords, rawIssues, selectedSchools, selectedGrades, selectedGenders, minAge, maxAge]);

  function download(filename: string, content?: string) {
    if (!content) return;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const filteredCount = (() => {
    if (!rawRecords) return 0;
    return rawRecords.filter((r) => {
      const sn =
        (r.fields.SchoolNumber || r.fields.SchoolName || "").trim() ||
        "(unknown)";
      const grade = (r.fields.Grade || "").trim();
      const gender = (r.fields.Gender || "").trim();
      const age = computeAge((r.fields.BirthDate || "").trim());
      if (!selectedSchools.includes(sn)) return false;
      if (grade && !selectedGrades.includes(grade)) return false;
      if (gender && !selectedGenders.includes(gender)) return false;
      if (age !== null && (age < minAge || age > maxAge)) return false;
      return true;
    }).length;
  })();

  return (
    <div
      style={{
        padding: "24px 32px",
        maxWidth: 1100,
        margin: "0 auto",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 4,
          color: "var(--color-text-primary)",
        }}
      >
        STIX Reports
      </h1>
      <p
        style={{
          fontSize: 14,
          color: "var(--color-text-secondary)",
          marginBottom: 20,
        }}
      >
        Upload or paste STIX XML, validate, then filter by school, grade,
        gender, and age to generate targeted CSV reports.
      </p>

      {/* File + XML input */}
      <div
        style={{
          background: "var(--color-surface-1)",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <label
            style={{
              fontSize: 13,
              color: "var(--color-text-secondary)",
              display: "block",
              marginBottom: 6,
            }}
          >
            Upload XML file
          </label>
          <input
            type="file"
            accept=".xml,text/xml"
            onChange={onFile}
            style={{ fontSize: 13, color: "var(--color-text-primary)" }}
          />
        </div>
        <textarea
          value={xml}
          onChange={(e) => setXml(e.target.value)}
          rows={10}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            background: "var(--color-surface-0)",
            color: "var(--color-text-primary)",
            border: "1px solid var(--color-border)",
            borderRadius: 3,
            padding: "10px 12px",
            resize: "vertical",
            boxSizing: "border-box",
          }}
          placeholder="…or paste STIX XML here"
        />
        <div style={{ marginTop: 14, marginBottom: 2 }}>
          <RulesetSelector onRulesChange={setActiveRules} />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            onClick={runValidation}
            disabled={!xml.trim()}
            style={{
              padding: "7px 18px",
              borderRadius: 3,
              background: xml.trim()
                ? "var(--color-brand-600)"
                : "var(--color-surface-3)",
              color: xml.trim()
                ? "var(--marble)"
                : "var(--color-text-muted)",
              border: "none",
              fontWeight: 600,
              fontSize: 14,
              cursor: xml.trim() ? "pointer" : "not-allowed",
            }}
          >
            Validate
          </button>
          <button
            onClick={clearAll}
            style={{
              padding: "7px 14px",
              borderRadius: 3,
              background: "var(--color-surface-3)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {errors && (
        <div
          style={{
            background: "var(--color-error-bg)",
            border: "1px solid var(--color-error-border)",
            color: "var(--color-error-text)",
            borderRadius: 4,
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {errors}
        </div>
      )}

      {summary && rawRecords && filteredSummary && (
        <>
          {/* Summary bar */}
          <div
            style={{
              background: "var(--color-surface-1)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "12px 16px",
              marginBottom: 16,
              display: "flex",
              gap: 24,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Schools
              </span>
              <div style={{ fontWeight: 700, fontSize: 20 }}>
                {summary.schoolCount}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Total students
              </span>
              <div style={{ fontWeight: 700, fontSize: 20 }}>
                {summary.studentCount}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Filtered students
              </span>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 20,
                  color: "var(--color-brand-400)",
                }}
              >
                {filteredCount}
              </div>
            </div>
            <div>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Gate
              </span>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color:
                    summary.gate === "PASS"
                      ? "var(--color-brand-400)"
                      : summary.gate === "BLOCKED"
                      ? "var(--color-error-text)"
                      : "var(--color-warning-text)",
                }}
              >
                {summary.gate}
              </div>
            </div>
          </div>

          {/* Filters */}
          <div
            style={{
              background: "var(--color-surface-1)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "16px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 15,
                  color: "var(--color-text-primary)",
                }}
              >
                Filters
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    setSelectedSchools(options.schools);
                    setSelectedGrades(options.grades);
                    setSelectedGenders(options.genders);
                    setMinAge(ageBounds[0]);
                    setMaxAge(ageBounds[1]);
                  }}
                  style={{
                    fontSize: 12,
                    padding: "4px 12px",
                    borderRadius: 5,
                    background: "var(--color-surface-3)",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                    cursor: "pointer",
                  }}
                >
                  Select all
                </button>
                <button
                  onClick={() => {
                    setSelectedSchools([]);
                    setSelectedGrades([]);
                    setSelectedGenders([]);
                  }}
                  style={{
                    fontSize: 12,
                    padding: "4px 12px",
                    borderRadius: 5,
                    background: "var(--color-surface-3)",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border)",
                    cursor: "pointer",
                  }}
                >
                  Clear all
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <CheckboxGroup
                label="School"
                options={options.schools}
                selected={selectedSchools}
                onToggle={(v) => setSelectedSchools((s) => toggle(s, v))}
                onAll={() => setSelectedSchools(options.schools)}
                onNone={() => setSelectedSchools([])}
              />
              <CheckboxGroup
                label="Grade"
                options={options.grades}
                selected={selectedGrades}
                onToggle={(v) => setSelectedGrades((s) => toggle(s, v))}
                onAll={() => setSelectedGrades(options.grades)}
                onNone={() => setSelectedGrades([])}
              />
              <CheckboxGroup
                label="Gender"
                options={options.genders}
                selected={selectedGenders}
                onToggle={(v) => setSelectedGenders((s) => toggle(s, v))}
                onAll={() => setSelectedGenders(options.genders)}
                onNone={() => setSelectedGenders([])}
              />
              <AgeRangeFilter
                minBound={ageBounds[0]}
                maxBound={ageBounds[1]}
                minAge={minAge}
                maxAge={maxAge}
                onChange={(min, max) => {
                  setMinAge(min);
                  setMaxAge(max);
                }}
              />
            </div>
          </div>

          {/* Downloads */}
          <div
            style={{
              background: "var(--color-surface-1)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "14px 16px",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                marginBottom: 10,
                color: "var(--color-text-primary)",
              }}
            >
              Export filtered reports ({filteredCount} students)
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                {
                  label: "Issues CSV",
                  file: "filtered_issues.csv",
                  csv: filteredSummary.issueCsv,
                },
                {
                  label: "School Summary CSV",
                  file: "filtered_schools_summary.csv",
                  csv: filteredSummary.schoolCsv,
                },
                {
                  label: "Age Group CSV",
                  file: "filtered_age_groups.csv",
                  csv: filteredSummary.ageCsv,
                },
              ].map(({ label, file, csv }) => (
                <button
                  key={file}
                  onClick={() => download(file, csv)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 3,
                    background: "var(--color-surface-3)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border-hover)",
                    fontSize: 13,
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  ↓ {label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <details
            style={{
              background: "var(--color-surface-1)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "12px 16px",
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 13,
                color: "var(--color-text-secondary)",
              }}
            >
              Preview: filtered school CSV
            </summary>
            <pre
              style={{
                marginTop: 10,
                whiteSpace: "pre-wrap",
                maxHeight: 280,
                overflow: "auto",
                fontSize: 12,
                color: "var(--color-text-primary)",
                background: "var(--color-surface-0)",
                borderRadius: 3,
                padding: "10px 12px",
              }}
            >
              {filteredSummary.schoolCsv?.slice(0, 3000) || "(empty)"}
            </pre>
          </details>
        </>
      )}
    </div>
  );
}
