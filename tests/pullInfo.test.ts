import assert from "node:assert/strict";
import { test } from "vitest";
import { birthYearFromDate, studentFromRecord } from "../lib/pullInfo";

test("birthYearFromDate returns the year for valid canonical dates", () => {
  assert.equal(birthYearFromDate("2012-02-29"), 2012);
  assert.equal(birthYearFromDate("2026-09-10"), 2026);
});

test("birthYearFromDate rejects missing, non-canonical, and impossible dates", () => {
  assert.equal(birthYearFromDate(""), null);
  assert.equal(birthYearFromDate("2012/02/29"), null);
  assert.equal(birthYearFromDate("2013-02-29"), null);
  assert.equal(birthYearFromDate("2012-13-01"), null);
});

test("studentFromRecord preserves student columns and adds the derived birth year", () => {
  const student = studentFromRecord({
    id: "student-1",
    xmlPath: "/SchoolUpload/School[1]/Students/Student[1]",
    fields: {
      SchoolName: "Example School",
      FirstName: "Ada",
      LastName: "Lovelace",
      BirthDate: "2012-02-29",
    },
  });

  assert.equal(student.SchoolName, "Example School");
  assert.equal(student.FirstName, "Ada");
  assert.equal(student.LastName, "Lovelace");
  assert.equal(student.BirthYear, 2012);
});
