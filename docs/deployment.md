# Deployment

One GitHub Pages artifact publishes two independent builds:

- `/PanoReady/` redirects to `/PanoReady/stable/` (preserving query and fragment).
- `/PanoReady/stable/` serves the highest `vX.Y.Z` tag reachable from `main`.
- `/PanoReady/latest/` serves the current `main` commit.
- Each channel includes its own `/docs/`; the old `/PanoReady/docs/` entry redirects to stable documentation.

Prerelease tags are excluded. A release tag must be on main's history. The footer shows the release version and eight-character source commit SHA; commits beyond the highest reachable release show `+`, for example `v0.1.0+ · abc12345`. Each channel also publishes `build.json` with the full SHA.

GitHub Pages replaces the entire site on deployment, so both channels are built and uploaded together. Publishing runs share a concurrency group. Each snapshot installs its own npm lockfile and Python requirements (with hash verification when provided by the release) in separate directories/environments, with separate Next.js asset paths. Dependency versions can differ without runtime collisions. Both builds must succeed before anything is published; an old dependency becoming unavailable can therefore block publication. Browser storage is still shared by origin: custom rulesets stored by one channel are visible to the other. Persistent data formats must remain compatible or use channel-specific keys.

The existing `v0.1.0` release predates configurable paths and version labels. The build script adapts only its deployment configuration and footer in a temporary checkout; it does not change the tag or application logic. That old tag pins only the direct documentation dependencies, so its transitive Python dependencies are not fully reproducible. Newer releases retain their hashed requirements. Future releases use the environment variables directly.

**URL casing:** the repository is currently `PanoReady`, so its project Pages path is `/PanoReady/`. Exact lowercase `/panoready/` requires renaming the repository or configuring an alias in the organization's `wdgph.github.io` site. Changing the build path alone cannot create that alias. After a rename, update `PAGES_BASE_PATH` in the workflow and public links.

## Run the application

Use Node.js 24 (the version in `.nvmrc`) or Node.js 22 and npm. From a checkout:

```bash
npm ci
npm run check
npm start
```

`check` includes the production build. `start` serves it on port 3000. Use your hosting platform's process manager and HTTPS configuration for a public instance. The app has no required environment variables or database setup.

The build downloads Google fonts through `next/font/google`. Allow access to Google's font services from the build environment. The resulting font assets are served with the app. Package installation also requires access to the npm registry and the SheetJS CDN.

Test `/` and `/reports` on the deployed instance, then process a synthetic XML file and workbook. Check downloads and ruleset persistence in the browsers your users run.

## Publish on GitHub Pages

The `GitHub Pages` workflow rebuilds both channels on pushes to `main`, version-tag pushes, and manual runs from `main`. Pull requests build stable and the proposed merge commit without deploying. At least one reachable `vX.Y.Z` release tag is required.

A repository administrator must select **GitHub Actions** under **Settings → Pages → Build and deployment → Source**. The `github-pages` environment must allow deployments from `main` and version tags (`v*`); tag-triggered deployments otherwise fail the environment policy. Check any environment approval rules if deployment waits for approval.

For a fork, update the GitHub Pages base path in `next.config.ts`; update `site_url`, `repo_url`, `repo_name`, and `edit_uri` in `mkdocs.yml`; and update repository links in the README and policies. Set up Pages in the fork as well.

To build locally:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-docs.txt
mkdocs build --strict
mkdocs serve
```

On Windows PowerShell, activate with `.venv\Scripts\Activate.ps1`. Open <http://127.0.0.1:8000> for the preview. Generated HTML is in `site/` and is not committed. The Pages workflow instead passes `--site-dir out/docs` so the documentation is included below the application.

Internal pages and anchors are checked using [MkDocs link validation](https://www.mkdocs.org/user-guide/configuration/#validation). External URLs still need review when publishing.
