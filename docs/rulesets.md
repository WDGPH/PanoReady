# Validation and cleaning profiles

The built-in profile supplies PanoReady's fixed destination baseline: required fields, supported controlled values, maximum lengths, postal-code pattern, maintained grade and gender aliases, phone checks, and duplicate detection. A custom profile may add local requirements, narrow allowed values or lengths, add phone placeholders, and configure supported cleaning mappings. It cannot weaken or replace the baseline, open the XML structure, add workbook layouts, bypass date interpretation, or preserve unknown fields.

Profiles can be created, duplicated, edited, imported, and exported from **Validation ruleset** in Validate & Fix. Imported and edited profiles stay only in application memory for the current page session. Export the JSON before reload to keep or share it.

The required profile fields are enforced during import. Use the exported built-in profile as the starting shape. Main sections include:

| Field | Purpose |
|---|---|
| `requiredFields` | May add canonical student or school requirements; baseline fields cannot be removed |
| `allowed*Values` | May narrow the baseline code lists; unsupported values cannot be added |
| `fieldLengths` | May reduce baseline maximums; baseline limits cannot be increased or removed |
| `postalCodePattern` | Fixed to the supported baseline pattern |
| `gradeAliases`, `genderAliases` | May retain or remove baseline aliases; entries cannot be added or changed |
| `phoneConfig` | May add placeholders; baseline placeholders and notice level remain enforced |
| `duplicateDetection` | Baseline duplicate checks cannot be disabled |

Unknown rule keys are reported and ignored. A malformed or baseline-relaxing profile is rejected with the incompatible setting named. Values are case-sensitive unless the specific validator or mapping documents normalization.

## Cleaning mappings

A profile may contain `cleaning.enabledFields` and ordered `cleaning.mappings` entries. Each entry has `raw`, `canonical`, and optional `matchCase` values. Cleaning compares the whole field, ignores case by default, and uses the first match. It does not run regular expressions or partial replacements. Suggestions remain reviewable and enter the same action history as other changes.

Use profiles only for verified local policy. Do not broaden a controlled list because an unexpected source value appears; confirm the intended submission code first.
