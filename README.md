# PanoReady

[![Current version](https://img.shields.io/github/v/release/WDGPH/PanoReady?sort=semver&label=version)](https://github.com/WDGPH/PanoReady/releases/latest)
[![Browser privacy](https://github.com/WDGPH/PanoReady/actions/workflows/browser-privacy.yml/badge.svg?branch=main)](https://github.com/WDGPH/PanoReady/actions/workflows/browser-privacy.yml)
[![Offline operation](https://github.com/WDGPH/PanoReady/actions/workflows/offline-operation.yml/badge.svg?branch=main)](https://github.com/WDGPH/PanoReady/actions/workflows/offline-operation.yml)
[![Docs](https://img.shields.io/badge/Docs-User_guide-blue)](https://wdgph.github.io/PanoReady/stable/docs/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/WDGPH/PanoReady)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

PanoReady helps you check, correct, and compare Ontario school enrolment files for use with Panorama. It runs in your browser. Your files are processed on your device and are not uploaded to a server.

Built by [Wellington-Dufferin-Guelph Public Health](https://wdgpublichealth.ca/).

## Use PanoReady

**[Open PanoReady — stable version](https://wdgph.github.io/PanoReady/stable/)**. No installation is needed.

| Version | When to use it |
|---|---|
| [Stable](https://wdgph.github.io/PanoReady/stable/) | The most recent release. Choose this for everyday use. |
| [Latest](https://wdgph.github.io/PanoReady/latest/) | Includes changes since the last release. Use it to try upcoming improvements; behaviour may change before release. |

The [main site address](https://wdgph.github.io/PanoReady/) takes you to stable. The version is shown at the bottom of the app.

## What you can do

- **Validate & Fix:** Check a school enrolment file, review suggested corrections, make changes, and download the updated file and reports.
- **Compare Files:** Compare previous and current files to review changes to students, schools, and enrolment.

You can open STIX XML files or supported Excel workbooks (`.xlsm`). Downloads include XML and reports, with an optional password-protected ZIP for XML files.

Start with the [getting started guide](https://wdgph.github.io/PanoReady/stable/docs/getting-started/) or try the [sample file](public/samples/stix-validation-demo.stix), which contains made-up records. See the [user guide](https://wdgph.github.io/PanoReady/stable/docs/) for detailed instructions. If you use latest, use its [matching guide](https://wdgph.github.io/PanoReady/latest/docs/).

## Follow releases

The [Releases page](https://github.com/WDGPH/PanoReady/releases) lists published versions and their release notes.

To receive notifications when a release is published:

1. Sign in to GitHub and open [this repository](https://github.com/WDGPH/PanoReady).
2. Select **Watch → Custom**, select **Releases**, and apply your selection.
3. To receive emails too, enable email for watched repositories in your [notification settings](https://github.com/settings/notifications). See [GitHub's notification guide](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications) for help.

Read the notes for the version shown in the app to understand what changed, what was fixed, and any known limitations or steps you need to take. Check them before starting work with a new release. Stable updates when a new release is deployed; reopen or reload the app to use it. Changes in latest may not have release notes yet; see the [changelog](CHANGELOG.md) for unreleased changes.

## Help and privacy

Report problems or suggest improvements through [GitHub issues](https://github.com/WDGPH/PanoReady/issues). Keep real student data and other sensitive information out of issues and screenshots. Report security concerns privately using the [security policy](SECURITY.md).

## Contribute or run locally

See the [contribution guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md). The [development guide](docs/development.md) covers local setup and checks; [deployment](docs/deployment.md) and the [release checklist](docs/releasing.md) explain how the site is published.

## License

PanoReady's original code and documentation are available under the [MIT License](LICENSE). Panorama, STIX, and related third-party systems and materials remain the property of their respective owners. References describe intended compatibility and do not imply affiliation or endorsement.
