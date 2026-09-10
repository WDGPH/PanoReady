# PanoReady

[![CI](https://github.com/WDGPH/PanoReady/actions/workflows/ci.yml/badge.svg)](https://github.com/WDGPH/PanoReady/actions/workflows/ci.yml)
[![Documentation](https://github.com/WDGPH/PanoReady/actions/workflows/docs.yml/badge.svg)](https://github.com/WDGPH/PanoReady/actions/workflows/docs.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)

PanoReady is a browser-based tool with two workflows for preparing Ontario school enrolment data in STIX XML format. All record processing happens on your device; files are not uploaded to a server.

Built by [Wellington-Dufferin-Guelph Public Health](https://wdgpublichealth.ca/).

## What it does

| Workflow | Description |
|---|---|
| **Validate & Fix** | Preview workbook imports, apply optional cleaning mappings, validate metadata and records, review fixes, revalidate, and download XML, audit files, formatted XML, and reports. |
| **Compare Files** | Compare previous and current STIX snapshots; review record, field, school, and transfer changes; and export the reviewed current XML and comparison logs. |

PanoReady accepts STIX XML and Excel macro-enabled workbook (`.xlsm`) inputs. Validated and compared XML can optionally be downloaded in an AES-256 password-protected ZIP archive.

Validate & Fix shows five stages: **Prepare & clean → Validate → Review & fix → Recheck → Download**. After import, optional cleaning mappings replace known whole-field values before validation or autofix. Matching ignores case unless “Match case” is enabled; the first matching mapping wins. Cleaning does not support regex.

Select a saved profile inside preparation: profiles contain validation rules and optional cleaning mappings. Validation identifies issues; supported automatic corrections are prefilled for review and applied only when requested. Applied fixes are rechecked before download. Skipping cleaning leaves validation and autofix available.

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
npm test         # Run the Vitest suite
npm run build    # Create a production build
npm run start    # Serve the production build
npm run check    # Run application checks
```

## Documentation

The application is published at <https://wdgph.github.io/PanoReady/>. The documentation is published from the same Pages deployment at <https://wdgph.github.io/PanoReady/docs/> and is maintained in the [`docs`](docs/) directory.

To preview the documentation locally:

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
python -m pip install -r requirements-docs.txt
mkdocs serve
```

Then open <http://127.0.0.1:8000>.

The synthetic [validation demo](public/samples/stix-validation-demo.stix) exercises representative metadata, postal-code, and phone-number findings without using operational records.

See [deployment](docs/deployment.md) for hosting and [the release checklist](docs/releasing.md) for repository settings and release checks.

## Custom validation rulesets

Export the built-in rules from the **Validation ruleset** menu, edit the JSON, and import it back into PanoReady. Custom rulesets remain in the browser's local storage and can be shared as files. See the [ruleset reference](docs/rulesets.md) for every available field.

## Privacy and security

PanoReady performs file parsing, validation, cleaning, comparison, and output generation in the browser. Do not attach real student data or other sensitive information to public issues. Please report vulnerabilities according to the [security policy](SECURITY.md).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md), follow the [Code of Conduct](CODE_OF_CONDUCT.md), and use the issue templates before opening a pull request.

See [CHANGELOG.md](CHANGELOG.md) for unreleased changes.

## License

PanoReady's original code and documentation are available under the [MIT License](LICENSE). Panorama, STIX, and related third-party systems, standards, names, specifications, schemas, templates, and documentation remain the property of their respective owners. References identify intended compatibility only and do not imply affiliation or endorsement.
