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
    ["519-824-1234 ext 2", "appended-text"],
  ])("rejects uninterpretable input %s", (raw, reason) => {
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
