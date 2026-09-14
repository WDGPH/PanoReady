<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project boundaries

- Accepted inputs are the closed STIX XML subset and concrete `.xlsm` layout documented in `docs/supported-inputs-and-outputs.md`.
- Reject unsupported data-bearing structure. Do not guess identity, school values, date conventions, or two-digit-year centuries.
- Keep one canonical editable document and route committed corrections through the existing session updater with stable targets and Undo last action.
- Keep source records, settings, reviewer labels, histories, and passwords in memory. Do not add persistence, telemetry, or network transmission without an explicit product and privacy decision.
- Extend existing STIX modules for demonstrated needs. Remove superseded paths instead of maintaining parallel import, report, state, or serialization systems.
