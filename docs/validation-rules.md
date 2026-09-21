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

### Rule: `BIRTHDATE_FORMAT`

**Severity:** error
**Field:** `BirthDate`

The `BirthDate` field must be in `YYYY-MM-DD` format and represent a parseable calendar date.

**Pass condition:** Value matches `YYYY-MM-DD` and the date is valid (e.g. month 1–12, day within month).

**Auto-fix:** Only for real, unambiguous numeric dates no later than today.
XML validation suggests `YYYY-MM-DD`; workbook import uses the same calendar
rules to normalize birth-date text before validation.

| Input | Result |
|---|---|
| `2015/4/13` or `2015-4-13` | `2015-04-13` |
| `13/04/2015` or `04-13-2015` | `2015-04-13` |
| `04/04/2015` | `2015-04-04` (both orders agree) |
| `03/04/2015` | Review required; day/month order is ambiguous |
| `2015-02-29` or `31/04/2015` | Review required; impossible calendar date |

Use a four-digit year and consistent slash or hyphen separators. Month names,
two-digit years, numeric serial text, and timestamps require source confirmation;
PanoReady does not use locale guessing or timezone conversion. Workbook dates
are evaluated as formatted cell text, so export them as `YYYY-MM-DD` to avoid
ambiguous displays. Invalid or ambiguous values are preserved for review.
Future birth dates still fail validation and receive no automatic suggestion.

Metadata `CreateDate` continues to require a real `YYYY-MM-DD` date no later
than today; it is not automatically rewritten. Age reports and filters consume
only confirmed, valid ISO birth dates. Unresolved dates have unknown age and
do not contribute to age-group counts.

### OEN identity findings

`OEN_DUPLICATE` blocks same-school duplicates; `OEN_DUAL_ENROLLMENT` warns
about cross-school occurrences. Neither finding offers a replacement OEN input.
Review the records in the source system and upload a corrected file if needed.
A cross-school occurrence does not hide later same-school duplicates. Correction
of a malformed OEN (`OEN_FORMAT`) remains available. A separate duplicate
resolution workflow is outside the current scope.


---

### Rule: `postal-code`

**Severity:** info or warning
**Field:** `PostalCode`

The built-in rule validates Canadian postal-code structure and produces the
canonical six-character STIX value `A1A1A1` (uppercase, no separator). Canada
Post normally displays the same code as `A1A 1A1`; PanoReady accepts that form
as input and suggests the unspaced machine representation used in its output.

**Allowed characters:**

- Position 1: `A B C E G H J K L M N P R S T V X Y`
- Positions 3 and 5: `A B C E G H J K L M N P R S T V W X Y Z`
- Positions 2, 4, and 6: digits `0`–`9`; zero in position 2 is valid and
  identifies a rural forward sortation area
- Letters `D F I O Q U` are never valid; `W Z` are additionally excluded from
  position 1

**Built-in canonical pattern:**

```text
^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJKLMNPRSTVWXYZ]\d[ABCEGHJKLMNPRSTVWXYZ]\d$
```

The following input connectors are accepted only between the first and last
three characters: one or more whitespace characters, `-`, en dash (`–`), em
dash (`—`), `/`, `\`, `_`, and `.`. Whitespace may surround a punctuation
connector. For example, `N1G / 2W1` safely normalizes to `N1G2W1`. A connector
in any other position, repeated punctuation, or arbitrary punctuation remains
invalid; PanoReady does not globally strip punctuation.

The validator reports one of three issue outcomes:

| Outcome | Severity | Auto-fix | Example |
|---|---|---|---|
| Formatting/case normalization | info | Yes | `n1g 2w1` → `N1G2W1` |
| Numeric-position transcription repair | warning | Yes | `NIG2W1` → `N1G2W1` |
| Unresolved invalid structure | warning | No | `N1/G2W1` |

Only `O → 0`, `I → 1`, and `L → 1` are repaired, and only in positions that
must be numeric. PanoReady does not truncate, stitch, reverse a digit into a
letter, or make speculative substitutions such as `S → 5`.

These checks prove syntactic structure only. They do not prove that Canada Post
currently assigns the postal code or that it belongs to the supplied address.

**Rule sources:**

- [Canada Post — Addressing guidelines: Postal codes](https://www.canadapost-postescanada.ca/cpc/en/support/articles/addressing-guidelines/postal-codes.page)
- [Canada Post — Addressing guidelines: Important information](https://www.canadapost-postescanada.ca/cpc/en/support/articles/addressing-guidelines/important-information.page)
- [Statistics Canada — Postal Code Conversion File Reference Guide](https://www150.statcan.gc.ca/n1/pub/92-154-g/92-154-g2017001-eng.htm)

---

### Rules: `PHONE_FORMAT`, `PHONE_EXTENSION_NORMALIZE`, `PHONE_EXTENSION_FORMAT`, `PHONE_NPA_STRUCTURE`, `PHONE_NXX_STRUCTURE`, `PHONE_PLACEHOLDER`

**Severity:** error
**Fields:** metadata `ContactPhone`, student `Phone`, and each guardian `Phone`

The built-in phone rule expects the canonical North American Numbering Plan
(NANP) form `NPA-NXX-XXXX`, optionally followed immediately by a lowercase `x`
and an extension of 1–5 digits: `NPA-NXX-XXXXx12345`. Both the area code (`NPA`)
and central-office or exchange code (`NXX`) have the form `NXX`, where `N` is a
digit from `2` through `9` and each `X` is a digit from `0` through `9`.

For example, `519-824-1234` is structurally valid. `019-824-1234` has an
invalid NPA, and `519-124-1234` has an invalid NXX. PanoReady never guesses a
replacement digit for either structural failure.

Common numeric presentation variants are interpreted deterministically. Ten
digits, parentheses and spaces, and an optional leading NANP country code `1`
(including `+1`) can be normalized to `XXX-XXX-XXXX`. The resulting suggestion
uses the existing apply-and-revalidate workflow. Common unambiguous extension
markers—uppercase `X`, spaced `x`, `ext`, `ext.`, `extension`, and `#`—are
similarly normalized. For example, `519-824-1234 ext. 12`
becomes `519-824-1234x12`.

An extension marker with no digits, more than five digits, non-numeric extension
text, too few or too many base-number digits, appended notes, and multiple
numbers require manual correction. PanoReady does not guess or truncate those
values. Numbers
listed in `phoneConfig.placeholderNumbers` are also errors; a placeholder may
receive both the applicable structural issue and the placeholder issue.

**Auto-fix:** Base-number formatting and unambiguous extension-marker
normalization only. Missing, overlong, or non-numeric extensions, NPA/NXX
structural failures, multiple numbers, appended notes, and placeholders are not
auto-fixable.

**Rule sources:**

- [Canadian Numbering Administrator — NPA Code (Area Code)](https://cnac.ca/npa_codes/npa_codes.htm)
- [NANPA — CO Codes/Thousands-Blocks](https://www.nanpa.com/index.php/numbering/co-codesthousands-blocks)
- [NANPA — About the North American Numbering Plan](https://www.nanpa.com/about)

---

### Rule: `PHONE_CANADIAN_AREA_CODE`

**Severity:** off, info, or warning
**Fields:** metadata `ContactPhone`, student `Phone`, and each guardian `Phone`

After a number passes NANP structural validation, this optional policy rule
checks whether its NPA is a currently active Canadian **geographic** area code.
It does not classify a structurally valid US or other NANP number as invalid.
The built-in STIX ruleset uses `warning`; custom rulesets can choose `off`,
`info`, or `warning`. The rule can never produce an error and therefore never
changes a READY gate to BLOCKED.

PanoReady bundles a static CNAC-derived set rather than making a runtime network
request. The set was verified on **2026-09-01** against CNAC's current CO Code
Status data and relief notices. It excludes future or reserved relief NPAs such
as `273` and `851`, and Canadian non-geographic numbering resources such as
`600`. Because area codes change, that source date is part of the rule and the
set must be reviewed over time.

No Canadian policy issue is emitted unless the number first passes both the NPA
and NXX structural checks. Policy findings have no suggested fix.

Passing the structural and Canadian-geographic checks proves neither that the
subscriber number exists nor that it is active or belongs to the stated person.

**Rule sources:**

- [Canadian Numbering Administrator — CO Code Status](https://www.cnac.ca/co_codes/co_code_status.htm)
- [Canadian Numbering Administrator — Non-Geographic (6YY) Codes](https://www.cnac.ca/other_codes/nongeo/nongeo_codes.htm)
- [Canadian Numbering Administrator — 782/902 relief planning for future NPA 851](https://cnac.ca/npa_codes/relief/782-902/relief_782-902.htm)

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

**Auto-fix:** No. Values exceeding the limit must be shortened manually.

`PostalCode` is intentionally handled by its dedicated structural rule rather
than this generic length rule. Invalid postal codes are never auto-truncated.

---

### Rule: `whitespace`

**Severity:** info
**Field:** varies

Fields with leading or trailing whitespace are flagged.

`PostalCode` is intentionally excluded: its dedicated rule supplies the full
canonical value so the same input does not also receive a generic whitespace
issue.

**Auto-fix:** Yes. The suggested fix is the trimmed value (whitespace removed from both ends).

---

### Rules: free-text characters

**Severity:** info
**Fields:** configured independently in `freeTextCharacterChecks`

Four separate rules identify characters that are accepted in STIX but may make
downstream reporting or matching less reliable:

| Rule ID | Characters | Suggested fix |
|---|---|---|
| `FREE_TEXT_APOSTROPHE` | Straight and curly apostrophes | Remove |
| `FREE_TEXT_QUOTATION` | Straight and curly quotation marks | Remove |
| `FREE_TEXT_ACCENT` | Accented Latin letters, including `é è à ù ä ö ü` | Replace with the unaccented letter |
| `FREE_TEXT_SPECIAL_CHARACTER` | Anything outside ASCII letters, numbers, whitespace, `-`, round brackets, or the field's configured exceptions | Remove |

Each category has its own field list. The built-in profile permits apostrophes,
periods, and ampersands in `SchoolName`, while the other enabled checks still
apply there.
Periods and slashes are also preserved in the street-address fields `Unit`,
`StreetNumber`, `StreetNumberSuffix`, and `StreetName`.
The slash is preserved in `City` as well, but a period is not.
Profiles can enable or disable every category for every supported free-text
field. When one field contains multiple categories, the findings remain
separate but share the same composed suggestion so applying any or all of them
produces the complete safe value.

Balanced parenthetical spans are excluded entirely: the brackets and their
contents are preserved for possible future handling as aliases or former names.
An unmatched round bracket is allowed but does not shield the remaining text.

Character checks run last and act only as a fallback. If another validator
already reports the same record field, its specialized correction owns that
field and no character finding is added.

**Auto-fix:** Yes. These findings never change the validation gate.

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

## Custom Rulesets

The allowed values, field lengths, patterns, and aliases that drive these rules are configurable. You can create board-specific rulesets without code changes by using the **Validation ruleset** control in **Validate & Fix**.

See [docs/rulesets.md](rulesets.md) for a full field-by-field reference, including how each ruleset field maps to the rule IDs above.

---

## Auto-Fix Summary

| Rule | Auto-fixable | Fix applied |
|---|---|---|
| `FREE_TEXT_APOSTROPHE` | Yes | Apostrophe removed |
| `FREE_TEXT_QUOTATION` | Yes | Quotation mark removed |
| `FREE_TEXT_ACCENT` | Yes | Unaccented Latin letter |
| `FREE_TEXT_SPECIAL_CHARACTER` | Yes | Other special character removed |
| `xml-wellformed` | No | — |
| `root-element` | No | — |
| `school-structure` | No | — |
| `required-fields` | No | — |
| `grade-value` | Yes (alias match) | Canonical grade code |
| `gender-value` | Yes (alias match) | Canonical gender code |
| `province-value` | No | — |
| `birthdate-format` | Yes (parseable alternate format) | `YYYY-MM-DD` |
| `postal-code` | Yes (safe normalization or O/I/L numeric-position repair) | Canonical six-character value |
| `PHONE_FORMAT` | Yes (deterministic formatting only) | `XXX-XXX-XXXX` |
| `PHONE_NPA_STRUCTURE` | No | — |
| `PHONE_NXX_STRUCTURE` | No | — |
| `PHONE_PLACEHOLDER` | No | — |
| `PHONE_CANADIAN_AREA_CODE` | No | — |
| `oen-format` | No | — |
| `field-length` | No | — |
| `whitespace` | Yes | Trimmed value |
| `duplicate-oen` | No | — |
| `duplicate-name-dob-school` | No | — |

## XML structure acceptance

STIX XML is checked before values enter the working model. Every element must use the `http://ontario.ca` namespace and the supported STIX hierarchy. Unknown elements or attributes, duplicate singleton elements, more than two guardians, mixed container text, multiple roots, and DTD/entity declarations are rejected. Namespace aliases, comments, standard XML entities, phone `type` attributes and root `xsi:schemaLocation` are supported. Missing values in known fields remain validation findings. These are local structure checks, not certified XSD validation.

## Workbook birth-date interpretation

Intake shows evidence across all imported student birth dates, with the first five populated values as a preview. Choose day/month/year or month/day/year to resolve ambiguous text; each file in Compare Files has its own choice. Opposing unambiguous day-first and month-first values block conversion even if an order is selected. Choices reset when the file changes and are not stored with workbook metadata.

Typed Excel date cells use their stored numeric value, date format and workbook 1900/1904 date system, not their displayed text. Excel serial 60 in the 1900 system, fractional days, numeric cells without a date format, formulas and invalid calendar dates are rejected. Year-first and uniquely interpretable text dates can normalize without a choice. Output uses YYYY-MM-DD. Unresolved ambiguous, invalid or conflicting dates block intake; correct the source or choose a consistent interpretation before continuing. Other workbook mapping behavior is unchanged.
