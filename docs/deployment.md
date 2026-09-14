# Deployment

The GitHub Pages workflow builds the static Next.js application into `out/`, builds MkDocs into `out/docs/`, and publishes one combined Pages artifact. Pull requests verify the builds; pushes to `main` can deploy through the configured environment.

The production application has no server-side record-processing API, database, analytics integration, or required runtime environment variable. Package installation and build steps still require network access for declared dependencies. The resulting static artifact serves its own scripts, styles, and fonts.

Before release, run the checks in [Development](development.md), including the network-observed and offline browser scenarios. After deployment, use synthetic XML to inspect both rendered workflows and downloads at the Pages base path. When a locally approved workbook matching PanoReady's documented layout is available, test that path separately; the repository does not publish an authoritative workbook fixture. Hosted rendering, browser download policy, and Pages configuration are separate acceptance checks from a local static build.

For a fork, update the base path in `next.config.ts`, the repository/site settings in `mkdocs.yml`, and public links. Configure **GitHub Actions** as the Pages source. Do not add telemetry or remote validation merely to monitor deployment; any transmission of operational values requires a separate privacy decision.
