import assert from "node:assert/strict";
import { test } from "vitest";
import { compareSTIXFiles } from "../lib/compare";

const metadata = "<Metadata><CreateDate>2026-09-12</CreateDate><CreateTime>12:00:00</CreateTime><CreatedBy>Test</CreatedBy><ContactEmail>test@example.invalid</ContactEmail><FullUpload>YES</FullUpload></Metadata>";
function student(oen: string, first: string, grade = "GR5") {
  return `<Student><OEN>${oen}</OEN><Grade>${grade}</Grade><Name><First>${first}</First><Last>Test</Last></Name><Gender>F</Gender><BirthDate>2015-04-13</BirthDate></Student>`;
}
function file(schools: Array<{ number: string; name: string; students: string[] }>) {
  return `<SchoolUpload xmlns="http://ontario.ca">${metadata}${schools.map((school) => `<School><SchoolNumber>${school.number}</SchoolNumber><Name>${school.name}</Name><Students>${school.students.join("")}</Students></School>`).join("")}</SchoolUpload>`;
}

test("repeated OEN occurrences remain ambiguous under source permutations", () => {
  const prior = file([{ number: "A", name: "A", students: [student("123456789", "Ada")] }, { number: "B", name: "B", students: [student("123456789", "Bea"), student("123456789", "Cia")] }]);
  for (const order of [["Ada", "Bea", "Cia"], ["Cia", "Ada", "Bea"]]) {
    const current = file([{ number: "A", name: "A", students: [student("123456789", order[0], "GR6")] }, { number: "B", name: "B", students: [student("123456789", order[1]), student("123456789", order[2])] }]);
    const result = compareSTIXFiles(prior, current, "before.xml", "after.xml");
    assert.equal(result.matchedCount, 0);
    assert.equal(result.changedCount, 0);
    assert.equal(result.addedCount, 0);
    assert.equal(result.removedCount, 0);
    assert.equal(result.ambiguousCount, 6);
    assert.equal(result.changeRate, 0);
    assert.ok(result.schoolChanges.every((school) => school.added === 0 && school.removed === 0));
    assert.ok(result.recordChanges.every((record) => record.matchStatus === "ambiguous"));
  }
});

test("a school name change with the same school number is not reported as a transfer", () => {
  const prior = file([{ number: "123", name: "Old name", students: [student("123456789", "Ada")] }]);
  const current = file([{ number: "123", name: "New name", students: [student("123456789", "Ada")] }]);
  const result = compareSTIXFiles(prior, current, "before.xml", "after.xml");
  assert.equal(result.movedCount, 0);
  assert.equal(result.schoolTransfers.length, 0);
});

test("fallback does not override conflicting populated OENs or match on school alone", () => {
  const prior = file([{ number: "123", name: "School", students: [student("111111111", "Ada")] }]);
  const changedOen = file([{ number: "123", name: "School", students: [student("222222222", "Ada")] }]);
  assert.equal(compareSTIXFiles(prior, changedOen, "a.xml", "b.xml").matchedCount, 0);
  const unidentifiedPrior = file([{ number: "123", name: "School", students: [student("", "", "")] }]);
  const unidentifiedCurrent = file([{ number: "123", name: "School", students: [student("", "", "GR1")] }]);
  assert.equal(compareSTIXFiles(unidentifiedPrior, unidentifiedCurrent, "a.xml", "b.xml").matchedCount, 0);
});

test("schools with missing numbers and duplicate names remain distinct scoped targets", () => {
  const current = file([
    { number: "", name: "Same", students: [student("111111111", "Ada")] },
    { number: "", name: "Same", students: [student("222222222", "Bea")] },
  ]);
  const result = compareSTIXFiles(current, current, "a.xml", "b.xml");
  assert.equal(result.currentSchoolCount, 2);
  const currentSchools = result.schoolChanges.filter((school) => school.currentCount > 0);
  assert.equal(currentSchools.length, 2);
  assert.equal(new Set(currentSchools.map((school) => school.schoolId)).size, 2);
});
