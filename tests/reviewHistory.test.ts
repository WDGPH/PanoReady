import { describe, expect, it } from "vitest";
import { applyReviewChanges, undoLastReviewAction } from "../lib/reviewHistory";
import { parseCanonicalXml } from "../lib/canonical";
import { validateXml } from "../lib/validator";
import { defaultRules } from "../lib/rulesets";
import type { AppliedFix, ReviewAction, ValidateSession } from "../lib/types";

const xml = `<SchoolUpload xmlns="http://ontario.ca"><Metadata/><School><SchoolNumber>123</SchoolNumber><Name>Synthetic School</Name><Students><Student><Name><First>Sample</First><Last>Student</Last></Name><Guardian><Name/></Guardian><Guardian><Name><First>Example</First></Name><Relationship>MOTHER</Relationship></Guardian><Address><City>Exampleville</City><Province>ON</Province></Address></Student></Students></School></SchoolUpload>`;
function initial(): ValidateSession {
  return { fileName: "synthetic.xml", originalXml: xml, initialResult: validateXml(xml), fixes: [] };
}
function change(session: ValidateSession, field: string, oldValue: string, newValue: string): AppliedFix {
  return { issueId: "finding", recordId: session.initialResult.records[0].id, field, oldValue, newValue, ruleId: "test", appliedAt: 1 };
}
function apply(session: ValidateSession, changes: AppliedFix[], label: ReviewAction["label"] = "Manual fixes") {
  return applyReviewChanges({ ...session, fixes: [...session.fixes, ...changes] }, label);
}

describe("review action history", () => {
  it("groups each apply operation and restores XML, findings and audit together", () => {
    const source = initial();
    const applied = apply(source, [change(source, "City", "Exampleville", "Sampletown"), change(source, "Province", "ON", "QC")]);
    expect(applied.history).toHaveLength(1);
    expect(applied.history![0].changes).toHaveLength(2);
    expect(applied.appliedFixCount).toBe(2);
    const undone = undoLastReviewAction(applied);
    expect(undone.finalXml).toBe(xml);
    expect(undone.revalidatedResult).toEqual(source.initialResult);
    expect(undone.fixes).toEqual([]);
    expect(undone.appliedFixCount).toBe(0);
    expect(undone.history![0].status).toBe("undone");
    expect(applied.history![0].status).toBe("applied");
    expect(source.finalXml).toBeUndefined();
  });

  it("undoes repeated changes in reverse order and retains undone entries after a new action", () => {
    const source = initial();
    const first = apply(source, [change(source, "City", "Exampleville", "Sampletown")], "Automatic fixes");
    const second = apply(first, [change(first, "City", "Sampletown", "Mockborough")], "Cleaning mappings");
    const undone = undoLastReviewAction(second);
    expect(undone.finalXml).toBe(first.finalXml);
    expect(undone.fixes).toEqual(first.fixes);
    const third = apply(undone, [change(undone, "City", "Sampletown", "Fixture City")]);
    expect(third.history!.map((action) => action.status)).toEqual(["applied", "undone", "applied"]);
    expect(undoLastReviewAction(undoLastReviewAction(third)).finalXml).toBe(xml);
  });

  it("replays separate batches when a removal changes Guardian positions", () => {
    const source = initial();
    const removed = apply(source, [change(source, "Guardian", "", "")], "Automatic fixes");
    const edited = apply(removed, [change(removed, "GuardianFirstName", "Ann", "Anne")]);
    const later = apply(edited, [change(edited, "City", "Exampleville", "Sampletown")]);
    const undone = undoLastReviewAction(later);
    const guardians = parseCanonicalXml(undone.finalXml!).schools[0].students[0].guardians;
    expect(guardians).toHaveLength(1);
    expect(guardians[0].name.first).toBe("Anne");
    expect(undoLastReviewAction(undone).finalXml).toBe(removed.finalXml);
    expect(undoLastReviewAction(undoLastReviewAction(undone)).finalXml).toBe(xml);
  });

  it("revalidates under the current rules without undoing ruleset selection", () => {
    const source = initial();
    const applied = apply(source, [change(source, "City", "Exampleville", "Sampletown")]);
    const validationRules = { ...defaultRules, requiredFields: ["City"] };
    const undone = undoLastReviewAction({ ...applied, validationRules });
    expect(undone.validationRules).toBe(validationRules);
    expect(undone.revalidatedResult).toEqual(validateXml(xml, validationRules));
  });

  it("does not create history on a recheck or apply committed fixes twice", () => {
    const source = initial();
    expect(applyReviewChanges(source, "Manual fixes").history).toBeUndefined();
    const applied = apply(source, [change(source, "Guardian", "", "")]);
    const rechecked = applyReviewChanges(applied, "Manual fixes");
    expect(rechecked.finalXml).toBe(applied.finalXml);
    expect(rechecked.history).toEqual(applied.history);
    expect(undoLastReviewAction(source)).toBe(source);
  });

  it("rejects undo while corrections are pending", () => {
    const source = initial();
    const applied = apply(source, [change(source, "City", "Exampleville", "Sampletown")]);
    expect(() => undoLastReviewAction({ ...applied, fixes: [...applied.fixes, change(applied, "City", "Sampletown", "Mockborough")] })).toThrow("Finish applying");
  });
});
