import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ActionHistory from "../workflows/stix/validation/ActionHistory";
import RevalidateView from "../workflows/stix/validation/RevalidateView";
import type { ReviewAction, ValidateSession } from "../lib/types";

const noop = () => {};
const action: ReviewAction = {
  id: "action", label: "Manual fixes", status: "applied",
  changes: [{ issueId: "finding", recordId: "student", field: "City", oldValue: "Private old value", newValue: "Private new value", ruleId: "test", appliedAt: 1 }],
};

it("starts with only the history trigger and no correction data", () => {
  const html = renderToStaticMarkup(<ActionHistory history={[action]} disabled={false} onUndo={noop} />);
  expect(html).toContain("History (1)");
  expect(html).not.toContain("Manual fixes (1)");
  expect(html).not.toContain("Undo last action");
  expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain("Private");
  expect(html).not.toContain("student");
  expect(html).not.toContain("disabled");
});

it("hides empty history and keeps history accessible while busy or after undo", () => {
  expect(renderToStaticMarkup(<ActionHistory history={[]} disabled={false} onUndo={noop} />)).toBe("");
  for (const entry of [action, { ...action, status: "undone" as const }]) {
    const html = renderToStaticMarkup(<ActionHistory history={[entry]} disabled onUndo={noop} />);
    expect(html).toContain("History (1)");
    expect(html).not.toContain("disabled");
  }
});

it("uses indeterminate progress until the parent has a committed recheck result", () => {
  const session: ValidateSession = {
    originalXml: "", fileName: "example.xml", fixes: [],
    initialResult: { records: [], issues: [], gate: "READY", studentCount: 0, schoolCount: 0 },
  };
  const render = (session: ValidateSession) => renderToStaticMarkup(<RevalidateView session={session} onComplete={noop} onBack={noop} onContinue={noop} onReturnToFixes={noop} />);
  const html = render(session);
  expect(html).toContain('<progress aria-label="Corrections and recheck"');
  expect(html).not.toContain("aria-valuenow");
  expect(html).not.toContain(" value=");
  const completed = render({ ...session, revalidatedResult: session.initialResult, appliedFixCount: 0, finalXml: "" });
  expect(completed).not.toContain("<progress");
  expect(completed).toContain("Return to manual fixes");
  expect(completed).toContain("After 0 Corrections · 0 Field Changes");
  expect(completed).toContain("Automatic fixes");
  expect(completed).toContain("Manual fixes");
});
