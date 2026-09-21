import { ageOnDate, analyzeCalendarDate, validRealDate } from "./calendarDate";
/**
 * STIX XML validator — Phase 1 of PLAN.md
 *
 * Runs structural + rules validation and produces ValidationIssue records.
 * Also provides helpers for applying fixes back to XML and exporting reports.
 */

import { isOenIdentityFinding } from "./identityRules";
import { standardizeUnit } from "./cleaner";
import { normalizeCanadianPostalCode } from "./postalCode";
import {
  analyzePhoneNumber,
  isActiveCanadianGeographicNpa,
  type PhoneNumberAnalysis,
} from "./phoneNumber";
import type {
  ValidationIssue,
  ValidationResult,
  StudentRecord,
  GateState,
  AppliedFix,
  RulesProfile,
} from "./types";
import defaultRules from "../config/rules.stix.default.json";
import {
  flattenCanonicalStudent,
  parseCanonicalXml,
  serializeCanonicalXml,
  type CanonicalStudent,
  type CanonicalSchool,
  type CanonicalMetadata,
} from "./canonical";
import {
  ADDRESS_REPAIR_FIELDS,
  analyzeAlternateDeliveryInStreetFields,
  analyzeStreetNameSuffix,
  analyzeStreetNumberRepair,
  analyzeStreetNumberUnitPrefix,
  analyzeUnitOverflow,
} from "./addressRepair";
import { FREE_TEXT_FIELDS, SCHOOL_FIELDS } from "./fields";
import { freeTextCharacterFindings } from "./freeTextCharacters";

// ─── XML parser (standalone) ──────────────────────────────────────────────────

/**
 * Parse a STIX XML string into StudentRecord[].
 * Throws a descriptive Error for structural failures (bad XML, missing root,
 * no schools) so callers can surface the message without running validation.
 * Note: schools with zero <ns1:Student> elements produce no records here;
 * the empty-school warning is handled by validateXml internally.
 */
export function parseSTIXXml(xmlText: string): StudentRecord[] {
  const upload = parseCanonicalXml(xmlText);
  if (upload.schools.length === 0) throw new Error("No <School> elements found.");
  return upload.schools.flatMap((school, schoolIndex) => school.students.map((student, studentIndex) => ({
    id: `school${schoolIndex}:student${studentIndex}`,
    xmlPath: `SchoolUpload/School[${school.schoolNumber || school.name || schoolIndex + 1}]/Students/Student[${studentIndex}]`,
    fields: flattenCanonicalStudent(student, school),
  })));
}

function issue(
  issues: ValidationIssue[],
  value: Omit<ValidationIssue, "id" | "autoFixable"> & { id?: string; autoFixable?: boolean },
) {
  const autoFixable = value.repairProposal
    ? value.repairProposal.confidence === "safe"
      && value.repairProposal.changes.some(change => change.proposedValue !== change.currentValue)
    : value.autoFixable ?? value.suggestedFix !== undefined;
  issues.push({ id: value.id ?? `${value.ruleId}-${issues.length}`, ...value, autoFixable });
}

function allowedValuesForField(field: string, rules: RulesProfile): string[] | undefined {
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

function canonicalPhoneFindings(
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

function postalCodeFinding(raw: string, rules: RulesProfile): CanonicalPhoneFinding | null {
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
  if (field === "BoardNumber" && !/^(?:B\d{5}|D[A-Z]{2}\d{3})$/.test(value)) return false;
  return true;
}

/** Namespace-aware validation of the canonical STIX model. */
export function validateXml(xmlText: string, rules: RulesProfile = defaultRules as RulesProfile): ValidationResult {
  const issues: ValidationIssue[] = [];
  const effectiveRules: RulesProfile = {
    ...rules,
    freeTextCharacterChecks: { ...defaultRules.freeTextCharacterChecks, ...rules.freeTextCharacterChecks },
    freeTextAllowedCharacters: { ...defaultRules.freeTextAllowedCharacters, ...rules.freeTextAllowedCharacters },
  };
  let upload;
  try {
    upload = parseCanonicalXml(xmlText);
  } catch (error) {
    issue(issues, { severity: "error", ruleId: "XML_PARSE_OR_NAMESPACE", layer: "XML", message: error instanceof Error ? error.message : String(error) });
    return { issues, records: [], schoolCount: 0, studentCount: 0, gate: "BLOCKED", xsdValidated: false };
  }
  const records: StudentRecord[] = [];
  issues.push(...upload.diagnostics);
  const metadata = upload.metadata;
  const boardNumberSuggestion = /^\d{5}$/.test(metadata.boardNumber) ? `B${metadata.boardNumber}` : undefined;
  const metadataRequired: Array<[string, string]> = [
    ["CreateDate", metadata.createDate], ["CreateTime", metadata.createTime], ["CreatedBy", metadata.createdBy],
    ["ContactPhone", metadata.contactPhone?.number ?? ""], ["ContactEmail", metadata.contactEmail], ["FullUpload", metadata.fullUpload],
  ];
  for (const [field, value] of metadataRequired) if (!value.trim()) issue(issues, {
    severity: "error", field, recordId: "metadata", studentName: "File metadata", schoolNumber: "SchoolUpload/Metadata", currentValue: value,
    autoFixable: false, ruleId: "METADATA_REQUIRED", layer: "CANONICAL",
    message: field === "ContactPhone"
      ? "ContactPhone is required in file metadata. Enter the phone number for the person or team responsible for this upload; this is not a student or guardian phone."
      : `${field} is required in file metadata.`,
  });
  if (metadata.createDate && (!validRealDate(metadata.createDate) || metadata.createDate > new Date().toISOString().slice(0, 10))) issue(issues, { severity: "error", field: "CreateDate", ruleId: "METADATA_DATE", layer: "CANONICAL", message: "CreateDate must be a real YYYY-MM-DD date no later than today." });
  if (metadata.createTime && !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(metadata.createTime)) issue(issues, { severity: "error", field: "CreateTime", ruleId: "METADATA_TIME", layer: "CANONICAL", message: "CreateTime must use HH:mm:ss." });
  if (metadata.createdBy && (metadata.createdBy.length < 1 || metadata.createdBy.length > 100)) issue(issues, { severity: "error", field: "CreatedBy", ruleId: "METADATA_CREATED_BY", layer: "CANONICAL", message: "CreatedBy must contain 1–100 characters." });
  if (metadata.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(metadata.contactEmail)) issue(issues, { severity: "error", field: "ContactEmail", ruleId: "METADATA_EMAIL", layer: "CANONICAL", message: "ContactEmail is not a valid email address." });
  if (metadata.fullUpload && !rules.allowedFullLoadTypeValues.includes(metadata.fullUpload)) issue(issues, { severity: "error", field: "FullUpload", ruleId: "FULL_UPLOAD_ALLOWED_VALUE", layer: "CANONICAL", message: `FullUpload "${metadata.fullUpload}" is not allowed.` });
  if (metadata.boardNumber && !/^(?:B\d{5}|D[A-Z]{2}\d{3})$/.test(metadata.boardNumber)) issue(issues, {
    severity: "error", field: "BoardNumber", recordId: "metadata", studentName: "File metadata", schoolNumber: "SchoolUpload/Metadata", currentValue: metadata.boardNumber,
    suggestedFix: boardNumberSuggestion, autoFixable: false,
    ruleId: "BOARD_NUMBER_FORMAT", layer: "CANONICAL", message: "BoardNumber must be B plus 5 digits or D plus 2 letters and 3 digits.",
  });
  if (metadata.contactPhone) {
    for (const finding of canonicalPhoneFindings(metadata.contactPhone.number, "Metadata ContactPhone", rules)) {
      issue(issues, {
        recordId: "metadata",
        studentName: "File metadata",
        field: "MetadataContactPhone",
        currentValue: metadata.contactPhone.number,
        layer: "CANONICAL",
        ...finding,
      });
    }
    if (metadata.contactPhone.type && !rules.allowedPhoneTypeValues.includes(metadata.contactPhone.type)) issue(issues, { severity: "error", field: "PhoneType", ruleId: "PHONE_TYPE_ALLOWED_VALUE", layer: "CANONICAL", message: `Contact phone type "${metadata.contactPhone.type}" is not allowed.` });
  }

  const seenOens = new Map<string, { studentName: string; schoolId: string; schoolNumber: string; schoolName: string }[]>();
  const seenIdentity = new Map<string, { studentName: string; schoolNumber: string; schoolName: string }>();
  const allowedByField = Object.fromEntries([
    "Grade", "Gender", "Province", "Language", "CountryOfOrigin", "StreetType", "StreetDirection",
    "GuardianRelationship", "Guardian2Relationship", "PhoneType", "GuardianPhoneType", "Guardian2PhoneType",
  ].map(field => [field, allowedValuesForField(field, rules)!]));
  const aliasByField: Record<string, Record<string, string> | undefined> = { Grade: rules.gradeAliases, Gender: rules.genderAliases };
  const schoolFields = new Set<string>(SCHOOL_FIELDS);
  for (let schoolIndex = 0; schoolIndex < upload.schools.length; schoolIndex++) {
    const school = upload.schools[schoolIndex];
    if (rules.requiredFields.includes("SchoolNumber") && !school.schoolNumber) issue(issues, { severity: "error", field: "SchoolNumber", schoolNumber: "", ruleId: "SCHOOL_NUMBER_REQUIRED", layer: "CANONICAL", message: `School "${school.name || schoolIndex + 1}" is missing SchoolNumber.` });
    if (rules.requiredFields.includes("SchoolName") && !school.name) issue(issues, { severity: "error", field: "SchoolName", schoolNumber: school.schoolNumber, ruleId: "REQUIRED_FIELD", layer: "CANONICAL", message: "SchoolName is required but missing or empty." });
    if (school.schoolNumber.length > 100) issue(issues, { severity: "error", field: "SchoolNumber", schoolNumber: school.schoolNumber, ruleId: "SCHOOL_NUMBER_LENGTH", layer: "CANONICAL", message: "SchoolNumber exceeds 100 characters." });
    if (school.students.length === 0) issue(issues, {
      severity: "error", recordId: `school${schoolIndex}`, field: "School", schoolNumber: school.schoolNumber,
      currentValue: school.name || school.schoolNumber, ruleId: "EMPTY_STUDENTS", layer: "CANONICAL",
      message: `School "${school.name || school.schoolNumber}" has no students. Panorama rejects a Students element with no Student records. Select “Remove school” to omit it from the corrected export, or review the source data if the school should contain students.`,
    });
    for (let studentIndex = 0; studentIndex < school.students.length; studentIndex++) {
      const student = school.students[studentIndex];
      const fields = flattenCanonicalStudent(student, school);
      const recordId = `school${schoolIndex}:student${studentIndex}`;
      const studentName = [fields.FirstName, fields.LastName].filter(Boolean).join(" ") || `Student #${studentIndex + 1}`;
      const base = { recordId, studentName, schoolNumber: school.schoolNumber, layer: "CANONICAL" as const };
      records.push({ id: recordId, xmlPath: `SchoolUpload/School[${school.schoolNumber || schoolIndex}]/Students/Student[${studentIndex}]`, fields });
      // Only a standalone finding when StreetNumber is within its length limit — an over-length
      // value gets this same proposal attached to the blocking FIELD_LENGTH error instead.
      const unitPrefixProposal = (fields.StreetNumber ?? "").length <= (rules.fieldLengths.StreetNumber ?? Infinity)
        ? analyzeStreetNumberUnitPrefix(fields, `${recordId}-address-unit-prefix`)
        : undefined;
      if (unitPrefixProposal) {
        issue(issues, {
          ...base, severity: "warning", field: "StreetNumber", ruleId: "STREET_NUMBER_UNIT_PREFIX",
          message: unitPrefixProposal.explanation, autoFixable: false, repairProposal: unitPrefixProposal,
        });
      }
      const alternateDeliveryProposal = analyzeAlternateDeliveryInStreetFields(fields, `${recordId}-address-alternate-delivery`);
      if (alternateDeliveryProposal) {
        issue(issues, {
          ...base, severity: "warning", field: "StreetName", ruleId: "ALTERNATE_DELIVERY_IN_STREET_FIELD",
          message: alternateDeliveryProposal.explanation, autoFixable: false, repairProposal: alternateDeliveryProposal,
        });
      }

      const streetNameSuffixProposal = analyzeStreetNameSuffix(
        fields,
        rules.allowedStreetTypeValues,
        rules.allowedStreetDirectionValues,
        recordId + "-address-street-name-suffix",
      );
      if (streetNameSuffixProposal) {
        const safe = streetNameSuffixProposal.confidence === "safe";
        issue(issues, {
          ...base,
          severity: "warning",
          field: "StreetName",
          ruleId: "STREET_TYPE_IN_STREET_NAME",
          message: streetNameSuffixProposal.explanation,
          autoFixable: safe,
          repairProposal: streetNameSuffixProposal,
        });
      }

      for (const field of rules.requiredFields.filter((required) => !schoolFields.has(required))) if (!(fields[field] ?? "").trim()) issue(issues, { ...base, severity: "error", field, ruleId: "REQUIRED_FIELD", message: `${field} is required but missing or empty.` });
      for (const [field, allowed] of Object.entries(allowedByField)) {
        const value = fields[field];
        if (value && !allowed.includes(value)) {
          const aliasMap = aliasByField[field];
          const alias = aliasMap?.[value] ?? aliasMap?.[value.trim().toUpperCase()];
          issue(issues, { ...base, severity: "error", field, ruleId: `${field.toUpperCase()}_ALLOWED_VALUE`, message: `${field} value "${value}" is not allowed.`, suggestedFix: alias, autoFixable: !!alias });
        }
      }
      // An absent Guardian is valid. Once a Guardian element exists, Panorama
      // requires its Relationship child to contain a value—even if the other
      // Guardian fields are empty.
      for (const [index, guardian] of student.guardians.entries()) {
        if (!guardian.relationship.trim()) {
          const hasGuardianDetails = Boolean(
            guardian.name.first.trim() || guardian.name.middle.trim() || guardian.name.last.trim()
              || guardian.phone?.number.trim(),
          );
          const field = hasGuardianDetails
            ? (index === 0 ? "GuardianRelationship" : "Guardian2Relationship")
            : (index === 0 ? "Guardian" : "Guardian2");
          issue(issues, {
            ...base,
            severity: "error",
            field,
            ruleId: hasGuardianDetails ? "GUARDIAN_RELATIONSHIP_REQUIRED" : "EMPTY_GUARDIAN",
            message: hasGuardianDetails
              ? `Guardian ${index + 1} is missing a relationship.`
              : `Guardian ${index + 1} is an empty placeholder. Panorama rejects Guardian elements without a relationship.`,
            suggestedFix: hasGuardianDetails ? undefined : "",
            autoFixable: !hasGuardianDetails,
          });
        }
      }
      if (fields.BirthDate) {
        const date = analyzeCalendarDate(fields.BirthDate);
        const today = new Date().toISOString().slice(0, 10);
        if (date.status !== "valid") {
          const suggestion = date.status === "normalizable" && date.value <= today ? date.value : undefined;
          const guidance = date.status === "ambiguous"
            ? " The day and month order is ambiguous; confirm the source date."
            : " Confirm the source date if no correction is suggested.";
          issue(issues, { ...base, severity: "error", field: "BirthDate", ruleId: "BIRTHDATE_FORMAT", message: `BirthDate "${fields.BirthDate}" must be a real YYYY-MM-DD date.${guidance}`, suggestedFix: suggestion, autoFixable: suggestion !== undefined });
        }
        if ((date.status === "valid" || date.status === "normalizable") && date.value > today) issue(issues, { ...base, severity: "error", field: "BirthDate", ruleId: "BIRTHDATE_FUTURE", message: "BirthDate cannot be in the future." });
      }
      if (fields.OEN) {
        if (!/^\d{9}$/.test(fields.OEN)) issue(issues, { ...base, severity: "error", field: "OEN", ruleId: "OEN_FORMAT", message: `OEN "${fields.OEN}" must contain exactly 9 digits.` });
        else if (rules.duplicateDetection.checkOen) {
          const occurrences = seenOens.get(fields.OEN) ?? [];
          const prior = occurrences.find((entry) => entry.schoolId === school.schoolId) ?? occurrences[0];
          if (prior?.schoolId === school.schoolId) {
            issue(issues, { ...base, severity: "error", field: "OEN", ruleId: "OEN_DUPLICATE", message: `OEN "${fields.OEN}" is duplicated with ${prior.studentName} in the same school (${school.name || school.schoolNumber}). Resolve the duplicate in the source system and upload a corrected file.` });
          } else if (prior) {
            issue(issues, { ...base, severity: "warning", field: "OEN", ruleId: "OEN_DUAL_ENROLLMENT", message: `OEN "${fields.OEN}" also appears at ${prior.schoolName || prior.schoolNumber} (${prior.schoolNumber}) as ${prior.studentName}; review for dual enrollment in the source system.` });
          }
          occurrences.push({ studentName, schoolId: school.schoolId, schoolNumber: school.schoolNumber, schoolName: school.name });
          seenOens.set(fields.OEN, occurrences);
        }
      }
      if (fields.PostalCode) {
        const finding = postalCodeFinding(fields.PostalCode, rules);
        if (finding) issue(issues, { ...base, field: "PostalCode", currentValue: fields.PostalCode, ...finding });
      }
      const manualAddressProposal = (field: string, val: string, limit: number) => ({
        kind: "address" as const,
        id: `${recordId}-address-manual-${field}`,
        confidence: "manual" as const,
        title: `Review ${field} manually`,
        explanation: `${field} "${val}" exceeds its ${limit}-character limit and can't be safely auto-split. Review the complete address and edit the fields directly.`,
        changes: [],
      });
      for (const [field, limit] of Object.entries(rules.fieldLengths)) {
        const val = fields[field] ?? "";
        if (field === "PostalCode") continue;
        if (val.length <= limit) continue;
        if (field === "Unit") {
          const [standardized, changed] = standardizeUnit(val);
          const canFix = changed && standardized.length <= limit;
          const repairProposal = canFix ? undefined : (analyzeUnitOverflow(fields, rules.fieldLengths.StreetNumber ?? limit, `${recordId}-address-unit-overflow`) ?? manualAddressProposal(field, val, limit));
          issue(issues, {
            ...base,
            severity: "error",
            field,
            ruleId: "FIELD_LENGTH",
            message: repairProposal?.explanation ?? `${field} exceeds its ${limit}-character limit.`,
            suggestedFix: canFix ? standardized : undefined,
            autoFixable: canFix,
            repairProposal,
          });
        } else if (field === "StreetNumber") {
          const repairProposal = analyzeStreetNumberRepair(fields, limit, `${recordId}-address-street-number`)
            ?? analyzeStreetNumberUnitPrefix(fields, `${recordId}-address-street-number-unit-prefix`)
            ?? manualAddressProposal(field, val, limit);
          const safe = repairProposal.confidence === "safe";
          issue(issues, {
            ...base,
            severity: "error",
            field,
            ruleId: "FIELD_LENGTH",
            message: repairProposal.explanation,
            suggestedFix: safe ? repairProposal.changes.find((change) => change.field === field)?.proposedValue : undefined,
            autoFixable: safe,
            repairProposal,
          });
        } else if ((ADDRESS_REPAIR_FIELDS as readonly string[]).includes(field)) {
          const manualProposal = manualAddressProposal(field, val, limit);
          issue(issues, { ...base, severity: "error", field, ruleId: "FIELD_LENGTH", message: manualProposal.explanation, autoFixable: false, repairProposal: manualProposal });
        } else {
          issue(issues, { ...base, severity: "error", field, ruleId: "FIELD_LENGTH", message: `${field} exceeds its ${limit}-character limit.`, suggestedFix: val.slice(0, limit), autoFixable: true });
        }
      }
      for (const field of ["Phone", "GuardianPhoneNumber", "Guardian2PhoneNumber"]) {
        const value = fields[field];
        if (!value) continue;
        for (const finding of canonicalPhoneFindings(value, field, rules)) {
          issue(issues, { ...base, field, currentValue: value, ...finding });
        }
      }
      const identity = `${fields.FirstName.toLowerCase()}|${fields.LastName.toLowerCase()}|${fields.BirthDate}`;
      if (rules.duplicateDetection.checkNameDobSchool && fields.FirstName && fields.LastName && fields.BirthDate) {
        const priorIdentity = seenIdentity.get(identity);
        if (priorIdentity && priorIdentity.schoolNumber === school.schoolNumber) {
          issue(issues, { ...base, severity: "error", ruleId: "NAME_DOB_DUPLICATE", layer: "IDENTITY", message: `Possible duplicate: ${studentName} (DOB ${fields.BirthDate}) also appears as ${priorIdentity.studentName} in the same school (${school.name || school.schoolNumber}).` });
        } else if (priorIdentity) {
          issue(issues, { ...base, severity: "warning", ruleId: "IDENTITY_REVIEW", layer: "IDENTITY", message: `Same name and birth date also appear at ${priorIdentity.schoolName || priorIdentity.schoolNumber} (${priorIdentity.schoolNumber}) as ${priorIdentity.studentName}; review for dual enrollment.` });
        } else {
          seenIdentity.set(identity, { studentName, schoolNumber: school.schoolNumber, schoolName: school.name });
        }
      }
    }
  }
  // Character policy is a final fallback. If a specialized validator already
  // owns a record field, do not add a competing special-character suggestion.
  const claimedFields = new Set(
    issues
      .filter((finding) => finding.recordId && finding.field)
      .map((finding) => `${finding.recordId}\u0000${finding.field}`),
  );
  for (const [schoolIndex, school] of upload.schools.entries()) {
    const recordId = `school${schoolIndex}`;
    if (claimedFields.has(`${recordId}\u0000SchoolName`)) continue;
    for (const finding of freeTextCharacterFindings(school.name, "SchoolName", effectiveRules)) {
      issue(issues, {
        severity: "info", recordId, studentName: "School name", schoolNumber: school.schoolNumber,
        field: "SchoolName", currentValue: school.name, autoFixable: true, layer: "CANONICAL", ...finding,
      });
    }
  }
  for (const record of records) {
    const studentName = [record.fields.FirstName, record.fields.LastName].filter(Boolean).join(" ");
    for (const field of FREE_TEXT_FIELDS) {
      if (field === "SchoolName" || !record.fields[field] || claimedFields.has(`${record.id}\u0000${field}`)) continue;
      for (const finding of freeTextCharacterFindings(record.fields[field], field, effectiveRules)) {
        issue(issues, {
          severity: "info", recordId: record.id, studentName, schoolNumber: record.fields.SchoolNumber,
          field, currentValue: record.fields[field], autoFixable: true, layer: "CANONICAL", ...finding,
        });
      }
    }
  }
  const hasErrors = issues.some((finding) => finding.severity === "error");
  const hasWarnings = issues.some((finding) => finding.severity === "warning" && finding.ruleId !== "PHONE_CANADIAN_AREA_CODE");
  const gate: GateState = hasErrors ? "BLOCKED" : hasWarnings ? "REVIEW_REQUIRED" : "READY";
  return { issues, records, schoolCount: upload.schools.length, studentCount: records.length, gate, xsdValidated: false };
}

// ─── Fix application ──────────────────────────────────────────────────────────

/** Parse recordId → { schoolIndex, studentIndex } */
function decodeRecordId(recordId: string): { si: number; pi: number } | null {
  const m = recordId.match(/^school(\d+):student(\d+)$/);
  if (!m) return null;
  return { si: parseInt(m[1]), pi: parseInt(m[2]) };
}

function setCanonicalStudentField(student: CanonicalStudent, school: CanonicalSchool, field: string, value: string) {
  const direct: Record<string, keyof Pick<CanonicalStudent, "oen" | "grade" | "className" | "gender" | "birthDate" | "language" | "countryOfOrigin">> = {
    OEN: "oen", Grade: "grade", Class: "className", Gender: "gender", BirthDate: "birthDate", Language: "language", CountryOfOrigin: "countryOfOrigin",
  };
  if (direct[field]) { student[direct[field]] = value; return; }
  if (field === "SchoolName") { school.name = value; return; }
  if (field === "SchoolNumber") { school.schoolNumber = value; return; }
  const names: Record<string, ["name" | "aliasName", "first" | "middle" | "last"]> = {
    FirstName: ["name", "first"], MiddleName: ["name", "middle"], LastName: ["name", "last"],
    AliasFirstName: ["aliasName", "first"], AliasMiddleName: ["aliasName", "middle"], AliasLastName: ["aliasName", "last"],
  };
  if (names[field]) {
    const [container, part] = names[field];
    if (container === "aliasName" && !student.aliasName) student.aliasName = { first: "", middle: "", last: "" };
    (student[container] as { first: string; middle: string; last: string })[part] = value;
    return;
  }
  const address: Record<string, keyof CanonicalStudent["address"]> = {
    Unit: "unit", StreetNumber: "streetNumber", StreetNumberSuffix: "streetNumberSuffix", StreetName: "streetName",
    StreetType: "streetType", StreetDirection: "streetDirection", RuralRoute: "ruralRoute", PoBoxNumber: "poBoxNumber",
    City: "city", Province: "province", PostalCode: "postalCode",
  };
  if (address[field]) { student.address[address[field]] = value; return; }
  if (field === "Phone" || field === "ContactPhone") { student.phone = { number: value, type: student.phone?.type ?? "" }; return; }
  if (field === "PhoneType") { student.phone = { number: student.phone?.number ?? "", type: value }; return; }
  const guardianMatch = field.match(/^Guardian(2)?(FirstName|LastName|Relationship|PhoneNumber|PhoneType)$/);
  if (guardianMatch) {
    const index = guardianMatch[1] ? 1 : 0;
    while (student.guardians.length <= index) student.guardians.push({ name: { first: "", middle: "", last: "" }, relationship: "", phone: null });
    const guardian = student.guardians[index];
    const part = guardianMatch[2];
    if (part === "FirstName") guardian.name.first = value;
    else if (part === "LastName") guardian.name.last = value;
    else if (part === "Relationship") guardian.relationship = value;
    else if (part === "PhoneNumber") guardian.phone = { number: value, type: guardian.phone?.type ?? "" };
    else guardian.phone = { number: guardian.phone?.number ?? "", type: value };
  }
}

function setCanonicalMetadataField(metadata: CanonicalMetadata, field: string, value: string) {
  if (field === "ContactPhone" || field === "MetadataContactPhone") {
    metadata.contactPhone = { number: value, type: metadata.contactPhone?.type ?? "WORK" };
  } else if (field === "PhoneType") {
    metadata.contactPhone = { number: metadata.contactPhone?.number ?? "", type: value };
  } else if (field === "BoardNumber") {
    metadata.boardNumber = value;
  }
}

/** Apply fixes through the canonical model so every namespace-prefix form behaves identically. */
export function applyValidationFixes(xmlText: string, fixes: AppliedFix[]): string {
  const upload = parseCanonicalXml(xmlText);
  const guardianRemovals = new Map<CanonicalStudent, Set<number>>();
  const removedSchools = new Set<number>();
  for (const fix of fixes) {
    if (isOenIdentityFinding(fix.ruleId)) continue;
    if (fix.field === "RemoveSchool") {
      const schoolMatch = fix.recordId.match(/^school(\d+)$/);
      if (fix.newValue === "REMOVE" && schoolMatch) {
        const index = Number(schoolMatch[1]);
        if (upload.schools[index]?.students.length === 0) removedSchools.add(index);
      }
      continue;
    }
    if (fix.recordId === "metadata") {
      setCanonicalMetadataField(upload.metadata, fix.field, fix.newValue);
      continue;
    }
    const schoolMatch = fix.recordId.match(/^school(\d+)$/);
    if (schoolMatch) {
      const school = upload.schools[Number(schoolMatch[1])];
      if (school && fix.field === "SchoolName") school.name = fix.newValue;
      continue;
    }
    const coordinates = decodeRecordId(fix.recordId);
    if (!coordinates) continue;
    const school = upload.schools[coordinates.si];
    const student = school?.students[coordinates.pi];
    if (!school || !student) continue;
    if (fix.field === "Guardian" || fix.field === "Guardian2") {
      const removals = guardianRemovals.get(student) ?? new Set<number>();
      removals.add(fix.field === "Guardian2" ? 1 : 0);
      guardianRemovals.set(student, removals);
      continue;
    }
    setCanonicalStudentField(student, school, fix.field, fix.newValue);
  }
  for (const [student, indexes] of guardianRemovals) {
    for (const index of [...indexes].sort((a, b) => b - a)) student.guardians.splice(index, 1);
  }
  upload.schools = upload.schools.filter((_, index) => !removedSchools.has(index));
  return serializeCanonicalXml(upload);
}

// ─── Apply fixes to in-memory records (for UI refresh without re-parsing XML) ─

export function applyFixesToRecords(
  records: StudentRecord[],
  fixes: AppliedFix[]
): StudentRecord[] {
  const byRecord = new Map<string, Map<string, string>>();
  for (const fix of fixes) {
    if (!byRecord.has(fix.recordId)) byRecord.set(fix.recordId, new Map());
    byRecord.get(fix.recordId)!.set(fix.field, fix.newValue);
  }
  return records.map((r) => {
    const fieldFixes = byRecord.get(r.id);
    if (!fieldFixes) return r;
    return { ...r, fields: { ...r.fields, ...Object.fromEntries(fieldFixes) } };
  });
}

// ─── Issue report CSV ─────────────────────────────────────────────────────────

export function generateIssueReportCsv(
  issues: ValidationIssue[],
  appliedFixes: AppliedFix[]
): string {
  const fixedIds = new Set(appliedFixes.map((f) => f.issueId));
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const headers = [
    "severity", "ruleId", "studentName", "schoolNumber",
    "field", "message", "suggestedFix", "autoFixable", "fixed",
  ];
  const rows = issues.map((i) => [
    i.severity,
    i.ruleId,
    i.studentName ?? "",
    i.schoolNumber ?? "",
    i.field ?? "",
    i.message,
    i.suggestedFix ?? "",
    i.autoFixable ? "yes" : "no",
    fixedIds.has(i.id) ? "yes" : "no",
  ]);
  return [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

// ─── Reporting helpers (client-side) ────────────────────────────────────────

/**
 * Generate a school-based summary CSV from validation records.
 * Columns: schoolNumber, schoolName, totalStudents, gradesJson, gendersJson
 */
export function generateSchoolSummaryCsv(records: StudentRecord[]): string {
  const bySchool = new Map<string, { name: string; total: number; grades: Map<string, number>; genders: Map<string, number> }>();
  for (const r of records) {
    const sn = (r.fields.SchoolNumber || r.fields.SchoolName || "").trim();
    const key = sn || "(unknown)";
    if (!bySchool.has(key)) {
      bySchool.set(key, { name: r.fields.SchoolName || "", total: 0, grades: new Map(), genders: new Map() });
    }
    const entry = bySchool.get(key)!;
    entry.total++;
    const grade = (r.fields.Grade || "").trim();
    const gender = (r.fields.Gender || "").trim();
    if (grade) entry.grades.set(grade, (entry.grades.get(grade) || 0) + 1);
    if (gender) entry.genders.set(gender, (entry.genders.get(gender) || 0) + 1);
  }

  const escape = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  const headers = ["schoolNumber", "schoolName", "totalStudents", "gradesJson", "gendersJson"];
  const rows: string[] = [];
  for (const [schoolNumber, data] of bySchool) {
    const gradesObj: Record<string, number> = {};
    for (const [g, c] of data.grades) gradesObj[g] = c;
    const gendersObj: Record<string, number> = {};
    for (const [g, c] of data.genders) gendersObj[g] = c;
    const gradesJson = JSON.stringify(gradesObj);
    const gendersJson = JSON.stringify(gendersObj);
    rows.push([escape(schoolNumber), escape(data.name || ""), String(data.total), escape(gradesJson), escape(gendersJson)].join(","));
  }
  return [headers.join(","), ...rows].join("\n");
}

/**
 * Generate an age-group CSV. Buckets is an array of [min,max] pairs in years, last bucket may have max=null for open-ended.
 * Output columns: bucketLabel, count
 */
export function generateAgeGroupReportCsv(records: StudentRecord[], buckets?: Array<[number, number | null]>): string {
  const defaultBuckets: Array<[number, number | null]> = [[0,4],[5,9],[10,14],[15,19],[20,null]];
  const b = buckets ?? defaultBuckets;
  const counts = new Array(b.length).fill(0);
  const today = new Date().toISOString().slice(0, 10);
  for (const r of records) {
    const bd = (r.fields.BirthDate || "").trim();
    const age = ageOnDate(bd, today);
    if (age === null) continue;
    for (let i = 0; i < b.length; i++) {
      const [min, max] = b[i];
      if (age >= min && (max === null || age <= max)) {
        counts[i]++;
        break;
      }
    }
  }
  const headers = ["bucket", "count"];
  const rows: string[] = [];
  for (let i = 0; i < b.length; i++) {
    const [min, max] = b[i];
    const label = max === null ? `${min}+` : `${min}-${max}`;
    rows.push(`${label},${counts[i]}`);
  }
  return [headers.join(","), ...rows].join("\n");
}
