# Maintainer boundaries

PanoReady has one concrete STIX workflow family. Keep source contracts, validation, session updates, comparison, and serialization visible in `workflows/stix/` and `lib/`. Add shared abstractions when current consumers demonstrate the same behaviour; do not add source-profile registries, plugin systems, a universal XML editor, or future PHIX models in advance.

The canonical document in `lib/canonical.ts` is the only editable authority after intake. UI rows and findings are derived views. Corrections go through `lib/session.ts`, use stable session-local targets and expected old values, and create one reversible group. Do not introduce a parallel mutable XML string, record collection, counter, or history.

Input acceptance belongs at the boundary. XML structure is checked before projection. Workbook layout checks belong in `lib/excel.ts`. Do not accept unknown data-bearing content and then omit it from output. Missing values within known fields remain repairable. Unsupported structure is rejected with a location and reason.

Dates use `lib/calendar.ts`. Keep calendar validation strict, inspect raw workbook cell metadata, and require an explicit convention for ambiguous text. Do not use `Date.parse`, locale parsing, timezone conversion, majority voting over contradictions, or two-digit-year inference.

The downloaded XML is the primary Validate & Fix product. Add output fields to the canonical model, parser, serializer, validation behaviour, documentation, and preservation tests together. Plain and encrypted downloads must consume the same checked byte sequence. Comparison findings and its review log are analysis evidence only; they do not modify source documents or imply validation readiness.

Operational records and settings stay in memory. Save in-progress file is an explicit unencrypted STIX download of the canonical document with applied corrections. Re-upload uses ordinary intake and starts a fresh assessment; settings, drafts, review labels and history are not persisted. Do not introduce a separate session archive or resume path. New persistence, telemetry, analytics, remote validation, or network transmission needs an explicit product and privacy decision. Browser tests must observe requests, WebSockets, console output, URLs, browser storage, reset/reload, and production static assets with synthetic markers. Keep the offline container check so the same prepared image can run with Docker's network disabled.

Use the installed Next.js documentation in `node_modules/next/dist/docs/` before framework changes. Run `npm run check`, the production E2E scenario, and `mkdocs build --strict` for a release candidate. State separately what local static checks, browser execution, hosted CI, deployed Pages, and destination-system testing prove.
