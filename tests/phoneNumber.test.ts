import { describe, expect, it } from "vitest";
import { analyzePhoneNumber, isActiveCanadianGeographicNpa } from "../lib/phoneNumber";

describe("analyzePhoneNumber", () => {
  it.each(["519-824-1234", "416-555-6789", "867-920-1234"])(
    "accepts structurally valid canonical NANP number %s",
    (raw) => expect(analyzePhoneNumber(raw)).toMatchObject({ status: "valid", value: raw })
  );

  it.each([
    ["5198241234", "519-824-1234"],
    ["(519) 824-1234", "519-824-1234"],
    ["+1 519 824 1234", "519-824-1234"],
    ["1-519-824-1234", "519-824-1234"],
    [" 519-824-1234 ", "519-824-1234"],
  ])("normalizes supported formatting in %s", (raw, value) => {
    expect(analyzePhoneNumber(raw)).toEqual({
      status: "normalized",
      value,
      baseValue: value,
      npa: "519",
      nxx: "824",
    });
  });

  it.each([
    ["019-824-1234", "invalid-npa", "019"],
    ["119-824-1234", "invalid-npa", "119"],
    ["519-024-1234", "invalid-nxx", "024"],
    ["519-124-1234", "invalid-nxx", "124"],
  ])("rejects %s for %s", (raw, reason, invalidPart) => {
    expect(analyzePhoneNumber(raw)).toMatchObject({
      status: "invalid",
      reason,
      ...(reason === "invalid-npa" ? { npa: invalidPart } : { nxx: invalidPart }),
    });
  });

  it.each([
    ["519-824-123", "too-few-digits"],
    ["519-824-12345", "too-many-digits"],
    ["519-824-1234 / 416-555-1234", "multiple-numbers"],
    ["519-824-1234 call office", "appended-text"],
  ])("rejects uninterpretable input %s", (raw, reason) => {
    expect(analyzePhoneNumber(raw)).toMatchObject({ status: "invalid", reason });
  });

  it.each([
    "519-824-1234x1",
    "519-824-1234x12345",
  ])("accepts canonical extension syntax in %s", (raw) => {
    expect(analyzePhoneNumber(raw)).toMatchObject({
      status: "valid",
      value: raw,
      baseValue: "519-824-1234",
      extension: raw.split("x")[1],
    });
  });

  it.each([
    ["519-824-1234X12", "519-824-1234x12", "12"],
    ["519-824-1234 x 12", "519-824-1234x12", "12"],
    ["519-824-1234 ext 12", "519-824-1234x12", "12"],
    ["519-824-1234 ext. 12", "519-824-1234x12", "12"],
    ["519-824-1234 extension 12", "519-824-1234x12", "12"],
    ["519-824-1234 #12", "519-824-1234x12", "12"],
    ["+1 (519) 824-1234 ext. 12", "519-824-1234x12", "12"],
    ["519-824-1234 #12345", "519-824-1234x12345", "12345"],
  ])("normalizes common extension variant %s", (raw, value, extension) => {
    expect(analyzePhoneNumber(raw)).toMatchObject({
      status: "normalized",
      value,
      baseValue: "519-824-1234",
      extension,
    });
  });

  it.each([
    ["519-824-1234x", "extension-missing"],
    ["519-824-1234 ext.", "extension-missing"],
    ["519-824-1234x123456", "extension-too-long"],
    ["519-824-1234 ext ABC", "extension-invalid"],
    ["519-824-1234x12A", "extension-invalid"],
    ["519-824-1234x12x34", "extension-invalid"],
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
