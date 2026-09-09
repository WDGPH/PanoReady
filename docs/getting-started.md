# Getting started

PanoReady runs in a modern web browser and processes source records locally. Use the [deployed application](https://wdgph.github.io/PanoReady/), or follow [Development](development.md) to run it locally. Documentation is available under the deployed site's `/docs/` path.

## Choose an input

PanoReady accepts:

- STIX XML files (`.xml`); and
- Excel macro-enabled workbooks (`.xlsm`) with a `Student Info` sheet (or a usable first sheet) containing recognized headers such as `OEN`, `Grade`, `First Name`, `Last Name`, and `Birthdate`.

When importing a workbook, review the detected school and reporting metadata before continuing. PanoReady remembers workbook metadata in that browser's local storage. This can include creator and contact details. Clear the site's browser data when those saved details should be removed; this also removes custom rulesets, so export any rulesets you need first. Workbook macros are not executed.

!!! warning "Use approved data-handling practices"
    Local browser processing means PanoReady does not upload file contents, but source and downloaded files still contain sensitive records. Follow your organization's requirements for storage, access, transfer, passwords, and deletion.

## Run a workflow

1. Open PanoReady in your browser.
2. Select a workflow.
3. Choose or drag in the source file. **Compare Files** requires a previous and a current file; either input may be XML or a supported workbook.
4. For workbook input, review detected metadata and resolve populated columns that are unmapped or mapped more than once. For **Validate & Fix**, also confirm the selected ruleset.
5. Process the file and review the result before downloading it.

See the workflow guides for detailed behaviour:

- [Validate & Fix](workflow-validate-and-fix.md)
- [Compare Files](workflow-compare-files.md)

Cleaning mappings, report exports, and pretty-printed XML are available inside **Validate & Fix**; they are no longer separate workflow choices.

## Custom rulesets

The built-in validation rules cover the project's default STIX policy. To use different allowed codes or requirements, export the built-in JSON from the **Validation ruleset** menu, edit it, and import it as a custom ruleset. See the [ruleset reference](rulesets.md).

Custom rulesets are stored only in the current browser's local storage. Export the JSON file to back it up or share it.

## Troubleshooting

### The file cannot be read

Confirm that the file has an `.xml` or `.xlsm` extension and is readable. For XML, confirm that it is well formed and contains the expected STIX structure.

### A generated ZIP will not open in File Explorer

PanoReady's protected ZIP downloads use AES-256 encryption, which Windows File Explorer does not support. Use an AES-capable archive tool such as 7-Zip, WinRAR, or PeaZip.

### Validation results do not match local policy

Confirm which ruleset is selected. Export it and compare its allowed values, required fields, patterns, and cleaning mappings with the [ruleset reference](rulesets.md).

For reproducible software problems, read the project's [support policy](project-policies.md#support).
