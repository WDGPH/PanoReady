import { expect, it } from "vitest";
import * as XLSX from "xlsx";
import { analyzeWorkbookDates, interpretWorkbookDate } from "../lib/workbookDates";
import { importWorkbook } from "../lib/excel";
const text = (v: string): XLSX.CellObject => ({ t: "s", v });

it("requires a choice for ambiguous text and leaves ISO and equal day/month dates unchanged", () => {
  expect(interpretWorkbookDate(text("03/04/2015")).problem).toBe("ambiguous");
  expect(interpretWorkbookDate(text("03/04/2015"), false, "day-first").value).toBe("2015-04-03");
  expect(interpretWorkbookDate(text("03/04/2015"), false, "month-first").value).toBe("2015-03-04");
  expect(interpretWorkbookDate(text("13/04/2015")).value).toBe("2015-04-13");
  expect(interpretWorkbookDate(text("13/04/2015"), false, "month-first").problem).toBe("invalid");
  expect(interpretWorkbookDate(text("2015/4/13"), false, "month-first").value).toBe("2015-04-13");
  expect(interpretWorkbookDate(text("04/04/2015")).value).toBe("2015-04-04");
});

it.each(["04/03/15", "31/04/2015", "2015-02-29", "2015-04-13T00:00:00Z", "42000"])("preserves invalid date %s", raw => {
  expect(interpretWorkbookDate(text(raw))).toEqual({ raw, problem: "invalid" });
});

it.each([
  [0, false, "1899-12-31"], [59, false, "1900-02-28"], [61, false, "1900-03-01"],
  [0, true, "1904-01-01"], [60, true, "1904-03-01"], [1462, false, "1904-01-01"],
] as const)("reads serial %s in date1904=%s from its stored value", (v, date1904, value) => {
  expect(interpretWorkbookDate({ t: "n", v, z: "dd/mm/yyyy", w: "misleading display" }, date1904, "month-first").value).toBe(value);
});

it.each([
  { t: "n", v: 60, z: "yyyy-mm-dd" }, { t: "n", v: 61.5, z: "yyyy-mm-dd" },
  { t: "n", v: -1, z: "yyyy-mm-dd" }, { t: "n", v: 2958466, z: "yyyy-mm-dd" },
  { t: "n", v: 61, z: "0" }, { t: "n", v: 61, z: '0 "days"' },
  { t: "n", v: 0, z: "hh:mm" }, { t: "n", v: 61, z: "yyyy-mm-dd", f: "A1+1" },
] satisfies XLSX.CellObject[])("rejects invalid, time-bearing, untyped and formula cells: %j", cell => {
  expect(interpretWorkbookDate(cell).problem).toBe("invalid");
});

it("checks conflicts beyond the preview and never lets a convention override them", () => {
  const cells = [...Array.from({ length: 201 }, () => text("13/04/2015")), text("04/13/2015"), text("2015-04-13")];
  for (const choice of [undefined, "day-first", "month-first"] as const) {
    const { dates, analysis } = analyzeWorkbookDates(cells, false, choice);
    expect(analysis).toMatchObject({ dayFirst: 201, monthFirst: 1, conflict: true });
    expect(analysis.sample).toHaveLength(5);
    expect(dates[0].problem).toBe("conflict");
    expect(dates[201].problem).toBe("conflict");
    expect(dates[202].value).toBe("2015-04-13");
  }
});

it("passes raw workbook dates, mapped columns and explicit conventions through import", () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([["First Name", "Last Name", "Source date"], ["Ada", "Example", "03/04/2015"], ["Ann", "Example", 60]]);
  sheet.C3.z = "dd/mm/yyyy";
  XLSX.utils.book_append_sheet(workbook, sheet, "Students");
  workbook.Workbook = { WBProps: { date1904: true } };
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsm" });
  const pending = importWorkbook(bytes, "dates.xlsm", undefined, { 3: "BirthDate" });
  expect(pending.preview.diagnostics.some(finding => finding.ruleId === "IMPORT_DATE_AMBIGUOUS")).toBe(true);
  const imported = importWorkbook(bytes, "dates.xlsm", undefined, { 3: "BirthDate" }, "day-first");
  expect(imported.upload.schools[0].students.map(student => student.birthDate)).toEqual(["2015-04-03", "1904-03-01"]);
  expect(imported.preview.diagnostics.filter(finding => finding.ruleId.startsWith("IMPORT_DATE"))).toEqual([]);
  expect(imported.preview.reconciled).toBe(true);
});
