/**
 * Canadian postal-code structure and safe canonicalization.
 *
 * Canada Post defines the ANA NAN structure and rural zero in position two:
 * https://www.canadapost-postescanada.ca/cpc/en/support/articles/addressing-guidelines/postal-codes.page
 * Canada Post's display guidance uses uppercase with one separating space:
 * https://www.canadapost-postescanada.ca/cpc/en/support/articles/addressing-guidelines/important-information.page
 * Statistics Canada documents the excluded letters (D, F, I, O, Q, U, plus
 * W and Z in the first position) from Canada Post's postal-code definition:
 * https://www150.statcan.gc.ca/n1/pub/92-154-g/92-154-g2017001-eng.htm
 */

const FIRST_LETTERS = "ABCEGHJKLMNPRSTVXY";
const OTHER_LETTERS = "ABCEGHJKLMNPRSTVWXYZ";

export const CANADIAN_POSTAL_CODE_PATTERN =
  `^[${FIRST_LETTERS}]\\d[${OTHER_LETTERS}]\\d[${OTHER_LETTERS}]\\d$`;

const CANADIAN_POSTAL_CODE_RE = new RegExp(CANADIAN_POSTAL_CODE_PATTERN);

// A connector is accepted only between two three-character groups. Repetition
// is deliberately limited to whitespace; punctuation connectors are singular.
const CONNECTED_POSTAL_CODE_RE =
  /^([A-Z0-9]{3})(?:\s+|\s*[-–—/\\_.]\s*)([A-Z0-9]{3})$/;

const NUMERIC_CONFUSIONS: Record<string, string> = {
  O: "0",
  I: "1",
  L: "1",
};

export type PostalCodeResult =
  | { status: "valid" | "normalized" | "repaired"; value: string }
  | { status: "invalid" };

/** Return a canonical six-character value only when the transformation is safe. */
export function normalizeCanadianPostalCode(raw: string): PostalCodeResult {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();

  let compact: string;
  if (/^[A-Z0-9]{6}$/.test(upper)) {
    compact = upper;
  } else {
    const connected = upper.match(CONNECTED_POSTAL_CODE_RE);
    if (!connected) return { status: "invalid" };
    compact = connected[1] + connected[2];
  }

  const characters = [...compact];
  let repaired = false;
  for (const index of [1, 3, 5]) {
    const replacement = NUMERIC_CONFUSIONS[characters[index]];
    if (replacement) {
      characters[index] = replacement;
      repaired = true;
    }
  }

  const value = characters.join("");
  if (!CANADIAN_POSTAL_CODE_RE.test(value)) return { status: "invalid" };
  if (repaired) return { status: "repaired", value };
  if (raw !== value) return { status: "normalized", value };
  return { status: "valid", value };
}
