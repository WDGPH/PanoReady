# Validation rules

`lib/validator.ts` implements the checks. The built-in values are in `config/rules.stix.default.json`; [custom rulesets](rulesets.md) can change the settings used by those checks.

`READY` means no errors were found by the active checks. Warnings may remain. PanoReady does not perform full XSD validation or certify that a receiving system will accept a file.

## Findings

These are the rule IDs written to issue reports.

| Rule ID | Check |
|---|---|
| `XML_WELLFORMED` | The XML parser raised an error |
| `STRUCT_ROOT` | Expected `ns1:SchoolUpload` root is missing |
| `STRUCT_SCHOOLS` | No schools found |
| `SCHOOL_NUMBER_REQUIRED` | School number is missing |
| `EMPTY_STUDENTS` | A school has no students |
| `REQUIRED_FIELD` | A configured required field is empty |
| `GRADE_ALLOWED_VALUE` | Grade is outside the configured values; aliases can supply a correction |
| `GENDER_ALLOWED_VALUE` | Gender is outside the configured values; aliases can supply a correction |
| `PROVINCE_ALLOWED_VALUE` | Province is outside the configured values |
| `BIRTHDATE_FORMAT` | Birth date does not match the expected date format |
| `BIRTHDATE_RANGE` | Birth date is outside the implemented range |
| `POSTAL_CODE_FORMAT` | Postal code does not match the ruleset pattern |
| `OEN_FORMAT` | OEN is not nine digits |
| `OEN_DUPLICATE` | OEN repeats, when OEN duplicate detection is enabled |
| `UNIT_LENGTH` | Unit exceeds the configured limit |
| `STREET_NUMBER_LENGTH` | Street number exceeds the configured limit |
| `FIELD_LENGTH` | Another configured field exceeds its limit |
| `WHITESPACE_TRIM` | A parsed field contains surrounding whitespace |
| `NAME_DOB_DUPLICATE` | Name, birth date, and school repeat, when enabled |
| `PHONE_FORMAT` | Contact phone needs correction or matches a configured placeholder |

The issue's `severity`, `autoFixable`, and `suggestedFix` values determine how it appears in the interface. A suggested correction should still be reviewed before applying it.

## Configuration limits

A ruleset can store allowed language, country, street type, relationship, phone type, street direction, and full-upload values. The validator currently checks grade, gender, and province against allowed-value lists; storing another list does not add an enforcement rule for it.

Likewise, `dateFields` is part of the ruleset format, while the implemented date check targets `BirthDate`. XML parser success is not a complete well-formedness or schema check. Use receiving-system validation as part of submission review.

## Corrections

Review the current value, suggested value, and source record. Apply deterministic corrections such as configured aliases or known formatting changes. Resolve missing identity information and ambiguous values against the source system.

Revalidate after changes. Download the issue report with the XML so reviewers can see which findings remain.
