# PanoReady

PanoReady is a browser-based utility for validating, cleaning, comparing, and exporting Ontario school enrolment data in STIX XML format.

**Your record data stays on your device.** File parsing and generated outputs are handled in the browser; source files are not uploaded to a PanoReady server.

[Open PanoReady](https://wdgph.github.io/PanoReady/){ .md-button .md-button--primary }
[Get started](getting-started.md){ .md-button }
[View on GitHub](https://github.com/WDGPH/PanoReady){ .md-button }

## Workflows

| Workflow | Purpose | Output |
|---|---|---|
| [Validate & Fix](workflow-validate-and-fix.md) | Clean and validate records, review issues, apply safe fixes, and revalidate | XML, issue reports, summaries, optional encrypted ZIP |
| [Clean XML](workflow-clean-xml.md) | Normalize phone numbers and unit fields and review suspicious street numbers | Cleaned XML |
| [Export Reports](workflow-export-reports.md) | Extract student data and aggregate school or grade information | CSV files and Excel workbook |
| [Pretty Print](workflow-pretty-print.md) | Reformat XML with consistent indentation | Formatted XML |
| [Compare Files](workflow-compare-files.md) | Compare previous and current snapshots, including school and field changes | Comparison views and current XML export |

## Input formats

PanoReady accepts STIX XML and supported Excel macro-enabled workbooks (`.xlsm`). Workbook imports include a metadata review step before conversion to STIX XML.

## Configure validation

Validation settings and optional value mappings are configured through rulesets. The separate Clean XML workflow uses fixed cleaning logic. You can export it, create a custom variant, and import that variant without changing application code. Start with the [ruleset reference](rulesets.md) and [validation rules](validation-rules.md).

## Open-source project

PanoReady is maintained by [Wellington-Dufferin-Guelph Public Health](https://wdgpublichealth.ca/) and released under the [MIT License](https://github.com/WDGPH/PanoReady/blob/main/LICENSE). Contributions are welcome; see the [project policies](project-policies.md) and [development guide](development.md).

!!! warning "Protect sensitive information"
    Do not attach real student records or other sensitive information to GitHub issues or pull requests. Follow your organization's policies when handling source files and generated downloads.
