# PanoReady

[![CI](https://github.com/WDGPH/PanoReady/actions/workflows/ci.yml/badge.svg)](https://github.com/WDGPH/PanoReady/actions/workflows/ci.yml)
[![Browser privacy](https://github.com/WDGPH/PanoReady/actions/workflows/browser-privacy.yml/badge.svg?branch=main)](https://github.com/WDGPH/PanoReady/actions/workflows/browser-privacy.yml)
[![Offline operation](https://github.com/WDGPH/PanoReady/actions/workflows/offline-operation.yml/badge.svg?branch=main)](https://github.com/WDGPH/PanoReady/actions/workflows/offline-operation.yml)
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

Validate & Fix shows six stages: **Prepare & clean → Assess quality → Automatic fixes → Manual fixes → Recheck → Download**. After import, optional cleaning mappings replace known whole-field values before validation or autofix. Matching ignores case unless “Match case” is enabled; the first matching mapping wins. Cleaning does not support regex.

Select a saved profile inside preparation: profiles contain validation rules and optional cleaning mappings. Automatic fixes start unselected. Apply individual selections, the current sorted page, or all matching fixes across pages; each action updates and rechecks the file. Manual fixes shows unresolved issues, including unaccepted automatic suggestions. Skipping cleaning leaves validation and autofix available.

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

## Offline and privacy checks

Playwright exercises the production static export at `/PanoReady/` using synthetic
records. The **Browser privacy** workflow checks XML validation, automatic and manual
corrections, comparison decisions, report downloads, encrypted ZIP output, reset,
and reload. It fails on attempted requests outside the built static files, request
bodies or URL parameters, WebSockets, record/password markers in console output or
navigation, and persistent browser state. Negative controls deliberately attempt
traffic and storage writes to verify that the guards detect them.

The **Offline operation** workflow runs the same tests in a prepared Docker image
with `--network none`. Dependencies and the site are built before disconnecting;
the browser then loads the export from a server on the container's loopback address.
This tests operation without external connectivity, not reopening the hosted site
from a browser cache after disconnecting.

These checks cover Chromium and the listed XML flows with the built-in profile.
Custom profiles intentionally saved by users already use localStorage; profile
persistence and workbook imports are outside this suite. Passing checks are
regression evidence for these flows, not a comprehensive security audit or proof
that JavaScript heap memory has been erased. Downloads explicitly requested by
the user remain on disk. Traces contain synthetic test data only.

```bash
npx playwright install --with-deps chromium # Once per environment
npm run e2e                               # Build and test the static export
npm run e2e:offline                       # Requires Docker
```

The Playwright package and [Docker image](https://playwright.dev/docs/docker) are
pinned to the same version; update them together. Badge status reflects `main`.

## Documentation

The latest tagged release is published at <https://wdgph.github.io/PanoReady/> (redirecting to `/stable/`). The current main build is at <https://wdgph.github.io/PanoReady/latest/>. Both display their version and source commit. See [Deployment](docs/deployment.md) for release selection and URL casing. The documentation is published from the same Pages deployment at <https://wdgph.github.io/PanoReady/docs/> and is maintained in the [`docs`](docs/) directory.

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

On Import readiness, exclude schools or issue types from correction review for the current file. Exclusions are reversible and do not change validation totals, blocking errors, or exported records.
