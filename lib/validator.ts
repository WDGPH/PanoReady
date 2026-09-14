/**
 * STIX XML validator.
 *
 * Runs structural + rules validation and produces ValidationIssue records.
 * Also provides helpers for applying fixes back to XML and exporting reports.
 */

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
  type CanonicalUpload,
} from "./canonical";
import { commitChangeGroup } from "./session";
import {
  ADDRESS_REPAIR_FIELDS,
  analyzeAlternateDeliveryInStreetFields,
  analyzeStreetNumberRepair,
  analyzeStreetNumberUnitPrefix,
  analyzeUnitOverflow,
  standardizeUnit,
} from "./addressRepair";
import { SCHOOL_FIELDS } from "./fields";

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
  issues.push({ id: value.id ?? `${value.ruleId}-${issues.length}`, autoFixable: value.autoFixable ?? false, ...value });
}

/** Derive the release gate from the findings that apply to the exact output. */
export function gateForIssues(issues: ValidationIssue[]): GateState {
  if (issues.some((finding) => finding.severity === "error")) return "BLOCKED";
  return issues.some((finding) => finding.severity === "warning" && finding.ruleId !== "PHONE_CANADIAN_AREA_CODE")
    ? "REVIEW_REQUIRED"
    : "READY";
}

function validRealDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

/** Return age on an exact calendar date, or null for invalid/future birth dates. */
export function ageOnDate(birthDate: string, referenceDate: string): number | null {
  if (!validRealDate(birthDate) || !validRealDate(referenceDate)) return null;
  const [birthYear, birthMonth, birthDay] = birthDate.split("-").map(Number);
  const [referenceYear, referenceMonth, referenceDay] = referenceDate.split("-").map(Number);
  let age = referenceYear - birthYear;
  if (referenceMonth < birthMonth || (referenceMonth === birthMonth && referenceDay < birthDay)) age--;
  return age < 0 ? null : age;
}

/** Use an accepted source CreateDate, otherwise the explicit session date. */
export function chooseAgeReferenceDate(createDate: string, sessionDate: string): string {
  if (!validRealDate(sessionDate)) throw new Error("Session date must be a valid YYYY-MM-DD date.");
  return validRealDate(createDate) && createDate <= sessionDate ? createDate : sessionDate;
}

type CanonicalPhoneFinding = {
  severity: "error" | "warning" | "info";
  message: string;
  autoFixable: boolean;
  suggestedFix?: string;
  ruleId: string;
};

const SAFE_TRAILING_PHONE_NOTE = /[\s\-*/(),.!]*(?:(?:please\s+)?call\b[\s\-*/(),.!]*)?\b(?:1st|first|2nd|second|3rd|third)\b[\s\-*/(),.!]*(?:call\b[\s\-*/(),.!]*)?$|[\s\-*/(),.!]*\bcell\b[\s\-*/(),.!]*$/i;

function safePhoneNoteFix(raw: string): string | undefined {
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
  const noteFix = safePhoneNoteFix(raw);
  if (noteFix) {
    return [{
      severity: "error",
      message: `${label} "${raw}" can be safely normalized to "${noteFix}".`,
      suggestedFix: noteFix,
      autoFixable: true,
      ruleId: "PHONE_FORMAT",
    }];
  }
  const analysis = analyzePhoneNumber(raw);
  const placeholders = new Set(rules.phoneConfig.placeholderNumbers);
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
  const canadianAreaCodeCheck = rules.phoneConfig.canadianAreaCodeCheck;
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

/** Validate the canonical STIX model while preserving its stable local identities. */
export function validateCanonicalUpload(
  upload: CanonicalUpload,
  rules: RulesProfile = defaultRules as RulesProfile,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const records: StudentRecord[] = [];
  issues.push(...upload.diagnostics);
  const metadata = upload.metadata;
  const metadataRequired: Array<[string, string, string]> = [
    ["CreateDate", metadata.createDate, "CreateDate"], ["CreateTime", metadata.createTime, "CreateTime"], ["CreatedBy", metadata.createdBy, "CreatedBy"],
    ["MetadataContactPhone", metadata.contactPhone?.number ?? "", "ContactPhone"], ["ContactEmail", metadata.contactEmail, "ContactEmail"], ["FullUpload", metadata.fullUpload, "FullUpload"],
  ];
  const metadataBase = { recordId: "metadata", studentName: "File metadata", layer: "CANONICAL" as const };
  for (const [field, value, label] of metadataRequired) if (!value.trim()) issue(issues, { ...metadataBase, severity: "error", field, currentValue: value, ruleId: "METADATA_REQUIRED", message: `${label} is required but missing.` });
  if (metadata.createDate && (!validRealDate(metadata.createDate) || metadata.createDate > new Date().toISOString().slice(0, 10))) issue(issues, { ...metadataBase, severity: "error", field: "CreateDate", currentValue: metadata.createDate, ruleId: "METADATA_DATE", message: "CreateDate must be a real YYYY-MM-DD date no later than today." });
  if (metadata.createTime && !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(metadata.createTime)) issue(issues, { ...metadataBase, severity: "error", field: "CreateTime", currentValue: metadata.createTime, ruleId: "METADATA_TIME", message: "CreateTime must use HH:mm:ss." });
  if (metadata.createdBy && (metadata.createdBy.length < 1 || metadata.createdBy.length > 100)) issue(issues, { ...metadataBase, severity: "error", field: "CreatedBy", currentValue: metadata.createdBy, ruleId: "METADATA_CREATED_BY", message: "CreatedBy must contain 1–100 characters." });
  if (metadata.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(metadata.contactEmail)) issue(issues, { ...metadataBase, severity: "error", field: "ContactEmail", currentValue: metadata.contactEmail, ruleId: "METADATA_EMAIL", message: "ContactEmail is not a valid email address." });
  if (metadata.fullUpload && !rules.allowedFullLoadTypeValues.includes(metadata.fullUpload)) issue(issues, { ...metadataBase, severity: "error", field: "FullUpload", currentValue: metadata.fullUpload, ruleId: "FULL_UPLOAD_ALLOWED_VALUE", message: `FullUpload "${metadata.fullUpload}" is not allowed.` });
  if (metadata.boardNumber && !/^(?:B\d{5}|D[A-Z]{2}\d{3})$/.test(metadata.boardNumber)) issue(issues, { ...metadataBase, severity: "error", field: "BoardNumber", currentValue: metadata.boardNumber, ruleId: "BOARD_NUMBER_FORMAT", message: "BoardNumber must be B plus 5 digits or D plus 2 letters and 3 digits." });
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
    if (metadata.contactPhone.type && !rules.allowedPhoneTypeValues.includes(metadata.contactPhone.type)) issue(issues, { ...metadataBase, severity: "error", field: "MetadataContactPhoneType", currentValue: metadata.contactPhone.type, ruleId: "PHONE_TYPE_ALLOWED_VALUE", message: `Contact phone type "${metadata.contactPhone.type}" is not allowed.` });
  }

  type SeenIdentity = { studentName: string; schoolId: string; schoolNumber: string; schoolName: string };
  const seenOens = new Map<string, SeenIdentity[]>();
  const seenIdentity = new Map<string, SeenIdentity[]>();
  const allowedByField: Record<string, string[]> = {
    Grade: rules.allowedGradeValues, Gender: rules.allowedGenderValues, Province: rules.allowedProvinceValues,
    Language: rules.allowedLanguageValues, CountryOfOrigin: rules.allowedCountryValues, StreetType: rules.allowedStreetTypeValues,
    StreetDirection: rules.allowedStreetDirectionValues, GuardianRelationship: rules.allowedRelationshipValues,
    Guardian2Relationship: rules.allowedRelationshipValues, PhoneType: rules.allowedPhoneTypeValues,
    GuardianPhoneType: rules.allowedPhoneTypeValues, Guardian2PhoneType: rules.allowedPhoneTypeValues,
  };
  const aliasByField: Record<string, Record<string, string> | undefined> = { Grade: rules.gradeAliases, Gender: rules.genderAliases };
  const schoolFields = new Set<string>(SCHOOL_FIELDS);
  const schoolNumberCounts = new Map<string, number>();
  for (const school of upload.schools) if (school.schoolNumber) schoolNumberCounts.set(school.schoolNumber, (schoolNumberCounts.get(school.schoolNumber) ?? 0) + 1);
  for (let schoolIndex = 0; schoolIndex < upload.schools.length; schoolIndex++) {
    const school = upload.schools[schoolIndex];
    const schoolBase = { recordId: school.schoolId, targetId: school.schoolId, studentName: school.name || `School ${schoolIndex + 1}`, schoolNumber: school.schoolNumber };
    if (rules.requiredFields.includes("SchoolNumber") && !school.schoolNumber) issue(issues, { ...schoolBase, severity: "error", field: "SchoolNumber", currentValue: school.schoolNumber, ruleId: "SCHOOL_NUMBER_REQUIRED", layer: "CANONICAL", message: `School "${school.name || schoolIndex + 1}" is missing SchoolNumber.` });
    if (rules.requiredFields.includes("SchoolName") && !school.name) issue(issues, { ...schoolBase, severity: "error", field: "SchoolName", currentValue: school.name, ruleId: "REQUIRED_FIELD", layer: "CANONICAL", message: "SchoolName is required but missing or empty." });
    if (school.schoolNumber && (schoolNumberCounts.get(school.schoolNumber) ?? 0) > 1) issue(issues, { ...schoolBase, severity: "error", field: "SchoolNumber", currentValue: school.schoolNumber, ruleId: "SCHOOL_NUMBER_DUPLICATE", layer: "IDENTITY", message: `SchoolNumber "${school.schoolNumber}" appears in more than one School container.` });
    if (school.schoolNumber.length > 100) issue(issues, { ...schoolBase, severity: "error", field: "SchoolNumber", currentValue: school.schoolNumber, ruleId: "SCHOOL_NUMBER_LENGTH", layer: "CANONICAL", message: "SchoolNumber exceeds 100 characters." });
    if (school.students.length === 0) issue(issues, { severity: "error", schoolNumber: school.schoolNumber, ruleId: "EMPTY_STUDENTS", layer: "CANONICAL", message: `School "${school.name || school.schoolNumber}" has no students. Panorama rejects a Students element with no Student records.` });
    for (let studentIndex = 0; studentIndex < school.students.length; studentIndex++) {
      const student = school.students[studentIndex];
      const fields = flattenCanonicalStudent(student, school);
      const recordId = student.recordId;
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
            targetId: guardian.guardianId,
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
        if (!validRealDate(fields.BirthDate)) {
          issue(issues, { ...base, severity: "error", field: "BirthDate", ruleId: "BIRTHDATE_FORMAT", message: `BirthDate "${fields.BirthDate}" must be a real YYYY-MM-DD date. Confirm the source date and enter it explicitly.`, autoFixable: false });
        } else if (fields.BirthDate > new Date().toISOString().slice(0, 10)) issue(issues, { ...base, severity: "error", field: "BirthDate", ruleId: "BIRTHDATE_FUTURE", message: "BirthDate cannot be in the future." });
      }
      if (fields.OEN) {
        if (!/^\d{9}$/.test(fields.OEN)) issue(issues, { ...base, severity: "error", field: "OEN", ruleId: "OEN_FORMAT", message: `OEN "${fields.OEN}" must contain exactly 9 digits.` });
        else if (rules.duplicateDetection.checkOen) {
          const priorOccurrences = seenOens.get(fields.OEN) ?? [];
          const prior = priorOccurrences.find((entry) => entry.schoolId === school.schoolId) ?? priorOccurrences[0];
          if (prior?.schoolId === school.schoolId) {
            issue(issues, { ...base, severity: "error", field: "OEN", ruleId: "OEN_DUPLICATE", message: `OEN "${fields.OEN}" is duplicated with ${prior.studentName} in the same school (${school.name || school.schoolNumber}).` });
          } else if (prior) {
            issue(issues, { ...base, severity: "warning", field: "OEN", ruleId: "OEN_DUAL_ENROLLMENT", message: `OEN "${fields.OEN}" also appears at ${prior.schoolName || prior.schoolNumber} (${prior.schoolNumber}) as ${prior.studentName}; review for dual enrollment.` });
          }
          priorOccurrences.push({ studentName, schoolId: school.schoolId, schoolNumber: school.schoolNumber, schoolName: school.name });
          seenOens.set(fields.OEN, priorOccurrences);
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
          issue(issues, { ...base, severity: "error", field, ruleId: "FIELD_LENGTH", message: `${field} exceeds its ${limit}-character limit. Review the complete value; PanoReady will not shorten it automatically.`, autoFixable: false });
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
        const priorOccurrences = seenIdentity.get(identity) ?? [];
        const priorIdentity = priorOccurrences.find((entry) => entry.schoolId === school.schoolId) ?? priorOccurrences[0];
        if (priorIdentity?.schoolId === school.schoolId) {
          issue(issues, { ...base, severity: "error", ruleId: "NAME_DOB_DUPLICATE", layer: "IDENTITY", message: `Possible duplicate: ${studentName} (DOB ${fields.BirthDate}) also appears as ${priorIdentity.studentName} in the same school (${school.name || school.schoolNumber}).` });
        } else if (priorIdentity) {
          issue(issues, { ...base, severity: "warning", ruleId: "IDENTITY_REVIEW", layer: "IDENTITY", message: `Same name and birth date also appear at ${priorIdentity.schoolName || priorIdentity.schoolNumber} (${priorIdentity.schoolNumber}) as ${priorIdentity.studentName}; review for dual enrollment.` });
        }
        priorOccurrences.push({ studentName, schoolId: school.schoolId, schoolNumber: school.schoolNumber, schoolName: school.name });
        seenIdentity.set(identity, priorOccurrences);
      }
    }
  }
  const gate = gateForIssues(issues);
  return { issues, records, schoolCount: upload.schools.length, studentCount: records.length, gate };
}

/** Check external XML structure, then use the canonical semantic validator. */
export function validateXml(xmlText: string, rules: RulesProfile = defaultRules as RulesProfile): ValidationResult {
  try {
    return validateCanonicalUpload(parseCanonicalXml(xmlText), rules);
  } catch (error) {
    const issues: ValidationIssue[] = [];
    issue(issues, { severity: "error", ruleId: "XML_PARSE_OR_NAMESPACE", layer: "XML", message: error instanceof Error ? error.message : String(error) });
    return { issues, records: [], schoolCount: 0, studentCount: 0, gate: "BLOCKED" };
  }
}

// ─── Fix application ──────────────────────────────────────────────────────────

/** Apply fixes through the canonical model so every namespace-prefix form behaves identically. */
export function applyValidationFixes(xmlText: string, fixes: AppliedFix[]): string {
  if (fixes.length === 0) return xmlText;
  const upload = parseCanonicalXml(xmlText);
  const { document } = commitChangeGroup(upload, fixes, { label: "Apply validation corrections", origin: "manual" });
  return serializeCanonicalXml(document);
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
export function generateAgeGroupReportCsv(records: StudentRecord[], referenceDate: string, buckets?: Array<[number, number | null]>): string {
  const defaultBuckets: Array<[number, number | null]> = [[0,4],[5,9],[10,14],[15,19],[20,null]];
  const b = buckets ?? defaultBuckets;
  const counts = new Array(b.length).fill(0);
  if (!validRealDate(referenceDate)) throw new Error("Age reports require a valid YYYY-MM-DD reference date.");
  for (const r of records) {
    const bd = (r.fields.BirthDate || "").trim();
    const age = ageOnDate(bd, referenceDate);
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
