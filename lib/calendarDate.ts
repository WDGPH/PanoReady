/** Calendar dates only: never infer locale, roll invalid days, or shift time zones. */
export function validRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export type CalendarDateAnalysis =
  | { status: "valid" | "normalizable"; value: string }
  | { status: "ambiguous" | "invalid" };

export function analyzeCalendarDate(raw: string): CalendarDateAnalysis {
  const value = raw.trim();
  const yearFirst = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})$/.exec(value);
  const yearLast = /^(\d{1,2})([-/])(\d{1,2})\2(\d{4})$/.exec(value);
  let year: string, month: string, day: string;
  if (yearFirst) {
    [, year, , month, day] = yearFirst;
  } else if (yearLast) {
    const [, first, , second, last] = yearLast;
    if (+first >= 1 && +first <= 12 && +second >= 1 && +second <= 12 && first.padStart(2, "0") !== second.padStart(2, "0")) {
      return { status: "ambiguous" };
    }
    year = last;
    [month, day] = +first > 12 ? [second, first] : [first, second];
  } else {
    return { status: "invalid" };
  }
  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  if (!validRealDate(normalized)) return { status: "invalid" };
  return { status: normalized === raw ? "valid" : "normalizable", value: normalized };
}

/** Age calculations consume confirmed ISO dates, not normalization candidates. */
export function ageOnDate(birthDate: string, referenceDate: string): number | null {
  if (!validRealDate(birthDate) || !validRealDate(referenceDate)) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  const [referenceYear, referenceMonth, referenceDay] = referenceDate.split("-").map(Number);
  let age = referenceYear - year;
  if (referenceMonth < month || (referenceMonth === month && referenceDay < day)) age--;
  return age < 0 ? null : age;
}
