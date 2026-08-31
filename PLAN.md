# PanoReady Plan (Browser-Only)

## Product Definition
Build a client-side remediation utility for STIX XML files used before Panorama/STIX submission.

Core promise:
Open XML -> Validate -> Fix -> Revalidate -> Download cleaned XML + issue report.

Operating constraints:
- Entirely browser-based.
- No server upload, no backend storage, no user accounts.
- All data remains local to the user session.

## Scope
In scope:
- Local XML intake and validation.
- Human-readable issue detection.
- Safe inline and bulk remediation.
- Revalidation gate.
- Downloadable cleaned XML and reports.

Out of scope:
- Panorama integration/API submission.
- Workflow/task routing.
- PHI persistence.
- Enterprise identity/permissions.

## Success Criteria
- Every uploaded file gets structural + rules validation results.
- Issues are classified by severity (`error`, `warning`, `info`).
- Auto-fix applies only deterministic and safe transformations.
- Final status is explicit: `READY` or `BLOCKED`.
- User can download cleaned XML plus issue report CSV.

## Canonical User Flow (5 Screens)
1. Open File
- Validate filename, XML well-formedness, root/expected STIX structure.
- Show quick summary: schools, grades, student count.
- Stop with readable parse error if XML is invalid.

2. Review Issues
- Show table columns: severity, record, student, field, current value, issue, suggested fix.
- Support filters: severity, fixable only, school, text search.

3. Fix Data
- Inline edits and bulk safe fixes.
- Actions include trim spaces, code normalization, deterministic date normalization.
- No ambiguous auto-fixes.

4. Revalidate
- Re-run full checks after edits.
- Show remaining errors/warnings and total records fixed.

5. Download
- Download cleaned XML.
- Download issue report CSV (and optional JSON/print summary).
- Show final gate `READY` or `BLOCKED`.

## Safe vs Unsafe Fix Policy
Safe auto-fixes:
- Whitespace trimming.
- Case normalization for known coded values.
- Illegal character cleanup.
- Deterministic formatting normalization (date/code formats where unambiguous).
- Alias-to-standard mapping from explicit rule map.

Never auto-fix:
- Inventing DOB or identity values.
- Guessing sex/gender when unknown.
- Guessing school assignment.
- Ambiguous deduplication/record merges.

## Issue Taxonomy (Required)
Use this baseline model in `lib/types.ts`:

```ts
type ValidationIssue = {
  id: string;
  severity: "error" | "warning" | "info";
  recordId?: string;
  schoolNumber?: string;
  studentName?: string;
  field?: string;
  message: string;
  suggestedFix?: string;
  autoFixable: boolean;
  ruleId: string;
  xmlPath?: string;
};
```

## Rules Profile (Local Config)
Rules must be configurable through a bundled local JSON profile (no backend dependency), e.g. `config/rules.stix.default.json`.

Required sections:
- Required fields.
- Allowed code values (grade, sex/gender, phone types, etc.).
- Field length limits.
- Date/phone/postal formats.
- Duplicate detection thresholds.
- Safe alias mappings.

Example shape:

```json
{
  "requiredFields": ["FirstName", "LastName", "BirthDate", "Grade", "SchoolNumber"],
  "allowedGradeValues": ["JK", "SK", "GR1", "GR2", "GR3", "GR4", "GR5", "GR6", "GR7", "GR8", "GR9", "GR10", "GR11", "GR12"],
  "allowedSexValues": ["M", "F", "X", "U"]
}
```

## App State Model
Maintain deterministic in-memory state only:

```ts
type AppState = {
  sourceFileName: string;
  originalXmlText: string;
  parsedDocument: Document | null;
  records: StudentRecord[];
  issues: ValidationIssue[];
  fixes: AppliedFix[];
};
```

```ts
type StudentRecord = {
  id: string;
  xmlPath: string;
  fields: Record<string, string>;
};
```

## Implementation Phases
### Phase 1: Validation-First Foundation
1. Add validation types (`ValidationIssue`, `ValidationResult`, summaries, gate state).
2. Add `lib/validator.ts` for:
- XML well-formedness.
- Structure/root checks.
- Required field checks.
- Allowed-value checks.
- Field format/length checks.
3. Add issue table UI with filters/search.
4. Add `READY`/`BLOCKED` gate logic.

Acceptance:
- Invalid files fail early with clear messages.
- Blocking errors prevent ready state.

### Phase 2: Safe Remediation UX
1. Add inline fix editing at record/field level.
2. Add bulk safe actions (trim, normalize codes/dates, apply known mappings).
3. Track and display `AppliedFix` audit list in-session.
4. Preserve clear boundary between safe and unsafe changes.

Acceptance:
- Users can fix most routine formatting/code issues without leaving browser.
- Unsafe fields remain manual-only.

### Phase 3: Revalidate + Outputs
1. Add explicit revalidate step after edits.
2. Export cleaned XML.
3. Export issue report CSV (plus optional JSON).
4. Add compact summary/print view.

Acceptance:
- User can always produce a cleaned artifact and transparent issue report.
- Final state clearly shows remaining blockers.

### Phase 4: Fit-and-Finish
1. Add side-by-side diff (original vs cleaned) for changed nodes.
2. Add local session recovery (`sessionStorage`) for accidental refresh.
3. Add per-school summary stats.
4. Add optional profile selector for PHU rule variants.

Acceptance:
- Better usability without changing browser-only architecture.

## Test Plan
- Unit tests for validator and cleaner rule functions.
- Golden-file tests using known STIX samples and expected issue counts.
- UI tests for:
- upload failure paths,
- issue filtering,
- safe bulk fixes,
- revalidation gate behavior,
- download outputs.

## Delivery Order
1. Phase 1 (validation + gate).
2. Phase 2 (safe fix UX).
3. Phase 3 (revalidate + downloads).
4. Phase 4 (usability enhancements).

## Risks and Dependencies
- STIX rule details can vary by source system and PHU policy.
- Some data-quality decisions require explicit policy, not code guesses.
- Very large XML files may require chunked parsing/Web Worker usage while still staying client-side.

## Definition of Done
- A user can upload STIX XML and complete a deterministic local workflow:
- validate,
- fix safe issues,
- revalidate,
- download cleaned XML + issue report,
- receive explicit `READY` or `BLOCKED` outcome.
