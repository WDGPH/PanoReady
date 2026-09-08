# Contributing to PanoReady

Thank you for helping improve PanoReady. Contributions may include bug reports, documentation, validation rules, accessibility improvements, tests, and code.

## Before you start

- Search [existing issues](https://github.com/WDGPH/PanoReady/issues) before opening a new one.
- Use an issue to discuss substantial features or changes to validation policy before investing in an implementation.
- Never include real student records, personal health information, credentials, or other sensitive data in an issue, fixture, screenshot, commit, or pull request.
- Follow our [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md).

## Set up a development environment

PanoReady requires Node.js 22 or 24 (24 is the default in `.nvmrc`).

```bash
git clone https://github.com/WDGPH/PanoReady.git
cd PanoReady
npm ci
npm run dev
```

The app is available at <http://localhost:3000>.

## Make a change

1. Create a focused branch from the latest `main`.
2. Keep changes small and explain policy-sensitive validation behavior in comments and documentation.
3. Use synthetic test data only.
4. Update relevant files in `docs/` when behavior or workflows change.
5. Run the checks before opening a pull request:

   ```bash
   npm run check
   ```

For documentation changes, also run:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-docs.txt
mkdocs build --strict
```

## Pull requests

A pull request should:

- describe the problem and the chosen solution;
- link the related issue when one exists;
- state how the change was tested;
- include screenshots for visible interface changes;
- update documentation and tests where applicable; and
- avoid unrelated formatting or refactoring.

Maintainers may request changes to keep behavior safe, deterministic, accessible, and consistent with local STIX policy. By contributing, you agree that your contribution is licensed under the project's [MIT License](LICENSE).

## Validation and data-handling principles

- Never guess identity, date-of-birth, school assignment, or other ambiguous values.
- Automatic fixes must be deterministic and explainable.
- Keep all student-record processing in the browser unless maintainers explicitly approve an architectural change.
- Treat sample data as potentially sensitive until its provenance and anonymization are confirmed.

## Reporting security issues

Do not open a public issue for a vulnerability. Follow the private process in [SECURITY.md](SECURITY.md).
