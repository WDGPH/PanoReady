/**
 * STIX XML validator — Phase 1 of PLAN.md
 *
 * Runs structural + rules validation and produces ValidationIssue records.
 * Also provides helpers for applying fixes back to XML and exporting reports.
 */

import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { standardizeUnit } from "./cleaner";
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
} from "./canonical";

// ─── XML helpers (mirrored from cleaner.ts) ───────────────────────────────────

type XmlNode = Record<string, unknown>;

function ensureArray<T>(x: T | T[] | null | undefined): T[] {
  if (x === null || x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

function str(x: unknown): string {
  if (x === null || x === undefined) return "";
  if (typeof x === "object") {
    const obj = x as XmlNode;
    if (obj["#text"] !== undefined) return String(obj["#text"]);
    return "";
  }
  return String(x);
}

function getTextValue(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (node && typeof node === "object") {
    const obj = node as XmlNode;
    if (typeof obj["#text"] === "string") return obj["#text"];
    if (typeof obj["#text"] === "number") return String(obj["#text"]);
  }
  return "";
}

function setTextValue(parent: XmlNode, key: string, value: string) {
  const existing = parent[key];
  if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
    (existing as XmlNode)["#text"] = value;
  } else {
    parent[key] = value;
  }
}

// ─── Phone number validation helper ──────────────────────────────────────────

const VALID_PHONE_RE = /^\d{3}-\d{3}-\d{4}$/;

function checkPhone(
  rawPhone: string,
  fieldLabel: string,
  placeholderPhones: Set<string>
): { message: string; autoFixable: boolean; suggestedFix?: string } | null {
  const trimmed = rawPhone.trim();

  // Already in correct format
  if (VALID_PHONE_RE.test(trimmed)) {
    const areaCode = trimmed.slice(0, 3);
    // NANP: area codes cannot start with 0 or 1
    if (areaCode.startsWith("0") || areaCode.startsWith("1")) {
      return { message: `${fieldLabel} "${rawPhone}" has an invalid area code (${areaCode}).`, autoFixable: false };
    }
    if (placeholderPhones.has(trimmed)) {
      return { message: `${fieldLabel} "${rawPhone}" appears to be a placeholder number.`, autoFixable: false };
    }
    return null; // valid
  }

  // Multiple numbers
  if (/[;\/]/.test(trimmed)) {
    return { message: `${fieldLabel} "${rawPhone}" contains multiple phone numbers. Only one number in XXX-XXX-XXXX format is accepted.`, autoFixable: false };
  }

  // Letters indicate appended notes, extensions, or other text (e.g., "call 1st", "ex 233", "(cell)")
  if (/[a-z]/i.test(trimmed)) {
    return { message: `${fieldLabel} "${rawPhone}" contains non-numeric characters or notes. Enter only the 10-digit number in XXX-XXX-XXXX format.`, autoFixable: false };
  }

  // Extract digits and attempt normalization
  const digits = trimmed.replace(/\D/g, "");
  let effective = digits;

  // Strip leading country code 1 if exactly 11 digits
  if (digits.length === 11 && digits.startsWith("1")) {
    effective = digits.slice(1);
  }

  if (effective.length < 10) {
    return { message: `${fieldLabel} "${rawPhone}" has too few digits (${effective.length}). Phone numbers must be 10 digits in XXX-XXX-XXXX format.`, autoFixable: false };
  }
  if (effective.length > 10) {
    return { message: `${fieldLabel} "${rawPhone}" has too many digits. Phone numbers must be exactly 10 digits in XXX-XXX-XXXX format.`, autoFixable: false };
  }

  const areaCode = effective.slice(0, 3);
  const formatted = `${effective.slice(0, 3)}-${effective.slice(3, 6)}-${effective.slice(6, 10)}`;

  if (areaCode.startsWith("0") || areaCode.startsWith("1")) {
    return { message: `${fieldLabel} "${rawPhone}" has an invalid area code (${areaCode}).`, autoFixable: false };
  }
  if (placeholderPhones.has(formatted)) {
    return { message: `${fieldLabel} "${rawPhone}" appears to be a placeholder number.`, autoFixable: false };
  }

  return { message: `${fieldLabel} "${rawPhone}" is not in the required XXX-XXX-XXXX format.`, autoFixable: true, suggestedFix: formatted };
}

// ─── XML parser (standalone) ──────────────────────────────────────────────────

/**
 * Parse a STIX XML string into StudentRecord[].
 * Throws a descriptive Error for structural failures (bad XML, missing root,
 * no schools) so callers can surface the message without running validation.
 * Note: schools with zero <ns1:Student> elements produce no records here;
 * the empty-school warning is handled by validateXml internally.
 */
export function parseStixXml(xmlText: string): StudentRecord[] {
  const upload = parseCanonicalXml(xmlText);
  if (upload.schools.length === 0) throw new Error("No <School> elements found.");
  return upload.schools.flatMap((school, schoolIndex) => school.students.map((student, studentIndex) => ({
    id: `school${schoolIndex}:student${studentIndex}`,
    xmlPath: `SchoolUpload/School[${school.schoolNumber || school.name || schoolIndex + 1}]/Students/Student[${studentIndex}]`,
    fields: flattenCanonicalStudent(student, school),
  })));
}

// ─── Core validator ───────────────────────────────────────────────────────────

export function legacyValidateXml(
  xmlText: string,
  rules: RulesProfile = defaultRules
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const records: StudentRecord[] = [];

  // 1. XML well-formedness
  let doc: XmlNode;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      parseAttributeValue: false,
      parseTagValue: false,
      textNodeName: "#text",
      isArray: (name) => name === "ns1:School" || name === "ns1:Student",
    });
    doc = parser.parse(xmlText) as XmlNode;
  } catch (e) {
    issues.push({
      id: "parse-error",
      severity: "error",
      message: `XML parse error: ${e instanceof Error ? e.message : String(e)}`,
      autoFixable: false,
      ruleId: "XML_WELLFORMED",
    });
    return { issues, records, schoolCount: 0, studentCount: 0, gate: "BLOCKED" };
  }

  // 2. Root structure
  const root = doc["ns1:SchoolUpload"] as XmlNode | null;
  if (!root) {
    issues.push({
      id: "root-missing",
      severity: "error",
      message:
        'Root element <ns1:SchoolUpload> not found. This may not be a valid STIX file.',
      autoFixable: false,
      ruleId: "STRUCT_ROOT",
    });
    return { issues, records, schoolCount: 0, studentCount: 0, gate: "BLOCKED" };
  }

  const schools = ensureArray(root["ns1:School"] as XmlNode | XmlNode[]);
  if (schools.length === 0) {
    issues.push({
      id: "no-schools",
      severity: "error",
      message: "No <ns1:School> elements found.",
      autoFixable: false,
      ruleId: "STRUCT_SCHOOLS",
    });
    return { issues, records, schoolCount: 0, studentCount: 0, gate: "BLOCKED" };
  }

  // Alias lookups
  const gradeAliases = rules.gradeAliases as Record<string, string>;
  const genderAliases = rules.genderAliases as Record<string, string>;

  let totalStudents = 0;
  const seenOens = new Map<string, string>();
  const seenNameDob = new Map<string, string>();

  for (let si = 0; si < schools.length; si++) {
    const school = schools[si];
    const schoolName = str(school["ns1:Name"]);
    const schoolNumber = str(school["ns1:SchoolNumber"]);
    const schoolLabel = schoolNumber || schoolName || `School #${si + 1}`;

    if (!schoolNumber) {
      issues.push({
        id: `school-${si}-no-number`,
        severity: "error",
        message: `School "${schoolName || "(unnamed)"}" is missing SchoolNumber.`,
        schoolNumber: "",
        autoFixable: false,
        ruleId: "SCHOOL_NUMBER_REQUIRED",
      });
    }

    const studentsNode = (school["ns1:Students"] ?? {}) as XmlNode;
    const studentNodes = ensureArray(
      studentsNode["ns1:Student"] as XmlNode | XmlNode[]
    );

    // Empty Students element — school exists but has no student records
    if (studentNodes.length === 0) {
      issues.push({
        id: `school-${si}-empty-students`,
        severity: "warning",
        schoolNumber,
        message: `School "${schoolLabel}" has a Students element but contains no student records.`,
        autoFixable: false,
        ruleId: "EMPTY_STUDENTS",
      });
    }

    for (let pi = 0; pi < studentNodes.length; pi++) {
      const s = studentNodes[pi];
      const nameNode = (s["ns1:Name"] ?? {}) as XmlNode;
      const aliasNode = (s["ns1:AliasName"] ?? {}) as XmlNode;
      const addrNode = (s["ns1:Address"] ?? {}) as XmlNode;

      const firstName = str(nameNode["ns1:First"]);
      const middleName = str(nameNode["ns1:Middle"]);
      const lastName = str(nameNode["ns1:Last"]);
      const aliasFirst = str(aliasNode["ns1:First"]);
      const aliasMiddle = str(aliasNode["ns1:Middle"]);
      const aliasLast = str(aliasNode["ns1:Last"]);
      const birthDate = str(s["ns1:BirthDate"]);
      const grade = str(s["ns1:Grade"]);
      const gender = str(s["ns1:Gender"]);
      const oen = str(s["ns1:OEN"]);
      const language = str(s["ns1:Language"]);
      const contactPhone = str(s["ns1:ContactPhone"]);
      const city = str(addrNode["ns1:City"]);
      const province = str(addrNode["ns1:Province"]);
      const postalCode = str(addrNode["ns1:PostalCode"]);
      const streetNumber = str(addrNode["ns1:StreetNumber"]);
      const streetName = str(addrNode["ns1:StreetName"]);
      const streetNumberSuffix = str(addrNode["ns1:StreetNumberSuffix"]);
      const unit = str(addrNode["ns1:Unit"]);

      const studentName =
        [firstName, lastName].filter(Boolean).join(" ") || `Student #${pi + 1}`;
      const recordId = `school${si}:student${pi}`;
      totalStudents++;

      const fields: Record<string, string> = {
        SchoolName: schoolName,
        SchoolNumber: schoolNumber,
        FirstName: firstName,
        MiddleName: middleName,
        LastName: lastName,
        AliasFirstName: aliasFirst,
        AliasMiddleName: aliasMiddle,
        AliasLastName: aliasLast,
        BirthDate: birthDate,
        Grade: grade,
        Gender: gender,
        OEN: oen,
        Language: language,
        ContactPhone: contactPhone,
        City: city,
        Province: province,
        PostalCode: postalCode,
        StreetNumber: streetNumber,
        StreetName: streetName,
        StreetNumberSuffix: streetNumberSuffix,
        Unit: unit,
      };

      records.push({
        id: recordId,
        xmlPath: `ns1:SchoolUpload/ns1:School[${schoolLabel}]/ns1:Students/ns1:Student[${pi}]`,
        fields,
      });

      const base = { recordId, schoolNumber, studentName };

      // 3. Required fields
      for (const field of rules.requiredFields) {
        const val = fields[field] ?? "";
        if (!val.trim()) {
          issues.push({
            ...base,
            id: `${recordId}-req-${field}`,
            severity: "error",
            field,
            message: `${field} is required but missing or empty.`,
            autoFixable: false,
            ruleId: "REQUIRED_FIELD",
          });
        }
      }

      // 4. Grade allowed values
      if (grade) {
        const normalizedGrade = grade.trim().toUpperCase();
        if (!rules.allowedGradeValues.includes(normalizedGrade)) {
          const alias = gradeAliases[normalizedGrade] ?? gradeAliases[grade.trim()];
          issues.push({
            ...base,
            id: `${recordId}-grade-invalid`,
            severity: "error",
            field: "Grade",
            message: `Grade "${grade}" is not a recognized value.`,
            suggestedFix: alias ? alias : undefined,
            autoFixable: !!alias,
            ruleId: "GRADE_ALLOWED_VALUE",
          });
        }
      }

      // 5. Gender allowed values
      if (gender) {
        const normalizedGender = gender.trim().toUpperCase();
        if (!rules.allowedGenderValues.includes(normalizedGender)) {
          const alias = genderAliases[gender.trim()] ?? genderAliases[normalizedGender];
          issues.push({
            ...base,
            id: `${recordId}-gender-invalid`,
            severity: "error",
            field: "Gender",
            message: `Gender "${gender}" is not a recognized value. Use M, F, Unk, Other, X, or N.`,
            suggestedFix: alias ? alias : undefined,
            autoFixable: !!alias,
            ruleId: "GENDER_ALLOWED_VALUE",
          });
        }
      }

      // 6. Province allowed values
      if (province) {
        const normalizedProvince = province.trim().toUpperCase();
        if (!rules.allowedProvinceValues.includes(normalizedProvince)) {
          issues.push({
            ...base,
            id: `${recordId}-province-invalid`,
            severity: "warning",
            field: "Province",
            message: `Province "${province}" is not a recognized Canadian province/territory code.`,
            autoFixable: false,
            ruleId: "PROVINCE_ALLOWED_VALUE",
          });
        }
      }

      // 7. BirthDate format (YYYY-MM-DD)
      if (birthDate) {
        const datePattern = /^\d{4}-\d{2}-\d{2}$/;
        if (!datePattern.test(birthDate.trim())) {
          const d = new Date(birthDate);
          const canNormalize = !isNaN(d.getTime());
          issues.push({
            ...base,
            id: `${recordId}-birthdate-format`,
            severity: "error",
            field: "BirthDate",
            message: `BirthDate "${birthDate}" is not in YYYY-MM-DD format.`,
            suggestedFix: canNormalize ? d.toISOString().slice(0, 10) : undefined,
            autoFixable: canNormalize,
            ruleId: "BIRTHDATE_FORMAT",
          });
        } else {
          const year = parseInt(birthDate.slice(0, 4));
          const currentYear = new Date().getFullYear();
          if (year < 1990 || year > currentYear - 3) {
            issues.push({
              ...base,
              id: `${recordId}-birthdate-range`,
              severity: "warning",
              field: "BirthDate",
              message: `BirthDate year ${year} seems unusual for school enrollment.`,
              autoFixable: false,
              ruleId: "BIRTHDATE_RANGE",
            });
          }
        }
      }

      // 8. Postal code format
      if (postalCode) {
        const postalPattern = new RegExp(rules.postalCodePattern, "i");
        if (!postalPattern.test(postalCode.trim())) {
          issues.push({
            ...base,
            id: `${recordId}-postal-format`,
            severity: "warning",
            field: "PostalCode",
            message: `PostalCode "${postalCode}" does not match Canadian format (A1A 1A1).`,
            autoFixable: false,
            ruleId: "POSTAL_CODE_FORMAT",
          });
        }
      }

      // 9. OEN format (9 digits) — only if present
      if (oen) {
        if (!/^\d{9}$/.test(oen.trim())) {
          issues.push({
            ...base,
            id: `${recordId}-oen-format`,
            severity: "error",
            field: "OEN",
            message: `OEN "${oen}" must be exactly 9 digits.`,
            autoFixable: false,
            ruleId: "OEN_FORMAT",
          });
        } else if (rules.duplicateDetection.checkOen) {
          const oenKey = oen.trim();
          if (seenOens.has(oenKey)) {
            issues.push({
              ...base,
              id: `${recordId}-oen-dup`,
              severity: "error",
              field: "OEN",
              message: `OEN "${oenKey}" is duplicated (also used by ${seenOens.get(oenKey)}).`,
              autoFixable: false,
              ruleId: "OEN_DUPLICATE",
            });
          } else {
            seenOens.set(oenKey, studentName);
          }
        }
      }

      // 10. Field length limits
      for (const [field, maxLen] of Object.entries(rules.fieldLengths)) {
        const val = fields[field] ?? "";
        const limit = maxLen as number;
        if (val.length <= limit) continue;

        if (field === "Unit") {
          // Try smart abbreviation before reporting
          const [standardized, changed] = standardizeUnit(val);
          const canFix = changed && standardized.length <= limit;
          issues.push({
            ...base,
            id: `${recordId}-len-Unit`,
            severity: "error",
            field,
            message: `Unit "${val}" exceeds the ${limit}-character Panorama limit (${val.length} chars).`,
            suggestedFix: canFix ? standardized : undefined,
            autoFixable: canFix,
            ruleId: "UNIT_LENGTH",
          });
        } else if (field === "StreetNumber") {
          const looksLikeUnit = /^(apt\.?|unit|ph\.?)\s/i.test(val);
          const hasLetters = /[a-z]/i.test(val);
          const hint = looksLikeUnit
            ? ` Value looks like a unit/apartment number — move it to the Unit field.`
            : hasLetters
            ? ` Value contains letters; only the numeric street number (max ${limit} chars) belongs here.`
            : "";
          issues.push({
            ...base,
            id: `${recordId}-len-StreetNumber`,
            severity: "error",
            field,
            message: `StreetNumber "${val}" exceeds the ${limit}-character Panorama limit (${val.length} chars).${hint}`,
            autoFixable: false,
            ruleId: "STREET_NUMBER_LENGTH",
          });
        } else {
          issues.push({
            ...base,
            id: `${recordId}-len-${field}`,
            severity: "warning",
            field,
            message: `${field} exceeds maximum length of ${limit} characters (current: ${val.length}).`,
            suggestedFix: val.slice(0, limit),
            autoFixable: true,
            ruleId: "FIELD_LENGTH",
          });
        }
      }

      // 11. Whitespace (leading/trailing) on key text fields
      const textFields = [
        "FirstName", "MiddleName", "LastName", "Grade", "Gender",
        "OEN", "City", "PostalCode", "StreetName", "StreetNumber", "Unit",
      ];
      for (const field of textFields) {
        const val = fields[field];
        if (val && val !== val.trim()) {
          issues.push({
            ...base,
            id: `${recordId}-ws-${field}`,
            severity: "warning",
            field,
            message: `${field} has leading or trailing whitespace.`,
            suggestedFix: val.trim(),
            autoFixable: true,
            ruleId: "WHITESPACE_TRIM",
          });
        }
      }

      // 12. Duplicate name+DOB within same school
      if (
        rules.duplicateDetection.checkNameDobSchool &&
        firstName &&
        lastName &&
        birthDate
      ) {
        const dedupKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${birthDate}|${schoolNumber}`;
        if (seenNameDob.has(dedupKey)) {
          issues.push({
            ...base,
            id: `${recordId}-name-dob-dup`,
            severity: "warning",
            message: `Possible duplicate: ${studentName} (DOB ${birthDate}) appears more than once in school ${schoolLabel}.`,
            autoFixable: false,
            ruleId: "NAME_DOB_DUPLICATE",
          });
        } else {
          seenNameDob.set(dedupKey, recordId);
        }
      }

      // 13. Phone number format
      if (contactPhone) {
        const placeholderPhones = new Set(
          (rules.phoneConfig?.placeholderNumbers ?? []) as string[]
        );
        const phoneIssue = checkPhone(contactPhone, "ContactPhone", placeholderPhones);
        if (phoneIssue) {
          issues.push({
            ...base,
            id: `${recordId}-phone`,
            severity: "error",
            field: "ContactPhone",
            message: phoneIssue.message,
            suggestedFix: phoneIssue.suggestedFix,
            autoFixable: phoneIssue.autoFixable,
            ruleId: "PHONE_FORMAT",
          });
        }
      }
    }
  }

  const gate: GateState = issues.some((i) => i.severity === "error")
    ? "BLOCKED"
    : "READY";

  return {
    issues,
    records,
    schoolCount: schools.length,
    studentCount: totalStudents,
    gate,
  };
}

function issue(
  issues: ValidationIssue[],
  value: Omit<ValidationIssue, "id" | "autoFixable"> & { id?: string; autoFixable?: boolean },
) {
  issues.push({ id: value.id ?? `${value.ruleId}-${issues.length}`, autoFixable: value.autoFixable ?? false, ...value });
}

function validRealDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function canonicalPhoneIssue(value: string): string | null {
  if (!/^\d{3}-\d{3}-\d{4}(?:x\d{1,5})?$/.test(value)) return "must use 999-999-9999 with an optional x1–5 digit extension";
  const digits = value.replace(/\D/g, "");
  if (/[01]/.test(digits[0]) || /[01]/.test(digits[3])) return "has an invalid area-code or exchange first digit";
  return null;
}

/** Namespace-aware validation of the canonical STIX model. */
export function validateXml(xmlText: string, rules: RulesProfile = defaultRules): ValidationResult {
  const issues: ValidationIssue[] = [];
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
  const metadataRequired: Array<[string, string]> = [
    ["CreateDate", metadata.createDate], ["CreateTime", metadata.createTime], ["CreatedBy", metadata.createdBy],
    ["ContactPhone", metadata.contactPhone?.number ?? ""], ["ContactEmail", metadata.contactEmail], ["FullUpload", metadata.fullUpload],
  ];
  for (const [field, value] of metadataRequired) if (!value.trim()) issue(issues, { severity: "error", field, ruleId: "METADATA_REQUIRED", layer: "CANONICAL", message: `${field} is required but missing.` });
  if (metadata.createDate && (!validRealDate(metadata.createDate) || metadata.createDate > new Date().toISOString().slice(0, 10))) issue(issues, { severity: "error", field: "CreateDate", ruleId: "METADATA_DATE", layer: "CANONICAL", message: "CreateDate must be a real YYYY-MM-DD date no later than today." });
  if (metadata.createTime && !/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(metadata.createTime)) issue(issues, { severity: "error", field: "CreateTime", ruleId: "METADATA_TIME", layer: "CANONICAL", message: "CreateTime must use HH:mm:ss." });
  if (metadata.createdBy && (metadata.createdBy.length < 1 || metadata.createdBy.length > 100)) issue(issues, { severity: "error", field: "CreatedBy", ruleId: "METADATA_CREATED_BY", layer: "CANONICAL", message: "CreatedBy must contain 1–100 characters." });
  if (metadata.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(metadata.contactEmail)) issue(issues, { severity: "error", field: "ContactEmail", ruleId: "METADATA_EMAIL", layer: "CANONICAL", message: "ContactEmail is not a valid email address." });
  if (metadata.fullUpload && !rules.allowedFullLoadTypeValues.includes(metadata.fullUpload)) issue(issues, { severity: "error", field: "FullUpload", ruleId: "FULL_UPLOAD_ALLOWED_VALUE", layer: "CANONICAL", message: `FullUpload "${metadata.fullUpload}" is not allowed.` });
  if (metadata.boardNumber && !/^(?:B\d{5}|D[A-Z]{2}\d{3})$/.test(metadata.boardNumber)) issue(issues, { severity: "error", field: "BoardNumber", ruleId: "BOARD_NUMBER_FORMAT", layer: "CANONICAL", message: "BoardNumber must be B plus 5 digits or D plus 2 letters and 3 digits." });
  if (metadata.contactPhone) {
    const message = canonicalPhoneIssue(metadata.contactPhone.number);
    if (message) issue(issues, { severity: "error", field: "ContactPhone", ruleId: "METADATA_PHONE", layer: "CANONICAL", message: `ContactPhone ${message}.` });
    if (metadata.contactPhone.type && !rules.allowedPhoneTypeValues.includes(metadata.contactPhone.type)) issue(issues, { severity: "error", field: "PhoneType", ruleId: "PHONE_TYPE_ALLOWED_VALUE", layer: "CANONICAL", message: `Contact phone type "${metadata.contactPhone.type}" is not allowed.` });
  }

  const seenOens = new Map<string, string>();
  const seenIdentity = new Map<string, string>();
  const allowedByField: Record<string, string[]> = {
    Grade: rules.allowedGradeValues, Gender: ["F", "M", "Unk", "Other"], Province: rules.allowedProvinceValues,
    Language: rules.allowedLanguageValues, CountryOfOrigin: rules.allowedCountryValues, StreetType: rules.allowedStreetTypeValues,
    StreetDirection: rules.allowedStreetDirectionValues, GuardianRelationship: rules.allowedRelationshipValues,
    Guardian2Relationship: rules.allowedRelationshipValues, PhoneType: rules.allowedPhoneTypeValues,
    GuardianPhoneType: rules.allowedPhoneTypeValues, Guardian2PhoneType: rules.allowedPhoneTypeValues,
  };
  for (let schoolIndex = 0; schoolIndex < upload.schools.length; schoolIndex++) {
    const school = upload.schools[schoolIndex];
    if (!school.schoolNumber) issue(issues, { severity: "error", field: "SchoolNumber", schoolNumber: "", ruleId: "SCHOOL_NUMBER_REQUIRED", layer: "CANONICAL", message: `School "${school.name || schoolIndex + 1}" is missing SchoolNumber.` });
    else if (school.schoolNumber.length > 100) issue(issues, { severity: "error", field: "SchoolNumber", schoolNumber: school.schoolNumber, ruleId: "SCHOOL_NUMBER_LENGTH", layer: "CANONICAL", message: "SchoolNumber exceeds 100 characters." });
    if (school.students.length === 0) issue(issues, { severity: "warning", schoolNumber: school.schoolNumber, ruleId: "EMPTY_STUDENTS", layer: "CANONICAL", message: `School "${school.name || school.schoolNumber}" has no students.` });
    for (let studentIndex = 0; studentIndex < school.students.length; studentIndex++) {
      const student = school.students[studentIndex];
      const fields = flattenCanonicalStudent(student, school);
      const recordId = `school${schoolIndex}:student${studentIndex}`;
      const studentName = [fields.FirstName, fields.LastName].filter(Boolean).join(" ") || `Student #${studentIndex + 1}`;
      const base = { recordId, studentName, schoolNumber: school.schoolNumber, layer: "CANONICAL" as const };
      records.push({ id: recordId, xmlPath: `SchoolUpload/School[${school.schoolNumber || schoolIndex}]/Students/Student[${studentIndex}]`, fields });
      for (const field of rules.requiredFields.filter((required) => required !== "SchoolNumber")) if (!(fields[field] ?? "").trim()) issue(issues, { ...base, severity: "error", field, ruleId: "REQUIRED_FIELD", message: `${field} is required but missing or empty.` });
      for (const [field, allowed] of Object.entries(allowedByField)) {
        const value = fields[field];
        if (value && !allowed.includes(value)) issue(issues, { ...base, severity: "error", field, ruleId: `${field.toUpperCase()}_ALLOWED_VALUE`, message: `${field} value "${value}" is not allowed.` });
      }
      if (fields.BirthDate) {
        if (!validRealDate(fields.BirthDate)) issue(issues, { ...base, severity: "error", field: "BirthDate", ruleId: "BIRTHDATE_FORMAT", message: `BirthDate "${fields.BirthDate}" must be a real YYYY-MM-DD date.` });
        else if (fields.BirthDate > new Date().toISOString().slice(0, 10)) issue(issues, { ...base, severity: "error", field: "BirthDate", ruleId: "BIRTHDATE_FUTURE", message: "BirthDate cannot be in the future." });
      }
      if (fields.OEN) {
        if (!/^\d{9}$/.test(fields.OEN)) issue(issues, { ...base, severity: "error", field: "OEN", ruleId: "OEN_FORMAT", message: `OEN "${fields.OEN}" must contain exactly 9 digits.` });
        else if (seenOens.has(fields.OEN)) issue(issues, { ...base, severity: "error", field: "OEN", ruleId: "OEN_DUPLICATE", message: `OEN "${fields.OEN}" is duplicated with ${seenOens.get(fields.OEN)}.` });
        else seenOens.set(fields.OEN, studentName);
      }
      if (fields.PostalCode && !new RegExp(rules.postalCodePattern, "i").test(fields.PostalCode)) issue(issues, { ...base, severity: "error", field: "PostalCode", ruleId: "POSTAL_CODE_FORMAT", message: `PostalCode "${fields.PostalCode}" is invalid.` });
      for (const [field, limit] of Object.entries(rules.fieldLengths)) if ((fields[field] ?? "").length > limit) issue(issues, { ...base, severity: "error", field, ruleId: "FIELD_LENGTH", message: `${field} exceeds its ${limit}-character limit.` });
      for (const field of ["Phone", "GuardianPhoneNumber", "Guardian2PhoneNumber"]) {
        const value = fields[field];
        if (!value) continue;
        const message = canonicalPhoneIssue(value);
        if (message) issue(issues, { ...base, severity: "error", field, ruleId: "PHONE_FORMAT", message: `${field} ${message}.` });
      }
      const identity = `${fields.FirstName.toLowerCase()}|${fields.LastName.toLowerCase()}|${fields.BirthDate}`;
      if (fields.FirstName && fields.LastName && fields.BirthDate) {
        if (seenIdentity.has(identity)) issue(issues, { ...base, severity: "warning", ruleId: "IDENTITY_REVIEW", layer: "IDENTITY", message: `Possible duplicate identity also seen in ${seenIdentity.get(identity)}; review is required.` });
        else seenIdentity.set(identity, studentName);
      }
    }
  }
  issue(issues, { severity: "warning", ruleId: "XSD_SCHEMA_UNAVAILABLE", layer: "XSD", message: "The official studentuploaddata.xsd is not bundled, so final XSD validation is still required before submission." });
  const hasErrors = issues.some((finding) => finding.severity === "error");
  const gate: GateState = hasErrors ? "BLOCKED" : "REVIEW_REQUIRED";
  return { issues, records, schoolCount: upload.schools.length, studentCount: records.length, gate, xsdValidated: false };
}

// ─── Fix application ──────────────────────────────────────────────────────────

/**
 * Field-name → XML path within a student node.
 * Name sub-fields live under ns1:Name, address sub-fields under ns1:Address.
 */
const FIELD_TO_XML: Record<string, { parent: "name" | "alias" | "addr" | "direct" | "school"; tag: string }> = {
  SchoolName:         { parent: "school", tag: "ns1:Name" },
  SchoolNumber:       { parent: "school", tag: "ns1:SchoolNumber" },
  FirstName:          { parent: "name",   tag: "ns1:First" },
  MiddleName:         { parent: "name",   tag: "ns1:Middle" },
  LastName:           { parent: "name",   tag: "ns1:Last" },
  AliasFirstName:     { parent: "alias",  tag: "ns1:First" },
  AliasMiddleName:    { parent: "alias",  tag: "ns1:Middle" },
  AliasLastName:      { parent: "alias",  tag: "ns1:Last" },
  BirthDate:          { parent: "direct", tag: "ns1:BirthDate" },
  Grade:              { parent: "direct", tag: "ns1:Grade" },
  Gender:             { parent: "direct", tag: "ns1:Gender" },
  OEN:                { parent: "direct", tag: "ns1:OEN" },
  Language:           { parent: "direct", tag: "ns1:Language" },
  Class:              { parent: "direct", tag: "ns1:Class" },
  ContactPhone:       { parent: "direct", tag: "ns1:ContactPhone" },
  City:               { parent: "addr",   tag: "ns1:City" },
  Province:           { parent: "addr",   tag: "ns1:Province" },
  PostalCode:         { parent: "addr",   tag: "ns1:PostalCode" },
  StreetNumber:       { parent: "addr",   tag: "ns1:StreetNumber" },
  StreetNumberSuffix: { parent: "addr",   tag: "ns1:StreetNumberSuffix" },
  StreetName:         { parent: "addr",   tag: "ns1:StreetName" },
  StreetType:         { parent: "addr",   tag: "ns1:StreetType" },
  StreetDirection:    { parent: "direct", tag: "ns1:StreetDirection" },
  RuralRoute:         { parent: "direct", tag: "ns1:RuralRoute" },
  PoBoxNumber:        { parent: "direct", tag: "ns1:PoBoxNumber" },
  PhoneType:          { parent: "direct", tag: "ns1:PhoneType" },
  GuardianFirstName:  { parent: "direct", tag: "ns1:GuardianFirstName" },
  GuardianLastName:   { parent: "direct", tag: "ns1:GuardianLastName" },
  GuardianRelationship: { parent: "direct", tag: "ns1:GuardianRelationship" },
  GuardianPhoneNumber: { parent: "direct", tag: "ns1:GuardianPhoneNumber" },
  GuardianPhoneType:  { parent: "direct", tag: "ns1:GuardianPhoneType" },
  Guardian2FirstName: { parent: "direct", tag: "ns1:Guardian2FirstName" },
  Guardian2LastName:  { parent: "direct", tag: "ns1:Guardian2LastName" },
  Guardian2Relationship: { parent: "direct", tag: "ns1:Guardian2Relationship" },
  Guardian2PhoneNumber: { parent: "direct", tag: "ns1:Guardian2PhoneNumber" },
  Guardian2PhoneType:  { parent: "direct", tag: "ns1:Guardian2PhoneType" },
  Unit:               { parent: "addr",   tag: "ns1:Unit" },
};

function applyFieldFix(studentNode: XmlNode, schoolNode: XmlNode, field: string, value: string) {
  const mapping = FIELD_TO_XML[field];
  if (!mapping) return;

  if (mapping.parent === "school") {
    setTextValue(schoolNode, mapping.tag, value);
  } else if (mapping.parent === "name") {
    const nameNode = (studentNode["ns1:Name"] ?? {}) as XmlNode;
    studentNode["ns1:Name"] = nameNode;
    setTextValue(nameNode, mapping.tag, value);
  } else if (mapping.parent === "alias") {
    const aliasNode = (studentNode["ns1:AliasName"] ?? {}) as XmlNode;
    studentNode["ns1:AliasName"] = aliasNode;
    setTextValue(aliasNode, mapping.tag, value);
  } else if (mapping.parent === "addr") {
    const addrNode = (studentNode["ns1:Address"] ?? {}) as XmlNode;
    studentNode["ns1:Address"] = addrNode;
    setTextValue(addrNode, mapping.tag, value);
  } else {
    setTextValue(studentNode, mapping.tag, value);
  }
}

/** Parse recordId → { schoolIndex, studentIndex } */
function decodeRecordId(recordId: string): { si: number; pi: number } | null {
  const m = recordId.match(/^school(\d+):student(\d+)$/);
  if (!m) return null;
  return { si: parseInt(m[1]), pi: parseInt(m[2]) };
}

/** Apply a list of AppliedFix objects to original XML and return cleaned XML string */
export function legacyApplyValidationFixes(xmlText: string, fixes: AppliedFix[]): string {
  if (fixes.length === 0) return xmlText;

  // Group fixes by recordId
  const byRecord = new Map<string, AppliedFix[]>();
  for (const fix of fixes) {
    if (!byRecord.has(fix.recordId)) byRecord.set(fix.recordId, []);
    byRecord.get(fix.recordId)!.push(fix);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTagValue: false,
    textNodeName: "#text",
    isArray: (name) => name === "ns1:School" || name === "ns1:Student",
  });
  const doc = parser.parse(xmlText) as XmlNode;
  const root = doc["ns1:SchoolUpload"] as XmlNode;
  if (!root) return xmlText;

  const schools = ensureArray(root["ns1:School"] as XmlNode | XmlNode[]);

  for (const [recordId, recordFixes] of byRecord) {
    const coords = decodeRecordId(recordId);
    if (!coords) continue;
    const school = schools[coords.si];
    if (!school) continue;
    const studentsNode = (school["ns1:Students"] ?? {}) as XmlNode;
    const studentNodes = ensureArray(studentsNode["ns1:Student"] as XmlNode | XmlNode[]);
    const studentNode = studentNodes[coords.pi];
    if (!studentNode) continue;

    for (const fix of recordFixes) {
      applyFieldFix(studentNode, school as XmlNode, fix.field, fix.newValue);
    }
  }

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    format: true,
    indentBy: "  ",
    suppressEmptyNode: false,
  });

  return `<?xml version="1.0" encoding="utf-8"?>\n` + builder.build(doc);
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

/** Apply fixes through the canonical model so every namespace-prefix form behaves identically. */
export function applyValidationFixes(xmlText: string, fixes: AppliedFix[]): string {
  if (fixes.length === 0) return xmlText;
  const upload = parseCanonicalXml(xmlText);
  for (const fix of fixes) {
    const coordinates = decodeRecordId(fix.recordId);
    if (!coordinates) continue;
    const school = upload.schools[coordinates.si];
    const student = school?.students[coordinates.pi];
    if (school && student) setCanonicalStudentField(student, school, fix.field, fix.newValue);
  }
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
  const now = new Date();
  for (const r of records) {
    const bd = (r.fields.BirthDate || "").trim();
    if (!bd) continue;
    const m = bd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let age: number | null = null;
    if (m) {
      const y = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const d = parseInt(m[3], 10);
      const dob = new Date(y, mo, d);
      if (!isNaN(dob.getTime())) {
        age = now.getFullYear() - dob.getFullYear();
        const mDiff = now.getMonth() - dob.getMonth();
        if (mDiff < 0 || (mDiff === 0 && now.getDate() < dob.getDate())) age--;
      }
    } else {
      // try Date parse of other formats
      const parsed = new Date(bd);
      if (!isNaN(parsed.getTime())) {
        age = now.getFullYear() - parsed.getFullYear();
        const mDiff = now.getMonth() - parsed.getMonth();
        if (mDiff < 0 || (mDiff === 0 && now.getDate() < parsed.getDate())) age--;
      }
    }
    if (age === null || age < 0) continue;
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
