# PanoReady

PanoReady is an experimental browser-local utility for preparing known school-enrolment inputs for STIX submission and comparing two snapshots. It processes source records in memory without intentionally transmitting or persisting them.

| Workflow | Use it to | Main output |
|---|---|---|
| [Validate & Fix](workflow-validate-and-fix.md) | Check a supported XML or workbook, review corrections, and undo the latest change group | Checked STIX XML, or a clearly labelled draft while errors remain |
| [Compare Files](workflow-compare-files.md) | Inspect conservative matches and review changes between previous and current files | Local comparison review log |

Both workflows accept `.xml` and the supported `.xlsm` layout. See [Supported inputs and outputs](supported-inputs-and-outputs.md) before using operational data.

!!! warning "Operational meaning"
    `READY` means PanoReady's implemented checks passed. The application does not currently run independent XSD validation or prove acceptance by a destination system.

Downloads can contain sensitive student records. Follow your organization's requirements for storage, transfer, access, passwords, and deletion. Use synthetic data in public issues and tests.
