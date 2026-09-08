# Release checklist

Use this checklist when preparing a public release. Files in the repository cannot enable GitHub settings; an administrator must verify those settings in GitHub.

## Repository setup

- Confirm the existing MIT license and copyright holder are correct for the code being released.
- Review tracked files and Git history for credentials, student records, and material that cannot be redistributed. Synthetic examples belong in tests; operational workbooks do not.
- Confirm the security-reporting link works and enable private vulnerability reporting in repository settings. Confirm the Code of Conduct contact route reaches someone responsible for the project.
- Enable GitHub Pages with GitHub Actions as the source.
- Protect `main` with pull-request review and required CI checks: `check (22)`, `check (24)`, and the documentation workflow's `build` job. Select their actual names after the first successful run.
- Enable dependency alerts and review Dependabot updates.

## Validate the release

From a clean checkout, use the supported Node version and run:

```bash
npm ci
npm run check
npm audit
python -m pip install -r requirements-docs.txt
mkdocs build --strict
```

CI runs lint, TypeScript checks, the Vitest suite, and a production build on Node.js 22 and 24. The tests cover canonical data, validation, rulesets, and repair helpers with synthetic records. They do not replace browser testing of the interface.

Manually check all five workflows with synthetic inputs, including malformed input, unresolved validation errors, ruleset import/export, and downloaded files. Review the documented validation, cleaning, comparison, and export limits before describing the release's capabilities.

## Publish

Update `package.json` and its lockfile version, update `CHANGELOG.md` with changes and known limitations, and tag the reviewed commit as `vX.Y.Z`. Publish a GitHub release from that tag after the checks pass. The package remains `private: true` because this is an application, not an npm package; this does not affect its MIT license.

Record the application URL separately from the documentation URL. Verify both sites after deployment.

## Dependency maintenance

`package-lock.json` records resolved npm dependencies. Documentation tooling is pinned in `requirements-docs.txt`. Dependabot proposes updates to npm, Python, and GitHub Actions dependencies.

SheetJS is installed from its official versioned CDN tarball because newer releases are distributed there. See the [SheetJS installation guide](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). Its URL needs manual version review; retain the lockfile integrity hash and run the workbook regression test after updating it.

Third-party packages retain their own licenses. Review their bundled license notices when redistributing dependencies or packaged builds.
