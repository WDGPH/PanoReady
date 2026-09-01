/**
 * NANP phone-number structure, canonicalization, and Canadian NPA policy data.
 *
 * CNAC defines an NPA as NXX and distinguishes geographic from non-geographic
 * NPAs: https://cnac.ca/npa_codes/npa_codes.htm
 * NANPA defines central-office codes as NXX, with N=2-9 and X=0-9:
 * https://www.nanpa.com/index.php/numbering/co-codesthousands-blocks
 * Accepted extensions follow the NANP base number as a lowercase x and 1-5
 * digits.
 *
 * The Canadian geographic NPA set below was verified 2026-09-01 against CNAC's
 * current CO Code Status list and relief notices. It includes only geographic
 * NPAs already in service. In particular, it excludes Canadian non-geographic
 * resources (including 600) and future relief NPAs 273 (2027-02-27) and 851
 * (2028-05-27). This static policy data must be reviewed as area codes change.
 */

const ACTIVE_CANADIAN_GEOGRAPHIC_NPAS = new Set([
  "204", "226", "236", "249", "250", "257", "263", "289", "306", "343",
  "354", "365", "367", "368", "382", "403", "416", "418", "428", "431",
  "437", "438", "450", "468", "474", "506", "514", "519", "548", "579",
  "581", "584", "587", "604", "613", "639", "647", "672", "683", "705",
  "709", "742", "753", "778", "780", "782", "807", "819", "825", "867",
  "873", "879", "902", "905", "942",
]);

export type PhoneNumberInvalidReason =
  | "multiple-numbers"
  | "appended-text"
  | "too-few-digits"
  | "too-many-digits"
  | "invalid-npa"
  | "invalid-nxx"
  | "extension-missing"
  | "extension-too-long"
  | "extension-invalid";

export type PhoneNumberAnalysis =
  | {
      status: "valid" | "normalized";
      value: string;
      baseValue: string;
      npa: string;
      nxx: string;
      extension?: string;
    }
  | {
      status: "invalid";
      reason: PhoneNumberInvalidReason;
      digitCount?: number;
      value?: string;
      baseValue?: string;
      npa?: string;
      nxx?: string;
      extension?: string;
    };

/** Parse supported numeric formatting and enforce NANP NPA-NXX-XXXX structure. */
export function analyzePhoneNumber(raw: string): PhoneNumberAnalysis {
  const trimmed = raw.trim();

  if (/[;\/]/.test(trimmed)) {
    return { status: "invalid", reason: "multiple-numbers" };
  }

  const missingExtension = trimmed.match(/(?:\b(?:ext(?:ension)?\.?)|x|#)\s*$/i);
  if (missingExtension) {
    return { status: "invalid", reason: "extension-missing" };
  }

  const extensionMatch = trimmed.match(
    /\s*(?:x|ext(?:ension)?\.?|#)\s*([0-9]+)\s*$/i
  );
  let baseInput = trimmed;
  let extension: string | undefined;
  if (extensionMatch) {
    extension = extensionMatch[1];
    baseInput = trimmed.slice(0, extensionMatch.index).trim();
    if (extension.length > 5) {
      return { status: "invalid", reason: "extension-too-long", extension };
    }
    if (/(?:\b(?:ext(?:ension)?\.?)|x|#)/i.test(baseInput)) {
      return { status: "invalid", reason: "extension-invalid", extension };
    }
  } else if (/(?:\b(?:ext(?:ension)?\.?)|x|#)/i.test(trimmed)) {
    return { status: "invalid", reason: "extension-invalid" };
  } else if (/[a-z]/i.test(trimmed)) {
    return { status: "invalid", reason: "appended-text" };
  }

  const digits = baseInput.replace(/\D/g, "");
  const effective = digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;

  if (effective.length < 10) {
    return { status: "invalid", reason: "too-few-digits", digitCount: effective.length };
  }
  if (effective.length > 10) {
    return { status: "invalid", reason: "too-many-digits", digitCount: effective.length };
  }

  const npa = effective.slice(0, 3);
  const nxx = effective.slice(3, 6);
  const baseValue = `${npa}-${nxx}-${effective.slice(6)}`;
  const value = extension ? `${baseValue}x${extension}` : baseValue;
  if (!/^[2-9]\d{2}$/.test(npa)) {
    return { status: "invalid", reason: "invalid-npa", value, baseValue, npa, nxx, extension };
  }
  if (!/^[2-9]\d{2}$/.test(nxx)) {
    return { status: "invalid", reason: "invalid-nxx", value, baseValue, npa, nxx, extension };
  }

  return {
    status: raw === value ? "valid" : "normalized",
    value,
    baseValue,
    npa,
    nxx,
    ...(extension ? { extension } : {}),
  };
}

/** Return whether an NPA was an active Canadian geographic area code on the verification date above. */
export function isActiveCanadianGeographicNpa(npa: string): boolean {
  return ACTIVE_CANADIAN_GEOGRAPHIC_NPAS.has(npa);
}
