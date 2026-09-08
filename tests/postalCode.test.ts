import { describe, expect, it } from "vitest";
import { normalizeCanadianPostalCode } from "../lib/postalCode";

describe("normalizeCanadianPostalCode", () => {
  it.each(["N1G2W1", "K1A0B1", "K1W2Z3", "V9Z8W7"])(
    "accepts canonical Canadian postal code %s",
    (raw) => {
      expect(normalizeCanadianPostalCode(raw)).toEqual({ status: "valid", value: raw });
    }
  );

  it.each([
    ["n1g2w1", "N1G2W1"],
    [" N1G2W1 ", "N1G2W1"],
    ["N1G 2W1", "N1G2W1"],
    ["N1G   2W1", "N1G2W1"],
    ["N1G-2W1", "N1G2W1"],
    ["N1G–2W1", "N1G2W1"],
    ["N1G—2W1", "N1G2W1"],
    ["N1G/2W1", "N1G2W1"],
    ["N1G\\2W1", "N1G2W1"],
    ["N1G_2W1", "N1G2W1"],
    ["N1G.2W1", "N1G2W1"],
    ["N1G / 2W1", "N1G2W1"],
  ])("normalizes %s", (raw, value) => {
    expect(normalizeCanadianPostalCode(raw)).toEqual({ status: "normalized", value });
  });

  it.each([
    ["NIG2W1", "N1G2W1"],
    ["NLG2W1", "N1G2W1"],
    ["NOG2W1", "N0G2W1"],
    ["N1G2WI", "N1G2W1"],
    ["NIG/2WI", "N1G2W1"],
  ])("repairs numeric-position confusion in %s", (raw, value) => {
    expect(normalizeCanadianPostalCode(raw)).toEqual({ status: "repaired", value });
  });

  it.each([
    "N1D2W1",
    "N1F2W1",
    "N1I2W1",
    "N1O2W1",
    "N1Q2W1",
    "N1U2W1",
    "W1G2W1",
    "Z1G2W1",
    "N1G2W",
    "N1G2W11",
    "N1/G2W1",
    "N1G2/W1",
    "N1G!!!2W1",
    "N1G--2W1",
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
