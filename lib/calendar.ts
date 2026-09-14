/**
 * Deterministic date-only interpretation for the supported workbook input.
 *
 * Source text never enters Date.parse and calendar parts never pass through a
 * timezone. SheetJS numeric date cells are decoded from their stored serial.
 */

export type DateConvention = "day-first" | "month-first";

export type DateClassification =
  | "canonical"
  | "day-first"
  | "month-first"
  | "ambiguous"
  | "same-day-month"
  | "invalid"
  | "typed-workbook-date"
  | "conflicting";

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** The date-cell shape created by excel.ts from the installed SheetJS API. */
export interface WorkbookDateCell {
  t: "n";
  v: number;
  z?: string;
  date1904: boolean;
  location?: string;
}

export interface DateInterpretation {
  classification: DateClassification;
  input: string | null;
  valid: boolean;
  date: CalendarDate | null;
  canonical: string | null;
  convention: DateConvention | null;
  candidates: Partial<Record<DateConvention, string>>;
  explanation: string;
  reason?: string;
  location?: string;
}

export interface DateFieldEntry {
  value: unknown;
  location?: string;
}

export interface DateEvidence {
  location: string;
  raw: unknown;
  input: string | null;
  classification: DateClassification;
  convention: DateConvention | null;
  canonical: string | null;
  valid: boolean;
  explanation: string;
}

export interface DateFieldAnalysisOptions {
  field?: string;
  sampleSize?: number;
  convention?: DateConvention;
}

export interface DateEvidenceCounts {
  canonical: number;
  "day-first": number;
  "month-first": number;
  ambiguous: number;
  "same-day-month": number;
  invalid: number;
  "typed-workbook-date": number;
  conflicting: number;
}

export interface DateFieldAnalysis {
  field?: string;
  classification: DateClassification;
  proposedConvention: DateConvention | null;
  conventionRequired: boolean;
  conflict: boolean;
  ready: boolean;
  totalPopulated: number;
  sampleSize: number;
  sampled: boolean;
  /** Counts inspect every populated value, even when the displayed sample is bounded. */
  evidenceCounts: DateEvidenceCounts;
  sample: DateEvidence[];
  explanation: string;
}

const EMPTY_COUNTS: DateEvidenceCounts = {
  canonical: 0,
  "day-first": 0,
  "month-first": 0,
  ambiguous: 0,
  "same-day-month": 0,
  invalid: 0,
  "typed-workbook-date": 0,
  conflicting: 0,
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  return Number.isInteger(year) && year >= 1 && year <= 9999
    && Number.isInteger(month) && month >= 1 && month <= 12
    && Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month);
}

function canonicalDate(date: CalendarDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function humanDate(date: CalendarDate): string {
  return `${date.day} ${MONTH_NAMES[date.month - 1]} ${date.year}`;
}

function ordinalOf(year: number, month: number, day: number): number {
  const y = year - 1;
  const beforeYear = 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400);
  const priorMonth = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][month - 1];
  return beforeYear + priorMonth + (month > 2 && isLeapYear(year) ? 1 : 0) + day;
}

function dateFromOrdinal(ordinal: number): CalendarDate | null {
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > ordinalOf(9999, 12, 31)) return null;
  let low = 1;
  let high = 9999;
  while (low <= high) {
    const year = Math.floor((low + high) / 2);
    const start = ordinalOf(year, 1, 1);
    const next = ordinalOf(year + 1, 1, 1);
    if (ordinal < start) high = year - 1;
    else if (ordinal >= next) low = year + 1;
    else {
      for (let month = 1; month <= 12; month++) {
        const monthStart = ordinalOf(year, month, 1);
        const nextMonth = month === 12 ? next : ordinalOf(year, month + 1, 1);
        if (ordinal >= monthStart && ordinal < nextMonth) {
          return { year, month, day: ordinal - monthStart + 1 };
        }
      }
    }
  }
  return null;
}

function serialDate(serial: number, date1904: boolean): { date: CalendarDate | null; reason?: string } {
  if (!Number.isFinite(serial) || serial < 0) {
    return { date: null, reason: "Workbook date serial must be a non-negative finite number." };
  }
  const whole = Math.floor(serial);
  const fraction = serial - whole;
  if (Math.abs(fraction) > 1e-9) {
    const totalSeconds = Math.round(fraction * 86_400);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const time = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    return { date: null, reason: `Workbook date contains an unexpected time component (${time}); it was not truncated.` };
  }
  if (!date1904 && whole === 60) {
    return { date: null, reason: "Workbook serial 60 is Excel's non-existent 1900-02-29 and cannot be imported." };
  }
  const epoch = date1904 ? ordinalOf(1904, 1, 1) : ordinalOf(1899, 12, 31);
  const ordinal = epoch + whole - (!date1904 && whole > 60 ? 1 : 0);
  const date = dateFromOrdinal(ordinal);
  return date
    ? { date }
    : { date: null, reason: "Workbook date serial is outside the supported Gregorian calendar." };
}

function isWorkbookDateCell(value: unknown): value is WorkbookDateCell {
  if (!value || typeof value !== "object") return false;
  const cell = value as Partial<WorkbookDateCell>;
  return cell.t === "n" && typeof cell.v === "number" && typeof cell.date1904 === "boolean";
}

function looksLikeDateFormat(format: unknown): boolean {
  if (typeof format !== "string") return false;
  const stripped = format.replace(/"(?:[^"]|"")*"/g, "").replace(/\[[^\]]*\]/g, "").toLowerCase();
  return /(^|[^a-z])[dy]+([^a-z]|$)/.test(stripped)
    || /m{1,5}[^a-z]*[\/-][^a-z]*d+|d+[^a-z]*[\/-][^a-z]*m{1,5}/.test(stripped);
}

function invalid(input: string | null, reason: string, location?: string): DateInterpretation {
  return {
    classification: "invalid",
    input,
    valid: false,
    date: null,
    canonical: null,
    convention: null,
    candidates: {},
    explanation: reason,
    reason,
    location,
  };
}

function interpretWorkbookDate(cell: WorkbookDateCell): DateInterpretation {
  if (!looksLikeDateFormat(cell.z)) {
    return invalid(String(cell.v), "Numeric workbook cells require an explicit date format before they can be interpreted as dates.", cell.location);
  }
  const decoded = serialDate(cell.v, cell.date1904);
  if (!decoded.date) return invalid(String(cell.v), decoded.reason ?? "Typed workbook date is invalid.", cell.location);
  const canonical = canonicalDate(decoded.date);
  return {
    classification: "typed-workbook-date",
    input: null,
    valid: true,
    date: decoded.date,
    canonical,
    convention: null,
    candidates: {},
    explanation: `Workbook stored this as a typed date (${humanDate(decoded.date)}); output is ${canonical}. Display formatting was not used to infer day or month order.`,
    location: cell.location,
  };
}

function interpreted(
  classification: DateClassification,
  input: string,
  date: CalendarDate,
  convention: DateConvention | null,
  candidates: Partial<Record<DateConvention, string>>,
  explanation: string,
): DateInterpretation {
  return {
    classification,
    input,
    valid: true,
    date,
    canonical: canonicalDate(date),
    convention,
    candidates,
    explanation,
  };
}

function interpretTextDate(text: string, convention?: DateConvention): DateInterpretation {
  const yearFirst = text.match(/^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/);
  if (yearFirst) {
    const date = { year: Number(yearFirst[1]), month: Number(yearFirst[3]), day: Number(yearFirst[4]) };
    if (!validCalendarDate(date.year, date.month, date.day)) {
      return invalid(text, `"${text}" is not a real Gregorian calendar date.`);
    }
    const canonical = canonicalDate(date);
    return interpreted("canonical", text, date, null, {}, `Year-first date ${text} is valid; canonical output is ${canonical}.`);
  }

  const numeric = text.match(/^(\d{1,2})([-/])(\d{1,2})\2(\d{4})$/);
  if (!numeric) {
    const reason = /^\d{1,2}[-/]\d{1,2}[-/]\d{2}$/.test(text)
      ? `"${text}" uses a two-digit year; use a four-digit year.`
      : `"${text}" is not a supported date-only value. Use YYYY-MM-DD, YYYY/M/D, or a four-digit numeric date with an explicit convention.`;
    return invalid(text, reason);
  }

  const first = Number(numeric[1]);
  const second = Number(numeric[3]);
  const year = Number(numeric[4]);
  const dayFirst = validCalendarDate(year, second, first) ? { year, month: second, day: first } : null;
  const monthFirst = validCalendarDate(year, first, second) ? { year, month: first, day: second } : null;
  const candidates: Partial<Record<DateConvention, string>> = {};
  if (dayFirst) candidates["day-first"] = canonicalDate(dayFirst);
  if (monthFirst) candidates["month-first"] = canonicalDate(monthFirst);

  if (convention) {
    const date = convention === "day-first" ? dayFirst : monthFirst;
    if (!date) return invalid(text, `"${text}" is not a valid ${convention === "day-first" ? "day/month/year" : "month/day/year"} date.`);
    const classification = first === second ? "same-day-month" : convention;
    return interpreted(classification, text, date, convention, candidates, `${text} -> ${humanDate(date)} -> ${canonicalDate(date)}.`);
  }
  if (dayFirst && monthFirst) {
    if (first === second) {
      return interpreted("same-day-month", text, dayFirst, null, candidates, `${text} means ${humanDate(dayFirst)} under either order; it is not evidence for day-first or month-first.`);
    }
    return {
      classification: "ambiguous",
      input: text,
      valid: false,
      date: null,
      canonical: null,
      convention: null,
      candidates,
      explanation: `${text} could mean ${humanDate(dayFirst)} (${canonicalDate(dayFirst)}) or ${humanDate(monthFirst)} (${canonicalDate(monthFirst)}); choose day-first or month-first before converting.`,
    };
  }
  if (dayFirst) {
    return interpreted("day-first", text, dayFirst, "day-first", candidates, `${text} can only mean ${humanDate(dayFirst)}; canonical output is ${canonicalDate(dayFirst)}.`);
  }
  if (monthFirst) {
    return interpreted("month-first", text, monthFirst, "month-first", candidates, `${text} can only mean ${humanDate(monthFirst)}; canonical output is ${canonicalDate(monthFirst)}.`);
  }
  return invalid(text, `"${text}" is not a real Gregorian calendar date.`);
}

export function interpretDate(value: unknown, options: { convention?: DateConvention } = {}): DateInterpretation {
  if (isWorkbookDateCell(value)) return interpretWorkbookDate(value);
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return invalid(typeof value === "string" ? value : null, "Date value is empty.");
  }
  if (typeof value !== "string") {
    return invalid(null, "Date value must be supported text or a numeric workbook date cell.");
  }
  return interpretTextDate(value.trim(), options.convention);
}

function normalizeEntry(entry: DateFieldEntry | unknown, index: number): { value: unknown; location: string } {
  if (isWorkbookDateCell(entry)) return { value: entry, location: entry.location ?? `entry ${index + 1}` };
  if (entry && typeof entry === "object" && "value" in entry) {
    const wrapped = entry as DateFieldEntry;
    return { value: wrapped.value, location: wrapped.location ?? `entry ${index + 1}` };
  }
  return { value: entry, location: `entry ${index + 1}` };
}

function evidence(value: unknown, location: string, convention?: DateConvention): DateEvidence {
  const result = interpretDate(value, { convention });
  return {
    location: result.location ?? location,
    raw: value,
    input: result.input,
    classification: result.classification,
    convention: result.convention,
    canonical: result.canonical,
    valid: result.valid,
    explanation: result.explanation,
  };
}

function spreadSample<T>(values: readonly T[], limit: number): T[] {
  if (values.length <= limit) return [...values];
  const result: T[] = [];
  for (let i = 0; i < limit; i++) {
    const index = limit === 1 ? 0 : Math.floor((i * (values.length - 1)) / (limit - 1));
    result.push(values[index]);
  }
  return result;
}

function classification(entries: DateEvidence[], conflict: boolean, proposed: DateConvention | null): DateClassification {
  if (conflict) return "conflicting";
  if (entries.some((entry) => !entry.valid)) return "invalid";
  const textEntries = entries.filter((entry) => entry.classification !== "typed-workbook-date");
  if (entries.length > 0 && textEntries.length === 0) return "typed-workbook-date";
  if (entries.some((entry) => entry.classification === "ambiguous") && !proposed) return "ambiguous";
  if (entries.some((entry) => entry.classification === "day-first") || proposed === "day-first") return "day-first";
  if (entries.some((entry) => entry.classification === "month-first") || proposed === "month-first") return "month-first";
  if (entries.some((entry) => entry.classification === "same-day-month")) return "same-day-month";
  return textEntries.length === 0 ? "typed-workbook-date" : "canonical";
}

/**
 * Analyze every populated value. Sampling only bounds the evidence displayed
 * by the setup UI; it never limits conflict or validity checks.
 */
export function analyzeDateField(
  entries: readonly (DateFieldEntry | unknown)[],
  options: DateFieldAnalysisOptions = {},
): DateFieldAnalysis {
  const normalized = entries.map(normalizeEntry).filter(({ value }) =>
    !(value === null || value === undefined || (typeof value === "string" && value.trim() === "")));
  const unconverted = normalized.map(({ value, location }) => evidence(value, location));
  const counts = { ...EMPTY_COUNTS };
  for (const entry of unconverted) counts[entry.classification]++;
  const dayEvidence = counts["day-first"] > 0;
  const monthEvidence = counts["month-first"] > 0;
  const conflict = dayEvidence && monthEvidence;
  const proposedConvention = conflict ? null : dayEvidence ? "day-first" : monthEvidence ? "month-first" : null;
  const converted = options.convention
    ? normalized.map(({ value, location }) => evidence(value, location, options.convention))
    : unconverted;
  const sampleLimit = Number.isFinite(options.sampleSize)
    ? Math.max(1, Math.min(200, Math.floor(options.sampleSize!)))
    : 200;
  const sample = spreadSample(normalized, sampleLimit).map(({ value, location }) => evidence(value, location, options.convention));
  const hasInvalid = converted.some((entry) => entry.classification === "invalid");
  const conventionRequired = !options.convention && (conflict || unconverted.some((entry) => entry.classification === "ambiguous"));
  const resultClassification = classification(converted, conflict, proposedConvention);

  let explanation: string;
  if (conflict) {
    const day = unconverted.find((entry) => entry.classification === "day-first");
    const month = unconverted.find((entry) => entry.classification === "month-first");
    explanation = `Conflicting date conventions in ${options.field ?? "this field"}: ${day?.input ?? "a day-first value"} at ${day?.location ?? "an unknown location"} is day-first evidence, while ${month?.input ?? "a month-first value"} at ${month?.location ?? "an unknown location"} is month-first evidence. Review those source values before bulk conversion.`;
  } else if (hasInvalid) {
    explanation = `At least one populated value in ${options.field ?? "this field"} is not a valid supported date; no replacement was fabricated.`;
  } else if (conventionRequired) {
    explanation = `Some values in ${options.field ?? "this field"} are ambiguous. Choose day-first or month-first before bulk conversion.`;
  } else if (proposedConvention) {
    explanation = `${options.field ?? "This field"} has consistent ${proposedConvention} evidence; canonical output is YYYY-MM-DD.`;
  } else if (resultClassification === "typed-workbook-date") {
    explanation = `${options.field ?? "This field"} contains typed workbook dates; stored calendar values were decoded without using display formatting.`;
  } else {
    explanation = `${options.field ?? "This field"} contains valid year-first dates; canonical output is YYYY-MM-DD.`;
  }

  return {
    field: options.field,
    classification: resultClassification,
    proposedConvention,
    conventionRequired,
    conflict,
    ready: !hasInvalid && !conflict && (!conventionRequired || Boolean(options.convention)),
    totalPopulated: normalized.length,
    sampleSize: sample.length,
    sampled: normalized.length > sample.length,
    evidenceCounts: counts,
    sample,
    explanation,
  };
}
