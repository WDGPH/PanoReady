"use client";

import type { DateConvention, WorkbookDateAnalysis } from "@/lib/workbookDates";

export default function WorkbookDateReview({ label, analysis, convention, onChange }: {
  label: string; analysis: WorkbookDateAnalysis; convention?: DateConvention; onChange: (value?: DateConvention) => void;
}) {
  return <section className="card" style={{ padding: 16, marginTop: 16 }} aria-label={`${label} birth dates`}>
    <label style={{ display: "grid", gap: 8, fontSize: 13 }}>{label}: birth-date interpretation
      <select className="input" value={convention ?? ""} onChange={event => onChange(event.target.value as DateConvention || undefined)}>
        <option value="">No convention selected</option>
        <option value="day-first">Day / month / year</option>
        <option value="month-first">Month / day / year</option>
      </select>
    </label>
    <p style={{ fontSize: 12 }}>Source evidence (all rows): {analysis.dayFirst} day-first, {analysis.monthFirst} month-first, {analysis.ambiguous} ambiguous, {analysis.invalid} invalid.</p>
    {analysis.conflict && <p role="alert">Conflicting day/month conventions. Correct the source dates; selecting an order cannot resolve this conflict.</p>}
    {!analysis.conflict && analysis.ambiguous > 0 && !convention && <p>Confirm an order before importing ambiguous dates.</p>}
    <details><summary>First five populated values</summary><ul>{analysis.sample.map((date, index) => <li key={index}>{date.raw} → {date.value ?? date.problem}</li>)}</ul></details>
    <p style={{ fontSize: 11 }}>Year-first text and typed Excel dates use their stored values. Output uses YYYY-MM-DD.</p>
  </section>;
}
