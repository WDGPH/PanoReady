# Advanced rules and replacements

Most files should use PanoReady's built-in validation profile and suggested
fixes. Custom validation rules and saved value replacements are advanced options
for organizations with an approved local policy that differs from the built-in
one.

A profile can contain two related kinds of configuration:

- **Validation rules** define approved values, required fields, length limits,
  and selected data-quality checks.
- **Cleaning mappings** define exact whole-value replacements to apply before
  validation, such as `St. Marys` to `St. Mary’s`.

These settings can materially change findings and output values. Test a custom
profile with representative, non-sensitive records before relying on it.
Accepting a value locally does not establish that a receiving system accepts it;
base policy changes on that system's requirements.

This reference describes the current configuration contract. Exact bundled values
are in [rules.stix.default.json](../config/rules.stix.default.json).
[Validation Rules](validation-rules.md) provides additional background; the
implementation links below are the authority for current behavior and finding IDs.

## Access advanced options

Advanced options appear after PanoReady has assessed a file. They are collapsed
by default.

### Change validation rules

1. Start **Validate & Fix**, choose a file, and wait for **Import readiness**.
2. Expand **Advanced options** beside the page heading.
3. The current **Profile** is shown. Choose **Change** to open **Cleaning and
   validation profile**.
4. Choose **New** to start from the built-in defaults, or **Duplicate** to copy
   the selected profile. The built-in profile cannot be edited directly.
5. Configure the rules and choose **Save Ruleset**. The saved profile is selected
   automatically. Use **Edit** to change a custom profile later.

Changing the selected profile immediately revalidates the current file. Return
to the readiness summary and review the new findings before continuing.

### Add or change replacements

1. From **Import readiness**, continue to **Automatic fixes**.
2. Expand **Advanced options** beside **Choose automatic fixes**.
3. Under **Cleaning mappings**, choose **Add mapping** and select a field.
4. Enter the replacement beside each raw value. Matching applies to the complete
   field value and is case-insensitive unless **Match case** is selected.
5. Keep **Apply mappings** selected and choose **Preview cleaning changes**.
6. Review the cleaning summary, including mappings that changed no records,
   before continuing and applying the replacements.

Cleaning mappings are drafts for the current review until saved. Choose **Save
as new profile** when the built-in profile is active, or **Save mappings to
profile** for an existing custom profile. Saving a mapping does not apply it to
the current file; **Preview cleaning changes** begins that review-and-apply path.

### Import, export, and share profiles

Open the profile dialog from **Import readiness** → **Advanced options** →
**Change**. Use **Export** to back up or share the selected profile, and
**Import** to add an exported JSON profile to the current browser. Direct JSON
editing is an expert workflow; prefer the in-app editor for routine changes.

Switching profiles replaces validation rules and cleaning mappings, including
unsaved mappings for the current file. Profiles are stored in the browser's
`localStorage`; they are not uploaded or synchronized between users. Keep exports
if you need to recover profiles after clearing browser storage. Cleaning mappings
can contain literal source values, so review their contents before sharing.

Exporting the built-in profile creates a new ID and timestamp. Exporting a custom
profile preserves its ID. Importing an existing ID **replaces that saved profile**.
To keep both versions, duplicate the profile or change the imported `id`;
changing only `name` does not prevent replacement. Do not use the reserved ID
`builtin` for a custom profile.

## JSON file structure and import checks

This section is for maintainers and advanced users who need to inspect or edit an
exported profile. Start with an export from the app. The bundled configuration is
only the `rules` body, not a complete importable profile.

| Outer property | Required | Meaning |
|---|---|---|
| `id` | Yes | Non-empty string used for selection and replacement. |
| `name` | Yes | Non-empty display name. |
| `description` | No | Description of the profile's purpose and policy choices. |
| `createdAt` | Yes | Creation timestamp, normally ISO 8601. Import checks only for a non-empty string, not a valid date. |
| `rules` | Yes | Validation configuration described below. |
| `cleaning` | No | Cleaning configuration, alongside `rules`, not inside it. |
| `warnings` | No | Transient importer messages; omit from authored files. The UI removes this property before saving an import. |

Every `rules` property described below is required on import except
`freeTextCharacterChecks`, `freeTextAllowedCharacters`, and the nested
`phoneConfig.canadianAreaCodeCheck`. Required arrays and maps may be empty;
omission is not equivalent to an empty value.

Import checks JSON syntax, required types, the postal regular expression,
duplicate-check booleans, and optional configuration shapes. Unknown keys directly
inside `rules` or `cleaning` produce warnings and do not define new checks.
Unknown free-text category names are rejected.

Successful import is not semantic validation of a policy. It does not check that
field names exist, alias targets belong to allowed lists, length limits are
positive integers, or a profile meets an external specification. Use the editor's
field choices and test the resulting behavior.

## How configuration affects validation

Cleaning mappings propose substitutions before validation. Validation checks the
canonical working model and produces findings; suggestions are applied through
the review workflow and revalidated. An alias does not silently rewrite input
during validation.

Errors block the validation gate. Warnings and informational findings do not.
Most severities and repair algorithms are defined in code. XML structure,
metadata requirements, birth-date interpretation, OEN format, and guardian
structure cannot be disabled by removing a field from `requiredFields`.

### Required fields and length limits

`requiredFields` is an array of canonical field names. The bundled value is:

```json
["FirstName", "LastName", "Gender", "BirthDate", "SchoolNumber"]
```

Student fields must contain a non-whitespace value (`REQUIRED_FIELD`).
`SchoolNumber` and `SchoolName` are checked at school scope; a missing required
school number uses `SCHOOL_NUMBER_REQUIRED`. Unknown student field names can
create missing-field errors on every record; do not add arbitrary schema names.

`fieldLengths` maps field names to maximum lengths. These are the bundled limits:

| Fields | Limit |
|---|---|
| `FirstName`, `MiddleName`, `LastName`, `AliasFirstName`, `AliasMiddleName`, `AliasLastName`, `City` | 50 |
| `StreetName` | 80 |
| `StreetNumber` | 6 |
| `StreetNumberSuffix`, `Unit` | 5 |
| `OEN` | 9 |
| `PostalCode` | 7, retained for compatibility; ignored by the generic length check |

The generic check reads student record fields and emits `FIELD_LENGTH` errors.
Only listed fields receive it; separate structural limits still apply, including
the 100-character school-number limit. Length uses JavaScript string length
(UTF-16 code units).

Ordinary fields can receive a truncation suggestion; address fields use
specialized repair or manual review. Postal codes use their dedicated rule and
are never truncated by this check. Review proposed fixes when changing limits.

### Allowed values and aliases

Allowed-value arrays use exact, case-sensitive matching. Empty optional fields
skip these checks; presence is controlled separately. Invalid populated values
produce errors.

| Property | Fields checked | Finding ID |
|---|---|---|
| `allowedGradeValues` | `Grade` | `GRADE_ALLOWED_VALUE` |
| `allowedGenderValues` | `Gender` | `GENDER_ALLOWED_VALUE` |
| `allowedProvinceValues` | `Province` | `PROVINCE_ALLOWED_VALUE` |
| `allowedLanguageValues` | `Language` | `LANGUAGE_ALLOWED_VALUE` |
| `allowedCountryValues` | `CountryOfOrigin` | `COUNTRYOFORIGIN_ALLOWED_VALUE` |
| `allowedStreetTypeValues` | `StreetType` | `STREETTYPE_ALLOWED_VALUE` |
| `allowedStreetDirectionValues` | `StreetDirection` | `STREETDIRECTION_ALLOWED_VALUE` |
| `allowedRelationshipValues` | `GuardianRelationship`, `Guardian2Relationship` | `GUARDIANRELATIONSHIP_ALLOWED_VALUE`, `GUARDIAN2RELATIONSHIP_ALLOWED_VALUE` |
| `allowedPhoneTypeValues` | Student and guardian phone types; metadata contact-phone type | `PHONETYPE_ALLOWED_VALUE`, `GUARDIANPHONETYPE_ALLOWED_VALUE`, `GUARDIAN2PHONETYPE_ALLOWED_VALUE`; metadata uses `PHONE_TYPE_ALLOWED_VALUE` |
| `allowedFullLoadTypeValues` | Metadata `FullUpload` | `FULL_UPLOAD_ALLOWED_VALUE` |

The built-in genders are `F`, `M`, `Unk`, and `Other`; full-upload values are
`NO` and `YES`. Grades include `JK`, `SK`, `GR1` through `GR13`, `CCL`, `CCNL`,
`CL-CGP`, `PRE`, and `UNIV`. Consult the bundled JSON for complete lists. Its
language and country lists are application vocabularies, not a guarantee of
complete, current ISO coverage; for example, they contain `gaelic` and `AN`.

`gradeAliases` and `genderAliases` map inputs to suggested replacements. This
excerpt belongs inside `rules`:

```json
{
  "gradeAliases": { "K": "JK", "GR01": "GR1", "1": "GR1" },
  "genderAliases": { "MALE": "M", "FEMALE": "F", "UNKNOWN": "Unk" }
}
```

For a value outside its allowed list, the validator tries the exact alias key,
then the trimmed, uppercased key. The target is used as written. Add a code to
the allowed list if it should remain unchanged; add an alias if it should become
another accepted code.

Keep alias targets in their allowed list. This is an authoring requirement, not
an importer guarantee: current defaults include gender aliases to `X`, but `X`
is not in `allowedGenderValues`. Those suggestions do not resolve the error on
revalidation. A future policy change needs to reconcile that mismatch explicitly.

### Dates

`dateFields` is a required array whose bundled value is `["BirthDate"]`. It is
retained in the format and editor, but the current canonical validator does not
read it. Adding a name does not add date validation; clearing it does not disable
birth-date validation.

Populated `BirthDate` values are checked directly for a real `YYYY-MM-DD` date
and future dates (`BIRTHDATE_FORMAT`, `BIRTHDATE_FUTURE`). Only unambiguous,
non-future alternatives receive normalization suggestions. Metadata `CreateDate`
has its own check (`METADATA_DATE`). Workbook date interpretation happens at
intake; see [Validation Rules](validation-rules.md#workbook-birth-date-interpretation).

### Postal codes and phone numbers

`postalCodePattern` is a regular-expression string. The bundled value is:

```json
"^[ABCEGHJKLMNPRSTVXY]\\d[ABCEGHJKLMNPRSTVWXYZ]\\d[ABCEGHJKLMNPRSTVWXYZ]\\d$"
```

JSON requires doubled backslashes. Import checks that the expression compiles;
custom expressions are evaluated case-insensitively during validation. With the
built-in pattern, the dedicated rule normalizes supported formatting and can
repair `O`, `I`, or `L` in numeric positions. A custom pattern remains
authoritative: a Canadian normalization or repair is suggested only if it also
passes that expression. Findings are `POSTAL_CODE_NORMALIZE` (info),
`POSTAL_CODE_REPAIR` (warning), and `POSTAL_CODE_FORMAT` (warning). See
[postal-code behavior](validation-rules.md#rule-postal-code) for examples.

`phoneConfig` contains these settings, shown with their bundled values:

```json
{
  "placeholderNumbers": ["519-000-0000", "000-000-0000"],
  "canadianAreaCodeCheck": "warning"
}
```

`placeholderNumbers` is a required array of canonical numbers. Supported numeric
formatting variants are canonicalized before comparison. A match produces a
`PHONE_PLACEHOLDER` error without a replacement suggestion.

`canadianAreaCodeCheck` accepts `"off"`, `"info"`, or `"warning"`. It controls
`PHONE_CANADIAN_AREA_CODE` for a structurally valid NANP number whose area code
is outside the application's bundled Canadian geographic set. Omission means
`off`, including for older custom profiles; the built-in profile explicitly uses
`warning`. This setting never produces an error. The area-code set and phone
structure/extension rules are maintained in code, not profile JSON. See
[phone policy and provenance](validation-rules.md#rule-phone_canadian_area_code).

### Duplicate and identity checks

`duplicateDetection` requires two booleans, both `true` in the built-in profile:

| Setting | Match | Same-school finding | Cross-school finding |
|---|---|---|---|
| `checkOen` | Same valid nine-digit OEN | `OEN_DUPLICATE` (error) | `OEN_DUAL_ENROLLMENT` (warning) |
| `checkNameDobSchool` | Same first and last names, ignoring case, plus identical birth-date text | `NAME_DOB_DUPLICATE` (error) | `IDENTITY_REVIEW` (warning) |

Setting either flag to `false` disables both findings in its row, but not OEN
format or birth-date validation. Identity findings have no automatic replacement;
investigate them in the source system.

The implementations currently differ: OEN checks retain all occurrences and
prefer a prior match in the same canonical school. Name/date checks compare only
against the first matching record and use `SchoolNumber` for school equality.
A name/date sequence in schools A, B, B can therefore produce two cross-school
warnings without detecting the repeated B record as a same-school error. Do not
assume the settings have identical grouping behavior.

### Free-text character policy

`freeTextCharacterChecks` maps each category to the fields where it is checked:

| Category | Finding ID | Suggested change |
|---|---|---|
| `apostrophe` | `FREE_TEXT_APOSTROPHE` | Remove supported straight/curly apostrophes. |
| `quotation` | `FREE_TEXT_QUOTATION` | Remove supported quotation marks. |
| `accent` | `FREE_TEXT_ACCENT` | Convert letters that decompose to an ASCII Latin letter plus accent marks to the unaccented letter. |
| `other` | `FREE_TEXT_SPECIAL_CHARACTER` | Remove characters outside the base set and configured exceptions. |

All four findings are informational. The base set permits ASCII letters, digits,
whitespace, `-`, and round brackets. Balanced parenthetical spans and their
contents are preserved; unmatched brackets do not protect subsequent text.
Separate category findings on a field share one composed suggestion.

Each omitted category inherits its built-in field list. A supplied array replaces
that category's entire list; use `[]` to disable it everywhere. Omitting a field
from a supplied list disables that category for that field. This excerpt disables
apostrophe checks while retaining the other built-in categories:

```json
{ "freeTextCharacterChecks": { "apostrophe": [] } }
```

`freeTextAllowedCharacters` maps fields to strings of additional literal
characters. Exceptions take precedence over all four categories. Built-in values:

```json
{
  "SchoolName": ".&",
  "Unit": "./",
  "StreetNumber": "./",
  "StreetNumberSuffix": "./",
  "StreetName": "./",
  "City": "./&"
}
```

Each supplied string replaces that field's exceptions; `""` removes them.
Omitted fields inherit built-in exceptions. Omitting either free-text property
entirely retains the corresponding built-in policy. The built-in apostrophe
list also excludes `SchoolName`.

These checks run last. Existing findings with the same record ID and field
suppress character findings for that target so specialized corrections take
precedence. School names are processed separately from student fields.

## Cleaning mappings

`cleaning` is optional and belongs alongside `rules` in the outer profile. Add
this kind of configuration to a complete exported profile:

```json
{
  "cleaning": {
    "enabledFields": ["City", "Grade"],
    "mappings": {
      "City": [{ "raw": "toronto", "canonical": "Toronto" }],
      "Grade": [{ "raw": "Grade 1", "canonical": "GR1", "matchCase": true }]
    }
  }
}
```

Only fields in `enabledFields` are processed, in that order. For each field,
mappings are evaluated top to bottom and the first match wins. Each mapping
requires string values for `raw` and `canonical`. Matching compares the whole
value without trimming; it ignores case unless `matchCase` is `true`.

Cleaning can change controlled values such as grade, gender, language, and
province before validation. The cleaned result must still pass the active rules.
Use cleaning for explicit substitutions and aliases for validation suggestions
on invalid grade or gender values. The editor and cleaning view expose supported
fields; [cleaning.ts](../lib/cleaning.ts) defines the list and matching behavior.
Use **Save mappings to profile** in the cleaning workflow to retain mappings,
or **Save as new profile** when using the built-in profile. Omitting `cleaning`
means no saved cleaning mappings.

## Improving rules safely

A useful rule proposal records the affected fields, requirement or source,
accepted and rejected examples, severity, and whether a deterministic correction
exists. For changing reference data, record the source's verification date and
when it needs review.

Use this implementation map to keep a change consistent:

| Responsibility | Source |
|---|---|
| Bundled values and defaults | [rules.stix.default.json](../config/rules.stix.default.json) |
| Profile types and finding structure | [types.ts](../lib/types.ts) |
| Import checks, persistence, and compatibility | [rulesets.ts](../lib/rulesets.ts) |
| Selection, import/export, and editor controls | [RulesetSelector.tsx](../components/RulesetSelector.tsx), [RulesetEditor.tsx](../components/RulesetEditor.tsx) |
| Rule execution, severity, precedence, and fixes | [validator.ts](../lib/validator.ts) |
| Character categories and composed suggestions | [freeTextCharacters.ts](../lib/freeTextCharacters.ts) |
| Cleaning fields and matching | [cleaning.ts](../lib/cleaning.ts) |
| Regression evidence | [tests](../tests) |

For a new setting, define omitted, empty, and explicit values before adding it to
the importer and editor. Test existing imported profiles as well as new ones.
For a correction, verify the result passes revalidation, preserves unrelated
fields, and works with review and Undo. Use synthetic records for valid, invalid,
ambiguous, and conflicting cases. Browser interaction needs separate verification
from unit tests.

The gaps documented above—unconsumed `dateFields`, aliases outside their allowed
list, limited semantic import checks, and differing duplicate grouping—are
concrete candidates for future work, not behavior promised by this reference.
When changing them, update this document and the related sections of
[Validation Rules](validation-rules.md) together, using actual emitted IDs and
tested examples.
