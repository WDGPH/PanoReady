# Deployment

The application and documentation are separate sites. GitHub Pages publishes the MkDocs documentation; it does not start the Next.js application.

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

## Publish documentation

The `Documentation` GitHub Actions workflow builds on every pull request and push to `main`. Only runs on `main` can deploy.

A repository administrator must select **GitHub Actions** under **Settings → Pages → Build and deployment → Source**. The workflow then uploads `site/` and deploys it through the `github-pages` environment. Check any environment approval rules if deployment waits for approval.

For a fork, update `site_url`, `repo_url`, `repo_name`, and `edit_uri` in `mkdocs.yml`, and the repository links in the README and policies. Set up Pages in the fork as well.

To build locally:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-docs.txt
mkdocs build --strict
mkdocs serve
```

On Windows PowerShell, activate with `.venv\Scripts\Activate.ps1`. Open <http://127.0.0.1:8000> for the preview. Generated HTML is in `site/` and is not committed.

Internal pages and anchors are checked using [MkDocs link validation](https://www.mkdocs.org/user-guide/configuration/#validation). External URLs still need review when publishing.
