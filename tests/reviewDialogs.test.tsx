import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FixView from "../workflows/stix/validation/FixView";
import { validateXml } from "../lib/validator";
import type { ValidateSession } from "../lib/types";

const xml = readFileSync(new URL("../public/samples/stix-validation-demo.stix", import.meta.url), "utf8");
const result = validateXml(xml);
const session: ValidateSession = { fileName: "demo.xml", originalXml: xml, initialResult: result, fixes: [] };
const noop = () => {};

function render(view: "automatic" | "manual", currentSession = session) {
  return renderToStaticMarkup(<FixView session={currentSession} view={view}
    onApply={noop} onBack={noop} onClearFilter={noop} onContinue={noop}
    onAutoApply={noop} onBusyChange={noop} />);
}

describe("review dialogs", () => {
  it.each(["automatic", "manual"] as const)("keeps unrelated identity and contact details out of the %s table", (view) => {
    const issue = result.issues.find(candidate => result.records.some(record => record.id === candidate.recordId) && candidate.autoFixable && !candidate.repairProposal)!;
    const source = result.records.find(record => record.id === issue.recordId)!;
    const privateSession = { ...session, initialResult: { ...result,
      records: [{ ...source, fields: { ...source.fields, FirstName: "PrivateGivenName", LastName: "PrivateSurname", GuardianFirstName: "PrivateGuardian", GuardianPhoneNumber: "5195550199" } }],
      issues: [{ ...issue, studentName: "PrivateGivenName PrivateSurname" }],
    } };
    const html = render(view, privateSession);
    expect(html).toContain("View student ");
    expect(html).toContain("data-sort-value=\"Student ");
    for (const value of ["PrivateGivenName", "PrivateSurname", "PrivateGuardian", "5195550199"]) expect(html).not.toContain(value);
    expect(html).not.toContain("Student details");
  });

  it("includes address proposals as paged manual rows without mounting their editors", () => {
    const issue = result.issues.find(candidate => candidate.repairProposal && candidate.recordId)!;
    expect(issue).toBeDefined();
    const html = render("manual", { ...session, initialResult: { ...result, issues: [issue] } });
    expect(html).toContain(`data-row-id="${issue.id}"`);
    expect(html).toContain("Review address");
    expect(html).not.toContain("CORRECTED PREVIEW");
    expect(html).not.toContain("Address repairs</h2>");
    expect(render("automatic", { ...session, initialResult: { ...result, issues: [issue] } })).not.toContain("Review address");
  });

  it("shows file findings without inventing a student link", () => {
    const issue = result.issues.find(candidate => !candidate.recordId)!;
    expect(issue).toBeDefined();
    const html = render("manual", { ...session, initialResult: { ...result, issues: [issue] } });
    expect(html).toContain("File / unassigned");
    expect(html).not.toContain("View student");
  });
});
