# Security Policy

## Supported versions

Security updates are applied to the latest version on the `main` branch. Older commits and forks are not supported by the project maintainers.

## Report a vulnerability

Please report suspected vulnerabilities privately through [GitHub's private vulnerability reporting](https://github.com/WDGPH/PanoReady/security/advisories/new). Include:

- the affected workflow or component;
- steps to reproduce the issue using synthetic data;
- the security impact;
- any suggested mitigation; and
- your preferred contact information.

Do not open a public issue, disclose exploit details publicly, or include real student records or other sensitive information in a report.

We will acknowledge a report as maintainers become available, investigate it, and coordinate remediation and disclosure with the reporter. Response and resolution times depend on severity and maintainer availability.

## Security model

PanoReady is designed to process source files locally in the browser. Contributors should treat any change that introduces network transmission, persistent storage, analytics, or third-party processing of record data as a security- and privacy-sensitive architectural change requiring explicit maintainer review.

Password-protected ZIP files reduce accidental exposure but are not a substitute for organizational data-handling requirements. Users remain responsible for secure storage, transfer, password sharing, and deletion of generated files.

## GitHub Actions

Workflows default to no token permissions and grant permissions per job. Checkouts
disable credential persistence. PR checks use `pull_request`; do not introduce
`pull_request_target` or `workflow_run` to execute contributor code. Pass any
untrusted event text through environment variables rather than interpolating it
into shell commands.

Actions are pinned to release commit SHAs with exact version comments. Dependabot
checks npm, Python, and action dependencies weekly with a seven-day cooldown for
version updates. Security updates are exempt from that delay. Updates still need
review: immutable pins and hashes prevent unexpected changes to selected artifacts,
but do not establish that the selected code is safe.

The Pages build uses locked npm dependencies and hash-checked Python wheels, and
does not restore dependency caches. Only the separate deployment job receives
`pages: write` and `id-token: write`; it deploys output from the same workflow run
on `main`, without checking out or executing application code.

Repository administrators should configure the following in GitHub; workflow files
alone cannot enforce them:

- Require PRs and successful checks, including **Audit GitHub Actions**, before
  merging to `main`; dismiss stale approvals and restrict bypasses and force pushes.
- Require full SHA pins for actions, restrict allowed actions to those reviewed for
  this repository, and keep default token permissions read-only. Disable Actions'
  ability to create or approve PRs.
- Restrict the `github-pages` deployment environment to `main`; configure deployment
  reviewers if independent approval is required.
- Enable Dependabot alerts and security updates, secret scanning and push protection
  where available, and review fork-workflow approval settings.
- Assign real maintainers or teams as CODEOWNERS for `.github/`, dependency manifests
  and lockfiles, and build scripts; require their review through branch rules.

These controls follow [Astral's security practices](https://astral.sh/blog/open-source-security-at-astral)
and [Wiz's GitHub Actions guide](https://www.wiz.io/blog/github-actions-security-guide).
