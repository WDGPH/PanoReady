/**
 * Cleaning logic for the interactive cleaning step (validate workflow).
 *
 * Pure functions — no side effects, no XML touching.
 * XML application is handled by building synthetic AppliedFix[] in the pipeline
 * and passing them to applyValidationFixes() in validator.ts.
 */

import type { StudentRecord, CleaningProfile, CleaningSummaryEntry } from "./types";

// ─── Field picker helpers (shared by CleaningView and RulesetEditor) ──────────

/** All STIX fields eligible for cleaning mappings. */
export const ALL_CLEANABLE_FIELDS = [
  "SchoolName", "FirstName", "MiddleName", "LastName",
  "AliasFirstName", "AliasMiddleName", "AliasLastName",
  "BirthDate", "OEN", "Phone", "GuardianPhoneNumber", "Guardian2PhoneNumber",
  "City", "Province", "PostalCode", "StreetNumber",
  "StreetName", "StreetNumberSuffix", "Unit",
  "Grade", "Gender", "Language",
];

/**
 * Cleaning precedes validation, including checks of controlled vocabularies.
 * All supported fields remain available regardless of the selected checks.
 */
export function getCleanableFields(): string[] {
  return [...ALL_CLEANABLE_FIELDS];
}

/**
 * Apply a CleaningProfile to a set of records.
 * Returns a deep-copied, cleaned StudentRecord[] alongside a summary that
 * includes every defined mapping (including zero-match ones) for display.
 */
export function applyCleaningProfile(
  records: StudentRecord[],
  profile: CleaningProfile
): { records: StudentRecord[]; summary: CleaningSummaryEntry[] } {
  // counts[field][raw][canonical] = number of records changed
  const counts = new Map<string, Map<string, number>>();

  // Initialise count entries for every defined mapping (so zero-match appear in summary)
  for (const field of profile.enabledFields) {
    const mappings = profile.mappings[field] ?? [];
    if (!counts.has(field)) counts.set(field, new Map());
    const fieldCounts = counts.get(field)!;
    for (const { raw, canonical } of mappings) {
      const key = `${raw}\0${canonical}`;
      if (!fieldCounts.has(key)) fieldCounts.set(key, 0);
    }
  }

  const cleanedRecords = records.map((record) => {
    const newFields = { ...record.fields };
    let changed = false;

    for (const field of profile.enabledFields) {
      const mappings = profile.mappings[field];
      if (!mappings || mappings.length === 0) continue;
      const rawValue = newFields[field];
      if (rawValue === undefined) continue;

      for (const { raw, canonical, matchCase } of mappings) {
        const matches = matchCase === true
          ? rawValue === raw
          : rawValue.toLowerCase() === raw.toLowerCase();

        if (matches) {
          if (rawValue === canonical) break;
          newFields[field] = canonical;
          changed = true;
          const fieldCounts = counts.get(field)!;
          const key = `${raw}\0${canonical}`;
          fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1);
          break; // first match wins
        }
      }
    }

    if (!changed) return record;
    return { ...record, fields: newFields };
  });

  // Build summary in definition order (field → mapping order)
  const summary: CleaningSummaryEntry[] = [];
  for (const field of profile.enabledFields) {
    const mappings = profile.mappings[field] ?? [];
    const fieldCounts = counts.get(field) ?? new Map();
    for (const { raw, canonical } of mappings) {
      const key = `${raw}\0${canonical}`;
      summary.push({ field, raw, canonical, count: fieldCounts.get(key) ?? 0 });
    }
  }

  return { records: cleanedRecords, summary };
}

/**
 * Return unique values for a field across all records, with occurrence counts,
 * sorted descending by count. Used by CleaningView to populate the mapping table.
 */
export function discoverFieldValues(
  records: StudentRecord[],
  field: string
): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const record of records) {
    const value = record.fields[field];
    if (value === undefined || value === "") continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}
