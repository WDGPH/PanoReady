# PanoReady

PanoReady is a browser-based utility with two workflows for preparing and comparing Ontario school enrolment data in STIX XML format.

**Your record data stays on your device.** File parsing and generated outputs are handled in the browser; source files are not uploaded to a PanoReady server.

[Open PanoReady](https://wdgph.github.io/PanoReady/){ .md-button .md-button--primary }
[Get started](getting-started.md){ .md-button }
[View on GitHub](https://github.com/WDGPH/PanoReady){ .md-button }

## Workflows

| Workflow | Purpose | Output |
|---|---|---|
| [Validate & Fix](workflow-validate-and-fix.md) | Import, optionally clean, validate, review issues, apply fixes, and revalidate | Validated and formatted XML, optional encrypted ZIP, issue reports, CSV summaries, and Excel workbook |
| [Compare Files](workflow-compare-files.md) | Compare previous and current snapshots, review changes, and correct current values | Comparison views and logs, full or school-scoped current XML, optional encrypted ZIP |

## Input formats

PanoReady accepts STIX XML and supported Excel macro-enabled workbooks (`.xlsm`). Workbook imports include a metadata review step before conversion to STIX XML.

## Configure validation

Validation settings and optional cleaning mappings are configured through rulesets in **Validate & Fix**. You can export the built-in ruleset, create a custom variant, and import that variant without changing application code. Start with the [ruleset reference](rulesets.md) and [validation rules](validation-rules.md).

## Open-source project

PanoReady is maintained by [Wellington-Dufferin-Guelph Public Health](https://wdgpublichealth.ca/) and its original code and documentation are released under the [MIT License](https://github.com/WDGPH/PanoReady/blob/main/LICENSE). Panorama, STIX, and related third-party systems and materials remain the property of their respective owners. References identify intended compatibility only and do not imply affiliation or endorsement. Contributions are welcome; see the [project policies](project-policies.md) and [development guide](development.md).

!!! warning "Protect sensitive information"
    Do not attach real student records or other sensitive information to GitHub issues or pull requests. Follow your organization's policies when handling source files and generated downloads.
