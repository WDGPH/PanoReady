# TWIG STIX Cleaner — Documentation

TWIG STIX Cleaner is a browser-based utility for validating, cleaning, and exporting Ontario school enrollment data in STIX XML format. All processing happens entirely in your browser — no data is ever uploaded to a server.

## Workflows

| Workflow | Purpose | Output |
|---|---|---|
| [Validate & Fix](./workflow-validate-and-fix.md) | Deep validation against rules, interactive fix editor, revalidation, audit trail | Cleaned XML + issue report CSV |
| [Clean XML](./workflow-clean-xml.md) | Auto-fix phone numbers and address unit fields, optional manual review | Cleaned XML |
| [Export Reports](./workflow-export-reports.md) | Extract student data into spreadsheets with optional filtering | CSV files + Excel workbook |
| [Pretty Print](./workflow-pretty-print.md) | Reformat XML with consistent indentation | Formatted XML |

## How to Use

1. Open the app in your browser.
2. Drag and drop (or click to browse) a STIX XML file onto the upload zone.
3. Select a workflow from the four workflow cards.
4. Follow the on-screen steps for that workflow.
5. Download your output files.

## Privacy

All XML parsing, validation, and cleaning runs locally in your browser using JavaScript. No file contents are transmitted over a network at any point.

## Reference

- [Validation Rules Reference](./validation-rules.md) — All rules checked during Validate & Fix, including field requirements, allowed values, and auto-fix logic.
- [Type & Data Model Reference](./data-model.md) — TypeScript interfaces for workflows, issues, fixes, and student records.
