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
      id: `guardian-${index}`, recordId: `student-${index}`, field: "Guardian", ruleId: "EMPTY_GUARDIAN",
      message: "Empty Guardian placeholder", severity: "warning", autoFixable: false,
    })),
  },
};
const noop = () => {};

it.each(["automatic"] as const)("shows individually selectable Guardian removals in the %s table", view => {
  const html = renderToStaticMarkup(<FixView session={session} view={view} onApply={noop} onBack={noop} onClearFilter={noop} onContinue={noop} onAutoApply={noop} onBusyChange={noop} />);
  expect(html).toContain('data-row-id="guardian-0"');
  expect(html).toContain('data-row-id="guardian-24"');
  expect(html).not.toContain('data-row-id="guardian-25"');
  expect(html.match(/Remove Guardian 1/g)).toHaveLength(25);
  expect(html.match(/Entire empty section will be removed when applied/g)).toHaveLength(25);
  expect(html).not.toContain('guardian-removal');
  expect(html).toContain('Page 1 of 2');
  if (view === "automatic") {
    expect(html).toContain('Select all on current page (25)');
    expect(html).toContain('Select all across all pages (27)');
  }
});

it("keeps structural deletions out of manual review", () => {
  const html = renderToStaticMarkup(<FixView session={session} view="manual" onApply={noop} onBack={noop} onClearFilter={noop} onContinue={noop} onAutoApply={noop} onBusyChange={noop} />);
  expect(html).not.toContain('data-row-id="guardian-0"');
  expect(html).not.toContain("Remove Guardian");
});

it("shows clean rural-route corrections in automatic fixes", () => {
  const ruralSession: ValidateSession = {
    fileName: "rural-route.xml", originalXml: "", fixes: [],
    initialResult: {
      schoolCount: 1, studentCount: 1, gate: "REVIEW_REQUIRED",
      records: [{ id: "school0:student0", xmlPath: "", fields: { StreetName: "RR1", RuralRoute: "" } }],
      issues: [{
        id: "rural-route-0", recordId: "school0:student0", field: "StreetName",
        ruleId: "RURAL_ROUTE_IN_STREET_FIELD", message: "Rural route text was found in StreetName.",
        severity: "warning", autoFixable: true,
        repairProposal: {
          kind: "address", id: "rural-route-repair-0", confidence: "safe",
          title: "Move rural route text out of the street address", explanation: "",
          changes: [
            { field: "StreetName", currentValue: "RR1", proposedValue: "" },
            { field: "RuralRoute", currentValue: "", proposedValue: "RR 1" },
          ],
        },
      }],
    },
  };

  const automaticHtml = renderToStaticMarkup(<FixView session={ruralSession} view="automatic" onApply={noop} onBack={noop} onClearFilter={noop} onContinue={noop} onAutoApply={noop} onBusyChange={noop} />);
  expect(automaticHtml).toContain('data-row-id="rural-route-0"');
  expect(automaticHtml).toContain("RR 1");
});

it("keeps 1,000 safe compound street repairs in the 25-row paged table", () => {
  const count = 1000;
  const streetSession: ValidateSession = {
    fileName: "streets.xml", originalXml: "", fixes: [],
    initialResult: {
      schoolCount: 1, studentCount: count, gate: "REVIEW_REQUIRED",
      records: Array.from({ length: count }, (_, index) => ({
        id: "student-" + index,
        xmlPath: "",
        fields: { StreetName: "Example " + index + " St.", StreetType: "", StreetDirection: "" },
      })),
      issues: Array.from({ length: count }, (_, index) => ({
        id: "street-" + index,
        recordId: "student-" + index,
        studentName: "Student " + (index + 1),
        field: "StreetName",
        ruleId: "STREET_TYPE_IN_STREET_NAME",
        message: "Street type found in StreetName",
        severity: "warning" as const,
        autoFixable: true,
        repairProposal: {
          kind: "address" as const,
          id: "street-repair-" + index,
          confidence: "safe" as const,
          title: "Move the street type out of the street name",
          explanation: "",
          changes: [
            { field: "StreetName", currentValue: "Example " + index + " St.", proposedValue: "Example " + index },
            { field: "StreetType", currentValue: "", proposedValue: "ST" },
          ],
        },
      })),
    },
  };

  const html = renderToStaticMarkup(<FixView session={streetSession} view="automatic" onApply={noop} onBack={noop} onClearFilter={noop} onContinue={noop} onAutoApply={noop} onBusyChange={noop} />);
  expect(html).toContain('data-row-id="street-0"');
  expect(html).toContain('data-row-id="street-24"');
  expect(html).not.toContain('data-row-id="street-25"');
  expect(html).not.toContain("Address repairs");
  expect(html).toContain("1–25 of 1000");
  expect(html).toContain("Select all on current page (25)");
  expect(html).toContain("Select all across all pages (1000)");
});
