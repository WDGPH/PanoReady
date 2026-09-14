# Validation rules

PanoReady reports `error`, `warning`, and `info` findings. Errors produce `BLOCKED`. Warnings without errors produce `REVIEW_REQUIRED`. With neither, the file is `READY`. Informational notices do not change the gate.

Current checks cover:

- supported XML structure, namespace, attributes, cardinality, and resource limits;
- workbook layout, populated regions, hidden content, formulas, mapping, and reconciliation;
- required metadata, school values, and profile-selected fields;
- controlled grade, gender, province, language, country, street, relationship, phone-type, direction, and upload values;
- strict `YYYY-MM-DD` calendar validity after explicit workbook interpretation;
- configured length limits, OEN shape, Canadian postal codes, and deterministic phone structure;
- duplicate school numbers, OENs, and configured name/birth-date/school keys;
- incomplete or empty guardians and address-specific repair candidates; and
- source import findings that remain attached to their stable record or metadata target until corrected or undone.

Automatic fixes are restricted to deterministic changes. Examples include canonical whitespace/code mappings, unambiguous phone punctuation or leading country-code removal, postal-code spacing/case, and address repairs whose source and destination are explicit. PanoReady does not truncate identity fields, discard phone notes it cannot interpret, guess ambiguous dates, or switch date conventions row by row.

Ruleset configuration affects value policy. It cannot disable structural input checks, date calendar validity, stable-target preflight, output reconciliation, or privacy boundaries. See [Validation and cleaning profiles](rulesets.md).

These checks are application policy and compatibility evidence. They are not an independent XSD validation result or a destination-system response.
