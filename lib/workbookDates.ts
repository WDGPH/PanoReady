import { SSF, type CellObject } from "xlsx";
import { analyzeCalendarDate, validRealDate } from "./calendarDate";

export type DateConvention = "day-first" | "month-first";
export type WorkbookDate = { raw: string; value?: string; order?: DateConvention; problem?: "ambiguous" | "invalid" | "conflict" };
export type WorkbookDateAnalysis = {
  dayFirst: number;
  monthFirst: number;
  ambiguous: number;
  invalid: number;
  conflict: boolean;
  sample: WorkbookDate[];
};
const yearLast = /^(\d{1,2})([-/])(\d{1,2})\2(\d{4})$/;
const iso = (year: number, month: number, day: number) => `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** Read stored values; formatted display text never chooses a calendar interpretation. */
export function interpretWorkbookDate(cell: CellObject | undefined, date1904 = false, convention?: DateConvention): WorkbookDate {
  const raw = String(cell?.v ?? "").trim();
  if (cell?.f) return { raw, problem: "invalid" };
  if (!raw) return { raw, value: "" };
  if (cell?.t === "n") {
    const serial = cell.v;
    const format = (typeof cell.z === "string" ? cell.z : "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
    if (typeof serial !== "number" || !Number.isInteger(serial) || serial < 0
      || !SSF.is_date(format) || !/[dy]/i.test(format) || (!date1904 && serial === 60)) {
      return { raw, problem: "invalid" };
    }
    const date = SSF.parse_date_code(serial, { date1904 });
    const value = !date1904 && serial === 0 ? "1899-12-31" : date && iso(date.y, date.m, date.d);
    return value && validRealDate(value) ? { raw, value } : { raw, problem: "invalid" };
  }
  if (cell?.t !== "s") return { raw, problem: "invalid" };
  const parts = yearLast.exec(raw);
  if (parts) {
    const [, first, , second, year] = parts;
    const dayFirst = iso(+year, +second, +first);
    const monthFirst = iso(+year, +first, +second);
    const dayValid = validRealDate(dayFirst);
    const monthValid = validRealDate(monthFirst);
    const order = dayValid && !monthValid ? "day-first" : monthValid && !dayValid ? "month-first" : undefined;
    if (convention) {
      const value = convention === "day-first" ? dayFirst : monthFirst;
      return validRealDate(value) ? { raw, value, order } : { raw, order, problem: "invalid" };
    }
    if (dayValid && monthValid && dayFirst !== monthFirst) return { raw, problem: "ambiguous" };
    if (dayValid || monthValid) return { raw, value: dayValid ? dayFirst : monthFirst, order };
    return { raw, problem: "invalid" };
  }
  const date = analyzeCalendarDate(raw);
  return date.status === "valid" || date.status === "normalizable" ? { raw, value: date.value } : { raw, problem: "invalid" };
}

/** Inspect every populated date for conflicting evidence, independently of the chosen order. */
export function analyzeWorkbookDates(cells: (CellObject | undefined)[], date1904 = false, convention?: DateConvention): { dates: WorkbookDate[]; analysis: WorkbookDateAnalysis } {
  const evidence = cells.map(cell => interpretWorkbookDate(cell, date1904));
  const dayFirst = evidence.filter(date => date.order === "day-first").length;
  const monthFirst = evidence.filter(date => date.order === "month-first").length;
  const conflict = dayFirst > 0 && monthFirst > 0;
  const dates = cells.map((cell, index): WorkbookDate => conflict && yearLast.test(evidence[index].raw)
    ? { raw: evidence[index].raw, problem: "conflict" }
    : interpretWorkbookDate(cell, date1904, convention));
  return { dates, analysis: {
    dayFirst, monthFirst, conflict,
    ambiguous: evidence.filter(date => date.problem === "ambiguous").length,
    invalid: dates.filter(date => date.problem === "invalid").length,
    sample: dates.filter(date => date.raw).slice(0, 5),
  } };
}
