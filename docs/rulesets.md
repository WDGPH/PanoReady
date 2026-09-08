# Rulesets

A ruleset configures required fields, allowed codes, correction aliases, length limits, and cleaning mappings. Custom rulesets are stored in the current browser's local storage. Export them as JSON to back them up or share them.

## Create or import

Open the **Validation ruleset** menu in Validate & Fix or Reports. Choose **New**, configure the fields, and save. Use **Duplicate** and **Edit** to start from an existing ruleset.

To edit a file, export the selected ruleset, change the JSON, import it, and select it before validating. Start from an export so all required properties are present.

Importing a ruleset with an existing `id` replaces that entry. Change the **ID**, not just the name, to retain both versions. Shared rulesets do not synchronize between browsers.

## File structure

| Property | Required | Meaning |
|---|---|---|
| `id` | Yes | Non-empty identifier; used to replace matching saved rulesets |
| `name` | Yes | Name shown in the menu |
| `createdAt` | Yes | Creation timestamp string |
| `description` | No | Description shown in the interface |
| `rules` | Yes | Validation settings below |
| `cleaning` | No | Cleaning profile, alongside `rules` |
| `warnings` | No | Importer messages about unknown settings |

The importer checks property types and rejects invalid postal-code regular expressions. See `validateRulesetSchema()` in `lib/rulesets.ts` for the schema checks.

## Validation settings

These properties belong inside `rules`.

| Property | Type | Use |
|---|---|---|
| `requiredFields` | String array | Fields that must have values in the parsed field map |
| `allowedGradeValues` | String array | Accepted grade codes |
| `allowedGenderValues` | String array | Accepted gender codes |
| `allowedProvinceValues` | String array | Accepted province codes |
| `fieldLengths` | Object of numeric limits | Maximum lengths by parsed field name |
| `postalCodePattern` | String | JavaScript regular expression for postal codes |
| `phoneConfig.placeholderNumbers` | String array | Phone placeholders to flag |
| `gradeAliases` | Object of strings | Grade values mapped to suggested replacements |
| `genderAliases` | Object of strings | Gender values mapped to suggested replacements |
| `duplicateDetection.checkOen` | Boolean | Check repeated OENs |
| `duplicateDetection.checkNameDobSchool` | Boolean | Check repeated name, birth date, and school combinations |

The bundled `requiredFields` are `FirstName`, `LastName`, `BirthDate`, `Grade`, and `SchoolNumber`. Use the field names extracted by `parseStixXml()` in `lib/validator.ts`; arbitrary XML tag names are not necessarily available to the validator.

Aliases supply suggestions for review. They do not silently change the loaded XML. Set each alias target to an accepted code in the corresponding allowed-value list.

The schema also requires `dateFields` and these string arrays: `allowedLanguageValues`, `allowedCountryValues`, `allowedStreetTypeValues`, `allowedRelationshipValues`, `allowedPhoneTypeValues`, `allowedStreetDirectionValues`, and `allowedFullLoadTypeValues`. Keep these properties when editing an export. Their presence does not mean that every list is enforced; see [configuration limits](validation-rules.md#configuration-limits).

The built-in lists come from `config/rules.stix.default.json`. Check them against your receiving system's requirements before changing policy.

## Cleaning profile

`cleaning` is an optional top-level property. This example maps city and street-type values before validation:

```json
{
  "enabledFields": ["City", "StreetType"],
  "mappings": {
    "City": [{ "raw": "toronto", "canonical": "Toronto" }],
    "StreetType": [{ "raw": "Street", "canonical": "ST", "matchCase": true }]
  }
}
```

Only fields in `enabledFields` are processed. Each field's mappings run in order; the first match wins. `raw` is the source value, `canonical` is the replacement, and `matchCase` defaults to `false`.

The Cleaning tab in the editor manages these mappings. **Save to ruleset** in the workflow stores the current profile in the active custom ruleset. Mappings may contain personal values discovered in a source file; review them before sharing a ruleset.
