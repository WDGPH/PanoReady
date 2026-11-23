import { describe, expect, it } from "vitest";
import { issueCategory, CATEGORY_LABELS, phixCategories, stixCategories } from "../lib/issueCategories";
import { ADDRESS_FIELDS, REQUIRED_FIELDS } from "../lib/fields";
import { ALLOWED_VALUE_FIELDS } from "../lib/fieldValidation";
import { ISSUE_TYPE_LABELS } from "../workflows/stix/validation/overview";

describe("issueCategories", () => {
  it("maps STIX rule IDs to the correct category", () => {
    expect(issueCategory("XML_PARSE_OR_NAMESPACE", "stix")).toBe("file-structure");
    expect(issueCategory("REQUIRED_FIELD", "stix")).toBe("required");
    expect(issueCategory("FIELD_LENGTH", "stix")).toBe("text-constraint");
    expect(issueCategory("BIRTHDATE_FORMAT", "stix")).toBe("date");
    expect(issueCategory("OEN_DUPLICATE", "stix")).toBe("identity");
    expect(issueCategory("POSTAL_CODE_FORMAT", "stix")).toBe("address");
    expect(issueCategory("POSTAL_CODE_US_ZIP", "stix")).toBe("address");
    expect(issueCategory("PO_BOX_NUMBER_FORMAT", "stix")).toBe("address");
    expect(issueCategory("PHONE_FORMAT", "stix")).toBe("contact");
    expect(issueCategory("PHONETYPE_ALLOWED_VALUE", "stix")).toBe("contact");
    // file-level contact phone type is metadata, not the same as per-record PHONETYPE_ALLOWED_VALUE
    expect(issueCategory("PHONE_TYPE_ALLOWED_VALUE", "stix")).toBe("metadata");
    expect(issueCategory("STREETTYPE_ALLOWED_VALUE", "stix")).toBe("address");
    expect(issueCategory("RURAL_ROUTE_FORMAT", "stix")).toBe("address");
    expect(issueCategory("FREE_TEXT_APOSTROPHE", "stix")).toBe("text-constraint");
    expect(issueCategory("METADATA_REQUIRED", "stix")).toBe("metadata");
    expect(issueCategory("FULL_UPLOAD_ALLOWED_VALUE", "stix")).toBe("metadata");
    expect(issueCategory("GRADE_ALLOWED_VALUE", "stix")).toBe("coded-value");
  });
  it("maps PHIX rule IDs to the correct category", () => {
    expect(issueCategory("PHIX_PARSE_FAILURE", "phix")).toBe("file-structure");
    expect(issueCategory("PHIX_REQUIRED_FIELD", "phix")).toBe("required");
    expect(issueCategory("PHIX_IMMUNIZING_AGENT_ALLOWED_VALUE", "phix")).toBe("vaccine");
    expect(issueCategory("PHIX_AGENT_TRADENAME_CONFLICT", "phix")).toBe("vaccine");
    expect(issueCategory("PHIX_STREET_TYPE_ALLOWED_VALUE", "phix")).toBe("address");
    expect(issueCategory("PHIX_CITY_PROVINCE_MISMATCH", "phix")).toBe("address");
    expect(issueCategory("PHIX_DOB_FORMAT", "phix")).toBe("date");
    expect(issueCategory("PHIX_HCN_FORMAT", "phix")).toBe("identity");
    expect(issueCategory("PHIX_GENDER_ALLOWED_VALUE", "phix")).toBe("coded-value");
    // RELATIONSHIP is a coded administrative field (SELF/PARENT/GUARDIAN), not contact info
    expect(issueCategory("PHIX_RELATIONSHIP_ALLOWED_VALUE", "phix")).toBe("coded-value");
    expect(issueCategory("PHIX_POSTAL_CODE_REPAIR", "phix")).toBe("address");
    expect(issueCategory("PHIX_PHONE_FORMAT", "phix")).toBe("contact");
    // PHONE_TYPE is a submitter contact field, grouped with contact rather than coded-value
    expect(issueCategory("PHIX_PHONE_TYPE_ALLOWED_VALUE", "phix")).toBe("contact");
    expect(issueCategory("PHIX_SUBMITTER_EMAIL_FORMAT", "phix")).toBe("contact");
    expect(issueCategory("PHIX_FIELD_LENGTH", "phix")).toBe("text-constraint");
    expect(issueCategory("PHIX_SDL_ALLOWED_VALUE", "phix")).toBe("coded-value");
    expect(issueCategory("PHIX_ORGANIZATION_ALLOWED_VALUE", "phix")).toBe("coded-value");
  });
  it("maps every known STIX rule ID", () => {
    const ruleIds = [
      ...Object.keys(ISSUE_TYPE_LABELS),
      // built at runtime from the field name, so they have no label
      ...ALLOWED_VALUE_FIELDS.map(field => `${field.toUpperCase()}_ALLOWED_VALUE`),
      // fixed rule IDs without a label; add any new unlabelled rule here
      "FULL_UPLOAD_ALLOWED_VALUE", "PHONE_TYPE_ALLOWED_VALUE", "XML_PARSE_OR_NAMESPACE",
    ];
    expect(ruleIds.filter(ruleId => issueCategory(ruleId, "stix") === "other")).toEqual([]);
  });
  it.each([
    "REQUIRED_FIELD", "FIELD_LENGTH", "FREE_TEXT_APOSTROPHE", "FREE_TEXT_QUOTATION", "FREE_TEXT_ACCENT", "FREE_TEXT_SPECIAL_CHARACTER",
  ])("uses the field's category for the generic STIX rule %s", ruleId => {
    const own = issueCategory(ruleId, "stix");
    const grouped: Record<string, string> = {
      OEN: "identity", BirthDate: "date", SchoolNumber: "metadata", SchoolName: "metadata",
      Phone: "contact", PhoneType: "contact", GuardianPhoneNumber: "contact", GuardianPhoneType: "contact",
      Guardian2PhoneNumber: "contact", Guardian2PhoneType: "contact",
      // every address field except Province, which is a coded value
      ...Object.fromEntries(ADDRESS_FIELDS.filter(field => field !== "Province").map(field => [field, "address"])),
    };
    for (const field of REQUIRED_FIELDS) expect(issueCategory(ruleId, "stix", field), field).toBe(grouped[field] ?? own);
    // custom rulesets can name fields outside the catalog
    for (const field of ["", "NotAField"]) expect(issueCategory(ruleId, "stix", field)).toBe(own);
  });
  it("ignores the field for rules that already name what they check", () => {
    expect(issueCategory("PROVINCE_ALLOWED_VALUE", "stix", "Province")).toBe("coded-value");
    expect(issueCategory("GUARDIAN_RELATIONSHIP_REQUIRED", "stix", "GuardianRelationship")).toBe("required");
    expect(issueCategory("METADATA_REQUIRED", "stix", "PhoneType")).toBe("metadata");
    expect(issueCategory("PHONE_TYPE_ALLOWED_VALUE", "stix", "PhoneType")).toBe("metadata");
    expect(issueCategory("UNKNOWN_RULE", "stix", "StreetName")).toBe("other");
    expect(issueCategory("FIELD_LENGTH", "phix", "StreetName")).toBe("other");
  });
  it("does not split a field's missing and unlisted values, except for coded fields", () => {
    for (const field of ALLOWED_VALUE_FIELDS) {
      const unlisted = issueCategory(`${field.toUpperCase()}_ALLOWED_VALUE`, "stix", field);
      expect(issueCategory("REQUIRED_FIELD", "stix", field), field).toBe(unlisted === "coded-value" ? "required" : unlisted);
    }
  });
  it("falls back to 'other' for unmapped rule IDs", () => {
    expect(issueCategory("UNKNOWN_RULE", "stix")).toBe("other");
    expect(issueCategory("UNKNOWN_RULE", "phix")).toBe("other");
  });
  it("does not cross-contaminate workflows", () => {
    expect(issueCategory("PHIX_PARSE_FAILURE", "stix")).toBe("other");
    expect(issueCategory("REQUIRED_FIELD", "phix")).toBe("other");
  });
  it("has a non-empty label for every category", () => {
    for (const [category, label] of Object.entries(CATEGORY_LABELS)) expect(label.trim(), category).not.toBe("");
  });
  it("uses every category except 'other' in at least one mapping", () => {
    const used = new Set<string>([...Object.values(stixCategories), ...Object.values(phixCategories)]);
    for (const category of Object.keys(CATEGORY_LABELS)) if (category !== "other") expect(used.has(category), category).toBe(true);
  });
});
