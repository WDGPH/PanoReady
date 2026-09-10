# Proposed canonical schemas and processing contracts

## Status

This is the PanoReady canonical contract, version `1.0.0`. The canonical workbook adapter, namespace-aware XML parser, layered validation, import diagnostics, deterministic serialization, and count reconciliation are implemented in the browser runtime. The contract implements STIX/Panorama import requirements and adds defensive data-quality and reconciliation checks.

The current runtime can return `READY` when its implemented checks find no errors or review warnings, while still recording `xsdValidated: false` because it does not run a separate schema-validation layer. PanoReady's contract covers required structure, controlled values, formats, reconciliation, and additional quality checks; compatibility must remain protected through synthetic accepted/rejected cases, round-trip tests, and submission testing.

The machine-readable companions are:

- [`schemas/canonical-upload.schema.json`](https://github.com/WDGPH/PanoReady/blob/main/schemas/canonical-upload.schema.json), which defines the source-independent upload model; and
- [`schemas/source-profile.schema.json`](https://github.com/WDGPH/PanoReady/blob/main/schemas/source-profile.schema.json), which defines reusable mapping profiles for public schools, private schools, boards, daycares, and other sources.

JSON Schema validity means an object has the correct structure and primitive formats. It does not by itself mean the upload is ready for submission. Export readiness is governed by the validation and reconciliation contracts below.

## Normative language

The words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** describe normative requirements.

## Contract boundaries

PanoReady processing should be divided into explicit stages:

```text
Source bytes
  -> source detection
  -> source inspection
  -> analyst-approved mapping
  -> raw row extraction
  -> canonical upload
  -> deterministic normalization
  -> validation and identity review
  -> STIX XML serialization
  -> namespace/structure/schema validation
  -> count and field reconciliation
  -> downloadable XML and audit report
```

Each stage MUST return diagnostics instead of silently discarding data or assuming that the next stage will repair it.

## Canonical upload contract

The canonical upload is the boundary between source-specific parsing and STIX-specific serialization. All spreadsheet, delimited-text, and XML adapters MUST produce the same canonical structure.

At a high level:

```text
CanonicalUpload
  schemaVersion
  batchId
  status
  source
  metadata
  schools[]
    schoolId
    schoolNumber
    name
    students[]
      recordId
      oen
      grade
      className
      name
      aliasName
      gender
      birthDate
      language
      countryOfOrigin
      guardians[]
      address
      phone
      identity
      provenance
  diagnostics[]
  transformations[]
```

### Structural invariants

- `schemaVersion` MUST identify the canonical contract version.
- `batchId`, `schoolId`, and `recordId` MUST be opaque local identifiers. They MUST NOT be derived by exposing student data in logs or URLs.
- A batch MUST contain at least one school.
- A school MAY contain zero students while still being structurally valid, but an empty school MUST produce a diagnostic.
- A student MAY have zero, one, or two guardians under the STIX/Panorama import contract.
- Missing source values MUST be represented as `null`, not invented defaults or placeholder text.
- Raw source values MUST remain available through provenance until the session is discarded.
- Unknown populated source columns MUST produce diagnostics and remain available for analyst review.
- Canonical values MUST be independent of spreadsheet row, column, and worksheet position.

### Source descriptor

The source descriptor records:

- detected format;
- original filename;
- MIME type when available;
- SHA-256 hash when calculated;
- adapter identifier;
- mapping profile identifier and version;
- selected worksheet and header row; and
- local import timestamp.

The hash is used for audit and duplicate-file detection. It MUST NOT cause the file to be transmitted to another service.

### Metadata contract

The canonical metadata model includes:

- Create Date
- Create Time
- Created By
- Contact Phone and Phone Type
- Contact Email
- Full Upload
- optional School Board Number and Name

For an export-ready upload:

- Create Date MUST be a valid date no later than the current date.
- Create Time MUST use `HH:mm:ss`.
- Created By MUST contain 1 through 100 trimmed characters.
- Contact Phone MUST be present and valid.
- Contact Email MUST be present and syntactically valid.
- Full Upload MUST be `YES` or `NO`.
- A board number, when supplied, MUST meet the active STIX/Panorama profile format.
- Every school MUST have a School Number containing no more than 100 characters.
- School Name and board information MAY be omitted only when the active submission policy permits it.

The JSON Schema allows null metadata so an incomplete import can exist as a draft. The readiness validator MUST enforce the rules above before export.

### Student contract

For an export-ready student:

- First Name MUST be present.
- Last Name MUST be present.
- Birthdate MUST be a real ISO date in `YYYY-MM-DD` form and MUST NOT be in the future.
- Gender MUST be present and canonical.
- OEN MAY be absent. When present, it MUST contain exactly nine digits.
- Grade MAY be absent under the built-in contract, but a source or organization profile MAY require it.
- Controlled fields MUST use values in the active validation profile.

The final canonical Gender values are `F`, `M`, `Unk`, and `Other`. Raw `X` and `N` workbook-input aliases are retained in provenance and normalize to `Other`.

Field lengths MUST follow the active PanoReady ruleset and remain covered by submission compatibility tests.

### Name contract

A person name contains:

- First
- Middle
- Last

The student's primary name object MUST exist. Alias and guardian names MAY be null or partial when permitted by validation policy.

Name normalization MUST NOT alter the displayed or exported spelling merely to improve identity matching. A separate comparison form MAY normalize Unicode, whitespace, case, apostrophes, and hyphens for matching purposes.

### Guardian contract

A guardian contains:

- nested Name;
- Relationship; and
- optional typed Phone.

A guardian object SHOULD be created only when at least one guardian source field is populated. PanoReady omits empty Guardian containers and MUST cover that serializer behaviour with submission compatibility tests.

Guardian relationships MUST be checked against the active relationship list when present.

### Address contract

The address contains:

- Unit
- Street Number
- Street Name
- Street Type
- Street Direction
- Rural Route
- PO Box Number
- City
- Province
- Postal Code

Address fields MUST remain nested under `Address`. They MUST NOT be treated as direct Student elements.

The built-in PanoReady rules limit Unit to five characters and Street Number to six characters. Custom profiles MAY apply a different policy where the destination permits it.

Province, street type, and street direction MUST be checked against their active controlled-value lists when present.

### Phone contract

A phone contains:

- canonical number;
- optional extension; and
- optional canonical type.

The canonical number uses `999-999-9999`. Area-code and exchange first digits cannot be 0 or 1 under the built-in contract. An extension contains one through five digits and is serialized with lowercase `x` in STIX XML text.

The phone type, when present, MUST be one of:

- `HOME`
- `WORK`
- `MOBILE`
- `UNKNOWN`
- `ALTERNATE`
- `EMERGENCY`
- `PAGER`
- `FAX`

Contact, student, and guardian phones MUST use the same canonical parser and validator. Multiple numbers in one source cell MUST require review rather than being truncated to the first number.

## Provenance contract

Every mapped canonical field SHOULD have a provenance entry containing:

- raw source value;
- source worksheet, row, column, and original header; and
- mapping confidence from 0 through 1.

Canonical paths are used as provenance keys, for example:

```text
name.first
birthDate
address.postalCode
guardians[0].phone.number
```

Provenance MUST NOT be written into STIX XML. It exists for local review, diagnostics, and audit reporting.

## Transformation contract

Every value change MUST produce a transformation entry containing:

- rule identifier;
- record identifier when applicable;
- canonical field path;
- before and after values;
- whether the transformation is designated safe;
- whether it was automatic or analyst-applied; and
- application timestamp.

Safe automatic transformations MAY include:

- trimming and collapsing whitespace;
- Unicode normalization without changing visible meaning;
- case normalization for controlled codes;
- exact controlled-label-to-code lookup;
- unambiguous date conversion;
- unambiguous ten-digit phone formatting;
- postal-code capitalization and spacing;
- removal of OEN separators when exactly nine digits remain; and
- mappings explicitly declared in an approved source profile.

Automatic transformations MUST NOT:

- invent a name, DOB, OEN, gender, guardian, school, or address;
- select between ambiguous day/month date interpretations;
- merge multiple phone numbers;
- infer an identity from a name alone;
- discard a conflicting identifier; or
- silently shorten a value to satisfy a length limit.

## Source adapter contract

A source adapter is responsible only for safe file inspection and raw extraction. It MUST NOT contain organization-specific business policy.

Conceptually, every adapter provides:

```text
detect(bytes, fileName) -> DetectionResult
inspect(bytes) -> SourceInspection
parse(bytes, approvedMapping) -> ImportDraft
```

### Detection result

Detection reports:

- detected format and confidence;
- evidence such as magic bytes, workbook container type, or XML root;
- whether macros are present; and
- fatal safety or corruption findings.

Detection MUST use content where possible. A filename extension is only supporting evidence.

### Source inspection

Spreadsheet inspection reports:

- worksheets and visibility;
- candidate data sheets;
- candidate header rows;
- recognized and unknown headers;
- populated row estimates;
- merged and hidden regions;
- formulas without cached results;
- named tables and ranges; and
- possible metadata locations.

XML inspection reports:

- root namespace URI and local name;
- namespace prefixes encountered;
- school and student counts;
- unsupported or unknown elements;
- `DOCTYPE` or external-entity declarations; and
- parse errors.

Inspection diagnostics MUST NOT copy student values into application logs.

### Raw extraction

Raw extraction MUST:

- preserve source row and column locations;
- distinguish blank, zero, false, formula, date, numeric, and text cells;
- preserve leading zeros when the displayed source contains them;
- never execute workbook macros;
- never evaluate untrusted formulas;
- report formulas without cached values;
- retain populated unmapped columns; and
- reconcile the number of extracted rows with the inspection result.

## Source profile contract

A source profile is declarative mapping configuration, not executable code.

It defines:

- supported organization types and formats;
- sheet-name hints;
- header search bounds;
- aliases for canonical fields;
- minimum and required detection evidence;
- data-row start and exclusion rules;
- permitted normalizers;
- controlled raw-to-canonical mappings;
- metadata defaults;
- date interpretation policy; and
- identity policy.

Profiles MUST be versioned. An existing profile MUST NOT be applied automatically when a source header fingerprint changes materially.

Defaults MUST identify their origin. Organization-specific school metadata can be defaulted by an approved profile, but student identity or demographic fields MUST NOT be invented.

Profile normalizers are selected from an allowlist in the JSON Schema. Profiles MUST NOT contain arbitrary JavaScript, formulas, or regular-expression replacements capable of executing code.

## Mapping contract

Header matching produces one of four outcomes for every populated source column:

- `MAPPED`: one high-confidence canonical destination;
- `AMBIGUOUS`: more than one plausible destination;
- `DUPLICATE`: another column maps to the same canonical destination; or
- `UNMAPPED`: no supported destination.

Automatic processing MAY continue only when all required source evidence is mapped and no populated column is ambiguous or duplicate.

An analyst MUST review ambiguous, duplicate, and materially populated unmapped columns. Selecting “ignore” is an explicit analyst decision and MUST be recorded in the audit information.

The importer MUST NOT use a missing marker row as permission to interpret instruction or example rows as students. Data-row detection requires positive row evidence, such as populated identity fields and a consistent row shape.

## Controlled-value contract

The built-in STIX/Panorama compatibility profile uses ten controlled-value sets:

- Grade
- Gender
- Language
- Country of Origin
- Street Type
- Province
- Relationship
- Phone Type
- Street Direction
- Full Upload

Both the canonical codes and the human-readable Definitions SHOULD be imported from one versioned source of truth. Human-readable definitions become exact source aliases for their corresponding codes.

The application MUST validate every controlled field that it declares. A ruleset field that is accepted but never executed is a contract violation.

## Diagnostic contract

Every finding uses one diagnostic shape with:

- stable identifier;
- validation layer;
- severity;
- machine-readable code;
- human-readable message;
- canonical path;
- record and source location when applicable;
- resolution status;
- safe-auto-fix flag; and
- optional suggested value.

The validation layers are:

- `IMPORT`
- `CANONICAL`
- `PROFILE`
- `IDENTITY`
- `XML`
- `XSD`
- `RECONCILIATION`

Severity meanings are:

- `BLOCKER`: processing cannot safely continue;
- `ERROR`: output cannot be marked ready;
- `WARNING`: output may continue but requires attention;
- `INFO`: non-actionable context.

Diagnostics displayed to an analyst MAY contain record context. Exported or logged diagnostics SHOULD minimize student information.

## Identity contract

Identity matching is separate from canonical field normalization and XML generation.

Matching MUST use this evidence order:

1. Exact valid normalized OEN.
2. Exact stable source-system student identifier within its declared authority.
3. Exact normalized composite identity plus a corroborating attribute.
4. Candidate matching requiring analyst review.
5. Unmatched classification.

School MUST NOT be part of the core fallback identity because that prevents recognition of transfers.

Names used for comparison MAY normalize case, Unicode form, whitespace, and harmless punctuation. Stored and exported names retain their approved canonical spelling.

A date-format change alone SHOULD NOT create a new identity after both dates have been unambiguously canonicalized.

An automatic match MUST NOT be made from a name alone. Competing candidates, conflicting OENs, twins/siblings, DOB conflicts, and weak evidence MUST require analyst review.

Every match records:

- method;
- confidence;
- match-group identifier;
- review requirement; and
- analyst confirmation when applicable.

## XML parsing contract

XML parsing MUST be namespace-aware.

The Ontario namespace URI is:

```text
http://ontario.ca
```

The parser MUST accept equivalent forms such as:

```xml
<SchoolUpload xmlns="http://ontario.ca">
<ns1:SchoolUpload xmlns:ns1="http://ontario.ca">
<stix:SchoolUpload xmlns:stix="http://ontario.ca">
```

Element matching MUST use namespace URI and local name, not a literal prefix.

The parser MUST reject or safely isolate:

- malformed XML;
- unexpected root namespace or local name;
- external entities;
- `DOCTYPE` declarations when not explicitly supported;
- resource-exhaustion payloads; and
- conflicting duplicate elements.

Known STIX elements are mapped to the canonical model. Unknown elements and attributes SHOULD be preserved for lossless round-trip editing when safe, and MUST at minimum produce diagnostics.

## XML serialization contract

The serializer MUST:

- use the Ontario namespace URI;
- escape text and attribute values correctly;
- emit UTF-8 XML;
- use canonical `YYYY-MM-DD` dates;
- preserve leading zeros in string identifiers;
- emit typed phone elements;
- preserve guardian and address nesting;
- serialize schools and students deterministically;
- omit optional empty fields according to the XSD; and
- never serialize provenance, internal IDs, or diagnostics as STIX fields.

The serializer MAY use any namespace prefix, including the default namespace. Prefix choice MUST NOT affect validation or comparison.

Element order and empty-container behaviour MUST remain covered by serializer, round-trip, and submission compatibility tests.

## Validation contract

Validation is performed in layers and MUST run against the final values, not only the original input.

### Import validation

Checks format detection, selected sheet, header mapping, populated unmapped columns, instruction rows, formulas, merged regions, hidden content, and row counts.

### Canonical validation

Checks required values, field types, dates, lengths, phone format, postal codes, OEN, duplicate fields, nested structure, and canonical controlled values.

### Profile validation

Applies approved organization-specific rules, such as whether Grade or guardian information is locally required.

### Identity validation

Checks duplicate identifiers, conflicting identities, ambiguous candidate matches, and unresolved record groups.

### XML validation

Parses the generated output again and checks namespace, structure, values, and preservation.

### Schema validation

When a separate schema-validation layer is enabled, it MUST validate final XML locally in the browser unless the project's privacy architecture is explicitly changed and approved.

## Reconciliation contract

An output cannot be `READY` unless:

- every included source row maps to exactly one canonical student;
- every intentionally excluded row has a recorded reason;
- no instruction or example row became a student;
- source, canonical, serialized, and reparsed student counts agree;
- school counts agree;
- all populated mapped fields survive serialization and reparsing;
- no populated source column was silently ignored;
- there are no unresolved blocker or error diagnostics;
- there are no unresolved identity ambiguities affecting inclusion; and
- every validation layer enabled for the release succeeds.

## Readiness states

`DRAFT` means import or mapping is incomplete.

`BLOCKED` means at least one blocker or error prevents valid output.

`REVIEW_REQUIRED` means an analyst decision is required, including ambiguous mapping, date, or identity evidence.

`READY_WITH_WARNINGS` means all export requirements pass but open warnings remain.

`READY` means all validation layers implemented by the release, identity decisions, XML checks, and reconciliation checks pass without open warnings.

Status MUST be derived from current diagnostics. It MUST NOT be directly editable by a user or source profile.

## Privacy and security contract

- Processing MUST remain local to the browser under the current architecture.
- Source files and canonical records MUST NOT be sent to analytics, logs, crash reports, or external APIs.
- Workbook macros MUST never execute.
- Formulas MUST never execute.
- Persisted source profiles MUST contain mappings and organization defaults, not student records.
- Local recovery data, if implemented, MUST have an explicit retention period and deletion control.
- Audit reports SHOULD use counts, rule identifiers, and source locations instead of student values whenever possible.
- Generated XML and reports MUST be treated as sensitive even when packaged in an encrypted ZIP.

## Versioning contract

The canonical schema and every source profile use semantic versions.

- Patch versions clarify rules without changing accepted structure or meaning.
- Minor versions add backward-compatible fields, aliases, or optional behavior.
- Major versions change required structure, canonical meaning, or serialization behavior.

Every import records the exact adapter, canonical schema, validation profile, and source profile versions used. Reprocessing an old file under a newer version MUST produce a new audit result rather than rewriting the original history.

## Required work before adoption

Before these contracts become production guarantees:

1. Maintain maximum-length and conditional-requirement compatibility tests.
2. Run the row-7 table-boundary case in supported desktop Excel.
3. Generate synthetic STIX XML and compare canonical XML trees.
4. Confirm whether empty Guardian and AliasName containers are permitted or required through submission testing.
5. Confirm the intended output policy for `X`, `N`, `Unk`, and `Other` gender values.
6. Collect anonymized source examples from public schools, private schools, boards, daycares, and other supported organizations.
7. Create source profiles from those examples.
8. Build golden, mutation, namespace, identity, and round-trip test suites.
9. Require all enabled validation layers and reconciliation checks to succeed before returning `READY`.
