import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  analyzeDateField,
  interpretDate,
  type DateClassification,
} from "../lib/calendar";

function classification(value: string, expected: DateClassification, canonical?: string | null) {
  const result = interpretDate(value);
  assert.equal(result.classification, expected);
  if (canonical !== undefined) assert.equal(result.canonical, canonical);
  return result;
}

describe("strict calendar interpretation", () => {
  test.each([
    ["2015-4-13", "2015-04-13"],
    ["2015/4/13", "2015-04-13"],
  ])("recognizes year-first %s", (value, canonical) => {
    const result = classification(value, "canonical", canonical);
    assert.equal(result.valid, true);
  });

  test.each([
    ["2015-02-30"],
    ["2015-04-31"],
    ["03/03/2015"],
    ["03/04/15"],
  ])("handles invalid or unsupported date %s", (value) => {
    const result = interpretDate(value);
    if (value === "03/03/2015") assert.equal(result.classification, "same-day-month");
    else assert.equal(result.classification, "invalid");
    if (value !== "03/03/2015") assert.equal(result.canonical, null);
  });

  test("accepts a leap day", () => {
    const result = classification("2016-02-29", "canonical", "2016-02-29");
    assert.equal(result.date?.day, 29);
  });

  test("identifies unique day-first and month-first text", () => {
    const dmy = classification("13/04/2015", "day-first", "2015-04-13");
    const mdy = classification("04/13/2015", "month-first", "2015-04-13");
    assert.match(dmy.explanation, /13 April 2015/);
    assert.match(mdy.explanation, /April 13, 2015|13 April 2015/);
  });

  test("does not guess ambiguous text", () => {
    const result = classification("03/04/2015", "ambiguous", null);
    assert.deepEqual(result.candidates, {
      "day-first": "2015-04-03",
      "month-first": "2015-03-04",
    });
    assert.match(result.explanation, /3 April 2015/);
    assert.match(result.explanation, /4 March 2015/);
    assert.equal(interpretDate("03/04/2015", { convention: "day-first" }).canonical, "2015-04-03");
    assert.equal(interpretDate("03/04/2015", { convention: "month-first" }).canonical, "2015-03-04");
  });

  test("same day/month is valid but not convention evidence", () => {
    const result = classification("04/04/2015", "same-day-month", "2015-04-04");
    assert.equal(result.convention, null);
    assert.match(result.explanation, /not evidence/);
  });

  test("typed workbook dates use stored values and reject unexpected time", () => {
    const typed = interpretDate({ t: "n", v: 42007, z: "m/d/yyyy", date1904: false });
    assert.equal(typed.classification, "typed-workbook-date");
    assert.equal(typed.canonical, "2015-01-03");
    const typedWithTime = interpretDate({ t: "n", v: 42007.5, z: "m/d/yyyy", date1904: false });
    assert.equal(typedWithTime.classification, "invalid");
    assert.match(typedWithTime.explanation, /unexpected time/);
    const differentDisplayFormat = interpretDate({ t: "n", v: 42007, z: "dd/mm/yyyy", date1904: false });
    assert.equal(differentDisplayFormat.classification, "typed-workbook-date");
    assert.equal(differentDisplayFormat.canonical, "2015-01-03");
  });

  test("decodes the 1904 workbook date system", () => {
    const typed = interpretDate({ t: "n", v: 0, z: "m/d/yyyy", date1904: true });
    assert.equal(typed.canonical, "1904-01-01");
    const fakeLeapDay = interpretDate({ t: "n", v: 60, z: "m/d/yyyy", date1904: false });
    assert.equal(fakeLeapDay.classification, "invalid");
    assert.match(fakeLeapDay.explanation, /non-existent/);
  });
});

describe("field evidence and full validation", () => {
  test("reports counts, locations, and a deterministic bounded sample", () => {
    const values = Array.from({ length: 250 }, (_, index) => ({
      value: index % 2 ? "13/04/2015" : "2015-04-13",
      location: `Students!${index + 2}`,
    }));
    const result = analyzeDateField(values, { field: "BirthDate" });
    assert.equal(result.totalPopulated, 250);
    assert.equal(result.sampleSize, 200);
    assert.equal(result.sampled, true);
    assert.equal(result.proposedConvention, "day-first");
    assert.equal(result.evidenceCounts["day-first"], 125);
    assert.equal(result.evidenceCounts.canonical, 125);
    assert.equal(result.sample.find((entry) => entry.classification === "day-first")?.location, "Students!3");
  });

  test("finds a month-first contradiction outside the suggestion sample", () => {
    const values = Array.from({ length: 250 }, (_, index) => ({
      value: index === 248 ? "04/13/2015" : index % 2 ? "13/04/2015" : "2015-04-13",
      location: `Students!${index + 2}`,
    }));
    const suggested = analyzeDateField(values, { field: "BirthDate" });
    assert.equal(suggested.sampleSize, 200);
    assert.equal(suggested.conflict, true);
    assert.equal(suggested.classification, "conflicting");
    assert.equal(suggested.ready, false);
    assert.equal(suggested.evidenceCounts["month-first"], 1);
    assert.match(suggested.explanation, /Students!250/);
    assert.match(suggested.explanation, /conflicting/i);
    const confirmed = analyzeDateField(values, { field: "BirthDate", convention: "day-first" });
    assert.equal(confirmed.conflict, true);
    assert.equal(confirmed.ready, false);
  });

  test("allows ISO mixed with consistent day-first text", () => {
    const result = analyzeDateField([
      { value: "2015-04-13", location: "A2" },
      { value: "13/04/2015", location: "A3" },
      { value: "04/04/2015", location: "A4" },
    ]);
    assert.equal(result.conflict, false);
    assert.equal(result.proposedConvention, "day-first");
    assert.equal(result.ready, true);
  });

  test("rejects an explicit convention that cannot interpret a populated value", () => {
    const result = analyzeDateField(["13/04/2015"], { convention: "month-first" });
    assert.equal(result.classification, "invalid");
    assert.equal(result.ready, false);
  });

  test("keeps the optional evidence sample bounded even at a one-cell limit", () => {
    const result = analyzeDateField(["2015-01-01", "2015-01-02"], { sampleSize: 1 });
    assert.equal(result.sampleSize, 1);
    assert.equal(result.sample[0].canonical, "2015-01-01");
  });
});
