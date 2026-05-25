# Workflow: Export Reports

The Export Reports workflow parses a STIX XML file and produces spreadsheet exports of the student data: a full student list, a filtered subset, and aggregated counts by school and grade.

## When to Use

Use this workflow when you need to:
- Extract student records from a STIX XML file into a spreadsheet for review or analysis.
- Produce a filtered list of Grade 7–8 students born in 2012 or 2013.
- Generate student count summaries per school broken down by birth year or grade.
- Produce all four reports at once as a single Excel workbook.

This workflow does not validate or modify the XML — it is read-only extraction only.

---

## Step-by-Step Flow

### Step 0 — Upload

On the home screen, drop or select your STIX XML file, then click the **Export Reports** card.

The app parses the XML immediately. If the XML is not well-formed, an error is displayed.

---

### Step 1 — Download

The result screen shows a summary of what was found and provides download buttons for each report.

**Summary stats:**

| Stat | Description |
|---|---|
| Total students | Number of student records parsed from the file |
| Filtered students | Number of students matching the Gr7–8 / 2012–2013 filter |
| Schools | Number of distinct school numbers found |

---

## Available Reports

### 1. All Students (CSV)

**File:** `{filename}_all_students.csv`

One row per student. Includes all extracted fields.

**Columns:**

`SchoolName`, `SchoolNumber`, `OEN`, `FirstName`, `MiddleName`, `LastName`, `AliasFirstName`, `AliasMiddleName`, `AliasLastName`, `BirthDate`, `BirthYear`, `Grade`, `Class`, `Gender`, `Language`, `CountryOfOrigin`, `Unit`, `StreetNumber`, `StreetNumberSuffix`, `StreetName`, `StreetType`, `City`, `Province`, `PostalCode`

---

### 2. Filtered Students (CSV)

**File:** `{filename}_filtered_students.csv`

Same columns as All Students, but only includes rows where:
- `Grade` is `GR7` or `GR8`, **and**
- `BirthYear` is `2012` or `2013`.

Both conditions must be true for a student to appear in this report.

---

### 3. School Counts (CSV)

**File:** `{filename}_school_counts.csv`

Aggregated count of students per school per birth year.

**Columns:** `SchoolNumber`, `SchoolName`, `BirthYear`, `Count`

Each row represents one school–birth-year combination. Schools with no students in a given year are not included.

---

### 4. Grade Counts (CSV)

**File:** `{filename}_grade_counts.csv`

Aggregated count of students per school per grade.

**Columns:** `SchoolNumber`, `SchoolName`, `Grade`, `Count`

Each row represents one school–grade combination. Schools with no students in a given grade are not included.

---

### 5. All Reports (Excel Workbook)

**File:** `{filename}_reports.xlsx`

A single Excel workbook containing all four reports as separate sheets:

| Sheet name | Contents |
|---|---|
| All Students | Same as the All Students CSV |
| Filtered Students | Same as the Filtered Students CSV |
| School Counts | Same as the School Counts CSV |
| Grade Counts | Same as the Grade Counts CSV |

---

## Extraction Logic

### XML Parsing

The app reads student records from each `ns1:School` element in the STIX XML. Each `ns1:Student` element inside a school is extracted into a flat object.

Fields are extracted by element name. If a field is absent in the XML, the corresponding column is an empty string in the export.

`BirthYear` is derived by taking the first four characters of the `BirthDate` field value. No date validation is applied — if `BirthDate` is missing or malformed, `BirthYear` will also be empty or incorrect.

`SchoolName` and `SchoolNumber` are propagated from the parent `ns1:School` element to every student record in that school.

### Filter Criteria

The Filtered Students report applies these two conditions:

```
Grade ∈ { "GR7", "GR8" }
BirthYear ∈ { "2012", "2013" }
```

The grade comparison is case-sensitive and expects values exactly as they appear in the XML. If the file contains non-standard grade codes (e.g. `7` instead of `GR7`), those students will not appear in the filtered report. Run [Validate & Fix](./workflow-validate-and-fix.md) first to normalize grade codes if needed.

---

## Key Files

| File | Role |
|---|---|
| `lib/pullInfo.ts` | `parseXml()`, `filterStudents()`, `buildSchoolCounts()`, `buildGradeCounts()`, `processExport()` |
| `lib/utils.ts` | `toCsv()` — converts arrays of objects to escaped CSV strings |
| `lib/types.ts` | `Student`, `ExportResult` |
| `app/page.tsx` | `ResultView` screen (export variant) |

---

## Data Flow

```
Upload XML
    │
    ▼
processExport(xmlText)         ← lib/pullInfo.ts
    │
    ├── parseXml()             → Student[]
    ├── filterStudents()       → Student[] (Gr7-8, 2012-2013)
    ├── buildSchoolCounts()    → { SchoolNumber, SchoolName, BirthYear, Count }[]
    └── buildGradeCounts()     → { SchoolNumber, SchoolName, Grade, Count }[]
    │
    ▼
ExportResult
    │
    ├── Download: all_students.csv        ← toCsv(allStudents)
    ├── Download: filtered_students.csv   ← toCsv(filteredStudents)
    ├── Download: school_counts.csv       ← toCsv(schoolCounts)
    ├── Download: grade_counts.csv        ← toCsv(gradeCounts)
    └── Download: reports.xlsx            ← xlsx multi-sheet workbook
```

---

## Limitations

- This workflow does not validate field values. Malformed dates, invalid grade codes, or missing OENs will appear in the export exactly as they are in the XML.
- The filter uses grade codes as-is. Normalize the file with [Validate & Fix](./workflow-validate-and-fix.md) before exporting if you need accurate filtered counts.
- `BirthYear` derivation is a simple string slice of `BirthDate`. A malformed `BirthDate` (e.g. `2013/05/12` instead of `2013-05-12`) will still produce the correct `BirthYear` because only the first four characters are used, but a fully missing `BirthDate` will result in an empty `BirthYear`.
