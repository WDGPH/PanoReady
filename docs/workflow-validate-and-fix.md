# Validate & Fix

Use this workflow to check STIX records, review corrections, and download XML with an issue report. Keep the original file so you can compare it with the output.

## Load and clean

Select **Validate & Fix** and load an XML file or supported workbook. For workbooks, review the metadata before conversion.

The optional cleaning step maps values before validation. Select a field, inspect its distinct values and occurrence counts, and enter replacements. For example, map a known street-name spelling to the spelling used by your source system.

Controlled fields such as grade, gender, language, and province are excluded from the mapping picker. Use the ruleset's grade and gender aliases where appropriate.

- **Apply & Continue** applies the mappings and shows their match counts.
- **Save to ruleset** saves the profile when a custom ruleset is active.
- **Skip to validation** skips the mapping step.

Mappings are case-insensitive unless **Match case** is selected. A mapping with zero matches remains available for later files. Review the cleaning summary, then continue to validation.

## Review issues

The issue table shows severity, student, school, field, current value, message, and any suggested correction. Filter by severity, school, fixable issues, or search text.

`READY` means the active checks found no errors. `BLOCKED` means at least one error remains. Neither status establishes whether a receiving system will accept the file; see [Validation rules](validation-rules.md) for the checks and their limits.

## Apply fixes

Choose **Fix Issues** to review suggested values and enter manual corrections. **Auto-fill All Fixable** fills empty correction cells with suggestions; **Clear All** clears staged values. A blank correction leaves the original value unchanged.

Check identity, date, and school changes against the source system. Select **Apply & Revalidate** to write the staged values and run validation again. Review the before/after issue counts and applied-fix table. Return to the editor if errors remain.

## Download

The final screen shows the current status and remaining issues. Downloads include:

| Output | Contents |
|---|---|
| `{filename}_validated.xml` | XML after applied changes |
| `{filename}_issue_report.csv` | Findings and applied corrections |
| Filtered school, age, and issue CSVs | Reports for the selected filters |
| Password-protected ZIP | XML encrypted with AES-256 |

You can continue to download while the status is `BLOCKED`. Review unresolved errors before submitting the file. Share archive passwords separately and keep the issue report with the output for review.

The workflow uses `lib/validator.ts` for validation and fixes, `lib/cleaning.ts` for mappings, and the views in `app/page.tsx` and `components/` for review.
