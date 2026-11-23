# Release checklist

Use this checklist when preparing a public release. Files in the repository cannot enable GitHub settings; an administrator must verify those settings in GitHub.

## Repository setup

- Confirm the MIT licence, copyright holder, and third-party systems and standards notice are correct for the code being released.
- Review tracked files and Git history for credentials, student records, operational inputs, third-party reference assets, and other material that cannot be redistributed. Synthetic examples belong in tests; operational workbooks and reference documents do not.
- Confirm the security-reporting link works and enable private vulnerability reporting in repository settings. Confirm the Code of Conduct contact route reaches someone responsible for the project.
- Enable dependency alerts and review Dependabot updates.

## Validate the release

From a clean checkout, use the supported Node version and run:

```bash
npm ci
npm run check
npm audit
python -m pip install --require-hashes --only-binary=:all: -r requirements-docs.txt
mkdocs build --strict
```

CI runs lint, TypeScript checks, the Vitest suite, and a production build on Node.js 22 and 24. The tests cover canonical data, validation, rulesets, and repair helpers with synthetic records. They do not replace browser testing of the interface.

Manually check both workflows with synthetic inputs. Cover XML and workbook intake, malformed input, cleaning mappings, unresolved validation errors, ruleset import/export, comparison review and corrections, filters, and every download type. Review the documented validation, comparison, and export limits before describing the release's capabilities.

## Publish

Update `package.json` and its lockfile version, update `CHANGELOG.md` with changes and known limitations, and tag the reviewed commit as `vX.Y.Z`. Publish a GitHub release from that tag after the checks pass. The package remains `private: true` because this is an application, not an npm package; this does not affect its MIT license.

The tag must be on main's history. Application publication and the hub's release-lock pull request run independently. The stable application's help link points to its exact tagged manual, which becomes available only after the hub import pull request has passed its complete build, merged, and deployed. The application publisher verifies that the matching manual is public before deploying; a missing, replaced, or withdrawn manual stops publication.

After application deployment, confirm the Application Pages workflow succeeds, including its public-version verification, and compare the stable version and source commit in its Actions summary with the intended release. Record the application URL separately from the documentation URL and check both sites in a browser; manifest verification does not check rendering.

## Dependency maintenance

`package-lock.json` records resolved npm dependencies. Documentation tooling is pinned in `requirements-docs.txt`. Dependabot proposes updates to npm, Python, and GitHub Actions dependencies.

SheetJS is installed from its official versioned CDN tarball because newer releases are distributed there. See the [SheetJS installation guide](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). Its URL needs manual version review; retain the lockfile integrity hash and run the workbook regression test after updating it.

Third-party packages retain their own licenses. Review their bundled license notices when redistributing dependencies or packaged builds.
