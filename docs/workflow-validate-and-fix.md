# Workflow: Validate & Fix

The Validate & Fix workflow imports STIX XML or a supported workbook, optionally applies cleaning mappings, validates metadata and records, lets you review and apply corrections, revalidates the result, and provides XML and reporting downloads.

## When to Use

Use this workflow when you need to:
- Check a file against the implemented STIX/Panorama submission requirements before upload.
- Identify and fix specific field errors (missing values, invalid grades, malformed dates, etc.).
- Produce an auditable record of every change made to the file.

## Step-by-Step Flow

### Review history and Undo

**Save progress** below the right-hand navigation button downloads unencrypted `_in_progress.xml` containing the current file and applied corrections, including unresolved issues. Upload it through normal intake to continue with a fresh assessment. Unapplied edits, cleaning previews, ruleset settings, exclusions and Undo history are not saved. Nothing is saved automatically; encrypted ZIP output remains available on the Output page.

**History** opens from the right edge as a drawer, closed by default, without reserving space beside the centred review tables. Use the History control to open it and the close button, Escape, or the shaded area outside to close it. After applying corrections, it lists each automatic-fix batch, manual-fix submission, and confirmed cleaning mapping batch with its number of field changes. Address corrections submitted together stay in the same action. History shows aggregate labels and counts; it does not display student details or correction values.

**Undo last action** reverses the most recent action still applied and rechecks the restored file using the currently selected ruleset. Repeat Undo to work backwards. Undone entries remain visible in History, while the output file and fix reports include only corrections still applied. There is no Redo; review and apply the findings again if needed.

Undo returns to the fixes view and clears unapplied selections and address drafts so they cannot target findings from the previous file state. It is unavailable while corrections are being applied or a cleaning summary is awaiting confirmation. Ruleset choices and review exclusions are not undone. History belongs to the current review and is cleared when you start over or reload.

### Step 0 — Select rules and import

Select **Validate & Fix**, choose the validation ruleset, and then drop or select a STIX XML or `.xlsm` workbook. Click **Validate & Fix** to process it.

For workbook input, review the detected file metadata and import preview first. Populated columns that are unmapped or mapped more than once block processing until you map or explicitly ignore them. PanoReady converts the workbook to STIX XML without executing macros.

The app then parses the XML into student records. A malformed or unsupported document produces an error on the upload screen. After a successful parse, the workflow opens the optional cleaning step before validation runs.

---

### Step 1 — Clean (optional)

The Cleaning step lets you define field-value mappings to standardise inconsistent data **before** validation rules are applied. For example, if your SIS exports `"Gr. 7"` but the ruleset expects `"GR7"`, you can map the raw value to the canonical form here rather than treating it as a validation error.

**Field picker (left panel):**

- Click a field name to add it to the active field list.
- Controlled-vocabulary fields (`Grade`, `Gender`, `Language`, `Province`) are excluded — use grade/gender aliases in your ruleset for those.
- If a selected field has no values in the current file, the mapping table will show "No values found for this field in the loaded file."

**Mapping table (right panel):**

Once a field is selected, the table shows every distinct value found in the file with its occurrence count.

| Column | Description |
|---|---|
| Raw value | The exact string currently in the XML |
| Occurrences | Number of records containing this value |
| Map to | The replacement value to write. Leave blank to keep the original. |
| Match case | When checked, the raw value is matched case-sensitively (default: case-insensitive). |

A collapsible **Pre-defined mappings** section also shows mappings whose raw value did not appear in the current file. These are still included when you click Apply & Continue but will produce a zero count in the summary; they remain in the profile and will fire on future files where a match exists.

**Actions:**

| Button | Effect |
|---|---|
| **Save to ruleset** | Persists the current cleaning profile to the active custom ruleset so it loads automatically next time. Requires a custom ruleset to be active. |
| **Apply & Continue** | Runs the mappings against all records and advances to the Cleaning Summary screen. |
| **Skip to validation** | Proceeds directly to validation with the original, unmodified XML. |
| **Back** | Returns to the upload screen. |

---

### Step 1a — Cleaning Summary

After applying mappings, the Cleaning Summary screen shows which rules fired and how many records each one changed.

**Summary table columns:**

| Column | Description |
|---|---|
| Field | The XML field the mapping targeted |
| Raw | The original value that was matched |
| Canonical | The replacement value that was written |
| Records changed | Count of records affected |

Mappings that matched zero records are highlighted with a warning — they had no effect on this file.

**Actions:**

- **Back to cleaning** — Return to the mapping editor.
- **Continue to validation** — Apply the changes to the XML and run the full validation pass.

---

### Step 2 — Review Issues

The Issues screen shows every validation finding in a filterable table.

**Table columns:**

| Column | Description |
|---|---|
| Severity | `error`, `warning`, or `info` (color-coded) |
| Student | Student name the issue belongs to |
| School | School number |
| Field | The XML field with the problem (e.g. `Grade`, `BirthDate`) |
| Current Value | The value currently in the XML |
| Issue | Human-readable description of the problem |
| Suggested Fix | The correction the app recommends, if it can determine one automatically |

**Filters available:**

- **Severity** — Show only errors, only warnings, only info, or all.
- **School** — Filter to a specific school number.
- **Auto-fixable only** — Show only issues the app can correct automatically (i.e. those with a suggested fix).
- **Text search** — Free-text search across student name, field, and message columns.

**Gate badge:**

A READY / BLOCKED badge in the top-right corner reflects the overall gate state:

| State | Meaning |
|---|---|
| `READY` | No blocking errors or review warnings were found. |
| `REVIEW_REQUIRED` | No blocking errors remain, but one or more warnings require review. Informational Canadian area-code policy findings do not produce this state. |
| `BLOCKED` | One or more errors are present; the file should not be submitted without review. |
| `PENDING` | Validation has not yet run. |

**Summary stats** shown above the table:

- Total issues
- Error count
- Warning count
- Auto-fixable count

**Actions:**

- **Fix Issues** — Proceed to the fix editor (Step 3).
- **Skip to Download** — Bypass the fix step and go directly to the download screen. The file will still reflect any gate state.

---

### Step 3 — Fix Data

The Fix screen presents every issue that has either a suggested fix or can accept a manual correction.

**Table columns:**

| Column | Description |
|---|---|
| Student | Student name |
| Field | The XML field to change |
| Current Value | The value in the original XML |
| New Value | Editable input — pre-filled with the suggested fix if one exists |

**Controls:**

- **Auto-fill All Fixable** — Populates every empty "New Value" cell with its suggested fix in one click.
- **Clear All** — Removes all staged values, resetting the form.
- **Use suggested** (per-row button) — Applies the suggested fix for that row only.
- **Fixes staged counter** — Shows how many fixes are currently staged.

**Rules for entering manual fixes:**

- Leave the New Value blank to skip that issue — the original value is preserved.
- Any non-blank value you type will be applied as-is; ensure it matches the expected format for that field (see [Validation Rules](./validation-rules.md)).
- Postal-code normalization and numeric-position O/I/L repairs are bulk-safe
  suggestions. They are staged, audited, applied, and revalidated through this
  same screen; unresolved postal-code values remain manual issues.
- Deterministic phone formatting and leading-country-code removal use the same
  staged and audited path. Unambiguous extension variants (`X`, spaced `x`,
  `ext`, `ext.`, `extension`, and `#`) are normalized to canonical form: lowercase
  `x` followed by 1–5 digits. Missing, overlong, or non-numeric extensions,
  invalid NPA/NXX digits, placeholders, and Canadian geographic area-code
  policy findings are never auto-fixed.

**Action:**

- **Apply & Revalidate** — Applies all staged fixes to the XML and reruns the full validation pass.

---

### Step 4 — Revalidate

After corrections are applied, the Revalidate screen shows a side-by-side before/after comparison. Its heading distinguishes corrections from field changes: a coordinated address repair is one correction even when it updates several XML fields. The After card reports automatic and manual corrections separately, with cleaning mappings and earlier uncategorized corrections shown when present.

**Comparison cards:**

| Card | Shows |
|---|---|
| Before | Error count, warning count, and gate state from the initial validation |
| After | Error count, warning count, and gate state after fixes were applied |

**Applied corrections audit:**

Every field change that was applied records:

| Column | Description |
|---|---|
| Student | Student name |
| Field | XML field that was changed |
| Before | Original value |
| After | New value that was written |

**Warning banner:**

If blocking errors remain after fixes (gate is still BLOCKED), a warning banner is displayed. You can return to the fix screen to address remaining errors, or continue to download with the BLOCKED state acknowledged.

**Action:**

- **Continue to Download** — Proceed to the final screen.

---

### Step 5 — Download

The Download screen provides the final outputs.

**Gate banner:** Shows `READY`, `REVIEW_REQUIRED`, or `BLOCKED` based on the latest validation result.

**Summary stats:**

- Corrections applied, split into automatic and manual corrections (plus cleaning or earlier corrections when present)
- Field changes
- Remaining issues
- Total students in the file

**Downloads:**

| File | Contents |
|---|---|
| `{original-filename}_validated.xml` | The cleaned XML file with all staged fixes written in. |
| `{original-filename}_validated.zip` | The validated XML in an optional AES-256 encrypted ZIP. Passwords must contain at least eight characters and are not saved. |
| `{original-filename}_issue_report.csv` | A CSV audit log of every issue found, including whether it was fixed and what the new value is. |
| `{original-filename}_pretty.xml` | A reformatted copy for easier inspection, not for submission. |
| `{original-filename}_all_students.csv` | All extracted student rows. |
| `{original-filename}_filtered_students.csv` | Students in `GR7` or `GR8` whose birth year is 2012 or 2013. This built-in filter is fixed. |
| `{original-filename}_school_counts.csv` | Student counts grouped by school name and birth year. |
| `{original-filename}_grade_counts.csv` | Student counts grouped by school name and grade. |
| `{original-filename}_report.xlsx` | The four preceding student and summary datasets as separate worksheets. |

The **Filter & Custom Report** section can narrow the latest validated records by school, grade, gender, birth year, and age. Birth year is derived from a valid `YYYY-MM-DD` birth date; missing or invalid dates appear as `(unknown)`. **Students CSV** downloads `{original-filename}_filtered_students_custom.csv` with the same student columns as the pre-generated `all_students.csv`, limited to the current selection. The section also downloads school-summary, age-group, and issue CSVs. Records with an unparseable birth date are not excluded by the age range, but can be included or excluded with the `(unknown)` birth-year option.

The pretty-print download parses and serializes the XML, so it can change whitespace, comments, processing instructions, and empty-tag formatting. Keep the validated XML as the submission-oriented output.

**Issue report CSV columns:**

`IssueID`, `Severity`, `RuleID`, `SchoolNumber`, `StudentName`, `Field`, `OriginalValue`, `SuggestedFix`, `Applied`, `AppliedValue`, `Message`

---

## Validation Rules

The full set of rules checked during this workflow is documented in [Validation Rules](./validation-rules.md).

---

## Key Files

| File | Role |
|---|---|
| `lib/validator.ts` | Core validation engine — parsing, rule checks, fix application, CSV generation |
| `lib/cleaning.ts` | Cleaning logic — `applyCleaningProfile()`, `discoverFieldValues()` |
| `config/rules.stix.default.json` | Rule configuration — required fields, allowed values, patterns, aliases |
| `lib/types.ts` | `ValidationResult`, `ValidationIssue`, `AppliedFix`, `StudentRecord`, `ValidateSession`, `CleaningProfile`, `CleaningMapping`, `CleaningSummaryEntry` |
| `components/CleaningView.tsx` | Mapping editor UI (Step 1) |
| `components/CleaningSummaryView.tsx` | Post-cleaning summary screen (Step 1a) |
| `app/page.tsx` | UI screens: `CleaningView`, `CleaningSummaryView`, `ValidateIssuesView`, `ValidateFixView`, `ValidateRevalidateView`, `ValidateDownloadView` |

---

## Data Flow

```
Upload XML
    │
    ▼
parseSTIXXml(xmlText)         ← lib/validator.ts
    │
    ▼
StudentRecord[]               ← in-memory records for cleaning
    │
    ▼
applyCleaningProfile()        ← lib/cleaning.ts (skipped if user clicks Skip)
    │
    ▼
CleaningSummaryEntry[]        ← user reviews which mappings fired
    │
    ▼
applyValidationFixes(xml, syntheticFixes)  ← converts cleaning changes back to XML
    │
    ▼
validateXml(cleanedXml)       ← lib/validator.ts
    │
    ▼
ValidationResult              ← { gate, issues[], records[], studentCount, schoolCount }
    │
    ▼
User stages fixes             ← AppliedFix[]
    │
    ▼
applyValidationFixes(xml, fixes)  ← lib/validator.ts
    │
    ▼
cleanedXml + validateXml(cleanedXml)  ← revalidation pass
    │
    ▼
Download validated/formatted XML, reports, or an encrypted ZIP
```

---

## Error Handling

- **Malformed XML** — Validation fails at the parse step; an error is displayed and the user must re-upload a valid XML file.
- **Missing root element** — `ns1:SchoolUpload` must be the root; if absent, the gate is set to BLOCKED with a structural error.
- **Schools without SchoolNumber** — Treated as structural errors; all students in that school are flagged.
- **Fix fails to resolve an error** — After revalidation, if an error persists, the gate remains BLOCKED and the remaining issues are visible on the revalidate screen.
