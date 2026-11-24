import type { RequiredField } from "./fields";

export type IssueCategory =
  | "file-structure"
  | "metadata"
  | "required"
  | "date"
  | "identity"
  | "vaccine"
  | "coded-value"
  | "address"
  | "contact"
  | "text-constraint"
  | "other";

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  "file-structure":  "File Structure",
  "metadata":        "File Metadata",
  "required":        "Required Fields",
  "date":            "Dates",
  "identity":        "Identity & Duplicates",
  "vaccine":         "Vaccine / Immunizing Agent",
  "coded-value":     "Coded Values",
  "address":         "Address & Postal Code",
  "contact":         "Contact",
  "text-constraint": "Text Constraints",
  "other":           "Other",
};

// Rule IDs are workflow-specific; each workflow maps its own IDs to the shared
// IssueCategory type. Both fall back to "other" for unmapped rule IDs.
// Generic rules run on many fields, so the field can set their category.

export const stixCategories: Record<string, IssueCategory> = {
  // file-structure
  XML_PARSE_OR_NAMESPACE: "file-structure",
  // required
  EMPTY_GUARDIAN: "required", GUARDIAN_RELATIONSHIP_REQUIRED: "required", REQUIRED_FIELD: "required",
  // date
  BIRTHDATE_FORMAT: "date", BIRTHDATE_FUTURE: "date",
  // identity
  OEN_FORMAT: "identity", OEN_DUPLICATE: "identity", OEN_DUAL_ENROLLMENT: "identity",
  NAME_DOB_DUPLICATE: "identity", IDENTITY_REVIEW: "identity",
  // contact — phone format rules and per-record phone-type allowed-value rules
  // (PHONE_TYPE_ALLOWED_VALUE is the file-level contact phone on the submission header; that stays "metadata")
  PHONE_FORMAT: "contact", PHONE_NPA_STRUCTURE: "contact", PHONE_NXX_STRUCTURE: "contact",
  PHONE_PLACEHOLDER: "contact", PHONE_EXTENSION_FORMAT: "contact", PHONE_EXTENSION_NORMALIZE: "contact",
  PHONE_CANADIAN_AREA_CODE: "contact",
  PHONETYPE_ALLOWED_VALUE: "contact", GUARDIANPHONETYPE_ALLOWED_VALUE: "contact", GUARDIAN2PHONETYPE_ALLOWED_VALUE: "contact",
  // address — street, PO box, rural route and postal code
  STREET_NUMBER_UNIT_PREFIX: "address", STREET_TYPE_IN_STREET_NAME: "address",
  ALTERNATE_DELIVERY_IN_STREET_FIELD: "address", PO_BOX_NUMBER_FORMAT: "address",
  RURAL_ROUTE_IN_STREET_FIELD: "address", RURAL_ROUTE_FORMAT: "address",
  STREETTYPE_ALLOWED_VALUE: "address", STREETDIRECTION_ALLOWED_VALUE: "address",
  POSTAL_CODE_NORMALIZE: "address", POSTAL_CODE_REPAIR: "address", POSTAL_CODE_FORMAT: "address",
  POSTAL_CODE_US_ZIP: "address",
  // text-constraint — field length and free-text character policy
  FIELD_LENGTH: "text-constraint",
  FREE_TEXT_APOSTROPHE: "text-constraint", FREE_TEXT_QUOTATION: "text-constraint",
  FREE_TEXT_ACCENT: "text-constraint", FREE_TEXT_SPECIAL_CHARACTER: "text-constraint",
  // metadata — file/submission-level rules, not per-record
  METADATA_REQUIRED: "metadata", METADATA_EMAIL: "metadata", METADATA_DATE: "metadata",
  METADATA_TIME: "metadata", METADATA_CREATED_BY: "metadata", EMPTY_STUDENTS: "metadata",
  SCHOOL_NUMBER_REQUIRED: "metadata", SCHOOL_NUMBER_LENGTH: "metadata", BOARD_NUMBER_FORMAT: "metadata",
  FULL_UPLOAD_ALLOWED_VALUE: "metadata", PHONE_TYPE_ALLOWED_VALUE: "metadata",
  // coded-value — all other allowed-value rules
  ALLOWED_VALUE: "coded-value",
  GRADE_ALLOWED_VALUE: "coded-value", GENDER_ALLOWED_VALUE: "coded-value",
  PROVINCE_ALLOWED_VALUE: "coded-value", LANGUAGE_ALLOWED_VALUE: "coded-value",
  COUNTRYOFORIGIN_ALLOWED_VALUE: "coded-value",
  GUARDIANRELATIONSHIP_ALLOWED_VALUE: "coded-value", GUARDIAN2RELATIONSHIP_ALLOWED_VALUE: "coded-value",
};

const stixFieldRules = new Set([
  "REQUIRED_FIELD", "FIELD_LENGTH",
  "FREE_TEXT_APOSTROPHE", "FREE_TEXT_QUOTATION", "FREE_TEXT_ACCENT", "FREE_TEXT_SPECIAL_CHARACTER",
]);

// null means the field has no group, so the generic rules keep their own category
const stixFieldCategories: Record<RequiredField, IssueCategory | null> = {
  // names and class
  FirstName: null, MiddleName: null, LastName: null,
  AliasFirstName: null, AliasMiddleName: null, AliasLastName: null,
  GuardianFirstName: null, GuardianLastName: null, Guardian2FirstName: null, Guardian2LastName: null,
  Class: null,
  // coded fields — a missing code is "required" and an unlisted code is "coded-value"
  // (Province is an address field, but its allowed-value rule is "coded-value")
  Grade: null, Gender: null, Language: null, CountryOfOrigin: null, Province: null,
  GuardianRelationship: null, Guardian2Relationship: null,
  // identity
  OEN: "identity",
  // date
  BirthDate: "date",
  // metadata
  SchoolNumber: "metadata", SchoolName: "metadata",
  // contact
  Phone: "contact", PhoneType: "contact", GuardianPhoneNumber: "contact", GuardianPhoneType: "contact",
  Guardian2PhoneNumber: "contact", Guardian2PhoneType: "contact",
  // address
  Unit: "address", StreetNumber: "address", StreetNumberSuffix: "address", StreetName: "address",
  StreetType: "address", StreetDirection: "address", RuralRoute: "address", PoBoxNumber: "address",
  City: "address", PostalCode: "address",
};

export const phixCategories: Record<string, IssueCategory> = {
  // file-structure
  PHIX_PARSE_FAILURE: "file-structure", PHIX_MISSING_HEADER: "file-structure", PHIX_NO_DATA: "file-structure",
  // required
  PHIX_REQUIRED_FIELD: "required",
  // vaccine
  PHIX_TRADE_NAME_ALLOWED_VALUE: "vaccine", PHIX_IMMUNIZING_AGENT_ALLOWED_VALUE: "vaccine",
  PHIX_AGENT_OR_TRADENAME_REQUIRED: "vaccine", PHIX_AGENT_AND_TRADENAME_INVALID: "vaccine",
  PHIX_IMMUNIZING_AGENT_DERIVED: "vaccine", PHIX_TRADE_NAME_INVALID: "vaccine",
  PHIX_AGENT_TRADENAME_CONFLICT: "vaccine",
  // address — street, city/province and postal code
  PHIX_STREET_NAME_REQUIRED: "address", PHIX_STREET_TYPE_ALLOWED_VALUE: "address",
  PHIX_STREET_DIRECTION_ALLOWED_VALUE: "address", PHIX_CITY_PROVINCE_MISMATCH: "address",
  PHIX_POSTAL_CODE: "address", PHIX_POSTAL_CODE_NORMALIZE: "address", PHIX_POSTAL_CODE_REPAIR: "address",
  // date
  PHIX_DOB_FORMAT: "date", PHIX_DOB_RANGE: "date",
  PHIX_DATE_ADMINISTERED_FORMAT: "date", PHIX_DATE_ADMINISTERED_FUTURE: "date",
  PHIX_DATE_ADMINISTERED_RANGE: "date", PHIX_DATE_ADMINISTERED_BEFORE_DOB: "date",
  PHIX_DATE_FORMAT: "date",
  // identity
  PHIX_HCN_FORMAT: "identity", PHIX_DUPLICATE_SUBMISSION: "identity",
  // coded-value — administrative codes that are not contact or address fields,
  // including organization and service delivery location (SDL)
  // (RELATIONSHIP is the submitter's coded relationship to the client, e.g. SELF/PARENT/GUARDIAN)
  PHIX_GENDER_ALLOWED_VALUE: "coded-value", PHIX_ADDRESS_TYPE_ALLOWED_VALUE: "coded-value",
  PHIX_RELATIONSHIP_ALLOWED_VALUE: "coded-value", PHIX_PROVINCE_ALLOWED_VALUE: "coded-value",
  PHIX_ESTIMATED_INDICATOR_ALLOWED_VALUE: "coded-value", PHIX_TIMEZONE_ALLOWED_VALUE: "coded-value",
  PHIX_DOSAGE_UOM_ALLOWED_VALUE: "coded-value", PHIX_SITE_ALLOWED_VALUE: "coded-value",
  PHIX_ROUTE_ALLOWED_VALUE: "coded-value", PHIX_REASON_ALLOWED_VALUE: "coded-value",
  PHIX_PROVIDER_ROLE_ALLOWED_VALUE: "coded-value",
  PHIX_ORGANIZATION_ALLOWED_VALUE: "coded-value", PHIX_SDL_ALLOWED_VALUE: "coded-value",
  // contact — submitter phone and email rules, including phone-type code
  PHIX_PHONE_FORMAT: "contact", PHIX_PHONE_FORMAT_NORMALIZE: "contact",
  PHIX_PHONE_TYPE_ALLOWED_VALUE: "contact", PHIX_SUBMITTER_EMAIL_FORMAT: "contact",
  // text-constraint
  PHIX_FIELD_LENGTH: "text-constraint",
};

const phixFieldRules = new Set(["PHIX_REQUIRED_FIELD", "PHIX_FIELD_LENGTH"]);

// PHIX fields are upper-case CSV headers; a header that is not listed has no group.
// Coded headers, including PROVINCE, have no group for the same reason as the STIX coded fields.
const phixFieldCategories: Record<string, IssueCategory> = {
  // identity
  "HEALTH CARD NUMBER": "identity",
  // date
  "DATE OF BIRTH": "date", "DATE ADMINISTERED": "date", "EXPIRY DATE": "date", "LOT EXPIRY DATE": "date",
  // vaccine
  "IMMUNIZING AGENT": "vaccine", "TRADE NAME": "vaccine",
  // contact
  "SUBMITTER PHONE NUMBER 1": "contact", "SUBMITTER PHONE NUMBER 2": "contact", "PHONE TYPE": "contact",
  "SUBMITTER EMAIL": "contact",
  // address
  "UNIT NUMBER": "address", "STREET NUMBER": "address", "STREET NAME": "address", "STREET TYPE": "address",
  "STREET DIRECTION": "address", "PO BOX": "address", "STN": "address", "RPO": "address", "RURAL ROUTE": "address",
  "ADDRESS LINE 1": "address", "ADDRESS LINE 2": "address", "CITY": "address", "POSTAL CODE": "address",
};

function fieldCategory(ruleId: string, workflow: "stix" | "phix", field: string): IssueCategory | null | undefined {
  if (workflow === "stix") return stixFieldRules.has(ruleId) ? stixFieldCategories[field as RequiredField] : null;
  return phixFieldRules.has(ruleId) ? phixFieldCategories[field.toUpperCase()] : null;
}

export function issueCategory(ruleId: string, workflow: "stix" | "phix", field = ""): IssueCategory {
  return fieldCategory(ruleId, workflow, field) ?? (workflow === "stix" ? stixCategories : phixCategories)[ruleId] ?? "other";
}
