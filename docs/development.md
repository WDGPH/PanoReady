# Development

## Prerequisites

- Node.js 22 or 24 (24 is the default in `.nvmrc`)
- npm
- Python 3.12 (the CI version) or newer to build the documentation

## Run the app

```bash
git clone https://github.com/WDGPH/PanoReady.git
cd PanoReady
npm ci
npm run dev
```

Open <http://localhost:3000>. The application uses the Next.js App Router and runs locally with webpack.

## Repository layout

| Path | Purpose |
|---|---|
| `app/` | Next.js routes, layout, and global styles |
| `components/` | Reusable interface components |
| `lib/` | STIX parsing, validation, cleaning, comparison, and export logic |
| `config/` | Bundled default validation rules |
| `docs/` | MkDocs user and technical documentation |
| `.github/` | Contribution templates and automation |

## Checks

Run the same application checks used in continuous integration:

```bash
npm run check
```

This runs ESLint, generates Next.js route types, checks TypeScript, runs the regression tests, and creates a production build. Keep test inputs synthetic and free of student or personal information.

## Build the documentation

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-docs.txt
mkdocs serve
```

Use `mkdocs build --strict` before submitting documentation changes. The `site/` output is generated and ignored by Git.

## Contribution principles

Automatic data fixes must be deterministic and explainable. Changes that transmit record data, add analytics, or persist it beyond existing browser-local behaviour require explicit privacy and security review. See the repository's [contribution guide](https://github.com/WDGPH/PanoReady/blob/main/CONTRIBUTING.md).

## Tests and dependency updates

`npm test` runs the Vitest suite. Tests use synthetic values and cover the canonical model, field definitions, address repair, phone and postal-code handling, ruleset import, and validator integration.

Add regression tests when changing data behaviour. UI changes also need a browser check; there is no automated end-to-end browser suite yet.

Run `npm audit` when updating dependencies and review the findings. Commit `package-lock.json` with dependency changes. See [release maintenance](releasing.md#dependency-maintenance) for the SheetJS distribution source.

Read `AGENTS.md` and the relevant installed Next.js guide in `node_modules/next/dist/docs/` before changing framework code. Historical planning notes are kept in `notes/`, outside the published site. Private workbook inspection notes are excluded from Git and the documentation build.
