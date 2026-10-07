# Rule order and automatic address repairs

Automatic address repairs run as a sequence on a temporary copy. Review shows the original values beside the final values, with the individual steps available underneath. Applying a selection commits that exact final difference and revalidates the complete file. Undo restores the whole applied batch.

This first implementation sequences address repairs. Other automatic fixes retain their existing single-assessment behavior, with a new batch check that rejects stale or conflicting writes. Cleaning mappings remain an explicit, separate operation.

## Findings and corrections have different jobs

Assessment describes the current file. It continues to report separate length, format, delivery, and character findings, with the same severity and submission gate meanings. A review exclusion does not remove a finding or make a blocking error pass validation.

Automatic review describes the problems being corrected. Multi-step repairs have a compact numbered list under **Repair steps**. The automatic-fix table uses **Issue** as its column label, with problem descriptions rather than action instructions. Composite repairs summarize the problems addressed by their steps. Single-step repairs show the problem and Before/After values directly, with no expandable details, even when the repair changes several fields. A short inline note identifies any remaining address issues. These full-width panels show remaining issues only when review is needed. The panel stays with its address during sorting and paging; it does not count as another correction. It combines address changes into one selectable row per student. One row can resolve several findings or discover a subsequent repair that was not visible in the original assessment. Its count is therefore not a count of assessment findings. A sequence that cannot safely complete is shown without an enabled checkbox, with a reason to use Manual fixes.

The assessment layout and issue taxonomy are intentionally unchanged apart from explanatory text. The current suggestion counts describe individual findings, not a forecast of the final number of corrections. Evidence from sequences can inform a later assessment redesign without coupling it to this engine.

## Source map

| Source | Responsibility |
|---|---|
| `lib/addressRules.ts` | Ordered address rules and findings; the single address assessment entry point |
| `lib/addressRepair.ts` | Pure address parsers and conservative multi-field proposals |
| `lib/fieldValidation.ts` | Independent format, allowed-value, and length checks shared with manual review |
| `lib/addressAutofix.ts` | Simulation, reassessment, termination, final validity, and original-to-final diff |
| `workflows/stix/validation/automaticReview.ts` | Group findings into review items; enforce the selected filter and exclusions at every step |
| `workflows/stix/validation/FixView.tsx` | Selection and final preview; `AddressRepairDetails.tsx` presents compact actions and remaining findings below each address |
| `lib/automaticBatch.ts` | Verify source values, complete address snapshots, rules, and exact preview/application agreement |
| `lib/reviewHistory.ts` | Apply, validate, publish one history action, and Undo |
| `lib/validator.ts` | Whole-file validation and canonical XML application |

## Address rule order

`ADDRESS_RULES` in `lib/addressRules.ts` is the executable order. The planner restarts at its first entry after each complete repair. Neither issue severity, table sorting, rule identifier, nor the order of keys in a custom profile determines execution priority.

| Order | Check | Reason for its position |
|---|---|---|
| 1 | Dedicated PO box number normalization | Make a recognized destination canonical before checking a transfer into it; preserve leading zeroes. |
| 2 | Dedicated rural route normalization | Make a recognized destination canonical before a transfer. |
| 3 | PO box or rural route text in a street field | Interpret delivery syntax before interpreting street suffixes or removing punctuation. |
| 4 | Address length and structural repairs | Visit Unit, then StreetNumber, then the remaining address fields in the maintained field order. Move misplaced components before abbreviating or separating their contents. Address values are never truncated. |
| 5 | Ambiguous unit prefix in StreetNumber | Keep this interpretation visible for manual review; do not guess from a hyphenated number. |
| 6 | Street type and direction in StreetName | Extract suffixes from the updated name. A delivery finding that still owns StreetName takes precedence, including an unresolved conflict. |
| 7 | Postal code normalization or repair | Independent postal correction can proceed alongside unresolved street findings. |
| 8 | Required fields and controlled values | Report missing or invalid values without inventing replacements. |
| 9 | Configured character checks | Only inspect fields not already owned by a specialized finding. Reassessment reveals cleanup after structural repairs finish. |

A registry entry can emit several findings. Their order is also deliberate: within the structural entry Unit precedes StreetNumber. Several findings may describe the same coordinated proposal; after it runs, reassessment replaces all of those old proposals.

Whole-file validation retains its other phases: XML/canonical diagnostics and metadata, school checks, student address checks, required/allowed student values, guardian structure, dates and identity, non-address lengths, phones and duplicate identity checks, then remaining free-text checks. These report findings; they do not mutate records. Character findings are presented after specialized findings, preserving the existing school/student display order.

## Sequence procedure

1. Copy every address field in the selected student record. Capture the active rules alongside it.
2. Assess that copy using the ordered rules. Generate proposals from the current values, never from cached findings.
3. Choose the first eligible proposal. All newly discovered findings must satisfy the current school/type/field/severity filter and review exclusions. A change that also touches an out-of-scope finding is conservatively withheld; shared character replacements cannot bypass an excluded category.
4. Check that each source value still matches, that every target is an address field, and that a repair writes each field at most once.
5. Apply all of that repair's field changes to the copy together. Record the rule, explanation, and intermediate field changes.
6. Restart assessment. Continue until there is no eligible change. Stop and withhold the address sequence if it repeats an address state, returns a field to a prior value, or exceeds 24 repairs.
7. Check the completed changes against the active field constraints. Withhold the entire address sequence if a changed field remains invalid or a new blocking address finding appears. Existing unrelated findings may remain and are shown in the preview.
8. Produce one net change per field from the original address to the final address. The apply path checks the complete original address, including unchanged fields that the repairs read, and the active rules. It rejects a batch whose writes differ from the preview.
9. Apply the selected net changes to the canonical model and validate the complete XML once. Publish the XML, findings, audit entries, and one review-history action together. A failure before publication leaves the session unchanged.

A temporary value can violate a final field limit. For example, `PO Box 42-123 Example Road` in StreetNumber can become `123 Example Road`, then split into StreetNumber and StreetName, then yield StreetType `RD`. The intermediate value is never committed. Legacy single-step PO-box suggestions remain conservative; only the planner can defer final validity until the full sequence is known.

When a filter deliberately excludes a later repair, the plan can end with that finding unresolved if its changed fields still meet their independent constraints. For example, filtering to StreetNumber length fixes can leave `Main Street West` in StreetName. The preview shows that remaining finding. Removing the filter regenerates the complete sequence.

Changing a severity filter clears automatic selections and regenerates previews. Changing review scope, rules, or the file also regenerates them. Applying or undoing revalidates the current file. Running an unrestricted successful sequence again should produce no further eligible changes.

## Adding an address rule or autofix

1. Define the finding first: its stable rule ID, severity, field, message, and the condition under which it exists. Use a new ID for a different problem; do not use execution order as an identifier.
2. If it needs parsing, add a pure analyzer in `lib/addressRepair.ts`. Pass in values and return a proposal. Do not mutate the input, serialize XML, or import UI code. Declare every changed field with its current and proposed values.
3. Establish eligibility. A populated destination must be empty or agree with the interpretation. Conflicting delivery references, uncertain structure, or ambiguous numbers remain review findings. A coordinated move is one proposal, not several independent writes. Do not broaden inference just to make a sequence finish.
4. Add an `AddressRule` in `lib/addressRules.ts`, or extend the entry that already owns the problem. Insert it explicitly into `ADDRESS_RULES`. Explain which rule must precede it, what it can expose afterward, and which specialized finding takes precedence when both recognize the same text. The existing `previous` findings argument supports that precedence without hiding it in the UI.
5. Use the shared field checks for constraints. If the transformation needs an intermediate value that violates a final constraint, keep ordinary assessment suggestions conservative and defer that constraint only through the planner's `allowIntermediate` context. The completed sequence still must pass the final checks.
6. Add the human-readable issue label to `workflows/stix/validation/overview.ts` and describe its contract in the validation-rule documentation. In `workflows/stix/validation/addressRepairCopy.ts`, provide a problem description for the Issue column and an action title for Repair steps; keep these distinct. The assessment gate remains based on actual findings, not whether a repair was previewed or excluded.
7. Add synthetic tests for the ordinary correction, populated agreeing destination, conflicting destination, malformed input, custom rules, and repeated execution. For interacting rules, test a complete chain, both overlapping proposals present initially, exclusions on a newly discovered step, and an invalid final result. Test through `automaticReviewItems` and `applyReviewChanges`, not only the parser.
8. Run `npm run check`. When the visible behavior changes, add or update a Playwright flow and run `npm run e2e`. For documentation, run `mkdocs build --strict`.

Do not add a second ordering list in the UI, incrementally mutate the real XML during planning, reuse stale proposals, or hide unresolved findings because another repair changed the same address. If two interpretations compete and priority alone cannot establish which is valid, return a review finding with no automatic changes.

## Adding a non-address rule

Issue descriptions in the review tables come from `lib/issueDescription.ts`. Add generic problem wording keyed by rule and field; never interpolate record values, names, school details, or proposed replacements. Values belong in the comparison table. The fallback for an unknown rule must remain generic. Address step copy uses the same descriptions, with structural repair summaries in `workflows/stix/validation/addressRepairCopy.ts`. Detailed validation diagnostics remain separate from these display descriptions.

Use the existing whole-file phases in `lib/validator.ts` and the independent checks in `lib/fieldValidation.ts`. Keep a diagnostic without a defensible correction non-automatic. A simple automatic suggestion needs its exact source value and replacement; the batch guard checks stale and conflicting writes before application.

Non-address rules do not yet participate in repeated local assessment. If a new non-address fix depends on another fix, define its dependency and tests before extending sequencing to that domain. Do not assume the final full-file recheck makes competing precomputed writes safe.

## Verification and limits

`tests/addressAutofix.test.ts` covers chaining, intermediate invalid values, order-sensitive interactions, scope and exclusions, custom constraints, loop/step guards, stale snapshots, exact application, Undo, and idempotence. Existing address, canonical, character, review, and summary tests continue to verify legacy contracts. `e2e/address-sequence.e2e.ts` exercises the combined preview, expandable steps, scope change, selection reset, downloaded XML, and Undo in Chromium.

The engine proves consistency with the implemented rules, not that an address exists or is deliverable. It performs no geocoding, network lookup, or new persistence. Preview steps and original address snapshots live in the current browser session and review history; Save progress continues to export applied XML only. The issue CSV marks original address findings resolved by the combined repair; unresolved findings remain unmarked. It remains an assessment report rather than an export of every intermediate repair step.
