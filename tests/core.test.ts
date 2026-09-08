import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { applyCleaningProfile } from "../lib/cleaning";
import { compareStixFiles } from "../lib/compare";
import { xlsmToStixXml } from "../lib/excel";
import { processExport } from "../lib/pullInfo";
import { defaultRules, validateRulesetSchema } from "../lib/rulesets";
import { applyValidationFixes, parseStixXml, validateXml } from "../lib/validator";
import { toCsv } from "../lib/utils";

// Invented records, generated here so no operational source file is needed.
const student = (oen = "000000001", grade = "GR7") => `<ns1:Student><ns1:OEN>${oen}</ns1:OEN><ns1:Name><ns1:First>Example</ns1:First><ns1:Last>Student</ns1:Last></ns1:Name><ns1:BirthDate>2013-06-15</ns1:BirthDate><ns1:Grade>${grade}</ns1:Grade></ns1:Student>`;
const xml = (students = student(), name = "Synthetic School") => `<ns1:SchoolUpload xmlns:ns1="urn:synthetic-stix"><ns1:School><ns1:Name>${name}</ns1:Name><ns1:SchoolNumber>000001</ns1:SchoolNumber><ns1:Students>${students}</ns1:Students></ns1:School></ns1:SchoolUpload>`;

test("valid records pass configured validation and retain leading-zero identifiers", () => {
  const result = validateXml(xml());
  assert.equal(result.gate, "READY");
  assert.equal(result.studentCount, 1);
  assert.equal(result.records[0].fields.OEN, "000000001");
});

test("missing structure and duplicate OENs block validation", () => {
  assert.equal(validateXml("<other/>").gate, "BLOCKED");
  const result = validateXml(xml(student() + student()));
  assert.equal(result.gate, "BLOCKED");
  assert.ok(result.issues.some((issue) => issue.ruleId === "OEN_DUPLICATE"));
});

test("a reviewed grade correction is written and clears its validation error", () => {
  const source = xml(student("000000001", "INVALID"));
  const before = validateXml(source);
  const issue = before.issues.find((item) => item.ruleId === "GRADE_ALLOWED_VALUE")!;
  assert.ok(issue);
  const output = applyValidationFixes(source, [{ issueId: issue.id, recordId: issue.recordId!, field: "Grade", oldValue: "INVALID", newValue: "GR7", ruleId: issue.ruleId, appliedAt: 0 }]);
  const after = validateXml(output);
  assert.equal(after.gate, "READY");
  assert.equal(after.records[0].fields.Grade, "GR7");
  assert.equal(after.records[0].fields.OEN, before.records[0].fields.OEN);
});

test("cleaning uses the first match without mutating source records", () => {
  const records = parseStixXml(xml());
  const result = applyCleaningProfile(records, { enabledFields: ["FirstName"], mappings: { FirstName: [{ raw: "example", canonical: "Reviewed" }, { raw: "Example", canonical: "Wrong" }] } });
  assert.equal(result.records[0].fields.FirstName, "Reviewed");
  assert.equal(records[0].fields.FirstName, "Example");
  assert.deepEqual(result.summary.map((entry) => entry.count), [1, 0]);
});

test("report filters and aggregation count the intended cohort", () => {
  const result = processExport(xml(student() + student("000000002", "GR9")));
  assert.equal(result.allStudents.length, 2);
  assert.equal(result.filteredStudents.length, 1);
  assert.deepEqual(result.schoolCounts, [{ SchoolName: "Synthetic School", BirthYear: 2013, StudentCount: 2 }]);
  assert.equal(result.gradeCounts.reduce((total, row) => total + row.GradeCount, 0), 2);
});

test("comparison tracks OEN-matched transfers and additions", () => {
  const result = compareStixFiles(xml(), xml(student() + student("000000002"), "New Synthetic School"), "before.xml", "after.xml");
  assert.equal(result.matchedCount, 1);
  assert.equal(result.addedCount, 1);
  assert.equal(result.removedCount, 0);
  assert.equal(result.movedCount, 1);
  assert.equal(result.schoolTransfers[0].count, 1);
  assert.equal(compareStixFiles(xml(), xml(), "a", "b").unchangedCount, 1);
});

test("invalid rulesets fail with an actionable schema error", () => {
  assert.throws(() => validateRulesetSchema(null), /JSON object/);
  assert.throws(() => validateRulesetSchema({ id: "test", name: "Test", createdAt: "2026-01-01", rules: { ...defaultRules, postalCodePattern: "[" } }), /regular expression/);
});

test("CSV escapes commas, quotes, and line breaks", () => {
  assert.equal(toCsv([{ name: 'Example, "Student"', note: "line1\nline2" }]), 'name,note\n"Example, ""Student""","line1\nline2"');
  assert.equal(toCsv([]), "");
});

test("synthetic workbook converts to readable XML without executing macros", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["OEN", "Grade", "First Name", "Last Name", "Birthdate"],
    ["000000001", "GR7", "Example & Test", "Student", "2013-06-15"],
  ]), "Student Info");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsm" });
  const converted = xlsmToStixXml(buffer, "synthetic.xlsm", { schoolName: "Synthetic School", schoolNumber: "000001" });
  const records = parseStixXml(converted);
  assert.equal(records.length, 1);
  assert.equal(records[0].fields.FirstName, "Example & Test");
  assert.equal(records[0].fields.OEN, "000000001");
});
