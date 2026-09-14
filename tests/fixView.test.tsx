import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FixView from "../workflows/stix/validation/FixView";
import type { ValidateSession, ValidationResult } from "../lib/types";
import { defaultRules } from "../lib/rulesets";
import { parseCanonicalXml } from "../lib/canonical";
import { draftTargetKey } from "../lib/session";

it("does not label unchanged drafts outdated when their findings are absent from review", () => {
  const document = parseCanonicalXml('<SchoolUpload xmlns="http://ontario.ca"><Metadata></Metadata><School><SchoolNumber>1</SchoolNumber><Name>School</Name><Students><Student><Name><First>Ada</First></Name><Address><City>Toronto</City></Address></Student></Students></School></SchoolUpload>');
  const target = { recordId: document.schools[0].students[0].recordId, field: "FirstName", oldValue: "Ada" };
  const key = draftTargetKey(target);
  const reviewed: ValidateSession = { ...session, document, currentResult: { ...result, issues: [], records: [] }, drafts: {
    values: { [key]: { value: "Grace", expected: target } },
    addresses: { [target.recordId]: { values: { City: "Ottawa" }, expectedValues: { City: "Toronto" }, selected: true } },
  } };
  const html = renderToStaticMarkup(<FixView session={reviewed} view="manual" onApply={noop} onBack={noop} onClearFilter={noop} onContinue={noop} onAutoApply={noop} onDraftsChange={noop} />);
  expect(html).not.toContain("outdated because");
  expect(html).not.toContain("Discard outdated edits");
});

const result: ValidationResult = {
    schoolCount: 1, studentCount: 27, gate: "REVIEW_REQUIRED",
    records: Array.from({ length: 27 }, (_, index) => ({ id: `student-${index}`, xmlPath: "", fields: {} })),
    issues: Array.from({ length: 27 }, (_, index) => ({
      id: `guardian-${index}`, recordId: `student-${index}`, field: "GuardianRelationship", ruleId: "EMPTY_GUARDIAN",
      message: "Empty Guardian placeholder", severity: "warning", autoFixable: false,
    })),
  };
const session: ValidateSession = {
  fileName: "example.xml", referenceDate: "2026-09-12", history: [], validationRules: defaultRules, drafts: { values: {}, addresses: {} },
  document: { schemaVersion: "test", batchId: "test", diagnostics: [], metadata: { createDate: "", createTime: "", createdBy: "", contactPhone: null, contactEmail: "", fullUpload: "", boardNumber: "", boardName: "" }, schools: [] },
  initialIssueCount: result.issues.length,
  currentResult: result,
};
const noop = () => {};

it.each(["automatic", "manual"] as const)("shows individually selectable Guardian removals in the %s table", view => {
  const html = renderToStaticMarkup(<FixView session={session} view={view} onApply={noop} onBack={noop} onClearFilter={noop} onContinue={noop} onAutoApply={noop} onDraftsChange={noop} />);
  expect(html).toContain('data-row-id="guardian-0"');
  expect(html).toContain('data-row-id="guardian-24"');
  expect(html).not.toContain('data-row-id="guardian-25"');
  expect(html.match(/Remove empty Guardian placeholder/g)).toHaveLength(25);
  expect(html).not.toContain('guardian-removal');
  expect(html).toContain('Page 1 of 2');
  expect(html).toContain('Record');
  expect(html).toContain('Issue');
  expect(html).toContain('Action');
  expect(html).not.toContain('New Value');
  expect(html).toContain('Filter severity: All severities');
  expect(html).toContain('popover="auto"');
  if (view === "automatic") {
    expect(html).toContain('Apply current page (25)');
    expect(html).toContain('Apply all pages (27)');
  }
});

it("does not duplicate applied history below current findings", () => {
  const change = { issueId: "phone-1", recordId: "student-0", field: "Phone", oldValue: "(519) 555-1234", newValue: "519-555-1234", ruleId: "PHONE_FORMAT", appliedAt: 1 };
  const reviewed: ValidateSession = { ...session, history: [
    { id: "group-1", label: "Reviewed phone", origin: "manual", appliedAt: 1, status: "undone", changes: [change] },
    { id: "group-2", label: "Earlier grade", origin: "manual", appliedAt: 2, status: "changed-again", changes: [{ ...change, issueId: "grade-1", field: "Grade", oldValue: "BAD", newValue: "GR5" }] },
  ] };
  const html = renderToStaticMarkup(<FixView session={reviewed} view="manual" onApply={noop} onBack={noop} onClearFilter={noop} onContinue={noop} onAutoApply={noop} onDraftsChange={noop} />);
  expect(html).toContain("Review status");
  expect(html).toContain("Remaining");
  expect(html).toContain("Applied");
  expect(html).not.toContain("Applied session changes");
  expect(html).not.toContain("Reviewed phone");
});
