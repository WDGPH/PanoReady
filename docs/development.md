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

In the workspace, open the port-3000 proxy. `next.config.ts` restores the proxy
prefix for Next.js's development WebSocket endpoint so the page becomes
interactive and live updates can connect. This rewrite only runs in development
when `NB_PREFIX` is set.

`allowedDevOrigins` in `next.config.ts` adds permission for WDGPH proxy hosts
(`*.wdgpublichealth.ca`). Localhost development
works without changes. For another proxy, add its hostname, such as
`workspace.example.org`, to this list and restart `npm run dev`. Use the hostname
only, without a scheme, port, or path. Open the app directly in a browser tab;
opaque origins (`Origin: null`), such as sandboxed frames, are not allowed.

## Repository layout

| Path | Purpose |
|---|---|
| `app/` | Next.js routes, layout, and global styles |
| `components/` | Reusable interface components |
| `lib/` | STIX parsing, validation, cleaning, comparison, and export logic |
| `config/` | Bundled default validation rules |
| `docs/` | MkDocs user and technical documentation |
| `.github/` | Contribution templates and automation |

### TypeScript file names

- Use the lowercase names required by Next.js for route files, such as `page.tsx` and `layout.tsx`.
- Use PascalCase for React component files and camelCase for non-component `.ts` modules.
- Name tests after their module or subject and append `.test.ts`.
- Write the STIX acronym as either `STIX` in PascalCase component/type names or `stix` in camelCase paths and filenames; do not use a mixed-case acronym.

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

Add regression tests when changing data behaviour. UI changes also need browser checks; see the automated coverage and its limits below.

Run `npm audit` when updating dependencies and review the findings. Commit `package-lock.json` with dependency changes. See [release maintenance](releasing.md#dependency-maintenance) for the SheetJS distribution source.

## Browser and offline checks

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
pinned to the same version; update them together. Workflow status badges reflect `main`.

Read `AGENTS.md` and the relevant installed Next.js guide in `node_modules/next/dist/docs/` before changing framework code. Historical planning notes are kept in `notes/`, outside the published site. Private workbook inspection notes are excluded from Git and the documentation build.

## Build version

Local `npm run dev` and `npm run build` derive the visible version and eight-character
commit SHA from Git, using the same highest reachable `vX.Y.Z` release tag as Pages.
Commits beyond that tag show `+`. Uncommitted edits do not change the commit label.
Restart the development server after changing commits or tags to refresh it.

Without a reachable release tag the version reads `unversioned`; without Git metadata
the SHA reads `unknown`. Builds from source archives can supply
`NEXT_PUBLIC_BUILD_VERSION` and `NEXT_PUBLIC_BUILD_SHA` explicitly, as Pages does.
