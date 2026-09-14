import { describe, expect, it } from "vitest";
import { parseCanonicalXml } from "../lib/canonical";
import { commitChangeGroup, draftTargetKey, reconcileChangeStatuses, staleDraftKeys, undoChangeGroup } from "../lib/session";
import type { AppliedFix, ValidateSession } from "../lib/types";
import { validateCanonicalUpload } from "../lib/validator";

const source = `<?xml version="1.0"?><SchoolUpload xmlns="http://ontario.ca"><Metadata></Metadata><School><SchoolNumber>1</SchoolNumber><Name>School</Name><Students><Student><Name><First>Ada</First><Last>Lovelace</Last></Name><Guardian><Name><First>First guardian</First></Name></Guardian><Guardian><Name><First>Second guardian</First></Name><Relationship>MOTHER</Relationship></Guardian><Address></Address></Student></Students></School></SchoolUpload>`;

function fix(values: Partial<AppliedFix> & Pick<AppliedFix, "recordId" | "field" | "oldValue" | "newValue">): AppliedFix {
  return { issueId: "issue", ruleId: "test", appliedAt: 0, ...values };
}

describe("workflow change groups", () => {
  it("preserves pending edits across unrelated revalidation and detects actual changes and undo", () => {
    const upload = parseCanonicalXml(source);
    const target = { recordId: "school0:student0", field: "FirstName", oldValue: "Ada" };
    const key = draftTargetKey(target);
    const drafts: ValidateSession["drafts"] = {
      values: { [key]: { value: "Grace", expected: target } },
      addresses: { [target.recordId]: { values: { City: "Toronto" }, expectedValues: { City: "" }, selected: true } },
    };
    const unrelated = commitChangeGroup(upload, [fix({ recordId: "metadata", field: "CreatedBy", oldValue: "", newValue: "Exporter" })], { label: "Setup", origin: "setup" });
    expect(staleDraftKeys(unrelated.document, drafts)).toEqual({ values: [], addresses: [] });
    const changed = commitChangeGroup(unrelated.document, [
      fix({ ...target, newValue: "Augusta" }),
      fix({ recordId: target.recordId, field: "City", oldValue: "", newValue: "Ottawa" }),
    ], { label: "Other edits", origin: "manual" });
    expect(staleDraftKeys(changed.document, drafts)).toEqual({ values: [key], addresses: [target.recordId] });
    expect(staleDraftKeys(undoChangeGroup(changed.document, changed.group), drafts)).toEqual({ values: [], addresses: [] });
    const removed = structuredClone(upload);
    removed.schools[0].students = [];
    expect(staleDraftKeys(removed, drafts)).toEqual({ values: [key], addresses: [target.recordId] });
  });

  it("keeps guardian drafts attached through ordinal shifts but rejects removed targets", () => {
    const upload = parseCanonicalXml(source);
    const [first, second] = upload.schools[0].students[0].guardians;
    const target = { recordId: "school0:student0", targetId: second.guardianId, field: "Guardian2Relationship", oldValue: "MOTHER" };
    const key = draftTargetKey(target);
    expect(draftTargetKey({ ...target, field: "GuardianRelationship" })).toBe(key);
    const drafts: ValidateSession["drafts"] = { values: { [key]: { value: "PARENT", expected: target } }, addresses: {} };
    const removal = commitChangeGroup(upload, [fix({ recordId: target.recordId, targetId: first.guardianId, field: "Guardian", oldValue: "", newValue: "" })], { label: "Remove first", origin: "automatic" });
    expect(staleDraftKeys(removal.document, drafts).values).toEqual([]);
    const removedTarget = commitChangeGroup(removal.document, [fix({ recordId: target.recordId, targetId: second.guardianId, field: "Guardian", oldValue: "", newValue: "" })], { label: "Remove second", origin: "automatic" });
    expect(staleDraftKeys(removedTarget.document, drafts).values).toEqual([key]);
  });

  it.each(["OEN_DUPLICATE", "OEN_DUAL_ENROLLMENT"])("rejects replacement OENs for %s before committing any changes", (ruleId) => {
    const upload = parseCanonicalXml(source);
    expect(() => commitChangeGroup(upload, [
      fix({ recordId: "school0:student0", field: "FirstName", oldValue: "Ada", newValue: "Grace" }),
      fix({ recordId: "school0:student0", field: "OEN", oldValue: "", newValue: "123456789", ruleId }),
    ], { label: "Identity review", origin: "manual" })).toThrow(/Resolve duplicate OENs in the source file/);
    expect(upload.schools[0].students[0].name.first).toBe("Ada");
    expect(upload.schools[0].students[0].oen).toBe("");
  });
  it("keeps a nested target stable when an earlier guardian is removed and restores the full group", () => {
    const upload = parseCanonicalXml(source);
    const [first, second] = upload.schools[0].students[0].guardians;
    const committed = commitChangeGroup(upload, [
      fix({ recordId: "school0:student0", targetId: first.guardianId, field: "Guardian", oldValue: "", newValue: "" }),
      fix({ recordId: "school0:student0", targetId: second.guardianId, field: "Guardian2Relationship", oldValue: "MOTHER", newValue: "PARENT" }),
    ], { label: "Coordinated guardian repair", origin: "manual", appliedAt: 10 });

    expect(upload.schools[0].students[0].guardians).toHaveLength(2);
    expect(committed.document.schools[0].students[0].guardians).toMatchObject([
      { guardianId: second.guardianId, relationship: "PARENT" },
    ]);

    const restored = undoChangeGroup(committed.document, committed.group);
    expect(restored.schools[0].students[0].guardians).toMatchObject([
      { guardianId: first.guardianId, name: { first: "First guardian" } },
      { guardianId: second.guardianId, relationship: "MOTHER" },
    ]);
  });

  it("rejects stale, duplicate, contradictory, and unsupported writes before mutation", () => {
    const upload = parseCanonicalXml(source);
    expect(() => commitChangeGroup(upload, [
      fix({ recordId: "school0:student0", field: "FirstName", oldValue: "Grace", newValue: "Ada" }),
    ], { label: "Stale", origin: "manual" })).toThrow(/Stale change/);
    expect(() => commitChangeGroup(upload, [
      fix({ recordId: "school0:student0", field: "FirstName", oldValue: "Ada", newValue: "Grace" }),
      fix({ recordId: "school0:student0", field: "FirstName", oldValue: "Ada", newValue: "Augusta" }),
    ], { label: "Contradiction", origin: "manual" })).toThrow(/contradictory writes/);
    expect(() => commitChangeGroup(upload, [
      fix({ recordId: "school0:student0", field: "Unknown", oldValue: "", newValue: "x" }),
    ], { label: "Unknown", origin: "manual" })).toThrow(/Unsupported editable field/);
    expect(upload.schools[0].students[0].name.first).toBe("Ada");
  });

  it("revalidation preserves the surviving guardian target through edit and undo", () => {
    const upload = parseCanonicalXml(source);
    const [first, second] = upload.schools[0].students[0].guardians;
    const removal = commitChangeGroup(upload, [fix({ recordId: "school0:student0", targetId: first.guardianId, field: "Guardian", oldValue: "", newValue: "" })], { label: "Remove first", origin: "automatic" });
    const madeInvalid = commitChangeGroup(removal.document, [fix({ recordId: "school0:student0", targetId: second.guardianId, field: "GuardianRelationship", oldValue: "MOTHER", newValue: "" })], { label: "Clear relationship", origin: "manual" });
    const finding = validateCanonicalUpload(madeInvalid.document).issues.find((issue) => issue.ruleId === "GUARDIAN_RELATIONSHIP_REQUIRED");
    expect(finding?.targetId).toBe(second.guardianId);
    const repaired = commitChangeGroup(madeInvalid.document, [fix({ recordId: finding!.recordId!, targetId: finding!.targetId, field: finding!.field!, oldValue: "", newValue: "PARENT" })], { label: "Repair survivor", origin: "manual" });
    const undoRepair = undoChangeGroup(repaired.document, repaired.group);
    const undoInvalid = undoChangeGroup(undoRepair, madeInvalid.group);
    const restored = undoChangeGroup(undoInvalid, removal.group);
    expect(restored.schools[0].students[0].guardians.map((guardian) => guardian.guardianId)).toEqual([first.guardianId, second.guardianId]);
  });

  it("recognizes the same guardian target after its ordinal changes", () => {
    const upload = parseCanonicalXml(source);
    const [first, second] = upload.schools[0].students[0].guardians;
    const firstEdit = commitChangeGroup(upload, [
      fix({ recordId: "school0:student0", targetId: second.guardianId, field: "Guardian2Relationship", oldValue: "MOTHER", newValue: "PARENT" }),
    ], { label: "Edit second guardian", origin: "manual" });
    const removal = commitChangeGroup(firstEdit.document, [
      fix({ recordId: "school0:student0", targetId: first.guardianId, field: "Guardian", oldValue: "", newValue: "" }),
    ], { label: "Remove first guardian", origin: "automatic" });
    const secondEdit = commitChangeGroup(removal.document, [
      fix({ recordId: "school0:student0", targetId: second.guardianId, field: "GuardianRelationship", oldValue: "PARENT", newValue: "OTHER" }),
    ], { label: "Edit surviving guardian", origin: "manual" });

    expect(reconcileChangeStatuses(secondEdit.document, [firstEdit.group, removal.group, secondEdit.group]).map((group) => group.status))
      .toEqual(["changed-again", "applied", "applied"]);
  });

  it("treats school edits as one shared target across student records", () => {
    const upload = parseCanonicalXml(source.replace("</Student>", "</Student><Student><Name><First>Grace</First><Last>Hopper</Last></Name></Student>"));
    expect(() => commitChangeGroup(upload, [
      fix({ recordId: "school0:student0", field: "SchoolName", oldValue: "School", newValue: "First choice" }),
      fix({ recordId: "school0:student1", field: "SchoolName", oldValue: "School", newValue: "Second choice" }),
    ], { label: "Conflicting school edit", origin: "manual" })).toThrow(/contradictory writes/);
    expect(upload.schools[0].name).toBe("School");
  });

  it("commits and undoes file and school setup through stable non-student targets", () => {
    const upload = parseCanonicalXml(source);
    const committed = commitChangeGroup(upload, [
      fix({ recordId: "metadata", field: "CreatedBy", oldValue: "", newValue: "Source exporter" }),
      fix({ recordId: upload.schools[0].schoolId, targetId: upload.schools[0].schoolId, field: "SchoolNumber", oldValue: "1", newValue: "123" }),
    ], { label: "File setup", origin: "setup", appliedAt: 20 });
    expect(committed.document.metadata.createdBy).toBe("Source exporter");
    expect(committed.document.schools[0].schoolNumber).toBe("123");
    const restored = undoChangeGroup(committed.document, committed.group);
    expect(restored.metadata.createdBy).toBe("");
    expect(restored.schools[0].schoolNumber).toBe("1");
  });

  it("re-enables an earlier bulk action after its overlapping later action is undone", () => {
    const upload = parseCanonicalXml(source);
    const first = commitChangeGroup(upload, [
      fix({ recordId: "school0:student0", field: "FirstName", oldValue: "Ada", newValue: "Augusta" }),
      fix({ recordId: "school0:student0", field: "LastName", oldValue: "Lovelace", newValue: "Byron" }),
    ], { label: "First review", origin: "manual", appliedAt: 10 });
    const secondChange = fix({ recordId: "school0:student0", field: "FirstName", oldValue: "Augusta", newValue: "Ada B." });
    const second = commitChangeGroup(first.document, [secondChange], { label: "Second review", origin: "manual", appliedAt: 20 });
    let history = reconcileChangeStatuses(second.document, [first.group, second.group]);
    expect(history.map((group) => group.status)).toEqual(["changed-again", "applied"]);

    const afterSecondUndo = undoChangeGroup(second.document, history[1]);
    history = reconcileChangeStatuses(afterSecondUndo, history.map((group, index) => index === 1 ? { ...group, status: "undone" as const } : group));
    expect(history.map((group) => group.status)).toEqual(["applied", "undone"]);
    expect(afterSecondUndo.schools[0].students[0].name).toEqual({ first: "Augusta", middle: "", last: "Byron" });

    const afterFirstUndo = undoChangeGroup(afterSecondUndo, history[0]);
    expect(afterFirstUndo.schools[0].students[0].name).toEqual({ first: "Ada", middle: "", last: "Lovelace" });
  });
});
