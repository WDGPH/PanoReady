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
  "GuardianFirstName", "GuardianMiddleName", "GuardianLastName", "GuardianRelationship",
  "GuardianPhoneNumber", "GuardianPhoneType",
] as const;

export const SECOND_GUARDIAN_FIELDS = [
  "Guardian2FirstName", "Guardian2MiddleName", "Guardian2LastName", "Guardian2Relationship",
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

/** Display the supported STIX element hierarchy, including phone attributes. */
export function fieldHierarchy(field: string): string | undefined {
  const metadata: Record<string, string> = {
    CreateDate: "CreateDate", CreateTime: "CreateTime", CreatedBy: "CreatedBy",
    ContactEmail: "ContactEmail", FullUpload: "FullUpload",
    MetadataContactPhone: "ContactPhone", MetadataContactPhoneType: "ContactPhone/@type",
    BoardNumber: "SchoolBoard/BoardNumber", BoardName: "SchoolBoard/Name",
  };
  if (metadata[field]) return `SchoolUpload/Metadata/${metadata[field]}`;
  if (field === "SchoolNumber" || field === "SchoolName") return `SchoolUpload/School/${field === "SchoolName" ? "Name" : field}`;
  const root = "SchoolUpload/School/Students/Student";
  const guardian = field.match(/^Guardian(2)?(FirstName|MiddleName|LastName|Relationship|PhoneNumber|PhoneType)?$/);
  if (guardian) {
    const part = guardian[2];
    const leaf = part?.endsWith("Name") ? `Name/${part.replace("Name", "")}` : part === "PhoneType" ? "Phone/@type" : part === "PhoneNumber" ? "Phone" : part;
    return `${root}/Guardian[${guardian[1] ? 2 : 1}]${leaf ? `/${leaf}` : ""}`;
  }
  if ((ADDRESS_FIELDS as readonly string[]).includes(field)) return `${root}/Address/${field}`;
  const name = field.match(/^(Alias)?(First|Middle|Last)Name$/);
  if (name) return `${root}/${name[1] ? "AliasName" : "Name"}/${name[2]}`;
  if (field === "PhoneType") return `${root}/Phone/@type`;
  if ((CANONICAL_FIELDS as readonly string[]).includes(field)) return `${root}/${field}`;
}
