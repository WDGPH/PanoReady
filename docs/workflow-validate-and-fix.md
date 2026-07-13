# Workflow: Validate & Fix

The Validate & Fix workflow performs a full structural and rules-based validation of a STIX XML file, lets you review and apply corrections, revalidates after fixes, and produces a cleaned XML file alongside a complete audit report.

## When to Use

Use this workflow when you need to:
- Confirm a file meets all submission requirements before uploading to the ministry system.
- Identify and fix specific field errors (missing values, invalid grades, malformed dates, etc.).
- Produce an auditable record of every change made to the file.

## Step-by-Step Flow

### Step 0 — Upload

On the home screen, drop or select your STIX XML file, then click the **Validate & Fix** card.

The app parses the XML into student records. If the XML is not well-formed, an error is shown and you are returned to the upload screen. After a successful parse you are taken to the Cleaning step before validation runs.

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
| `READY` | No blocking errors found; file can proceed to download. |
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

**Action:**

- **Apply & Revalidate** — Applies all staged fixes to the XML and reruns the full validation pass.

---

### Step 4 — Revalidate

After fixes are applied, the Revalidate screen shows a side-by-side before/after comparison and a full audit of every change.

**Comparison cards:**

| Card | Shows |
|---|---|
| Before | Error count, warning count, and gate state from the initial validation |
| After | Error count, warning count, and gate state after fixes were applied |

**Applied Fixes audit table:**

Every fix that was applied is listed with:

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

**Gate banner:** Prominently shows READY or BLOCKED.

**Summary stats:**

- Fixes applied
- Remaining issues
- Total students in the file

**Downloads:**

| File | Contents |
|---|---|
| `{original-filename}_validated.xml` | The cleaned XML file with all staged fixes written in. |
| `{original-filename}_issue_report.csv` | A CSV audit log of every issue found, including whether it was fixed and what the new value is. |

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
parseStixXml(xmlText)         ← lib/validator.ts
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
Download cleanedXml + generateIssueReportCsv()
```

---

## Error Handling

- **Malformed XML** — Validation fails at the parse step; an error is displayed and the user must re-upload a valid XML file.
- **Missing root element** — `ns1:SchoolUpload` must be the root; if absent, the gate is set to BLOCKED with a structural error.
- **Schools without SchoolNumber** — Treated as structural errors; all students in that school are flagged.
- **Fix fails to resolve an error** — After revalidation, if an error persists, the gate remains BLOCKED and the remaining issues are visible on the revalidate screen.
