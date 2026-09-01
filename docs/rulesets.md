# Ruleset Reference

Custom rulesets let you adjust what counts as a validation failure — for example, accepting grade codes your board uses that the built-in ruleset doesn't recognise, or tightening required-field rules — without editing source code or affecting other users.

Rulesets are stored in your browser's localStorage and never uploaded anywhere. To share one with a colleague, export it as a `.json` file and send it to them.

For background on what each rule *does*, see [validation-rules.md](validation-rules.md). This document explains which ruleset fields control which rules.

## Quick Start

The easiest path is to build a ruleset directly in the app — no JSON editing required:

1. Open the **Validation ruleset** dropdown in Validate & Fix or Reports.
2. Click **New** to open the in-app editor, configure each tab, and click **Save Ruleset**.
3. The new ruleset is selected automatically. Validate as normal.

To start from an existing ruleset, click **Duplicate** first, then **Edit** the copy.

Alternatively, work with the JSON file directly:

1. Click **Export** — downloads the built-in defaults as a `.json` file.
2. Edit the file (see fields below).
3. Click **Import** to load your edited file.
4. Select it from the dropdown and validate as normal.

---

## Outer Envelope

Every ruleset file must include these fields:

```json
{
  "id": "a unique string — generated automatically on export",
  "name": "My Board Ruleset",
  "description": "Optional note for your own reference",
  "createdAt": "2026-07-06T00:00:00.000Z",
  "rules": { ... }
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | Yes | Any non-empty string. Export generates a UUID; you can change it. |
| `name` | Yes | Shown in the dropdown. Keep it short and descriptive. |
| `description` | No | Free text — shown below the dropdown and editable in the in-app editor. |
| `createdAt` | Yes | ISO 8601 datetime string. Used for your records only. |
| `rules` | Yes | The ruleset body — all fields below go here. |
| `warnings` | No | Set internally by the importer when unknown `rules` keys are detected. Safe to remove from exported files. Do not set this manually. |

---

## Ruleset Fields

### `requiredFields`

**Controls:** `required-field` rule  
**Type:** array of strings

```json
"requiredFields": ["FirstName", "LastName", "Gender", "BirthDate", "SchoolNumber"]
```

Field names that must be non-empty on every student record. Any element name from the STIX XML schema is valid here. The built-in default requires the five fields above.

---

### `allowedGradeValues`

**Controls:** `grade-value` rule  
**Type:** array of strings

```json
"allowedGradeValues": ["JK", "SK", "GR1", "GR2", ..., "GR12", "GR13", "CCL", "CCNL", "CL-CGP", "PRE", "UNIV"]
```

The exact grade codes accepted after aliases are applied. If your board submits codes not in this list (and no alias covers them), add them here rather than adding aliases.

---

### `allowedGenderValues`

**Controls:** `gender-value` rule  
**Type:** array of strings

```json
"allowedGenderValues": ["F", "M", "N", "OTHER", "UNK", "X"]
```

Case-sensitive. Extend this list if your SIS exports additional codes that your board considers valid.

---

### `allowedProvinceValues`

**Controls:** `province-value` rule  
**Type:** array of strings

```json
"allowedProvinceValues": ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"]
```

Standard two-letter Canadian province/territory codes.

---

### `allowedLanguageValues`

**Controls:** `language-value` rule  
**Type:** array of strings

ISO 639-1 language codes. The built-in list includes all 184 codes defined in the standard. You would rarely need to change this.

---

### `allowedCountryValues`

**Controls:** `country-value` rule  
**Type:** array of strings

ISO 3166-1 alpha-2 country codes. The built-in list includes all current codes. You would rarely need to change this.

---

### `allowedStreetTypeValues`

**Controls:** `street-type-value` rule  
**Type:** array of strings

```json
"allowedStreetTypeValues": ["ST", "AVE", "BLVD", "DR", "RD", ...]
```

Canada Post street type abbreviations (English and French). Add any locally-used abbreviations your board's data includes.

---

### `allowedRelationshipValues`

**Controls:** `relationship-value` rule  
**Type:** array of strings

```json
"allowedRelationshipValues": ["AUNT", "COUSIN", "FATHER", "FOSTERPARENT", "FRIEND",
  "GRANDPARENT", "LEGALGRD", "MOTHER", "PARENT", "SIBLING", "SPOUSE", "STEPPARENT", "UNCLE"]
```

Relationship codes for emergency contacts. Extend if your SIS uses additional codes.

---

### `allowedPhoneTypeValues`

**Controls:** `phone-type-value` rule  
**Type:** array of strings

```json
"allowedPhoneTypeValues": ["ALTERNATE", "EMERGENCY", "FAX", "HOME", "MOBILE", "PAGER", "UNKNOWN", "WORK"]
```

---

### `allowedStreetDirectionValues`

**Controls:** `street-direction-value` rule  
**Type:** array of strings

```json
"allowedStreetDirectionValues": ["E", "N", "NE", "NW", "S", "SE", "SW", "W"]
```

---

### `allowedFullLoadTypeValues`

**Controls:** `full-load-type-value` rule  
**Type:** array of strings

```json
"allowedFullLoadTypeValues": ["NO", "YES"]
```

You would rarely need to change this.

---

### `fieldLengths`

**Controls:** `field-too-long` rule  
**Type:** object — field name → maximum character length

```json
"fieldLengths": {
  "FirstName": 50,
  "LastName": 50,
  "MiddleName": 50,
  "AliasFirstName": 50,
  "AliasMiddleName": 50,
  "AliasLastName": 50,
  "OEN": 9,
  "PostalCode": 7,
  "City": 50,
  "StreetName": 80,
  "StreetNumber": 6,
  "StreetNumberSuffix": 5,
  "Unit": 5
}
```

Only fields listed here are length-checked. If your board's schema permits a longer `City` field, increase the limit rather than removing it.

---

### `dateFields`

**Controls:** `date-format` rule  
**Type:** array of strings

```json
"dateFields": ["BirthDate"]
```

Fields that must contain a valid `YYYY-MM-DD` date. The default only checks `BirthDate`. Add other date fields from your schema if needed.

---

### `postalCodePattern`

**Controls:** `postal-code-format` rule  
**Type:** string (regular expression)

```json
"postalCodePattern": "^[A-Za-z]\\d[A-Za-z]\\s?\\d[A-Za-z]\\d$"
```

The pattern is compiled with JavaScript's `new RegExp()`. Note that backslashes must be double-escaped in JSON (`\\d` not `\d`). The import step will reject an invalid pattern with an error message before saving.

---

### `phoneConfig`

**Controls:** `phone-placeholder` rule  
**Type:** object

```json
"phoneConfig": {
  "placeholderNumbers": ["519-000-0000", "000-000-0000"]
}
```

Phone numbers in this list are flagged as placeholders. Add your board's commonly-used placeholder numbers here. Format must match exactly what appears in the XML (hyphens, spaces, etc.).

---

### `gradeAliases`

**Controls:** `grade-value` rule (auto-fix step)  
**Type:** object — raw value → canonical value

```json
"gradeAliases": {
  "K":    "JK",
  "KG":   "JK",
  "1":    "GR1",
  "GR01": "GR1",
  ...
}
```

When a grade value is not in `allowedGradeValues`, the validator checks this map. If a match is found, it auto-fixes the value to the canonical form. Add any non-standard codes your SIS exports. The target value must be in `allowedGradeValues`.

---

### `genderAliases`

**Controls:** `gender-value` rule (auto-fix step)  
**Type:** object — raw value → canonical value

```json
"genderAliases": {
  "MALE":       "M",
  "FEMALE":     "F",
  "NON-BINARY": "X",
  "UNKNOWN":    "Unk",
  "m":          "M",
  ...
}
```

Same pattern as `gradeAliases`. Aliases are case-sensitive (both the key and the value). The target value must be in `allowedGenderValues`.

---

### `duplicateDetection`

**Controls:** `OEN_DUPLICATE`/`OEN_DUAL_ENROLLMENT` and `NAME_DOB_DUPLICATE`/`IDENTITY_REVIEW` rules  
**Type:** object

```json
"duplicateDetection": {
  "checkOen": true,
  "checkNameDobSchool": true
}
```

Each check compares matching records (same OEN, or same first name + last name + birth date) and reacts differently depending on where the match was found:

- **Same school** — treated as a real duplicate record. Raised as an `error` (`OEN_DUPLICATE` / `NAME_DOB_DUPLICATE`) and blocks the gate.
- **Different schools** — treated as a possible dual enrollment (e.g. a student taking a co-op or off-site course at another school). Raised as a `warning` (`OEN_DUAL_ENROLLMENT` / `IDENTITY_REVIEW`), naming both schools so it's easy to review, and does **not** block the gate.

Set either value to `false` to disable that duplicate check entirely, in both its same-school and cross-school forms.

---

### `cleaning`

**Controls:** Cleaning step in Validate & Fix (Step 1)  
**Type:** object (optional — omit entirely if you have no cleaning rules)

```json
"cleaning": {
  "enabledFields": ["City", "StreetType"],
  "mappings": {
    "City": [
      { "raw": "toronto", "canonical": "Toronto" },
      { "raw": "TORONTO", "canonical": "Toronto", "matchCase": true }
    ],
    "StreetType": [
      { "raw": "Street", "canonical": "ST" },
      { "raw": "Avenue", "canonical": "AVE" }
    ]
  }
}
```

The cleaning profile defines field-value substitutions applied to student records **before** the validation rules run. Fields in `enabledFields` are processed in order; within each field, mappings are evaluated top-to-bottom and the first match wins.

**`enabledFields`** — array of strings  
Fields to apply mappings to. Only fields listed here are cleaned, even if `mappings` has entries for other fields.

**`mappings`** — object  
A record keyed by field name. Each value is an ordered array of mapping objects:

| Property | Required | Description |
|---|---|---|
| `raw` | Yes | The value to match against the field's current content |
| `canonical` | Yes | The replacement value to write when `raw` matches |
| `matchCase` | No | `true` for case-sensitive matching; default is case-insensitive |

**Scope note:** The cleaning step applies to all student records from the uploaded file. It does not affect controlled-vocabulary validation (grade, gender, language, province) — use the `gradeAliases` / `genderAliases` fields for those.

**In-app editing:** The Cleaning tab in the ruleset editor provides a UI for managing these mappings without editing JSON directly. Click **Save to ruleset** in the Cleaning step to sync mappings discovered from a file back into the active ruleset.

---

## Sharing Rulesets

Export produces a self-contained `.json` file. Recipients import it the same way — open the dropdown, click **Import**, and select the file. The ruleset is added to their browser's localStorage under the name defined in the file; it does not overwrite their existing rulesets.

If you update a shared ruleset, re-export and redistribute the file. There is no sync mechanism — each user holds their own copy.

## Versioning Note

The `id` field is how the app identifies rulesets. If you import a file whose `id` already exists in localStorage, the existing entry is overwritten. To keep both versions, change the `id` (or the `name`) before importing.
