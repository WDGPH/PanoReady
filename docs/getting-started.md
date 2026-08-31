# Getting started

PanoReady runs in a modern web browser and processes source records locally. You do not need to install anything to use a deployed instance.

## Choose an input

PanoReady accepts:

- STIX XML files (`.xml`); and
- Excel macro-enabled workbooks (`.xlsm`) that contain the expected student and school columns.

When importing a workbook, review the detected school and reporting metadata before continuing. PanoReady remembers workbook metadata in that browser's local storage for convenience.

!!! warning "Use approved data-handling practices"
    Local browser processing means PanoReady does not upload file contents, but source and downloaded files still contain sensitive records. Follow your organization's requirements for storage, access, transfer, passwords, and deletion.

## Run a workflow

1. Open PanoReady in your browser.
2. Select a workflow.
3. Choose or drag in the source file. **Compare Files** requires a previous and a current file.
4. Review any detected workbook metadata or validation ruleset.
5. Process the file and review the result before downloading it.

See the workflow guides for detailed behaviour:

- [Validate & Fix](workflow-validate-and-fix.md)
- [Clean XML](workflow-clean-xml.md)
- [Export Reports](workflow-export-reports.md)
- [Pretty Print](workflow-pretty-print.md)
- [Compare Files](workflow-compare-files.md)

## Custom rulesets

The built-in validation rules cover the project's default STIX policy. To use different allowed codes or requirements, export the built-in JSON from the **Validation ruleset** menu, edit it, and import it as a custom ruleset. See the [ruleset reference](rulesets.md).

Custom rulesets are stored only in the current browser's local storage. Export the JSON file to back it up or share it.

## Troubleshooting

### The file cannot be read

Confirm that the file has an `.xml` or `.xlsm` extension and is not open or corrupted. For XML, confirm that it is well formed and contains the expected STIX structure.

### A generated ZIP will not open in File Explorer

PanoReady's protected ZIP downloads use AES-256 encryption, which Windows File Explorer does not support. Use an AES-capable archive tool such as 7-Zip, WinRAR, or PeaZip.

### Validation results do not match local policy

Confirm which ruleset is selected. Export it and compare its allowed values, required fields, patterns, and cleaning mappings with the [ruleset reference](rulesets.md).

For reproducible software problems, read the project's [support policy](project-policies.md#support).
