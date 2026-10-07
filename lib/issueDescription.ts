import type { ValidationIssue } from "./types";

/** Field names are schema labels; record values belong in the comparison table. */
export function issueFieldLabel(field: string): string {
  if (field === "OEN") return "OEN";
  if (field === "PoBoxNumber") return "PO box number";
  return field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2").toLowerCase();
}

/**
 * Generic review copy. Deliberately accept only rule and field metadata, never
 * diagnostic messages or values. New rules must keep the fallback data-free.
 */
export function issueDescription({ ruleId, field }: Pick<ValidationIssue, "ruleId" | "field">): string {
  const label = field ? issueFieldLabel(field) : "record";
  const subject = label.charAt(0).toUpperCase() + label.slice(1);
  if (ruleId.endsWith("_ALLOWED_VALUE") || ruleId === "ALLOWED_VALUE") return `${subject} contains an unsupported code.`;
  switch (ruleId) {
    case "REQUIRED_FIELD":
    case "METADATA_REQUIRED": return `${subject} is required but missing or empty.`;
    case "FIELD_LENGTH": return `${subject} exceeds its length limit.`;
    case "PHONE_FORMAT": return `${subject} is not in the required XXX-XXX-XXXX format.`;
    case "PHONE_NPA_STRUCTURE": return `${subject} has an invalid area code.`;
    case "PHONE_NXX_STRUCTURE": return `${subject} has an invalid phone exchange.`;
    case "PHONE_PLACEHOLDER": return `${subject} appears to be a placeholder number.`;
    case "PHONE_EXTENSION_FORMAT": return `${subject} has a missing or invalid extension.`;
    case "PHONE_EXTENSION_NORMALIZE": return `${subject} has a nonstandard extension format.`;
    case "PHONE_CANADIAN_AREA_CODE": return `${subject} does not use an active Canadian geographic area code.`;
    case "BIRTHDATE_FORMAT": return "Birth date is not a valid date in YYYY-MM-DD format.";
    case "BIRTHDATE_FUTURE": return "Birth date is in the future.";
    case "OEN_FORMAT": return "OEN does not contain exactly nine digits.";
    case "OEN_DUPLICATE": return "OEN is duplicated within the same school.";
    case "OEN_DUAL_ENROLLMENT": return "OEN appears at more than one school; possible dual enrollment.";
    case "NAME_DOB_DUPLICATE": return "The same name and birth date appear more than once within the school.";
    case "IDENTITY_REVIEW": return "The same name and birth date appear at more than one school.";
    case "EMPTY_GUARDIAN": return `${subject} is an empty placeholder.`;
    case "GUARDIAN_RELATIONSHIP_REQUIRED": return `${subject} is missing from a populated guardian record.`;
    case "EMPTY_STUDENTS": return "School has no student records.";
    case "SCHOOL_NUMBER_REQUIRED": return "School number is missing.";
    case "SCHOOL_NUMBER_LENGTH": return "School number exceeds its length limit.";
    case "BOARD_NUMBER_FORMAT": return "Board number is not in the required format.";
    case "METADATA_DATE": return "File creation date is invalid or in the future.";
    case "METADATA_TIME": return "File creation time is not in HH:mm:ss format.";
    case "METADATA_CREATED_BY": return "File author is missing or exceeds its length limit.";
    case "METADATA_EMAIL": return "Contact email is not a valid email address.";
    case "XML_PARSE_OR_NAMESPACE": return "The file has invalid XML or an unsupported namespace.";
    case "ALTERNATE_DELIVERY_IN_STREET_FIELD": return `${subject} contains a PO box reference.`;
    case "RURAL_ROUTE_IN_STREET_FIELD": return `${subject} contains a rural route reference.`;
    case "STREET_TYPE_IN_STREET_NAME": return "Street name contains a street type or direction.";
    case "STREET_NUMBER_UNIT_PREFIX": return "Street number may contain a unit prefix.";
    case "PO_BOX_NUMBER_FORMAT": return "PO box number contains text other than the box number.";
    case "RURAL_ROUTE_FORMAT": return "Rural route is not in the required RR number format.";
    case "POSTAL_CODE_NORMALIZE": return "Postal code has nonstandard spacing or capitalization.";
    case "POSTAL_CODE_REPAIR": return "Postal code contains a letter in a numeric position.";
    case "POSTAL_CODE_FORMAT": return "Postal code does not match the required format.";
    case "POSTAL_CODE_US_ZIP": return "Postal code appears to be a U.S. ZIP code.";
    case "FREE_TEXT_APOSTROPHE": return `${subject} contains an apostrophe.`;
    case "FREE_TEXT_QUOTATION": return `${subject} contains a quotation mark.`;
    case "FREE_TEXT_ACCENT": return `${subject} contains an accented letter.`;
    case "FREE_TEXT_SPECIAL_CHARACTER": return `${subject} contains a character not allowed by its field policy.`;
    default: return `${subject} needs review.`;
  }
}
