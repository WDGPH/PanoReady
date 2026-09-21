import { describe, expect, it } from "vitest";
import { analyzePhoneNumber, isActiveCanadianGeographicNpa } from "../lib/phoneNumber";

describe("analyzePhoneNumber", () => {
  it.each(["204-555-0100", "416-555-0101", "867-555-0102"])(
    "accepts structurally valid canonical NANP number %s",
    (raw) => expect(analyzePhoneNumber(raw)).toMatchObject({ status: "valid", value: raw })
  );

  it.each([
    ["2045550100", "204-555-0100"],
    ["(204) 555-0100", "204-555-0100"],
    ["+1 204 555 0100", "204-555-0100"],
    ["1-204-555-0100", "204-555-0100"],
    [" 204-555-0100 ", "204-555-0100"],
  ])("normalizes supported formatting in %s", (raw, value) => {
    expect(analyzePhoneNumber(raw)).toEqual({
      status: "normalized",
      value,
      baseValue: value,
      npa: "204",
      nxx: "555",
    });
  });

  it.each([
    ["019-555-0100", "invalid-npa", "019"],
    ["119-555-0100", "invalid-npa", "119"],
    ["204-055-0100", "invalid-nxx", "055"],
    ["204-155-0100", "invalid-nxx", "155"],
  ])("rejects %s for %s", (raw, reason, invalidPart) => {
    expect(analyzePhoneNumber(raw)).toMatchObject({
      status: "invalid",
      reason,
      ...(reason === "invalid-npa" ? { npa: invalidPart } : { nxx: invalidPart }),
    });
  });

  it.each([
    ["204-555-010", "too-few-digits"],
    ["204-555-01000", "too-many-digits"],
    ["204-555-0100 / 416-555-0101", "multiple-numbers"],
    ["204-555-0100 call office", "appended-text"],
  ])("rejects uninterpretable input %s", (raw, reason) => {
    expect(analyzePhoneNumber(raw)).toMatchObject({ status: "invalid", reason });
  });

  it.each([
    "204-555-0100x1",
    "204-555-0100x12345",
  ])("accepts canonical extension syntax in %s", (raw) => {
    expect(analyzePhoneNumber(raw)).toMatchObject({
      status: "valid",
      value: raw,
      baseValue: "204-555-0100",
      extension: raw.split("x")[1],
    });
  });

  it.each([
    ["204-555-0100X12", "204-555-0100x12", "12"],
    ["204-555-0100 x 12", "204-555-0100x12", "12"],
    ["204-555-0100 ext 12", "204-555-0100x12", "12"],
    ["204-555-0100 ext. 12", "204-555-0100x12", "12"],
    ["204-555-0100 extension 12", "204-555-0100x12", "12"],
    ["204-555-0100 #12", "204-555-0100x12", "12"],
    ["+1 (204) 555-0100 ext. 12", "204-555-0100x12", "12"],
    ["204-555-0100 #12345", "204-555-0100x12345", "12345"],
  ])("normalizes common extension variant %s", (raw, value, extension) => {
    expect(analyzePhoneNumber(raw)).toMatchObject({
      status: "normalized",
      value,
      baseValue: "204-555-0100",
      extension,
    });
  });

  it.each([
    ["204-555-0100x", "extension-missing"],
    ["204-555-0100 ext.", "extension-missing"],
    ["204-555-0100x123456", "extension-too-long"],
    ["204-555-0100 ext ABC", "extension-invalid"],
    ["204-555-0100x12A", "extension-invalid"],
    ["204-555-0100x12x34", "extension-invalid"],
  ])("requires manual correction for extension input %s", (raw, reason) => {
    expect(analyzePhoneNumber(raw)).toMatchObject({ status: "invalid", reason });
  });
});

describe("isActiveCanadianGeographicNpa", () => {
  it.each(["204", "257", "382", "519", "879", "942"])(
    "recognizes active Canadian geographic NPA %s",
    (npa) => expect(isActiveCanadianGeographicNpa(npa)).toBe(true)
  );

  it.each(["212", "273", "600", "851"])(
    "does not treat non-Canadian, future, or non-geographic NPA %s as active geographic",
    (npa) => expect(isActiveCanadianGeographicNpa(npa)).toBe(false)
  );
});
