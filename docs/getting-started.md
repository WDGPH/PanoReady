# Getting started

Use the [deployed application](https://wdgph.github.io/PanoReady/) or run it locally from [Development](development.md).

1. Choose **Validate & Fix** or **Compare Files**.
2. Select or drop a supported `.xml` or `.xlsm` file. Comparison requires a previous and a current file.
3. Review File setup and quality.
4. For a workbook, review metadata, import findings, and date evidence. Confirm day/month order when the source contains ambiguous text dates.
5. Process the file and review the current findings or comparison before downloading.

The supported workbook requires exact `Student Info` and `File Info` sheets. A generic spreadsheet or renamed sheet is rejected. See [Supported inputs and outputs](supported-inputs-and-outputs.md) for the full boundary.

## Browser session

Files, comparison labels, workbook metadata, imported rules, cleaning mappings, changes, and passwords remain in memory for the current page session. Reloading the page or choosing the workflow reset action releases them. Export a rules profile before reload if it is needed later.

## Encrypted ZIPs

The optional ZIP uses AES-256 encryption and contains the generated XML file. Choose a password of at least eight characters and communicate it separately under local policy. Some built-in archive tools do not support AES ZIPs; use an AES-capable tool.

For a software problem, reproduce it with synthetic data and follow the [support policy](project-policies.md#support).
