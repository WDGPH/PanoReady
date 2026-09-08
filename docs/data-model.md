# Data model

`lib/types.ts` defines shared TypeScript types. Refer to that file for exact fields; this page explains how the main objects are used.

| Type | Role |
|---|---|
| `Workflow` | `validate`, `clean`, `export`, `pretty`, or `compare` |
| `SessionData` | Source XML, file name, cleaning results, and report data |
| `StudentRecord` | Validation record with an ID, XML path, and string-valued field map |
| `ValidationIssue` | Severity, rule ID, field, message, and optional suggested correction |
| `AppliedFix` | Record and issue IDs, old and new values, rule ID, and timestamp |
| `ValidationResult` | Records, issues, school/student counts, and validation status |
| `ValidateSession` | Original XML, initial result, staged fixes, optional rules snapshot, and revalidated output |
| `Student` | Flat report row with school, student, address, and guardian fields |
| `ExportResult` | Student rows, filtered rows, school counts, and grade counts |
| `StixComparison` | Matched, added, removed, and changed counts, field differences, transfers, and current XML |

## Validation status

`GateState` is `PENDING`, `READY`, or `BLOCKED`. A completed validation is `BLOCKED` if any issue has severity `error`; warnings and informational findings alone do not block it. `READY` means the configured checks found no errors. It does not certify acceptance by a receiving system.

Record IDs use school and student positions, such as `school0:student1`. They identify records within a particular parsed document, not people across files. Comparison uses its own matching logic; see [Compare Files](workflow-compare-files.md).

## Rules and cleaning

`RulesProfile` contains required fields, allowed codes, patterns, aliases, length limits, phone settings, and duplicate settings. `CustomRuleset` adds an ID, name, creation timestamp, optional description, and optional `CleaningProfile`.

A cleaning profile lists enabled fields and ordered mappings. Each `CleaningMapping` has a raw value, replacement value, and optional case-sensitive flag. The first matching mapping wins. `CleaningSummaryEntry` records the field, mapping, and match count. See [Rulesets](rulesets.md).

## Browser storage

Custom rulesets and workbook metadata use local storage. Rulesets can contain cleaning mappings, so avoid putting personal values in shared ruleset files. Session helpers in `lib/utils.ts` can serialize workflow data into session storage; check callers before changing persistence behaviour. Downloaded files exist outside browser storage and must be managed separately.
