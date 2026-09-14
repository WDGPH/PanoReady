import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import IssuesView from "../workflows/stix/validation/IssuesView";
import type { ValidateSession, ValidationResult } from "../lib/types";

const result: ValidationResult = {
  schoolCount: 0,
  studentCount: 0,
  gate: "READY",
  records: [],
  issues: [],
};

const session: ValidateSession = {
  fileName: "example.xml",
  referenceDate: "2026-09-12",
  history: [],
  drafts: { values: {}, addresses: {} },
  document: {
    schemaVersion: "test",
    batchId: "test",
    diagnostics: [],
    metadata: { createDate: "", createTime: "", createdBy: "", contactPhone: null, contactEmail: "", fullUpload: "", boardNumber: "", boardName: "" },
    schools: [],
  },
  initialIssueCount: result.issues.length,
  currentResult: result,
};

const noop = () => {};
const render = () => renderToStaticMarkup(
  <IssuesView
    session={session}
    onBack={noop}
    onFix={noop}
    onSkipToDownload={noop}
    exclusions={[]}
    onExclusionsChange={noop}
  />,
);

it("uses the review-status control style to select the quality table", () => {
  const html = render();
  expect(html).toContain('role="group" aria-label="Quality summary view"');
  expect(html).toContain('aria-pressed="true" class="btn btn-secondary">By issue type</button>');
  expect(html).toContain('aria-pressed="false" class="btn btn-ghost">By school</button>');
  expect(html).toContain('aria-label="By issue type"');
  expect(html).not.toContain('aria-label="By school"');
});
