import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import FixView from "../workflows/stix/validation/FixView";
import type { ValidateSession } from "../lib/types";

const session: ValidateSession = {
  fileName: "example.xml", originalXml: "", fixes: [],
  initialResult: {
    schoolCount: 1, studentCount: 27, gate: "REVIEW_REQUIRED",
    records: Array.from({ length: 27 }, (_, index) => ({ id: `student-${index}`, xmlPath: "", fields: {} })),
    issues: Array.from({ length: 27 }, (_, index) => ({
      id: `guardian-${index}`, recordId: `student-${index}`, field: "GuardianRelationship", ruleId: "EMPTY_GUARDIAN",
      message: "Empty Guardian placeholder", severity: "warning", autoFixable: false,
    })),
  },
};
const noop = () => {};

it.each(["automatic", "manual"] as const)("shows individually selectable Guardian removals in the %s table", view => {
  const html = renderToStaticMarkup(<FixView session={session} view={view} onApply={noop} onBack={noop} onClearFilter={noop} onContinue={noop} onAutoApply={noop} onBusyChange={noop} />);
  expect(html).toContain('data-row-id="guardian-0"');
  expect(html).toContain('data-row-id="guardian-24"');
  expect(html).not.toContain('data-row-id="guardian-25"');
  expect(html.match(/Remove empty Guardian placeholder/g)).toHaveLength(25);
  expect(html).not.toContain('guardian-removal');
  expect(html).toContain('Page 1 of 2');
  if (view === "automatic") {
    expect(html).toContain('Apply all on current page (25)');
    expect(html).toContain('Apply all across all pages (27)');
  }
});
