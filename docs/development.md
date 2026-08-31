# Development

## Prerequisites

- Node.js 20.9 or newer
- npm
- Python 3.9 or newer to build the documentation

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

This runs ESLint and creates a production build. Keep test inputs synthetic and free of student or personal information.

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
