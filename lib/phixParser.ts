/**
 * PHIX CSV parser.
 *
 * Parses a PHIX immunization CSV file into PhixRecord[].
 * Field keys are the UPPER CASE column headers exactly as they appear in the file.
 * Row IDs are "row1", "row2", … matching 1-indexed CSV data row numbers
 * (i.e. the header row is not counted).
 */

import Papa from "papaparse";
import type { PhixRecord } from "./types";

export type PhixParseResult =
  | { ok: true; records: PhixRecord[]; headers: string[] }
  | { ok: false; error: string };

/**
 * Parse PHIX CSV text into PhixRecord[].
 * Throws on catastrophic parse failure; callers should catch and surface as an error issue.
 */
export function parsePhixCsv(csvText: string): PhixParseResult {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toUpperCase(),
    transform: (v) => v,
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    return {
      ok: false,
      error: `CSV parse failed: ${result.errors[0].message}`,
    };
  }

  const headers = result.meta.fields ?? [];

  const records: PhixRecord[] = result.data.map((row, i) => {
    const rowNum = i + 1;
    // Normalize field keys to UPPER CASE (already done by transformHeader,
    // but guard against any dynamic keys that slip through).
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      fields[k.toUpperCase()] = v ?? "";
    }
    return {
      id: `row${rowNum}`,
      rowPath: `Row ${rowNum}`,
      fields,
    };
  });

  return { ok: true, records, headers };
}
