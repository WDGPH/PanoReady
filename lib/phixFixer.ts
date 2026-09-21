/**
 * PHIX fix application utilities.
 *
 * applyPhixFixes          — applies AppliedFix[] to raw CSV text and returns the updated CSV.
 * applyPhixFixesToRecords — applies fixes to in-memory PhixRecord[] (for UI preview).
 */

import Papa from "papaparse";
import type { AppliedFix, PhixRecord } from "./types";

/**
 * Apply a set of approved fixes to the raw CSV text.
 *
 * Re-parses with PapaParse (same settings as phixParser), mutates the rows
 * in-place, then unparses back to CSV. Header order, quoting, and delimiter
 * are preserved faithfully.
 */
export function applyPhixFixes(csvText: string, fixes: AppliedFix[]): string {
  if (fixes.length === 0) return csvText;

  // Build a lookup: rowId → { FIELD → newValue }
  // AppliedFix.recordId is "row1", "row2", … matching PhixRecord.id.
  // AppliedFix.field is the UPPER CASE column name.
  const byRow = new Map<string, Map<string, string>>();
  for (const fix of fixes) {
    if (!byRow.has(fix.recordId)) byRow.set(fix.recordId, new Map());
    byRow.get(fix.recordId)!.set(fix.field.toUpperCase(), fix.newValue);
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toUpperCase(),
  });

  const updated = parsed.data.map((row, i) => {
    const rowId = `row${i + 1}`;
    const rowFixes = byRow.get(rowId);
    if (!rowFixes) return row;
    const next = { ...row };
    for (const [col, val] of rowFixes) {
      if (col in next) next[col] = val;
    }
    return next;
  });

  return Papa.unparse(updated, {
    header: true,
    columns: parsed.meta.fields,
  });
}

/** Apply fixes to in-memory PhixRecord[] without re-parsing CSV. */
export function applyPhixFixesToRecords(
  records: PhixRecord[],
  fixes: AppliedFix[],
): PhixRecord[] {
  if (fixes.length === 0) return records;
  const byRecord = new Map<string, Map<string, string>>();
  for (const fix of fixes) {
    if (!byRecord.has(fix.recordId)) byRecord.set(fix.recordId, new Map());
    byRecord.get(fix.recordId)!.set(fix.field.toUpperCase(), fix.newValue);
  }
  return records.map((r) => {
    const fieldFixes = byRecord.get(r.id);
    if (!fieldFixes) return r;
    return { ...r, fields: { ...r.fields, ...Object.fromEntries(fieldFixes) } };
  });
}
