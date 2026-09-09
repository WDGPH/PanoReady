# Canonical runtime implementation

PanoReady now routes spreadsheet and XML intake through one source-independent student model before validation and serialization.

## Implemented

- Worksheet and header discovery using canonical aliases rather than fixed sheet names or positions.
- Import preview with mapped, duplicate, and unmapped columns plus populated-value counts.
- Positive-evidence row detection when the official marker row is absent.
- Formula, merged-cell, hidden-sheet, unknown-column, duplicate-column, and ambiguous-date diagnostics.
- Exact lookup of codes and human-readable definitions from the official workbook's ten controlled-value tables.
- Deterministic date, phone, postal-code, whitespace, casing, and gender normalization. Intake `X` and `N` become `Other`.
- Canonical nested guardians, addresses, and typed phones with provenance retained during workbook import.
- Default, `ns1`, and arbitrary-prefix Ontario namespace parsing.
- Required metadata, all configured controlled-value sets, formats, lengths, duplicates, and identity-review validation.
- Source/canonical/serialized/reparsed count reconciliation.
- Local-only parsing with macro/formula execution disabled and explicit resource limits.

## Readiness limitation

`/home/jovyan/Template Aug2026.xlsm` contains only a schema-location reference to `studentuploaddata.xsd`; it does not contain that file or an embedded equivalent, and its VBA does not validate against an XSD. The schema is also not publicly discoverable from an authoritative Ontario source.

The runtime records `xsdValidated: false`, but the current gate is based on implemented findings: errors produce `BLOCKED`, review warnings produce `REVIEW_REQUIRED`, and a file without either produces `READY`. `READY` therefore means that the checks implemented by PanoReady passed; it does not claim authoritative XSD conformance. Once WDGPH supplies the schema, browser-local XSD validation and golden accepted-file tests should be added.
