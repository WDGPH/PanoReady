# Canonical runtime implementation

PanoReady now routes spreadsheet and XML intake through one source-independent student model before validation and serialization.

## Implemented

- Worksheet and header discovery using canonical aliases rather than fixed sheet names or positions.
- Import preview with mapped, duplicate, and unmapped columns plus populated-value counts.
- Positive-evidence row detection when a configured marker row is absent.
- Formula, merged-cell, hidden-sheet, unknown-column, duplicate-column, and ambiguous-date diagnostics.
- Exact lookup of codes and human-readable definitions from supported workbook lookup tables.
- Deterministic date, phone, postal-code, whitespace, casing, and gender normalization. Intake `X` and `N` become `Other`.
- Canonical nested guardians, addresses, and typed phones with provenance retained during workbook import.
- Default, `ns1`, and arbitrary-prefix Ontario namespace parsing.
- Required metadata, all configured controlled-value sets, formats, lengths, duplicates, and identity-review validation.
- Source/canonical/serialized/reparsed count reconciliation.
- Local-only parsing with macro/formula execution disabled and explicit resource limits.

## Compatibility and readiness

PanoReady's built-in contract implements STIX/Panorama import requirements and adds data-quality checks for ambiguous mappings, duplicates, normalization, and count reconciliation. Errors produce `BLOCKED`, review warnings produce `REVIEW_REQUIRED`, and a file without either produces `READY`.

The runtime records `xsdValidated: false` because the current release does not run a separate schema-validation layer. `READY` means that all checks implemented by PanoReady passed; external acceptance remains controlled by the destination system. Compatibility should continue to be protected through synthetic accepted/rejected cases, round-trip tests, and submission testing.
