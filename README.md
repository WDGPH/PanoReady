# PanoReady

[![CI](https://github.com/WDGPH/PanoReady/actions/workflows/ci.yml/badge.svg)](https://github.com/WDGPH/PanoReady/actions/workflows/ci.yml)
[![Documentation](https://github.com/WDGPH/PanoReady/actions/workflows/docs.yml/badge.svg)](https://github.com/WDGPH/PanoReady/actions/workflows/docs.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)

PanoReady is a browser-based tool for validating, cleaning, comparing, and exporting Ontario school enrolment data in STIX XML format. All record processing happens on your device; files are not uploaded to a server.

Built by [Wellington-Dufferin-Guelph Public Health](https://wdgpublichealth.ca/).

## What it does

| Workflow | Description |
|---|---|
| **Validate & Fix** | Validate required fields, code values, formats, and duplicates; apply safe fixes; revalidate; and export XML and reports. |
| **Clean XML** | Normalize phone numbers and unit fields and flag suspicious street numbers for review. |
| **Export Reports** | Export student data, school and grade summaries, filtered CSVs, and an Excel workbook. |
| **Pretty Print** | Reformat XML with consistent indentation. |
| **Compare Files** | Compare two STIX snapshots and review record, field, school, and transfer changes. |

PanoReady accepts STIX XML and Excel macro-enabled workbook (`.xlsm`) inputs. Validated and compared XML can optionally be downloaded in an AES-256 password-protected ZIP archive.

## Quick start

Requirements: [Node.js](https://nodejs.org/) 22 or 24 (24 is the default in `.nvmrc`) and npm.

```bash
git clone https://github.com/WDGPH/PanoReady.git
cd PanoReady
npm ci
npm run dev
```

Open <http://localhost:3000>.

## Development commands

```bash
npm run dev      # Start the development server
npm run lint     # Run ESLint
npm run typecheck # Check TypeScript
npm test         # Run regression tests
npm run build    # Create a production build
npm run start    # Serve the production build
npm run check    # Run application checks
```

## Documentation

The documentation site is configured to publish at <https://wdgph.github.io/PanoReady/> and in the [`docs`](docs/) directory.

To preview the documentation locally:

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
python -m pip install -r requirements-docs.txt
mkdocs serve
```

Then open <http://127.0.0.1:8000>.

See [deployment](docs/deployment.md) for hosting and [the release checklist](docs/releasing.md) for repository settings and release checks.

## Custom validation rulesets

Export the built-in rules from the **Validation ruleset** menu, edit the JSON, and import it back into PanoReady. Custom rulesets remain in the browser's local storage and can be shared as files. See the [ruleset reference](docs/rulesets.md) for every available field.

## Privacy and security

PanoReady performs file parsing, validation, cleaning, comparison, and generation in the browser. Do not attach real student data or other sensitive information to public issues. Please report vulnerabilities according to the [security policy](SECURITY.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and use the issue templates before opening a pull request.

See [CHANGELOG.md](CHANGELOG.md) for unreleased changes.

## License

PanoReady is available under the [MIT License](LICENSE).
