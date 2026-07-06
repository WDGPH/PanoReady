# Ruleset Reference

Custom rulesets let you adjust what counts as a validation failure — for example, accepting grade codes your board uses that the built-in ruleset doesn't recognise, or tightening required-field rules — without editing source code or affecting other users.

Rulesets are stored in your browser's localStorage and never uploaded anywhere. To share one with a colleague, export it as a `.json` file and send it to them.

For background on what each rule *does*, see [validation-rules.md](validation-rules.md). This document explains which ruleset fields control which rules.

## Quick Start

1. Open the **Validation ruleset** dropdown in Validate & Fix or Reports.
2. Click **Export** — this downloads the built-in defaults as a `.json` file.
3. Edit the file (see fields below).
4. Click **Import** to load your edited file.
5. Select it from the dropdown and validate as normal.

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
| `description` | No | Free text — not displayed in the app, useful in the file. |
| `createdAt` | Yes | ISO 8601 datetime string. Used for your records only. |
| `rules` | Yes | The ruleset body — all fields below go here. |

---

## Ruleset Fields

### `requiredFields`

**Controls:** `required-field` rule  
**Type:** array of strings

```json
"requiredFields": ["FirstName", "LastName", "BirthDate", "Grade", "SchoolNumber"]
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

**Controls:** `duplicate-oen` and `duplicate-name-dob-school` rules  
**Type:** object

```json
"duplicateDetection": {
  "checkOen": true,
  "checkNameDobSchool": true
}
```

Set either value to `false` to disable that duplicate check entirely. This is useful if your export process intentionally includes the same OEN across records (for example, a student enrolled in multiple schools).

---

## Sharing Rulesets

Export produces a self-contained `.json` file. Recipients import it the same way — open the dropdown, click **Import**, and select the file. The ruleset is added to their browser's localStorage under the name defined in the file; it does not overwrite their existing rulesets.

If you update a shared ruleset, re-export and redistribute the file. There is no sync mechanism — each user holds their own copy.

## Versioning Note

The `id` field is how the app identifies rulesets. If you import a file whose `id` already exists in localStorage, the existing entry is overwritten. To keep both versions, change the `id` (or the `name`) before importing.
