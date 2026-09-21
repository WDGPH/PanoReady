import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import FixView from "../workflows/stix/validation/FixView";
import { applyValidationFixes, validateXml } from "../lib/validator";

const student = '<Student><OEN>123456789</OEN><Name><First>Ada</First><Last>Example</Last></Name></Student>';
const school = (number: string, count: number) => `<School><SchoolNumber>${number}</SchoolNumber><Students>${student.repeat(count)}</Students></School>`;
const xml = `<SchoolUpload xmlns="http://ontario.ca">${school("111", 1)}${school("222", 2)}</SchoolUpload>`;
const result = validateXml(xml);
const noop = () => {};

it("detects a duplicate in a later school after a cross-school occurrence", () => {
  expect(result.issues.filter(i => i.field === "OEN").map(i => [i.ruleId, i.severity])).toEqual([
    ["OEN_DUAL_ENROLLMENT", "warning"], ["OEN_DUPLICATE", "error"],
  ]);
});

it.each(["OEN_DUPLICATE", "OEN_DUAL_ENROLLMENT"])("does not offer or apply a replacement OEN for %s", ruleId => {
  const issue = result.issues.find(i => i.ruleId === ruleId)!;
  const html = renderToStaticMarkup(<FixView session={{ fileName: "demo.xml", originalXml: xml,
    initialResult: { ...result, issues: [issue] }, fixes: [] }} view="manual"
    onApply={noop} onBack={noop} onClearFilter={noop} onContinue={noop} onAutoApply={noop} onBusyChange={noop} />);
  expect(html).toContain("Review in the source system");
  expect(html).not.toContain("Enter corrected value");
  const fixed = applyValidationFixes(xml, [{ issueId: issue.id, recordId: issue.recordId!, field: "OEN",
    oldValue: "123456789", newValue: "987654321", ruleId, appliedAt: 0 }]);
  expect(validateXml(fixed).records.map(r => r.fields.OEN)).toEqual(["123456789", "123456789", "123456789"]);
});

it("still permits correction of a malformed OEN", () => {
  const source = xml.replace("123456789", "123");
  const issue = validateXml(source).issues.find(i => i.ruleId === "OEN_FORMAT")!;
  const fixed = applyValidationFixes(source, [{ issueId: issue.id, recordId: issue.recordId!, field: "OEN",
    oldValue: "123", newValue: "987654321", ruleId: issue.ruleId, appliedAt: 0 }]);
  expect(validateXml(fixed).records[0].fields.OEN).toBe("987654321");
});
