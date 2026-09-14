# Validate & Fix

Validate & Fix uses one working STIX document through four visible stages.

## 1. Quality assessment

Select a supported XML or XLSM file. XML structure and workbook layout are checked before records enter the workflow. Structural incompatibility is rejected; invalid values within known fields remain available for repair.

In Validate & Fix, drop one file anywhere on the landing page or use Browse. Compare Files keeps separate previous/current drop targets.

XML assessment parses and validates the selected file in the browser before committing a working document. The assessment screen can return to intake before validation begins; once synchronous validation is running, unusually large files may briefly pause the interface.

For XLSM input, File setup shows mapped metadata, worksheet/header locations, unknown or duplicate populated columns, and birth-date evidence. Typed dates use workbook cell metadata. Ambiguous text requires an explicit day-first or month-first choice, and conflicting evidence blocks bulk conversion. All populated dates are checked even when the early suggestion uses a spread sample.

Quality assessment lists current errors, warnings, and information. Missing or invalid file metadata and school identity values have stable setup targets and can be edited in Manual fixes; these commits are labelled as setup actions and support Undo last action. Review exclusions hide issue groups from correction screens for the current file; they do not remove records, change validation totals, waive errors, or alter output.

## 2. Automatic fixes

PanoReady suggests only deterministic value changes, such as unambiguous phone or postal-code formatting and maintained code aliases. Suggestions start unselected. Review individual items, the current sorted page, or all matching pages before applying them.

An apply action preflights every stable target and expected old value. The whole group commits together or no values change. The current document is immediately revalidated. An Applied label records the write; it does not mean the value is valid.

Optional cleaning runs here before automatic validation fixes. Cleaning uses whole-value mappings. Matching is case-insensitive by default, first match wins, and regular expressions are not supported. Cleaning changes use the same grouped session update and history.

## 3. Manual fixes

Manual review includes unresolved errors and warnings, including automatic suggestions that were not accepted. Draft values belong to the workflow session and survive navigation. If another committed action changes their target or old value, the stale draft is blocked instead of overwriting newer data.

Pending edits follow stable record and field targets, not finding numbers. Unrelated corrections, revalidation, and review filters do not invalidate them. Changed original values or removed targets produce an outdated-edit warning; Discard outdated edits removes only those pending edits.

Select / Selected marks a proposed correction; Apply selected commits it. Clear selected removes uncommitted edits in the current review scope without changing the file. Remove value proposes an empty value and still requires Apply selected.

Unapplied automatic suggestions are entered manually here. Address findings appear in the same table; Edit address opens the multi-field editor. Back to fixes returns to the table with staged changes; Apply selected commits them through the same session updater.

Select a record label to view the complete current student entry in a read-only popup. Labels use one-based positions: Student 1.24 is student 24 in school 1 of this file, not an OEN or a cross-file identifier. Names remain available as fields inside the full entry, but are not used as its trigger or heading. Guardian, address, phone and school context is available there instead of repeated in correction rows. Hover over a field label to see its STIX hierarchy; keyboard focus exposes the same path to assistive technology.

Review tables separate Record, Field, and Issue from Current value and Action. The Action column contains the available correction control or source-file instruction, not necessarily a replacement text value. The filter icon beside Severity opens the severity choices and indicates when a filter is active.

Duplicate OEN and cross-school OEN findings require investigation in the source file. They do not offer replacement-OEN inputs, and their corrections are rejected by the session updater.

The workflow supports **Undo last action**, including the latest bulk group and supported nested guardian insertion or removal. Undo revalidates the restored document and keeps the action in history as undone. There is no selective undo or redo.

The history sits in a narrow right-hand column on wide desktop screens. On smaller screens it collapses to a compact control above the page, with Undo still available. Expand it to inspect applied and undone actions.

**Save in-progress file**, below the forward navigation button, downloads an unencrypted `_in_progress.xml` STIX file, including when validation is blocked. It includes applied corrections only. Upload it through the usual file picker to start a fresh assessment. Uncommitted edits, profile settings, exclusions and Undo history are not included. Keep the original workbook if you may need to change its mapping or date interpretation.

## 4. Summary and Output

The summary shows the current validation gate, counts, and action history. Return to either correction stage if work remains.

Output uses the canonical serializer's standard indented XML formatting. The generated XML is parsed and reconciled before the direct XML and encrypted ZIP downloads:

- `_checked.xml` and `_checked.zip` are used when no blocking errors remain;
- `_draft.xml` and `_draft.zip` are used while the gate is blocked; and
- the ZIP uses AES-256 and contains the generated XML file.

The optional review report is an XLSX workbook with input details, action history, current findings, source locations when known, the explicit age reference date, and active local policy. Age filters and reports use the valid `CreateDate` accepted during initial assessment, or that session's date when the metadata is missing, invalid, or in the future. This reference stays fixed if `CreateDate` is later edited or undone. Additional CSV and Excel summaries are derived from the current records and are built only when requested. Spreadsheet exports protect leading formula characters.

`READY` states that current implemented checks pass. It is not independent XSD certification or proof of destination-system acceptance.
