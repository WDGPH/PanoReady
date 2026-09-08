# PanoReady — System Design

**Status:** Implemented browser-only architecture with documented limitations
**Date:** 2026-09-02
**Audience:** Product, engineering, data-quality, and privacy stakeholders

## 1. Executive summary

PanoReady is a browser-based utility for preparing Ontario school-enrollment data for Panorama/STIX workflows. It accepts STIX XML and Excel/XLSM source workbooks, maps inputs into a canonical student model, validates data against local rules, applies only deterministic fixes, and generates cleaned XML, issue reports, spreadsheets, and comparisons.

The application has no backend, accounts, upload endpoint, or server-side data store. Parsing, normalization, validation, XML serialization, and file generation run in the user’s browser. This is the primary privacy boundary: source records remain on the user’s device unless the user chooses to download or share an output.

The current readiness limitation is deliberate: the authoritative `studentuploaddata.xsd` is not available in the supplied workbook or from an authoritative public source. Therefore, files without implemented validation errors remain `REVIEW_REQUIRED` with `XSD_SCHEMA_UNAVAILABLE` until the schema and accepted-file fixtures are supplied.

## 2. Goals and non-goals

### Goals

- Provide a deterministic local workflow: intake → inspect → normalize → validate → review/fix → revalidate → export.
- Support both source-independent workbook intake and direct STIX XML workflows.
- Make every issue explainable through severity, rule ID, field, record, and XML/source location.
- Apply only safe, deterministic transformations automatically.
- Preserve original XML structure and fields when writing corrected values.
- Produce auditable outputs, including cleaned XML and issue reports.

### Non-goals

- Direct Panorama integration or API submission.
- Workflow/task routing, collaboration, or approval queues.
- Persistence of PHI on a server.
- Enterprise identity, permissions, or multi-user administration.
- Guessing identity, school assignment, dates of birth, gender, deduplication, or other ambiguous values.

## 3. Users and primary workflows

The repository describes operational users who prepare school enrollment files before submission. Exact roles and volume targets are not specified.

| Workflow | Input | Processing | Output |
|---|---|---|---|
| Validate & Fix | STIX XML or canonical workbook intake | Structure, required fields, controlled values, formats, duplicates, safe corrections, revalidation | Cleaned XML and issue report CSV |
| Clean XML | STIX XML | Phone formatting, unit standardization, street-number review | Cleaned XML |
| Export Reports | STIX XML | Student extraction, filtering, school/grade aggregation | CSV files and Excel workbook |
| Pretty Print | STIX XML | Consistent indentation | Formatted XML |
| Compare Files | Two STIX snapshots | Record, field, and school-level change detection | On-screen comparison and exportable results |

## 4. Architecture

```text
User browser
┌──────────────────────────────────────────────────────────────┐
│ Next.js / React UI                                            │
│  Home + workflow views + issue/fix/review components           │
│             │                                                │
│             ▼                                                │
│ Intake adapters                                               │
│  XML parser        Excel/XLSM importer                        │
│             │                                                │
│             ▼                                                │
│ Canonical student/upload model                                │
│  provenance + diagnostics                                     │
│             │                                                │
│             ├── local ruleset + cleaning profile              │
│             ├── validator / duplicate checks                  │
│             ├── XML cleaner / correction writer               │
│             ├── comparison engine                             │
│             └── CSV / XLSX / XML exporters                    │
│                                                              │
│ Browser memory + guarded localStorage                         │
└──────────────────────────────────────────────────────────────┘
                         │
                         ▼
                 User-selected downloads
```

The deployed runtime is a Next.js 16 application using React 19. The UI is client-side for data-bearing workflows. `fast-xml-parser` handles XML parsing, `xlsx` handles workbook processing and Excel output, `@zip.js/zip.js` supports packaged inputs, and `lucide-react` supplies interface icons.

There is no application API or remote persistence layer in the current design. Internal module calls are the system’s effective API boundaries.

## 5. Data flow

### 5.1 Workbook intake

1. The user selects an `.xls`/`.xlsx`/`.xlsm` workbook.
2. The importer discovers worksheets and headers using canonical aliases rather than fixed names or positions.
3. It reports mapped, duplicate, unmapped, hidden-sheet, formula, merged-cell, and ambiguous-date diagnostics.
4. Controlled values are resolved through the workbook’s ten lookup tables.
5. Values are normalized into canonical students, guardians, addresses, phones, schools, and metadata.
6. Provenance retains the raw value and source worksheet/cell location.
7. The canonical upload is validated and can be serialized to STIX XML after review.

Macro execution and formula execution are disabled. Local resource limits include a 50 MB XML limit and explicit import diagnostics.

### 5.2 XML validation and repair

1. The browser validates XML well-formedness and rejects unsupported `DOCTYPE`/entity declarations.
2. The parser accepts the default Ontario namespace, `ns1`, and arbitrary prefixes while matching elements by local name.
3. Metadata, schools, students, nested guardians, addresses, phones, unknown elements, duplicate singleton elements, required fields, formats, controlled values, and duplicates are checked.
4. The UI presents issues with severity, record, student, field, current value, explanation, suggested fix, and rule ID.
5. The user may apply safe fixes or enter a manual correction. Each applied fix records old value, new value, issue ID, rule ID, field, record, and timestamp.
6. Corrections are written back into the original XML DOM, preserving unknown fields and the broader document structure.
7. Revalidation produces a new gate state and output files.

## 6. Core components

| Component | Responsibility |
|---|---|
| `app/page.tsx` | Client workflow shell, upload handling, navigation, review/fix views, and download actions |
| `lib/excel.ts` | Workbook metadata discovery, canonical header mapping, lookup extraction, normalization, and import preview |
| `lib/canonical.ts` | Namespace-tolerant STIX parsing into canonical metadata, schools, students, guardians, addresses, phones, and provenance |
| `lib/validator.ts` | XML/canonical validation, issue generation, gate calculation, fix application, and CSV reports |
| `lib/cleaner.ts` | Phone and address cleanup, review updates, and pretty printing |
| `lib/stixExport.ts` | Structure-preserving XML corrections and school-scoped XML extraction |
| `lib/compare.ts` | Comparison of current and prior STIX snapshots |
| `lib/pullInfo.ts` | Student extraction and report aggregation |
| `lib/rulesets.ts` | Built-in/custom ruleset validation and browser persistence |
| `config/rules.stix.default.json` | Default required fields, controlled values, formats, aliases, phone policy, and duplicate settings |
| `schemas/*.schema.json` | Canonical upload and source-profile contracts |

## 7. Data contracts

The main in-memory contracts are:

- `CanonicalUpload`: schema version, batch ID, metadata, schools, and import diagnostics.
- `CanonicalStudent`: identity fields, OEN, grade, class, gender, birth date, guardians, address, phone, and provenance.
- `ValidationIssue`: severity, field/record context, message, suggested fix, auto-fixability, rule ID, and location.
- `AppliedFix`: issue/record/field correlation, old/new values, rule ID, and timestamp.
- `ValidationResult`: issues, records, school/student counts, and gate (`READY`, `BLOCKED`, `PENDING`, or the implemented `REVIEW_REQUIRED` limitation).

The source profile and canonical upload schemas are versioned JSON Schema artifacts. The canonical model is the integration boundary between source formats and downstream validation/export behavior.

## 8. Rules and safety policy

Rulesets are local JSON profiles. Custom rulesets are imported/exported by the user and stored in browser `localStorage`; they are not uploaded. A ruleset can define required fields, allowed values, field lengths, date fields, postal-code patterns, aliases, phone placeholders, Canadian area-code policy, and duplicate checks. Optional cleaning profiles define ordered raw-to-canonical mappings for selected fields.

Safe transformations include whitespace trimming, known code/alias normalization, deterministic date formatting, phone formatting when unambiguous, postal-code normalization, and known unit mappings. Manual review is required for ambiguous phone values, ambiguous dates, suspicious street numbers, identity changes, and other non-deterministic decisions.

## 9. Gate and operational behavior

The gate is intentionally explicit:

- `BLOCKED`: at least one blocking validation error remains.
- `READY`: all required validation prerequisites pass; enabling this state also requires authoritative XSD validation and accepted-file tests.
- `PENDING`: validation has not completed.
- `REVIEW_REQUIRED`: implemented checks pass, but authoritative XSD validation is unavailable.

Failures should be readable and local: invalid XML, unexpected root/namespace, unsupported entities, oversized input, missing required values, invalid controlled values, duplicate singleton elements, and ambiguous values are surfaced as actionable diagnostics.

## 10. Privacy, security, and resilience

- No upload endpoint, backend database, account system, or server-side PHI store exists.
- XML entity expansion is disabled/rejected; `DOCTYPE` and `ENTITY` declarations are not accepted.
- Macro and formula execution are disabled during workbook intake.
- Browser storage is limited to rulesets and selected workbook metadata; source data remains in the active session unless the user downloads it.
- Unknown XML elements are preserved in the original XML path and reported for review rather than silently discarded.
- Large-input performance may require Web Workers or chunked parsing in a future iteration; this must preserve the local-only boundary.

## 11. Key tradeoffs

| Decision | Benefit | Cost / risk |
|---|---|---|
| Browser-only processing | Strong privacy and simple deployment | Limited by device memory and browser performance |
| Canonical intermediate model | Source independence, provenance, and consistent validation | Additional mapping and reconciliation complexity |
| Structure-preserving XML edits | Retains fields the app does not understand | DOM path matching must remain carefully tested |
| Deterministic-only auto-fixes | Prevents silent data corruption | More manual review for ambiguous cases |
| Local custom rulesets | Supports board/PHU variation without a backend | Ruleset sharing and governance are user-managed |
| Conservative readiness gate | Prevents overstating compliance without the official XSD | Users cannot receive final `READY` status until the dependency is supplied |

## 12. Testing and verification

The repository contains Vitest coverage for canonical import, postal-code and phone validation, address repair, fields, rulesets, and related behavior. The validation demo fixture exercises structural failures, placeholder handling, postal/phone normalization, and nested guardian phones.

Recommended release checks:

1. Unit-test every validator, normalizer, serializer, and key-matching function.
2. Add golden-file tests for accepted and rejected STIX/XML and workbook inputs.
3. Verify source → canonical → serialized → reparsed counts reconcile.
4. Exercise upload errors, filters, safe bulk fixes, manual corrections, revalidation, gate transitions, downloads, and comparison flows.
5. When supplied, run authoritative XSD validation and accepted-file compatibility tests before enabling `READY`.

## 13. Risks and open decisions

- Obtain the authoritative `studentuploaddata.xsd` and representative accepted files from WDGPH.
- Confirm the exact operational roles, supported browser matrix, expected maximum workbook/XML sizes, and retention expectations.
- Decide whether a future Web Worker implementation is needed for large files.
- Define governance for custom ruleset distribution and versioning.
- Confirm whether `REVIEW_REQUIRED` should remain distinct from `BLOCKED` in user-facing exports and downstream operating procedures.

## 14. Definition of done

PanoReady is complete for the current browser-only scope when a user can locally intake a supported workbook or STIX XML file, inspect diagnostics, apply safe fixes and explicit manual corrections, revalidate, and download cleaned XML plus transparent reports without any source data leaving the browser. Final `READY` status remains contingent on the authoritative XSD and compatibility fixtures.
