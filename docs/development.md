# Development

Use Node.js 22 or 24 and npm. Node 24 is selected by `.nvmrc`.

```bash
npm ci
npm run dev
```

Read `AGENTS.md` and the relevant installed guide in `node_modules/next/dist/docs/` before changing Next.js code. Routes remain lowercase, React component files use PascalCase, non-component modules use camelCase, and tests end in `.test.ts`.

## Verification

```bash
npm run check
npm run e2e
npm run e2e:offline
```

`check` runs ESLint, Next route generation, TypeScript, Vitest, and a production build. `e2e` builds and serves the GitHub Pages static artifact, then runs a serial Chromium scenario with request, WebSocket, storage, URL, and log guards. It exercises import, correction, undo, comparison review logs, reports, encryption, download bytes, reset, and reload with synthetic markers.

`e2e:offline` builds `Dockerfile.e2e`, which prepares the same production artifact and Playwright runtime, then runs the container with Docker's `--network none` isolation. The app and test server share that isolated container. A passing observed run proves that tested browser activity stayed at the local origin; a passing offline run proves that the prepared scenario did not require network access. Neither proves hosted deployment behaviour or destination-system acceptance.

Keep browser tests serial and synthetic. Never place operational record values, real passwords, or private template material in fixtures, logs, traces, screenshots, issues, or commits.

## Documentation

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-docs.txt
mkdocs build --strict
```

Generated `out/`, `site/`, Playwright reports, and test results are not committed.
