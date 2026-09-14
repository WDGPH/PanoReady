# Compare Files

Compare Files accepts a previous and current supported XML or XLSM input. A workbook with unresolved import findings must first be repaired through Validate & Fix.

File setup accepts separate optional labels for the previous source, current source, and comparison reviewer. They stay in memory, appear in the local review log, and never enter STIX XML.

Records with a unique OEN in both files match by OEN. Repeated OENs remain ambiguous. For records where both OENs are blank, fallback matching requires the same school, name, and birth date. A populated conflicting OEN is never overridden by name or school similarity. Sorting and input order do not decide a match.

The result separates added, removed, changed, unchanged, ambiguous, and unmatched records. A transfer is reported only for a matched student whose nonblank school number changed. School-name edits alone are not transfers.

For each changed field, record one of these review labels:

- **Keep current** when the current value is accepted for analysis; or
- **Needs fix in Validate & Fix** when the source should be corrected before submission.

These labels are analysis state only. Compare Files never edits either document, applies a previous value, accepts a replacement, or regenerates XML. Make corrections through Validate & Fix, where they use the canonical session updater, stale-value checks, and Undo last action.

The Review log download records each changed field, its previous and current values, the review label, and optional source/reviewer context. It is a local analyst aid and is not a submission file. Comparison does not waive validation errors or establish readiness.

Comparison parsing and matching run locally in the browser. Review decisions, labels, and filters remain in memory until the page is reset or reloaded.
