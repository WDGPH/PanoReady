import { afterEach, describe, expect, it, vi } from "vitest";
import { planAddressRepairs, assertAddressPlanCurrent } from "../lib/addressAutofix";
import * as addressRules from "../lib/addressRules";
import { defaultRules } from "../lib/rulesets";
import { generateIssueReportCsv, parseSTIXXml, validateXml } from "../lib/validator";
import { applyReviewChanges, undoLastReviewAction } from "../lib/reviewHistory";
import { automaticReviewItems } from "../workflows/stix/validation/automaticReview";
import { automaticFixes } from "../workflows/stix/validation/helpers";
import { countAppliedCorrections } from "../lib/fixSummary";
import type { StudentRecord, ValidateSession } from "../lib/types";

const record = (fields: Record<string, string>): StudentRecord => ({ id: "school0:student0", xmlPath: "", fields });
const output = (fields: Record<string, string>) => {
  const plan = planAddressRepairs(record(fields), defaultRules);
  return { plan, fields: { ...fields, ...Object.fromEntries(plan.changes.map(change => [change.field, change.proposedValue])) } };
};
const xml = (address: string) => `<SchoolUpload xmlns="http://ontario.ca"><Metadata/><School><SchoolNumber>123</SchoolNumber><Name>Test School</Name><Students><Student><Name><First>Sample</First><Last>Student</Last></Name><Address>${address}</Address></Student></Students></School></SchoolUpload>`;
const session = (address: string): ValidateSession => {
  const source = xml(address);
  return { originalXml: source, fileName: "synthetic.xml", initialResult: validateXml(source), fixes: [], validationRules: defaultRules };
};
afterEach(() => vi.restoreAllMocks());

describe("address repair sequencing", () => {
  it("reassesses after each atomic repair and previews only the original-to-final diff", () => {
    const before = { StreetNumber: "123 Main Street West", StreetName: "" };
    const { plan, fields } = output(before);
    expect(plan.stoppedReason).toBeUndefined();
    expect(plan.steps.map(step => step.ruleId)).toEqual(["FIELD_LENGTH", "STREET_TYPE_IN_STREET_NAME"]);
    expect(fields).toMatchObject({ StreetNumber: "123", StreetName: "Main", StreetType: "ST", StreetDirection: "W" });
    expect(plan.changes.find(change => change.field === "StreetName")).toEqual({ field: "StreetName", currentValue: "", proposedValue: "Main" });
    expect(before).toEqual({ StreetNumber: "123 Main Street West", StreetName: "" });
    expect(planAddressRepairs(record(fields), defaultRules).changes).toEqual([]);
  });

  it("repairs a temporary overlength street number after extracting a PO box", () => {
    const { plan, fields } = output({ StreetNumber: "PO Box 42-123 Example Road" });
    expect(plan.stoppedReason).toBeUndefined();
    expect(plan.steps.map(step => step.ruleId)).toEqual(["ALTERNATE_DELIVERY_IN_STREET_FIELD", "FIELD_LENGTH", "STREET_TYPE_IN_STREET_NAME"]);
    expect(fields).toMatchObject({ PoBoxNumber: "42", StreetNumber: "123", StreetName: "Example", StreetType: "RD" });
  });

  it("normalizes a destination first and preserves its leading zeroes", () => {
    const { plan, fields } = output({ StreetName: "PO Box 0042", PoBoxNumber: "Box 0042" });
    expect(plan.steps[0].ruleId).toBe("PO_BOX_NUMBER_FORMAT");
    expect(fields).toMatchObject({ StreetName: "", PoBoxNumber: "0042" });
  });

  it("splits StreetNumber before shortening an agreeing StreetName", () => {
    const { plan, fields } = output({ StreetNumber: "123 Main Street West", StreetName: "Main Street West" });
    expect(plan.steps).toHaveLength(2);
    expect(fields).toMatchObject({ StreetNumber: "123", StreetName: "Main", StreetType: "ST", StreetDirection: "W" });
  });

  it("runs character policy on the newly separated name", () => {
    const { plan, fields } = output({ StreetNumber: "123 Café Street West" });
    expect(plan.steps.map(step => step.ruleId)).toEqual(["FIELD_LENGTH", "STREET_TYPE_IN_STREET_NAME", "FREE_TEXT_ACCENT"]);
    expect(fields.StreetName).toBe("Cafe");
  });

  it("retains conflicts for review while allowing an independent postal repair", () => {
    const { plan, fields } = output({ StreetName: "PO Box 42 Main Road", PoBoxNumber: "99", PostalCode: "n1h 1a1" });
    expect(plan.steps.map(step => step.ruleId)).toEqual(["POSTAL_CODE_NORMALIZE"]);
    expect(fields).toMatchObject({ StreetName: "PO Box 42 Main Road", PoBoxNumber: "99", PostalCode: "N1H1A1" });
    expect(plan.remaining.some(finding => finding.ruleId === "ALTERNATE_DELIVERY_IN_STREET_FIELD")).toBe(true);
  });

  it("withholds a sequence whose intermediate street value cannot be repaired", () => {
    const { plan } = output({ StreetNumber: "PO Box 42-123 Example Road", StreetName: "Different Road" });
    expect(plan.stoppedReason).toContain("invalid");
    expect(plan.changes).toEqual([]);
  });

  it("respects final custom lengths and required fields", () => {
    const longBox = planAddressRepairs(record({ StreetName: "PO Box 1234" }), { ...defaultRules, fieldLengths: { ...defaultRules.fieldLengths, PoBoxNumber: 3 } });
    expect(longBox.changes).toEqual([]);
    expect(longBox.stoppedReason).toContain("invalid");
    const requiredName = planAddressRepairs(record({ StreetName: "PO Box 42" }), { ...defaultRules, requiredFields: [...defaultRules.requiredFields, "StreetName"] });
    expect(requiredName.changes).toEqual([]);
  });

  it("stops at a bounded step count without publishing partial changes", () => {
    const plan = planAddressRepairs(record({ StreetNumber: "123 Main Street West" }), defaultRules, { maxSteps: 1 });
    expect(plan.stoppedReason).toContain("step limit");
    expect(plan.changes).toEqual([]);
  });

  it("rejects a future rule that reverses a previous repair", () => {
    vi.spyOn(addressRules, "assessAddress").mockImplementation(fields => [{ field: "City", severity: "info", ruleId: "REVERSING_RULE", autoFixable: true, message: "Test", suggestedFix: fields.City === "A" ? "B" : "A" }]);
    const plan = planAddressRepairs(record({ City: "A" }), defaultRules);
    expect(plan.stoppedReason).toContain("reverse");
    expect(plan.changes).toEqual([]);
  });

  it("checks read-only destination fields and the active rules when applying", () => {
    const source = record({ StreetName: "Main St", StreetType: "ST" });
    const plan = planAddressRepairs(source, defaultRules);
    expect(plan.changes.map(change => change.field)).not.toContain("StreetType");
    expect(() => assertAddressPlanCurrent(plan, { ...source, fields: { ...source.fields, StreetType: "RD" } }, defaultRules)).toThrow("changed after preview");
    expect(() => assertAddressPlanCurrent(plan, source, { ...defaultRules, allowedStreetTypeValues: ["RD"] })).toThrow("changed after preview");
  });
});

describe("combined address review and application", () => {
  it("applies exactly one combined preview, revalidates, and undoes it as one action", () => {
    const source = session("<StreetNumber>123 Main Street West</StreetNumber>");
    const items = automaticReviewItems(source.initialResult, defaultRules, {}, []);
    expect(items).toHaveLength(1);
    const batch = automaticFixes(items[0], source.initialResult.records, 1);
    expect(countAppliedCorrections(batch)).toBe(1);
    const applied = applyReviewChanges({ ...source, fixes: batch }, "Automatic fixes");
    expect(parseSTIXXml(applied.finalXml!)[0].fields).toMatchObject({ StreetNumber: "123", StreetName: "Main", StreetType: "ST", StreetDirection: "W" });
    expect(applied.history).toHaveLength(1);
    expect(applied.history![0].changes[0].addressPlan?.steps).toHaveLength(2);
    expect(automaticReviewItems(applied.revalidatedResult!, defaultRules, {}, [])).toEqual([]);
    expect(undoLastReviewAction(applied).finalXml).toBe(source.originalXml);
  });

  it("keeps combined repairs in the existing assessment row order", () => {
    const source = session("<StreetNumber>123 Main Street West</StreetNumber>");
    const result = source.initialResult;
    const addressIndex = result.issues.findIndex(issue => issue.field === "StreetNumber");
    result.issues.splice(addressIndex + 1, 0, {
      id: "grade", recordId: "school0:student0", field: "Grade", ruleId: "GRADE_ALLOWED_VALUE",
      severity: "error", message: "Test grade", autoFixable: true, suggestedFix: "JK",
    });
    const items = automaticReviewItems(result, defaultRules, {}, []);
    expect(items.map(item => item.field)).toEqual(["StreetNumber", "Grade"]);
  });

  it("marks every resolved address finding in the issue CSV, leaving remaining findings unmarked", () => {
    const source = session("<StreetNumber>123 Main Street West</StreetNumber><StreetName>Main Street West</StreetName>");
    const addressIssues = source.initialResult.issues.filter(issue => issue.field === "StreetNumber" || issue.field === "StreetName");
    expect(addressIssues).toHaveLength(2);
    const complete = automaticReviewItems(source.initialResult, defaultRules, {}, [])[0];
    const completeFixes = automaticFixes(complete, source.initialResult.records, 1);
    const completedRows = generateIssueReportCsv(addressIssues, completeFixes).split("\n").slice(1);
    expect(completedRows.every(row => row.endsWith(",yes"))).toBe(true);
    const partial = automaticReviewItems(source.initialResult, defaultRules, { ruleId: "FIELD_LENGTH" }, [])[0];
    const partialFixes = automaticFixes(partial, source.initialResult.records, 1);
    const rows = generateIssueReportCsv(addressIssues, partialFixes).split("\n").slice(1);
    expect(rows[0]).toMatch(/,yes$/);
    expect(rows[1]).toMatch(/,no$/);
  });

  it("honors exclusions and type filters for newly discovered steps", () => {
    const source = session("<StreetNumber>123 Main Street West</StreetNumber>");
    for (const items of [
      automaticReviewItems(source.initialResult, defaultRules, {}, [{ ruleId: "STREET_TYPE_IN_STREET_NAME", field: "StreetName" }]),
      automaticReviewItems(source.initialResult, defaultRules, { ruleId: "FIELD_LENGTH", field: "StreetNumber" }, []),
      automaticReviewItems(source.initialResult, defaultRules, {}, [], "error"),
    ]) {
      expect(items).toHaveLength(1);
      expect(items[0].addressPlan?.steps.map(step => step.ruleId)).toEqual(["FIELD_LENGTH"]);
      expect(items[0].addressPlan?.changes.find(change => change.field === "StreetName")?.proposedValue).toBe("Main Street West");
    }
    expect(automaticReviewItems(source.initialResult, defaultRules, {}, [{ schoolNumber: "123" }])).toEqual([]);
  });

  it("does not bypass an excluded character category through a shared replacement", () => {
    const source = session("<City>Café'</City>");
    const rules = { ...defaultRules, freeTextCharacterChecks: { ...defaultRules.freeTextCharacterChecks, apostrophe: ["City"] } };
    expect(automaticReviewItems(validateXml(source.originalXml, rules), rules, {}, [{ ruleId: "FREE_TEXT_APOSTROPHE", field: "City" }])).toEqual([]);
  });

  it("rejects stale previews and extra writes to the previewed address", () => {
    const source = session("<StreetNumber>123 Main Street West</StreetNumber>");
    const item = automaticReviewItems(source.initialResult, defaultRules, {}, [])[0];
    const fixes = automaticFixes(item, source.initialResult.records, 1);
    const stale = { ...source, initialResult: validateXml(xml("<StreetNumber>456</StreetNumber>")), fixes };
    expect(() => applyReviewChanges(stale, "Automatic fixes")).toThrow("changed after preview");
    expect(() => applyReviewChanges({ ...source, fixes: [...fixes, { ...fixes[0], field: "City", oldValue: "", newValue: "Unexpected", addressPlan: undefined }] }, "Automatic fixes")).toThrow("differ from the preview");
  });

  it("rejects competing automatic writes instead of silently using the last one", () => {
    const source = session("<City>Original</City>");
    const fix = { issueId: "test", recordId: "school0:student0", field: "City", oldValue: "Original", newValue: "First", ruleId: "TEST", appliedAt: 1 };
    expect(() => applyReviewChanges({ ...source, fixes: [fix, { ...fix, newValue: "Second" }] }, "Automatic fixes")).toThrow("conflicting changes");
  });
});
