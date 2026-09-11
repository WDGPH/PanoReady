import { describe, expect, it } from "vitest";
import { applyCleaningProfile, getCleanableFields } from "../lib/cleaning";
import { parseSTIXXml } from "../lib/validator";

const xml = `<SchoolUpload xmlns="http://ontario.ca"><School><SchoolNumber>123456</SchoolNumber><Name>Synthetic School</Name><Students><Student><OEN>100000001</OEN><Name><First>Test</First><Last>Student</Last></Name><Grade>Grade 5</Grade><Gender>Other</Gender><BirthDate>2015-01-01</BirthDate></Student></Students></School></SchoolUpload>`;

describe("pre-validation cleaning", () => {
  it("allows controlled-vocabulary fields to be cleaned before they are checked", () => {
    expect(getCleanableFields()).toEqual(expect.arrayContaining(["Grade", "Gender", "Province", "Language"]));
    const source = parseSTIXXml(xml);
    const cleaned = applyCleaningProfile(source, { enabledFields: ["Grade"], mappings: { Grade: [{ raw: "grade 5", canonical: "GR5" }] } });
    expect(cleaned.records[0].fields.Grade).toBe("GR5");
    expect(source[0].fields.Grade).toBe("Grade 5");
    expect(cleaned.summary[0].count).toBe(1);
  });

  it("uses whole-value, first-match replacements without cascading or regex", () => {
    const source = parseSTIXXml(xml);
    const cleaned = applyCleaningProfile(source, { enabledFields: ["Grade"], mappings: { Grade: [
      { raw: "Grade.*", canonical: "REGEX" },
      { raw: "Grade", canonical: "PARTIAL" },
      { raw: "grade 5", canonical: "CASE", matchCase: true },
      { raw: "grade 5", canonical: "GR5" },
      { raw: "GR5", canonical: "CASCADE" },
    ] } });
    expect(cleaned.records[0].fields.Grade).toBe("GR5");
    expect(cleaned.summary.map((entry) => entry.count)).toEqual([0, 0, 0, 1, 0]);
  });

  it("does not report unchanged values as cleaning changes", () => {
    const source = parseSTIXXml(xml);
    const cleaned = applyCleaningProfile(source, { enabledFields: ["Grade"], mappings: { Grade: [
      { raw: "Grade 5", canonical: "Grade 5" },
      { raw: "Grade 5", canonical: "GR5" },
    ] } });
    expect(cleaned.records[0]).toBe(source[0]);
    expect(cleaned.summary.map((entry) => entry.count)).toEqual([0, 0]);
  });
});
