# Clean XML

Clean XML formats phone numbers and offers review controls for unit and street-number values. It uses fixed cleaning logic in `lib/cleaner.ts`, separate from the [validation ruleset](rulesets.md).

1. Select **Clean XML** and load a source file.
2. Review any flagged values against the source records.
3. Enter corrections or keep the current values.
4. Download the cleaned XML and review it before use.

## Phone handling

The cleaner removes non-digit characters, removes a leading country code `1` when there are more than ten digits, and formats the number as `AAA-BBB-CCCC`. It recognizes a trailing `x` followed by one to four extension digits. Extra digits without that extension notation are truncated.

Numbers shorter than ten digits become blank. The ordinary ten-digit path also clears area codes `163` and `081` and the placeholder `519-000-0000`; the extension path returns before these checks.

## Address handling and limits

The unit helper trims short values, abbreviates recognized floor names, and removes recognized unit prefixes when the result fits five characters. Longer unrecognized values need review. Street-number review targets values longer than six characters.

The XML traversal currently applies unit and street-number handling to object-shaped text nodes. Plain text leaf elements may bypass those checks. Do not treat an empty review table as confirmation that all addresses meet the limits; use [Validate & Fix](workflow-validate-and-fix.md) for field validation.

Cleaning parses and rebuilds the XML. Formatting and comments may change. Keep the source file and check the resulting values.
