export type IssueCategory =
  | "parse"
  | "metadata"
  | "required"
  | "dates"
  | "identity"
  | "vaccine"
  | "coded-values"
  | "address"
  | "postal-code"
  | "contact"
  | "field-length"
  | "character-policy"
  | "service-delivery"
  | "other";

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  "parse":            "Parse & Structure",
  "metadata":         "File Metadata",
  "required":         "Required Fields",
  "dates":            "Dates",
  "identity":         "Identity & Duplicates",
  "vaccine":          "Vaccine / Immunizing Agent",
  "coded-values":     "Coded Values",
  "address":          "Address",
  "postal-code":      "Postal Code",
  "contact":          "Contact",
  "field-length":     "Field Length",
  "character-policy": "Character Policy",
  "service-delivery": "Service Delivery",
  "other":            "Other",
};

// Rule IDs are workflow-specific; each workflow maps its own IDs to the shared
// IssueCategory type. Both fall back to "other" for unmapped rule IDs.

const stixCategories: Record<string, IssueCategory> = {
  // required
  EMPTY_GUARDIAN: "required", GUARDIAN_RELATIONSHIP_REQUIRED: "required", REQUIRED_FIELD: "required",
  // field-length
  FIELD_LENGTH: "field-length",
  // postal-code
  POSTAL_CODE_NORMALIZE: "postal-code", POSTAL_CODE_REPAIR: "postal-code", POSTAL_CODE_FORMAT: "postal-code",
  // dates
  BIRTHDATE_FORMAT: "dates", BIRTHDATE_FUTURE: "dates",
  // identity
  OEN_FORMAT: "identity", OEN_DUPLICATE: "identity", OEN_DUAL_ENROLLMENT: "identity",
  NAME_DOB_DUPLICATE: "identity", IDENTITY_REVIEW: "identity",
  // contact — phone format rules and per-record phone-type allowed-value rules
  // (PHONE_TYPE_ALLOWED_VALUE is the file-level contact phone on the submission header; that stays "metadata")
  PHONE_FORMAT: "contact", PHONE_NPA_STRUCTURE: "contact", PHONE_NXX_STRUCTURE: "contact",
  PHONE_PLACEHOLDER: "contact", PHONE_EXTENSION_FORMAT: "contact", PHONE_EXTENSION_NORMALIZE: "contact",
  PHONE_CANADIAN_AREA_CODE: "contact",
  PHONETYPE_ALLOWED_VALUE: "contact", GUARDIANPHONETYPE_ALLOWED_VALUE: "contact", GUARDIAN2PHONETYPE_ALLOWED_VALUE: "contact",
  // address
  STREET_NUMBER_UNIT_PREFIX: "address", STREET_TYPE_IN_STREET_NAME: "address",
  ALTERNATE_DELIVERY_IN_STREET_FIELD: "address", RURAL_ROUTE_IN_STREET_FIELD: "address", RURAL_ROUTE_FORMAT: "address",
  STREETTYPE_ALLOWED_VALUE: "address", STREETDIRECTION_ALLOWED_VALUE: "address",
  // character-policy
  FREE_TEXT_APOSTROPHE: "character-policy", FREE_TEXT_QUOTATION: "character-policy",
  FREE_TEXT_ACCENT: "character-policy", FREE_TEXT_SPECIAL_CHARACTER: "character-policy",
  // metadata — file/submission-level rules, not per-record
  METADATA_REQUIRED: "metadata", METADATA_EMAIL: "metadata", METADATA_DATE: "metadata",
  METADATA_TIME: "metadata", METADATA_CREATED_BY: "metadata", EMPTY_STUDENTS: "metadata",
  SCHOOL_NUMBER_REQUIRED: "metadata", SCHOOL_NUMBER_LENGTH: "metadata", BOARD_NUMBER_FORMAT: "metadata",
  FULL_UPLOAD_ALLOWED_VALUE: "metadata", PHONE_TYPE_ALLOWED_VALUE: "metadata",
  // coded-values — all other allowed-value rules
  ALLOWED_VALUE: "coded-values",
  GRADE_ALLOWED_VALUE: "coded-values", GENDER_ALLOWED_VALUE: "coded-values",
  PROVINCE_ALLOWED_VALUE: "coded-values", LANGUAGE_ALLOWED_VALUE: "coded-values",
  COUNTRYOFORIGIN_ALLOWED_VALUE: "coded-values",
  GUARDIANRELATIONSHIP_ALLOWED_VALUE: "coded-values", GUARDIAN2RELATIONSHIP_ALLOWED_VALUE: "coded-values",
};

const phixCategories: Record<string, IssueCategory> = {
  // parse
  PHIX_PARSE_FAILURE: "parse", PHIX_MISSING_HEADER: "parse", PHIX_NO_DATA: "parse",
  // required
  PHIX_REQUIRED_FIELD: "required",
  // vaccine
  PHIX_TRADE_NAME_ALLOWED_VALUE: "vaccine", PHIX_IMMUNIZING_AGENT_ALLOWED_VALUE: "vaccine",
  PHIX_AGENT_OR_TRADENAME_REQUIRED: "vaccine", PHIX_AGENT_AND_TRADENAME_INVALID: "vaccine",
  PHIX_IMMUNIZING_AGENT_DERIVED: "vaccine", PHIX_TRADE_NAME_INVALID: "vaccine",
  PHIX_AGENT_TRADENAME_CONFLICT: "vaccine",
  // address
  PHIX_STREET_NAME_REQUIRED: "address", PHIX_STREET_TYPE_ALLOWED_VALUE: "address",
  PHIX_STREET_DIRECTION_ALLOWED_VALUE: "address", PHIX_CITY_PROVINCE_MISMATCH: "address",
  // dates
  PHIX_DOB_FORMAT: "dates", PHIX_DOB_RANGE: "dates",
  PHIX_DATE_ADMINISTERED_FORMAT: "dates", PHIX_DATE_ADMINISTERED_FUTURE: "dates",
  PHIX_DATE_ADMINISTERED_RANGE: "dates", PHIX_DATE_ADMINISTERED_BEFORE_DOB: "dates",
  PHIX_DATE_FORMAT: "dates",
  // identity
  PHIX_HCN_FORMAT: "identity", PHIX_DUPLICATE_SUBMISSION: "identity",
  // coded-values — administrative codes that are not contact or address fields
  // (RELATIONSHIP is the submitter's coded relationship to the client, e.g. SELF/PARENT/GUARDIAN)
  PHIX_GENDER_ALLOWED_VALUE: "coded-values", PHIX_ADDRESS_TYPE_ALLOWED_VALUE: "coded-values",
  PHIX_RELATIONSHIP_ALLOWED_VALUE: "coded-values", PHIX_PROVINCE_ALLOWED_VALUE: "coded-values",
  PHIX_ESTIMATED_INDICATOR_ALLOWED_VALUE: "coded-values", PHIX_TIMEZONE_ALLOWED_VALUE: "coded-values",
  PHIX_DOSAGE_UOM_ALLOWED_VALUE: "coded-values", PHIX_SITE_ALLOWED_VALUE: "coded-values",
  PHIX_ROUTE_ALLOWED_VALUE: "coded-values", PHIX_REASON_ALLOWED_VALUE: "coded-values",
  PHIX_PROVIDER_ROLE_ALLOWED_VALUE: "coded-values",
  // postal-code
  PHIX_POSTAL_CODE: "postal-code", PHIX_POSTAL_CODE_NORMALIZE: "postal-code", PHIX_POSTAL_CODE_REPAIR: "postal-code",
  // contact — submitter phone and email rules, including phone-type code
  PHIX_PHONE_FORMAT: "contact", PHIX_PHONE_FORMAT_NORMALIZE: "contact",
  PHIX_PHONE_TYPE_ALLOWED_VALUE: "contact", PHIX_SUBMITTER_EMAIL_FORMAT: "contact",
  // field-length
  PHIX_FIELD_LENGTH: "field-length",
  // service-delivery
  PHIX_ORGANIZATION_ALLOWED_VALUE: "service-delivery", PHIX_SDL_ALLOWED_VALUE: "service-delivery",
};

export function issueCategory(ruleId: string, workflow: "stix" | "phix"): IssueCategory {
  return (workflow === "stix" ? stixCategories : phixCategories)[ruleId] ?? "other";
}
