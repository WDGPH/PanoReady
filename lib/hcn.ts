/**
 * Ontario Health Card Number (HCN) validation.
 *
 * Format: exactly 10 digits, no spaces, no version code.
 * Check digit algorithm: Luhn mod-10 variant used by MOHLTC.
 */

const HCN_RE = /^\d{10}$/;

/** Luhn check digit validation for Ontario HCN (standard Luhn algorithm). */
function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export type HcnResult =
  | { valid: true }
  | { valid: false; reason: "format" }
  | { valid: false; reason: "check-digit" };

/**
 * Validate an Ontario HCN.
 * Returns { valid: true } on success, or { valid: false, reason } on failure.
 * Input should be pre-trimmed.
 */
export function validateHcn(raw: string): HcnResult {
  if (!HCN_RE.test(raw)) {
    return { valid: false, reason: "format" };
  }
  if (!luhnValid(raw)) {
    return { valid: false, reason: "check-digit" };
  }
  return { valid: true };
}
