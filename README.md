# PanoReady

[![CI](https://github.com/WDGPH/PanoReady/actions/workflows/ci.yml/badge.svg)](https://github.com/WDGPH/PanoReady/actions/workflows/ci.yml)
[![Documentation](https://github.com/WDGPH/PanoReady/actions/workflows/docs.yml/badge.svg)](https://github.com/WDGPH/PanoReady/actions/workflows/docs.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

PanoReady is an experimental browser-local tool for preparing and comparing known school-enrolment inputs for STIX submission. It accepts the project's supported STIX XML subset and one macro-enabled workbook layout. Source records are processed in memory and are not uploaded by the application.

## Workflows

- **Validate & Fix** checks structure and values, presents optional deterministic corrections, records reviewed change groups, supports Undo last action, and produces checked XML or a clearly labelled draft.
- **Compare Files** matches previous and current records conservatively, lets an analyst review differences, and exports a local review log. It does not modify or regenerate either source file.

Final XML uses standard indented formatting and can be downloaded directly or inside a locally generated AES-256 encrypted ZIP. A local Excel review report contains source context, action history, and current findings. Imported rules and cleaning profiles remain in memory for the current page session; export them if they are needed later.

See [Supported inputs and outputs](docs/supported-inputs-and-outputs.md) for the precise contract and limitations. PanoReady's `READY` result means that its implemented checks passed. It does not claim independent XSD validation or acceptance by another system.

## Develop

Requires Node.js 22 or 24 and npm.

```bash
npm ci
npm run dev
npm run check
```

Production browser tests use `npm run e2e`. The offline network-isolation check uses Docker through `npm run e2e:offline`. Documentation lives in [`docs/`](docs/) and is built with `mkdocs build --strict` after installing `requirements-docs.txt`.

Use synthetic data in tests, issues, and pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the [project documentation](https://wdgph.github.io/PanoReady/docs/).

PanoReady's original code and documentation are provided under the [MIT License](LICENSE). STIX, Panorama, and related third-party systems, standards, schemas, templates, and documentation remain the property of their respective owners.
