# Validation Rules Reference

This page documents every rule checked during the [Validate & Fix](./workflow-validate-and-fix.md) workflow. Rules are loaded from `config/rules.stix.default.json` at runtime.

---

## Severity Levels

| Level | Meaning |
|---|---|
| `error` | Blocks the gate. The file should not be submitted until all errors are resolved. |
| `warning` | Does not block the gate, but indicates data quality issues worth reviewing. |
| `info` | Informational notice only — no action required. |

---

## Rule Catalogue

### Rule: `xml-wellformed`

**Severity:** error  
**Field:** (structural)

Checks that the uploaded file is valid XML. This is the first check — if it fails, no other rules run.

**Pass condition:** `fast-xml-parser` can parse the file without throwing.  
**Auto-fix:** No. A malformed XML file must be corrected externally.

---

### Rule: `root-element`

**Severity:** error  
**Field:** (structural)

Checks that the root element is `ns1:SchoolUpload`.

**Pass condition:** The parsed document has a root key of `ns1:SchoolUpload`.  
**Auto-fix:** No.

---

### Rule: `school-structure`

**Severity:** error  
**Field:** `SchoolNumber`

Each `ns1:School` element must have a `SchoolNumber` attribute or child element.

**Pass condition:** `SchoolNumber` is present and non-empty on the school element.  
**Auto-fix:** No.

---

### Rule: `required-fields`

**Severity:** error  
**Fields:** `FirstName`, `LastName`, `BirthDate`, `Grade`, `SchoolNumber`

Each student record must have all required fields present and non-empty.

**Required fields (from `rules.stix.default.json`):**

```
FirstName, LastName, BirthDate, Grade, SchoolNumber
```

**Pass condition:** Each required field exists and contains at least one non-whitespace character.  
**Auto-fix:** No. Missing required fields must be supplied manually.

---

### Rule: `grade-value`

**Severity:** error  
**Field:** `Grade`

The `Grade` field must be one of the allowed values.

**Allowed values:**

```
JK, SK, GR1, GR2, GR3, GR4, GR5, GR6, GR7, GR8, GR9, GR10, GR11, GR12
```

**Grade aliases (auto-corrected):**

| Input | Corrected to |
|---|---|
| `K` | `JK` |
| `GR01` | `GR1` |
| `1` | `GR1` |
| `2` | `GR2` |
| `3` | `GR3` |
| `4` | `GR4` |
| `5` | `GR5` |
| `6` | `GR6` |
| `7` | `GR7` |
| `8` | `GR8` |
| `9` | `GR9` |
| `10` | `GR10` |
| `11` | `GR11` |
| `12` | `GR12` |

**Auto-fix:** Yes, when the value matches a known alias. The suggested fix is the canonical form.

---

### Rule: `gender-value`

**Severity:** error  
**Field:** `Gender`

The `Gender` field must be one of the allowed values.

**Allowed values:**

```
M, F, X, U
```

**Gender aliases (auto-corrected):**

| Input | Corrected to |
|---|---|
| `MALE` | `M` |
| `FEMALE` | `F` |
| `NON-BINARY` | `X` |
| `UNKNOWN` | `U` |

**Auto-fix:** Yes, when the value matches a known alias.

---

### Rule: `province-value`

**Severity:** warning  
**Field:** `Province`

The `Province` field must be a valid Canadian province or territory code.

**Allowed values:**

```
AB, BC, MB, NB, NL, NS, NT, NU, ON, PE, QC, SK, YT
```

**Auto-fix:** No. Province codes must be corrected manually.

---

### Rule: `birthdate-format`

**Severity:** error  
**Field:** `BirthDate`

The `BirthDate` field must be in `YYYY-MM-DD` format and represent a parseable calendar date.

**Pass condition:** Value matches `YYYY-MM-DD` and the date is valid (e.g. month 1–12, day within month).

**Auto-fix:** Yes, for common alternate formats. The validator attempts to parse dates in formats such as `DD/MM/YYYY`, `MM/DD/YYYY`, and `YYYY/MM/DD`, and suggests the normalized `YYYY-MM-DD` form when it can resolve the date unambiguously.

---

### Rule: `postal-code`

**Severity:** warning  
**Field:** `PostalCode`

The `PostalCode` field must match the Canadian postal code pattern.

**Pattern:** `^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$`

Examples of valid values: `K1A 0A9`, `M5V3L9`

**Auto-fix:** No. Postal codes must be corrected manually.

---

### Rule: `oen-format`

**Severity:** error  
**Field:** `OEN`

The Ontario Education Number (OEN) must be exactly 9 digits.

**Pass condition:** Value contains exactly 9 digit characters and no other characters.

**Auto-fix:** No.

---

### Rule: `field-length`

**Severity:** warning  
**Field:** varies

Field values must not exceed the maximum length for that field.

**Maximum field lengths:**

| Field | Max characters |
|---|---|
| `FirstName` | 50 |
| `MiddleName` | 50 |
| `LastName` | 50 |
| `AliasFirstName` | 50 |
| `AliasMiddleName` | 50 |
| `AliasLastName` | 50 |
| `StreetName` | 80 |
| `StreetNumber` | 10 |
| `StreetNumberSuffix` | 5 |
| `StreetType` | 10 |
| `Unit` | 10 |
| `City` | 50 |
| `OEN` | 9 |
| `PostalCode` | 7 |

**Auto-fix:** No. Values exceeding the limit must be shortened manually.

---

### Rule: `whitespace`

**Severity:** info  
**Field:** varies

Fields with leading or trailing whitespace are flagged.

**Affected fields:** `FirstName`, `LastName`, `MiddleName`, `Grade`, `Gender`, `BirthDate`, `OEN`, `PostalCode`

**Auto-fix:** Yes. The suggested fix is the trimmed value (whitespace removed from both ends).

---

### Rule: `duplicate-oen`

**Severity:** error  
**Field:** `OEN`

Each OEN must appear only once in the file. A duplicate OEN indicates two records share the same student identifier.

**Pass condition:** No two student records have the same non-empty OEN value.  
**Auto-fix:** No. Duplicate OENs require manual investigation to determine which record is correct.

---

### Rule: `duplicate-name-dob-school`

**Severity:** warning  
**Field:** `FirstName`, `LastName`, `BirthDate`, `SchoolNumber`

Flags student records where the combination of `FirstName + LastName + BirthDate + SchoolNumber` appears more than once, indicating a possible duplicate enrollment.

**Pass condition:** No two records share the same name, date of birth, and school.  
**Auto-fix:** No.

---

## Configuration File

All allowed values, field lengths, patterns, and aliases are defined in:

```
config/rules.stix.default.json
```

The structure of this file:

```json
{
  "requiredFields": ["FirstName", "LastName", "BirthDate", "Grade", "SchoolNumber"],
  "allowedGradeValues": ["JK", "SK", "GR1", ...],
  "allowedGenderValues": ["M", "F", "X", "U"],
  "allowedProvinceValues": ["AB", "BC", ...],
  "fieldLengths": { "FirstName": 50, ... },
  "dateFields": ["BirthDate"],
  "postalCodePattern": "^[A-Za-z]\\d[A-Za-z]\\s?\\d[A-Za-z]\\d$",
  "gradeAliases": { "K": "JK", "1": "GR1", ... },
  "genderAliases": { "MALE": "M", "FEMALE": "F", ... },
  "duplicateDetection": { "checkOen": true, "checkNameDobSchool": true }
}
```

To modify which values are allowed or which fields are required, edit this file and reload the app.

---

## Auto-Fix Summary

| Rule | Auto-fixable | Fix applied |
|---|---|---|
| `xml-wellformed` | No | — |
| `root-element` | No | — |
| `school-structure` | No | — |
| `required-fields` | No | — |
| `grade-value` | Yes (alias match) | Canonical grade code |
| `gender-value` | Yes (alias match) | Canonical gender code |
| `province-value` | No | — |
| `birthdate-format` | Yes (parseable alternate format) | `YYYY-MM-DD` |
| `postal-code` | No | — |
| `oen-format` | No | — |
| `field-length` | No | — |
| `whitespace` | Yes | Trimmed value |
| `duplicate-oen` | No | — |
| `duplicate-name-dob-school` | No | — |
