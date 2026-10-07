/** Independent field checks shared by assessment, repair planning and manual review. */
import { validRealDate } from "./calendarDate";
import { normalizeCanadianPostalCode } from "./postalCode";
import { analyzePhoneNumber, isActiveCanadianGeographicNpa, type PhoneNumberAnalysis } from "./phoneNumber";
import { isCanonicalPoBoxNumber, isCanonicalRuralRoute } from "./addressRepair";
import type { RulesProfile } from "./types";
import defaultRules from "../config/rules.stix.default.json";

export function allowedValuesForField(field: string, rules: RulesProfile): string[] | undefined {
  return {
    Grade: rules.allowedGradeValues,
    Gender: rules.allowedGenderValues,
    Province: rules.allowedProvinceValues,
    Language: rules.allowedLanguageValues,
    CountryOfOrigin: rules.allowedCountryValues,
    StreetType: rules.allowedStreetTypeValues,
    StreetDirection: rules.allowedStreetDirectionValues,
    GuardianRelationship: rules.allowedRelationshipValues,
    Guardian2Relationship: rules.allowedRelationshipValues,
    PhoneType: rules.allowedPhoneTypeValues,
    GuardianPhoneType: rules.allowedPhoneTypeValues,
    Guardian2PhoneType: rules.allowedPhoneTypeValues,
  }[field];
}

type CanonicalPhoneFinding = {
  severity: "error" | "warning" | "info";
  message: string;
  autoFixable: boolean;
  suggestedFix?: string;
  ruleId: string;
};

const SAFE_TRAILING_PHONE_NOTE = /[\s\-*/(),.!]*(?:(?:please\s+)?call\b[\s\-*/(),.!]*)?\b(?:1st|first|2nd|second|3rd|third)\b[\s\-*/(),.!]*(?:call\b[\s\-*/(),.!]*)?$|[\s\-*/(),.!]*\bcell\b[\s\-*/(),.!]*$/i;

function legacyCanonicalPhoneFix(raw: string): string | undefined {
  const withoutNote = raw.replace(SAFE_TRAILING_PHONE_NOTE, "");
  const extension = withoutNote.match(/\bex\s*(\d{1,5})\s*$/i)?.[1] ?? "";
  const base = extension ? withoutNote.replace(/\bex\s*\d{1,5}\s*$/i, "") : withoutNote;
  if (base === raw && !extension) return undefined;
  let digits = base.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return undefined;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}${extension ? `x${extension}` : ""}`;
}

function invalidPhoneFinding(
  raw: string,
  label: string,
  analysis: Extract<PhoneNumberAnalysis, { status: "invalid" }>,
): CanonicalPhoneFinding {
  const shared = { severity: "error" as const, autoFixable: false };
  switch (analysis.reason) {
    case "multiple-numbers": return { ...shared, message: `${label} "${raw}" contains multiple phone numbers. Only one number in XXX-XXX-XXXX format is accepted.`, ruleId: "PHONE_FORMAT" };
    case "appended-text": return { ...shared, message: `${label} "${raw}" contains unrecognized text or notes. Enter one phone number, optionally followed by lowercase x and 1-5 extension digits.`, ruleId: "PHONE_FORMAT" };
    case "too-few-digits": return { ...shared, message: `${label} "${raw}" has too few digits (${analysis.digitCount}). Phone numbers must be 10 digits in XXX-XXX-XXXX format.`, ruleId: "PHONE_FORMAT" };
    case "too-many-digits": return { ...shared, message: `${label} "${raw}" has too many digits. Phone numbers must be exactly 10 digits in XXX-XXX-XXXX format.`, ruleId: "PHONE_FORMAT" };
    case "invalid-npa": return { ...shared, message: `${label} "${raw}" has an invalid NANP area code (${analysis.npa}). Its first digit must be 2-9.`, ruleId: "PHONE_NPA_STRUCTURE" };
    case "invalid-nxx": return { ...shared, message: `${label} "${raw}" has an invalid NANP exchange code (${analysis.nxx}). Its first digit must be 2-9.`, ruleId: "PHONE_NXX_STRUCTURE" };
    case "extension-missing": return { ...shared, message: `${label} "${raw}" has an extension marker but no extension. Enter lowercase x followed by 1-5 digits, or remove the marker.`, ruleId: "PHONE_EXTENSION_FORMAT" };
    case "extension-too-long": return { ...shared, message: `${label} "${raw}" has an extension longer than the maximum of 5 digits. Confirm and enter 1-5 digits after lowercase x.`, ruleId: "PHONE_EXTENSION_FORMAT" };
    case "extension-invalid": return { ...shared, message: `${label} "${raw}" has an invalid extension. Use lowercase x followed by 1-5 digits.`, ruleId: "PHONE_EXTENSION_FORMAT" };
  }
}

export function canonicalPhoneFindings(
  raw: string,
  label: string,
  rules: RulesProfile,
): CanonicalPhoneFinding[] {
  const legacyFix = legacyCanonicalPhoneFix(raw);
  if (legacyFix) {
    return [{
      severity: "error",
      message: `${label} "${raw}" can be safely normalized to "${legacyFix}".`,
      suggestedFix: legacyFix,
      autoFixable: true,
      ruleId: "PHONE_FORMAT",
    }];
  }
  const analysis = analyzePhoneNumber(raw);
  const placeholders = new Set(rules.phoneConfig?.placeholderNumbers ?? []);
  if (analysis.status === "invalid") {
    const findings = [invalidPhoneFinding(raw, label, analysis)];
    if (analysis.baseValue && placeholders.has(analysis.baseValue)) {
      findings.push({ severity: "error", message: `${label} "${raw}" appears to be a placeholder number.`, autoFixable: false, ruleId: "PHONE_PLACEHOLDER" });
    }
    return findings;
  }

  const findings: CanonicalPhoneFinding[] = [];
  if (analysis.status === "normalized") {
    findings.push({
      severity: "error",
      message: analysis.extension !== undefined
        ? `${label} "${raw}" can be safely normalized to "${analysis.value}" (lowercase x followed by 1-5 digits).`
        : `${label} "${raw}" is not in the required XXX-XXX-XXXX format.`,
      suggestedFix: analysis.value,
      autoFixable: true,
      ruleId: analysis.extension !== undefined ? "PHONE_EXTENSION_NORMALIZE" : "PHONE_FORMAT",
    });
  }
  if (placeholders.has(analysis.baseValue)) {
    findings.push({ severity: "error", message: `${label} "${raw}" appears to be a placeholder number.`, autoFixable: false, ruleId: "PHONE_PLACEHOLDER" });
  }
  const canadianAreaCodeCheck = rules.phoneConfig?.canadianAreaCodeCheck ?? "off";
  if (canadianAreaCodeCheck !== "off" && !isActiveCanadianGeographicNpa(analysis.npa)) {
    findings.push({
      severity: canadianAreaCodeCheck,
      message: `Area code ${analysis.npa} is not a currently active Canadian geographic area code. Confirm that this non-Canadian number is intended.`,
      autoFixable: false,
      ruleId: "PHONE_CANADIAN_AREA_CODE",
    });
  }
  return findings;
}

export function postalCodeFinding(raw: string, rules: RulesProfile): CanonicalPhoneFinding | null {
  if (/^\d{5}(?:-\d{4})?$/.test(raw.trim())) {
    return {
      severity: "error",
      message: `PostalCode "${raw}" looks like a U.S. ZIP code. Enter a Canadian postal code in A1A1A1 format.`,
      autoFixable: false,
      ruleId: "POSTAL_CODE_US_ZIP",
    };
  }
  const normalized = normalizeCanadianPostalCode(raw);
  const usesBuiltInRule = rules.postalCodePattern === defaultRules.postalCodePattern;
  if (!usesBuiltInRule) {
    const pattern = new RegExp(rules.postalCodePattern, "i");
    const trimmed = raw.trim();
    if (pattern.test(trimmed)) {
      return raw === trimmed ? null : { severity: "info", message: `PostalCode "${raw}" has surrounding whitespace; normalize it to "${trimmed}".`, suggestedFix: trimmed, autoFixable: true, ruleId: "POSTAL_CODE_NORMALIZE" };
    }
    if (normalized.status === "invalid" || !pattern.test(normalized.value)) {
      return { severity: "warning", message: `PostalCode "${raw}" does not match the active postal-code pattern.`, autoFixable: false, ruleId: "POSTAL_CODE_FORMAT" };
    }
  }
  if (normalized.status === "valid") return null;
  if (normalized.status === "normalized") return { severity: "info", message: `PostalCode "${raw}" can be safely normalized to "${normalized.value}".`, suggestedFix: normalized.value, autoFixable: true, ruleId: "POSTAL_CODE_NORMALIZE" };
  if (normalized.status === "repaired") return { severity: "warning", message: `PostalCode "${raw}" contains an O/I/L transcription in a numeric position; repair it to "${normalized.value}".`, suggestedFix: normalized.value, autoFixable: true, ruleId: "POSTAL_CODE_REPAIR" };
  return { severity: "warning", message: `PostalCode "${raw}" is not a valid Canadian postal-code structure. Expected canonical form A1A1A1.`, autoFixable: false, ruleId: "POSTAL_CODE_FORMAT" };
}

/**
 * Check the independent rules for one non-empty field value. Cross-record and
 * cross-field findings still require the normal recheck after fixes are applied.
 */
export function fieldValueMeetsRules(field: string, value: string, rules: RulesProfile): boolean {
  if (!value) return !rules.requiredFields.includes(field);
  if (value.length > (rules.fieldLengths[field] ?? Infinity)) return false;
  const allowed = allowedValuesForField(field, rules);
  if (allowed && !allowed.includes(value)) return false;
  if (field === "PostalCode" && postalCodeFinding(value, rules)) return false;
  if (["Phone", "ContactPhone", "MetadataContactPhone", "GuardianPhoneNumber", "Guardian2PhoneNumber"].includes(field)
    && canonicalPhoneFindings(value, field, rules).length) return false;
  if (field === "BirthDate" && (!validRealDate(value) || value > new Date().toISOString().slice(0, 10))) return false;
  if (field === "OEN" && !/^\d{9}$/.test(value)) return false;
  if (field === "RuralRoute" && !isCanonicalRuralRoute(value)) return false;
  if (field === "PoBoxNumber" && !isCanonicalPoBoxNumber(value)) return false;
  if (field === "BoardNumber" && !/^(?:B\d{5}|D[A-Z]{2}\d{3})$/.test(value)) return false;
  return true;
}
