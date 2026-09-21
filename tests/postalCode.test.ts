import { describe, expect, it } from "vitest";
import { normalizeCanadianPostalCode } from "../lib/postalCode";

describe("normalizeCanadianPostalCode", () => {
  it.each(["H0H0H0", "A1A1A1", "B2B2B2", "C3C3C3"])(
    "accepts canonical Canadian postal code %s",
    (raw) => {
      expect(normalizeCanadianPostalCode(raw)).toEqual({ status: "valid", value: raw });
    }
  );

  it.each([
    ["h0h0h0", "H0H0H0"],
    [" H0H0H0 ", "H0H0H0"],
    ["H0H 0H0", "H0H0H0"],
    ["H0H   0H0", "H0H0H0"],
    ["H0H-0H0", "H0H0H0"],
    ["H0H–0H0", "H0H0H0"],
    ["H0H—0H0", "H0H0H0"],
    ["H0H/0H0", "H0H0H0"],
    ["H0H\\0H0", "H0H0H0"],
    ["H0H_0H0", "H0H0H0"],
    ["H0H.0H0", "H0H0H0"],
    ["H0H / 0H0", "H0H0H0"],
  ])("normalizes %s", (raw, value) => {
    expect(normalizeCanadianPostalCode(raw)).toEqual({ status: "normalized", value });
  });

  it.each([
    ["HIH1H1", "H1H1H1"],
    ["HLH1H1", "H1H1H1"],
    ["HOH0H0", "H0H0H0"],
    ["H1H1HI", "H1H1H1"],
    ["HIH/1HI", "H1H1H1"],
  ])("repairs numeric-position confusion in %s", (raw, value) => {
    expect(normalizeCanadianPostalCode(raw)).toEqual({ status: "repaired", value });
  });

  it.each([
    "H0D0H0",
    "H0F0H0",
    "H0I0H0",
    "H0O0H0",
    "H0Q0H0",
    "H0U0H0",
    "W0H0H0",
    "Z0H0H0",
    "H0H0H",
    "H0H0H00",
    "H0/H0H0",
    "H0H0/H0",
    "H0H!!!0H0",
    "H0H--0H0",
  ])("rejects unresolved input %s", (raw) => {
    expect(normalizeCanadianPostalCode(raw)).toEqual({ status: "invalid" });
  });

  it("does not treat an allowed L in an alphabetic position as a repair", () => {
    expect(normalizeCanadianPostalCode("L1L2L3")).toEqual({
      status: "valid",
      value: "L1L2L3",
    });
  });
});
