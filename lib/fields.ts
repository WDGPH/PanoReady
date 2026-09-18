/**
 * Canonical field catalog shared by import mapping, validation, and ruleset UI.
 * Keep field names aligned with flattenCanonicalStudent().
 */

export const STUDENT_FIELDS = [
  "OEN", "Grade", "Class", "FirstName", "MiddleName", "LastName",
  "AliasFirstName", "AliasMiddleName", "AliasLastName", "Gender",
  "BirthDate", "Language", "CountryOfOrigin",
] as const;

export const STUDENT_PHONE_FIELDS = ["Phone", "PhoneType"] as const;

export const GUARDIAN_FIELDS = [
  "GuardianFirstName", "GuardianLastName", "GuardianRelationship",
  "GuardianPhoneNumber", "GuardianPhoneType",
] as const;

export const SECOND_GUARDIAN_FIELDS = [
  "Guardian2FirstName", "Guardian2LastName", "Guardian2Relationship",
  "Guardian2PhoneNumber", "Guardian2PhoneType",
] as const;

export const ADDRESS_FIELDS = [
  "Unit", "StreetNumber", "StreetNumberSuffix", "StreetName", "StreetType",
  "StreetDirection", "RuralRoute", "PoBoxNumber", "City", "Province",
  "PostalCode",
] as const;

export const SCHOOL_FIELDS = ["SchoolNumber", "SchoolName"] as const;

export type CanonicalField =
  | (typeof STUDENT_FIELDS)[number]
  | (typeof STUDENT_PHONE_FIELDS)[number]
  | (typeof GUARDIAN_FIELDS)[number]
  | (typeof SECOND_GUARDIAN_FIELDS)[number]
  | (typeof ADDRESS_FIELDS)[number];

export type RequiredField = CanonicalField | (typeof SCHOOL_FIELDS)[number];

export const CANONICAL_FIELDS: readonly CanonicalField[] = [
  ...STUDENT_FIELDS,
  ...STUDENT_PHONE_FIELDS,
  ...GUARDIAN_FIELDS,
  ...SECOND_GUARDIAN_FIELDS,
  ...ADDRESS_FIELDS,
];

export const REQUIRED_FIELD_GROUPS: ReadonlyArray<{
  label: string;
  fields: readonly RequiredField[];
}> = [
  { label: "Student", fields: STUDENT_FIELDS },
  { label: "Student phone", fields: STUDENT_PHONE_FIELDS },
  { label: "Guardian 1", fields: GUARDIAN_FIELDS },
  { label: "Guardian 2", fields: SECOND_GUARDIAN_FIELDS },
  { label: "Address", fields: ADDRESS_FIELDS },
  { label: "School", fields: SCHOOL_FIELDS },
];

export const REQUIRED_FIELDS: readonly RequiredField[] = REQUIRED_FIELD_GROUPS.flatMap(
  ({ fields }) => fields,
);

/** Whole-guardian edits use the same section keys as guardian removal fixes. */
export function guardianSectionForField(field: string): "Guardian" | "Guardian2" | undefined {
  if (field === "Guardian" || GUARDIAN_FIELDS.some(candidate => candidate === field)) return "Guardian";
  if (field === "Guardian2" || SECOND_GUARDIAN_FIELDS.some(candidate => candidate === field)) return "Guardian2";
}
