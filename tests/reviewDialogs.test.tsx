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
    expect(html).not.toContain("EDITED PREVIEW");
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

  it("keeps single-field manual corrections inline", () => {
    const record = result.records[0];
    const issue = { id: "single-field", recordId: record.id, field: "GuardianRelationship", currentValue: record.fields.GuardianRelationship, ruleId: "GUARDIAN_RELATIONSHIP_REQUIRED", message: "Relationship required", severity: "error" as const, autoFixable: false };
    const html = render("manual", { ...session, initialResult: { ...result, issues: [issue] } });
    expect(html).toContain(`aria-label="GuardianRelationship for Student 1.1"`);
    expect(html).toContain("<th scope=\"col\">Field</th><th scope=\"col\">Edit</th>");
    expect(html).not.toContain("<th scope=\"col\">Current</th>");
    expect(html).toContain(`value="${record.fields.GuardianRelationship}"`);
    expect(html).not.toContain("Review and edit");
  });

  it.each(["OEN_DUPLICATE", "OEN_DUAL_ENROLLMENT", "NAME_DOB_DUPLICATE", "IDENTITY_REVIEW"])("keeps %s as source review", ruleId => {
    const issue = { id: "identity-review", recordId: result.records[0].id, field: ruleId.startsWith("OEN_") ? "OEN" : undefined, ruleId, message: "Review identity", severity: "error" as const, autoFixable: false };
    const html = render("manual", { ...session, initialResult: { ...result, issues: [issue] } });
    expect(html).toContain("Review in source");
    expect(html).not.toContain("Correct OEN");
    expect(html).not.toContain("Review and edit");
  });
});
