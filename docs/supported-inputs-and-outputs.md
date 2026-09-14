# Supported inputs and outputs

PanoReady deliberately accepts a small, project-supported contract. The repository does not contain a currently verified authoritative workbook template or XSD artifact, so this page describes observable compatibility implemented and tested by PanoReady. It is not a complete specification of STIX or a promise that another system will accept a file.

## STIX XML input

The root must be `SchoolUpload` in the `http://ontario.ca` namespace. Equivalent prefixes and a default namespace are accepted. Every STIX element must use that namespace. The supported hierarchy is:

| Container | Supported children |
|---|---|
| `SchoolUpload` | one `Metadata`; repeated `School` |
| `Metadata` | `CreateDate`, `CreateTime`, `CreatedBy`, `ContactPhone`, `ContactEmail`, `FullUpload`, `SchoolBoard` |
| `SchoolBoard` | `BoardNumber`, `Name` |
| `School` | `SchoolNumber`, `Name`, `Students` |
| `Students` | repeated `Student` |
| `Student` | `OEN`, `Grade`, `Class`, `Name`, `AliasName`, `Gender`, `BirthDate`, `Language`, `CountryOfOrigin`, up to two `Guardian` elements, `Address`, `Phone` |
| `Name` and `AliasName` | `First`, `Middle`, `Last` |
| `Guardian` | `Name`, `Relationship`, `Phone` |
| `Address` | `Unit`, `StreetNumber`, `StreetNumberSuffix`, `StreetName`, `StreetType`, `StreetDirection`, `RuralRoute`, `PoBoxNumber`, `City`, `Province`, `PostalCode` |

Only `type` on phone elements, namespace declarations, and `xsi:schemaLocation` on the root are accepted attributes. Unknown elements or attributes, foreign namespaces, duplicate singleton elements, more than two guardians, mixed container text, multiple roots, `DOCTYPE`, and entity declarations are rejected before values enter the working model. Standard XML entities are decoded safely.

Comments, the XML declaration, prefixes, whitespace, empty optional elements, and input element order are presentation details. Accepted values are kept in the canonical working document, escaped on output, and written in canonical order. PanoReady emits its own declaration, namespace prefix, and schema-location identifier. It does not fetch or execute a remote schema.

XML input is limited to 50,000,000 characters and 250,000 students. Workbook intake uses a separate 50 MB compressed-file limit; compressed workbook size is not an estimate of expanded browser memory.

A supported structure may still contain missing or invalid values. Those values enter Validate & Fix as repairable findings. Structural content that cannot be represented is rejected instead of discarded.

## Workbook input

Workbook input must have the `.xlsm` extension and contain:

- a `Student Info` sheet with exactly one header row in the first 60 rows that maps `First Name`, `Last Name`, and `Birthdate`;
- a `File Info` sheet with exactly one `Field` / `Value` heading and recognized metadata rows; and
- at most the known non-data sheets `Lists of Values` and `Student XML`, plus blank worksheets.

Recognized student headers are the canonical fields shown in the application and their maintained aliases in `lib/excel.ts`. Blank padding and formatting are tolerated. A populated unknown or duplicate semantic column, unexpected populated metadata row or cell, populated unknown sheet, formula in an input region, or hidden populated row/column is reported as outside the contract. Macros are never executed. Formula results and external links are not refreshed.

The workbook importer retains all supported student, alias, guardian, address, phone, school, and metadata values. It records source locations for review. It does not invent school identity from the filename or shorten names and OENs.

### Dates

Text dates are limited to valid year-first dates and an explicitly confirmed day/month/year or month/day/year convention. Ambiguous text is never guessed. Mixed contradictory day-first and month-first evidence blocks bulk conversion, including contradictions outside the deterministic sample. Every populated value is validated before output.

Typed workbook dates use the stored cell type/value, number format, and workbook 1900 or 1904 date system. Display formatting does not choose day/month order. The impossible Excel serial 60, time-bearing values, two-digit years, and invalid calendar dates are rejected. Output dates use `YYYY-MM-DD` without timezone conversion.

## Working session and output

After structural acceptance, one canonical STIX document owns editable state. Local school, student, and guardian IDs are session-only and never enter XML. Automatic, manual, cleaning, and metadata corrections use the same target and stale-value checks. A bulk action either commits as one group or fails without partial changes. Undo last action restores the previous values and nested records for that group.

Validate & Fix produces:

- `_checked.xml` when no blocking value errors remain, or `_draft.xml` when the file is still blocked;
- an optional AES-256 encrypted ZIP containing the generated XML file;
- an optional `.xlsx` review report with source context, action history, current findings, and the active local policy; and
- optional CSV or Excel summaries derived from the current records.

XML output uses the canonical serializer's standard indented formatting. The generated XML is parsed and reconciled before download. A `READY` label means the implemented structural, field, policy, duplicate, and reconciliation checks passed. It does not mean certified XSD validation or destination-system acceptance.

Compare Files is read-only. It reports conservative matches, added and removed records, field changes, school changes, and transfers between a previous and current supported document. Repeated OENs remain ambiguous. Fallback matching is limited to records with blank OENs and requires school, name, and birth date; populated conflicting OENs are never overridden. Review decisions and source/reviewer labels remain in memory and can be exported as a local comparison review log. Comparison does not modify either input, create a partial file, or establish submission readiness; make corrections in Validate & Fix.

## Privacy boundary

Parsing, validation, comparison, report creation, Validate & Fix corrections, and ZIP encryption run in the browser. Source files, profile contents, reviewer labels, passwords, working documents, and change history are held in memory for the current page session. PanoReady clears storage keys used by older versions and does not intentionally write operational values to local storage, session storage, IndexedDB, cookies, or Cache Storage. Reloading or resetting releases the in-memory session.

Save in-progress file is never automatic. It downloads an unencrypted STIX XML draft containing the current document and applied corrections, including unresolved validation findings. Upload that XML through normal intake to continue with a fresh assessment. Draft edits, settings, exclusions, reviewer labels and Undo history are not included. Original workbook bytes are not included; changing workbook mapping or date interpretation requires the original workbook. ZIP files and the former saved-review format are not accepted inputs. Password-protected ZIP output remains available on the output page.

Downloaded XML, reports, and ZIPs can contain sensitive records. Handle and delete them under the applicable organizational policy.
