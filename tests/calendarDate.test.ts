import { expect, it } from "vitest";
import * as XLSX from "xlsx";
import { ageOnDate, analyzeCalendarDate, validRealDate } from "../lib/calendarDate";
import { importWorkbook } from "../lib/excel";
import { applyValidationFixes, generateAgeGroupReportCsv, validateXml } from "../lib/validator";

it.each([
  ["2016-02-29", "2016-02-29"], ["2015/4/13", "2015-04-13"],
  ["13/04/2015", "2015-04-13"], ["04-13-2015", "2015-04-13"],
  ["04/04/2015", "2015-04-04"], [" 2015-4-3 ", "2015-04-03"],
])("standardizes unambiguous calendar date %s", (raw, value) => {
  expect(analyzeCalendarDate(raw)).toEqual({ status: raw === value ? "valid" : "normalizable", value });
});

it.each(["2015-02-29", "1900-02-29", "2015/4/31", "31/04/2015", "13/13/2015", "00/04/2015",
  "0000-01-01", "2015-01/02", "04/13/15", "April 13, 2015", "42000", "2015-04-13T23:00:00-05:00", ""])("rejects invalid or unsupported date %s", raw => {
  expect(analyzeCalendarDate(raw).status).toBe("invalid");
});

it("validates leap centuries without the JavaScript year 0–99 offset", () => {
  expect(validRealDate("2000-02-29")).toBe(true);
  expect(validRealDate("0096-02-29")).toBe(true);
  expect(validRealDate("2100-02-29")).toBe(false);
});

const xml = (date: string) => `<SchoolUpload xmlns="http://ontario.ca"><School><SchoolNumber>123</SchoolNumber><Students><Student><Name><First>Ada</First><Last>Example</Last></Name><BirthDate>${date}</BirthDate></Student></Students></School></SchoolUpload>`;

it.each(["03/04/2015", "2015-02-29", "April 13, 2015"])("preserves unresolved %s in both XML and workbook paths", raw => {
  const issue = validateXml(xml(raw)).issues.find(i => i.ruleId === "BIRTHDATE_FORMAT")!;
  expect(issue.autoFixable).toBe(false);
  expect(issue.suggestedFix).toBeUndefined();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["First Name", "Last Name", "DOB"], ["Ada", "Example", raw],
  ]), "Students");
  const imported = importWorkbook(XLSX.write(workbook, { type: "array", bookType: "xlsx" }), "dates.xlsx");
  expect(imported.upload.schools[0].students[0].birthDate).toBe(raw);
  expect(imported.preview.diagnostics.some(i => i.ruleId === (raw === "03/04/2015" ? "IMPORT_DATE_AMBIGUOUS" : "IMPORT_DATE_INVALID"))).toBe(true);
});

it("applies a safe XML date correction and revalidates it", () => {
  const source = xml("13/04/2015");
  const issue = validateXml(source).issues.find(i => i.ruleId === "BIRTHDATE_FORMAT")!;
  expect(issue.suggestedFix).toBe("2015-04-13");
  expect(issue.autoFixable).toBe(true);
  const fixed = applyValidationFixes(source, [{ issueId: issue.id, recordId: issue.recordId!, field: "BirthDate",
    oldValue: "13/04/2015", newValue: issue.suggestedFix!, ruleId: issue.ruleId, appliedAt: 0 }]);
  expect(validateXml(fixed).issues.some(i => i.ruleId.startsWith("BIRTHDATE"))).toBe(false);
});

it("does not offer a future date as an automatic correction", () => {
  const issues = validateXml(xml("9999/1/13")).issues;
  expect(issues.find(i => i.ruleId === "BIRTHDATE_FORMAT")?.autoFixable).toBe(false);
  expect(issues.some(i => i.ruleId === "BIRTHDATE_FUTURE")).toBe(true);
});

it("excludes unresolved and impossible birth dates from age counts", () => {
  const records = ["2015-02-29", "03/04/2015", "2015-04-13"].flatMap(date => validateXml(xml(date)).records);
  expect(generateAgeGroupReportCsv(records, [[0, null]])).toBe("bucket,count\n0+,1");
});

it("computes age at calendar boundaries and rejects unresolved dates", () => {
  expect(ageOnDate("2015-04-13", "2026-04-12")).toBe(10);
  expect(ageOnDate("2015-04-13", "2026-04-13")).toBe(11);
  expect(ageOnDate("2016-02-29", "2026-02-28")).toBe(9);
  expect(ageOnDate("2016-02-29", "2026-03-01")).toBe(10);
  for (const value of ["03/04/2015", "2015-02-29", "9999-01-01"]) {
    expect(ageOnDate(value, "2026-04-13")).toBeNull();
  }
});
