# Data Model Reference

This page documents the TypeScript types and interfaces used across all workflows. All types are defined in `lib/types.ts`.

---

## Workflow Types

### `Workflow`

```ts
type Workflow = "validate" | "clean" | "export" | "pretty";
```

Identifies which workflow the user selected. Used to route the app between processing paths and result screens.

---

### `SessionData`

Holds state for the Clean XML, Export Reports, and Pretty Print workflows.

```ts
interface SessionData {
  workflow: Workflow;
  fileName: string;
  xmlContent: string;        // original uploaded XML
  autoCleanXml?: string;     // XML after auto-clean pass (before manual review)
  cleanXml?: string;         // XML after manual review overrides applied
  issues?: Issue[];          // items flagged for manual review (Clean workflow)
  stats?: CleanStats;        // summary counts from auto-cleaning
  exportResult?: ExportResult; // parsed and aggregated data (Export workflow)
}
```

---

### `ValidateSession`

Holds state for the Validate & Fix workflow. Kept separate from `SessionData` because the validate workflow has a multi-step state machine (initial validation → staged fixes → revalidation).

```ts
type ValidateSession = {
  fileName: string;
  originalXml: string;
  initialResult: ValidationResult;   // result of first validateXml() call
  fixes: AppliedFix[];               // fixes staged by the user in the fix editor
  revalidatedResult?: ValidationResult; // result after fixes applied
  finalXml?: string;                 // cleaned XML ready to download
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
  gate: "READY" | "BLOCKED" | "PENDING";
};
```

| Field | Description |
|---|---|
| `issues` | All issues found during validation |
| `records` | Parsed student records extracted from the XML |
| `schoolCount` | Number of `ns1:School` elements found |
| `studentCount` | Total number of student records found |
| `gate` | `READY` = no errors; `BLOCKED` = one or more errors present; `PENDING` = not yet validated |

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

## Clean Workflow Types

### `CleanStats`

Summary counts produced by `cleanXml()`.

```ts
interface CleanStats {
  phonesCleaned: number;       // phone fields successfully formatted
  phonesBlanked: number;       // phone fields that could not be cleaned and were emptied
  unitsStandardized: number;   // unit fields normalized to a known abbreviation
  needsReview: number;         // items flagged for manual review
}
```

---

### `Issue`

An item that the auto-cleaner could not resolve and flagged for manual review.

```ts
interface Issue {
  schoolNumber: string;
  studentName: string;
  field: string;          // "StreetNumber" or "Unit"
  currentValue: string;   // value after auto-cleaning (may be unchanged)
  xmlPath: string;        // location in the XML for write-back
}
```

---

## Export Workflow Types

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
  BirthYear: string;       // derived: first 4 chars of BirthDate
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
  City: string;
  Province: string;
  PostalCode: string;
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
  SchoolNumber: string;
  SchoolName: string;
  BirthYear: string;
  Count: number;
}
```

---

### `GradeCount`

One row in the Grade Counts report.

```ts
interface GradeCount {
  SchoolNumber: string;
  SchoolName: string;
  Grade: string;
  Count: number;
}
```
