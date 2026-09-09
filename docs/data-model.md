# Data Model Reference

This page documents the TypeScript types and interfaces used across all workflows. All types are defined in `lib/types.ts`.

---

## Workflow Types

### `Workflow`

```ts
type Workflow = "validate" | "compare";
```

Identifies which workflow the user selected. Used to route the app between processing paths and result screens.

---

### `ValidateSession`

Holds state for the multi-step Validate & Fix workflow.

```ts
type ValidateSession = {
  fileName: string;
  originalXml: string;
  initialResult: ValidationResult;   // result of first validateXml() call
  fixes: AppliedFix[];               // fixes staged by the user in the fix editor
  validationRules?: RulesProfile;    // snapshot used for revalidation
  revalidatedResult?: ValidationResult; // result after fixes applied
  finalXml?: string;                 // corrected XML ready to download
};
```

---

## Validation Workflow Types

### `ValidationResult`

Returned by `validateXml()` in `lib/validator.ts`.

```ts
type ValidationResult = {
  issues: ValidationIssue[];
  records: StudentRecord[];
  schoolCount: number;
  studentCount: number;
  gate: "READY" | "READY_WITH_WARNINGS" | "REVIEW_REQUIRED" | "BLOCKED" | "PENDING";
  xsdValidated?: boolean;
};
```

| Field | Description |
|---|---|
| `issues` | All issues found during validation |
| `records` | Parsed student records extracted from the XML |
| `schoolCount` | Number of `ns1:School` elements found |
| `studentCount` | Total number of student records found |
| `gate` | Readiness state. The current validator returns `BLOCKED` for errors, `REVIEW_REQUIRED` for review warnings, and `READY` otherwise. The union also reserves `READY_WITH_WARNINGS` and `PENDING`. |
| `xsdValidated` | Whether authoritative XSD validation was completed; currently `false` |

---

### `ValidationIssue`

Represents a single finding from the validation pass.

```ts
type ValidationIssue = {
  id: string;               // unique ID (used to correlate with AppliedFix)
  severity: "error" | "warning" | "info";
  recordId?: string;        // ID of the StudentRecord this issue belongs to
  schoolNumber?: string;    // school number for display
  studentName?: string;     // student name for display
  field?: string;           // XML field name (e.g. "Grade", "BirthDate")
  currentValue?: string;    // source value for a non-student issue (e.g. metadata)
  message: string;          // human-readable description of the problem
  suggestedFix?: string;    // correction the app recommends, if deterministic
  autoFixable: boolean;     // whether a suggestedFix exists and is safe to apply
  ruleId: string;           // which rule produced this issue (e.g. "grade-value")
  xmlPath?: string;         // XPath-style pointer to the element in the XML
  layer?: DiagnosticLayer;  // import/canonical/XML/etc. diagnostic layer
  sourceLocation?: string;  // workbook cell or other source location
  repairProposal?: AddressRepairProposal; // coordinated multi-field repair
};
```

---

### `AppliedFix`

Records a single correction that was staged in the fix editor and applied to the XML.

```ts
type AppliedFix = {
  issueId: string;     // ID of the ValidationIssue being resolved
  recordId: string;    // ID of the StudentRecord being modified
  field: string;       // XML field that was changed
  oldValue: string;    // value before the fix
  newValue: string;    // value written by the fix
  ruleId: string;      // rule that raised the original issue
  appliedAt: number;   // Unix timestamp (ms) when the fix was staged
  repairId?: string;   // links fields changed by one repair card
};
```

---

### `StudentRecord`

An in-memory representation of a single student element, extracted during validation for use in the fix editor and audit log.

```ts
type StudentRecord = {
  id: string;                       // stable ID used to correlate issues and fixes
  xmlPath: string;                  // location in the XML tree (for write-back)
  fields: Record<string, string>;   // all student fields as key-value pairs
};
```

---

## Cleaning Step Types

These types are used by the interactive cleaning step in the Validate & Fix workflow (`lib/cleaning.ts`, `lib/types.ts`).

### `CleaningMapping`

A single raw → canonical substitution rule for one field.

```ts
interface CleaningMapping {
  raw: string;        // exact string to match (case-insensitive by default)
  canonical: string;  // replacement value
  matchCase?: boolean; // true = case-sensitive match (default: false)
}
```

---

### `CleaningProfile`

The full set of cleaning rules attached to a custom ruleset.

```ts
interface CleaningProfile {
  enabledFields: string[];                      // fields to apply mappings to (opt-in)
  mappings: Record<string, CleaningMapping[]>;  // field → ordered mapping list
}
```

Only fields listed in `enabledFields` are cleaned. Within a field, mappings are evaluated in order and the first match wins.

---

### `CleaningSummaryEntry`

One row in the cleaning summary screen — one entry per mapping that was defined, including those with zero matches.

```ts
interface CleaningSummaryEntry {
  field: string;
  raw: string;
  canonical: string;
  count: number; // number of records changed by this mapping (0 = no match)
}
```

---

## Validate & Fix reporting types

These types support the report downloads on the Validate & Fix download screen; reporting is not a separate workflow.

### `Student`

A flat representation of a student record extracted from the STIX XML.

```ts
interface Student {
  SchoolName: string;
  SchoolNumber: string;
  FirstName: string;
  MiddleName: string;
  LastName: string;
  AliasFirstName: string;
  AliasMiddleName: string;
  AliasLastName: string;
  BirthDate: string;
  BirthYear: number | null; // derived from a valid YYYY-MM-DD BirthDate
  Grade: string;
  Class: string;
  OEN: string;
  Gender: string;
  Language: string;
  CountryOfOrigin: string;
  Unit: string;
  StreetNumber: string;
  StreetNumberSuffix: string;
  StreetName: string;
  StreetType: string;
  StreetDirection: string;
  RuralRoute: string;
  PoBoxNumber: string;
  City: string;
  Province: string;
  PostalCode: string;
  PhoneType: string;
  GuardianFirstName: string;
  GuardianLastName: string;
  GuardianRelationship: string;
  GuardianPhoneNumber: string;
  GuardianPhoneType: string;
  Guardian2FirstName: string;
  Guardian2LastName: string;
  Guardian2Relationship: string;
  Guardian2PhoneNumber: string;
  Guardian2PhoneType: string;
}
```

---

### `ExportResult`

Returned by `processExport()` in `lib/pullInfo.ts`.

```ts
interface ExportResult {
  allStudents: Student[];
  filteredStudents: Student[];    // Grade GR7/GR8, BirthYear 2012/2013
  schoolCounts: SchoolCount[];
  gradeCounts: GradeCount[];
}
```

---

### `SchoolCount`

One row in the School Counts report.

```ts
interface SchoolCount {
  SchoolName: string;
  BirthYear: number | null;
  StudentCount: number;
}
```

---

### `GradeCount`

One row in the Grade Counts report.

```ts
interface GradeCount {
  SchoolName: string;
  Grade: string;
  GradeCount: number;
}
```

---

## Compare Files types

`StixComparison` is the result of `compareStixFiles()`. It stores source filenames and the current XML, student and school totals, matched/unchanged/added/removed/changed/moved counts, the calculated change rate and signal, and these detail collections:

- `recordChanges`: added, removed, and changed records with per-field before/after values;
- `fieldChanges`: aggregate counts by compared field;
- `schoolChanges`: previous/current and change counts by school; and
- `schoolTransfers`: matched students whose school name changed.

Review decisions and proposed corrections are transient UI state in `CompareView`; they are not part of `StixComparison`. Proposed corrections are applied to an exported copy of `currentXml`.
