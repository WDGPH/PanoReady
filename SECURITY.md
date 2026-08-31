# Security Policy

## Supported versions

Security updates are applied to the latest version on the `main` branch. Older commits and forks are not supported by the project maintainers.

## Report a vulnerability

Please report suspected vulnerabilities privately through [GitHub's private vulnerability reporting](https://github.com/WDGPH/PanoReady/security/advisories/new). Include:

- the affected workflow or component;
- steps to reproduce the issue using synthetic data;
- the security impact;
- any suggested mitigation; and
- your preferred contact information.

Do not open a public issue, disclose exploit details publicly, or include real student records or other sensitive information in a report.

We will acknowledge a report as maintainers become available, investigate it, and coordinate remediation and disclosure with the reporter. Response and resolution times depend on severity and maintainer availability.

## Security model

PanoReady is designed to process source files locally in the browser. Contributors should treat any change that introduces network transmission, persistent storage, analytics, or third-party processing of record data as a security- and privacy-sensitive architectural change requiring explicit maintainer review.

Password-protected ZIP files reduce accidental exposure but are not a substitute for organizational data-handling requirements. Users remain responsible for secure storage, transfer, password sharing, and deletion of generated files.
