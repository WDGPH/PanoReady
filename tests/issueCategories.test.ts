import { describe, expect, it } from "vitest";
import { issueCategory, CATEGORY_LABELS } from "../lib/issueCategories";
import type { IssueCategory } from "../lib/issueCategories";

describe("issueCategories", () => {
  it("maps STIX rule IDs to the correct category", () => {
    expect(issueCategory("REQUIRED_FIELD", "stix")).toBe("required");
    expect(issueCategory("FIELD_LENGTH", "stix")).toBe("field-length");
    expect(issueCategory("BIRTHDATE_FORMAT", "stix")).toBe("dates");
    expect(issueCategory("OEN_DUPLICATE", "stix")).toBe("identity");
    expect(issueCategory("POSTAL_CODE_FORMAT", "stix")).toBe("postal-code");
    expect(issueCategory("PHONE_FORMAT", "stix")).toBe("contact");
    expect(issueCategory("PHONETYPE_ALLOWED_VALUE", "stix")).toBe("contact");
    // file-level contact phone type is metadata, not the same as per-record PHONETYPE_ALLOWED_VALUE
    expect(issueCategory("PHONE_TYPE_ALLOWED_VALUE", "stix")).toBe("metadata");
    expect(issueCategory("STREETTYPE_ALLOWED_VALUE", "stix")).toBe("address");
    expect(issueCategory("RURAL_ROUTE_FORMAT", "stix")).toBe("address");
    expect(issueCategory("FREE_TEXT_APOSTROPHE", "stix")).toBe("character-policy");
    expect(issueCategory("METADATA_REQUIRED", "stix")).toBe("metadata");
    expect(issueCategory("FULL_UPLOAD_ALLOWED_VALUE", "stix")).toBe("metadata");
    expect(issueCategory("GRADE_ALLOWED_VALUE", "stix")).toBe("coded-values");
  });
  it("maps PHIX rule IDs to the correct category", () => {
    expect(issueCategory("PHIX_PARSE_FAILURE", "phix")).toBe("parse");
    expect(issueCategory("PHIX_REQUIRED_FIELD", "phix")).toBe("required");
    expect(issueCategory("PHIX_IMMUNIZING_AGENT_ALLOWED_VALUE", "phix")).toBe("vaccine");
    expect(issueCategory("PHIX_AGENT_TRADENAME_CONFLICT", "phix")).toBe("vaccine");
    expect(issueCategory("PHIX_STREET_TYPE_ALLOWED_VALUE", "phix")).toBe("address");
    expect(issueCategory("PHIX_CITY_PROVINCE_MISMATCH", "phix")).toBe("address");
    expect(issueCategory("PHIX_DOB_FORMAT", "phix")).toBe("dates");
    expect(issueCategory("PHIX_HCN_FORMAT", "phix")).toBe("identity");
    expect(issueCategory("PHIX_GENDER_ALLOWED_VALUE", "phix")).toBe("coded-values");
    // RELATIONSHIP is a coded administrative field (SELF/PARENT/GUARDIAN), not contact info
    expect(issueCategory("PHIX_RELATIONSHIP_ALLOWED_VALUE", "phix")).toBe("coded-values");
    expect(issueCategory("PHIX_POSTAL_CODE_REPAIR", "phix")).toBe("postal-code");
    expect(issueCategory("PHIX_PHONE_FORMAT", "phix")).toBe("contact");
    // PHONE_TYPE is a submitter contact field, grouped with contact rather than coded-values
    expect(issueCategory("PHIX_PHONE_TYPE_ALLOWED_VALUE", "phix")).toBe("contact");
    expect(issueCategory("PHIX_SUBMITTER_EMAIL_FORMAT", "phix")).toBe("contact");
    expect(issueCategory("PHIX_FIELD_LENGTH", "phix")).toBe("field-length");
    expect(issueCategory("PHIX_SDL_ALLOWED_VALUE", "phix")).toBe("service-delivery");
    expect(issueCategory("PHIX_ORGANIZATION_ALLOWED_VALUE", "phix")).toBe("service-delivery");
  });
  it("falls back to 'other' for unmapped rule IDs", () => {
    expect(issueCategory("UNKNOWN_RULE", "stix")).toBe("other");
    expect(issueCategory("UNKNOWN_RULE", "phix")).toBe("other");
  });
  it("does not cross-contaminate workflows", () => {
    expect(issueCategory("PHIX_PARSE_FAILURE", "stix")).toBe("other");
    expect(issueCategory("REQUIRED_FIELD", "phix")).toBe("other");
  });
  it("CATEGORY_LABELS has an entry for every IssueCategory", () => {
    const categories: IssueCategory[] = [
      "parse", "metadata", "required", "dates", "identity", "vaccine",
      "coded-values", "address", "postal-code", "contact", "field-length",
      "character-policy", "service-delivery", "other",
    ];
    for (const cat of categories) expect(CATEGORY_LABELS[cat]).toBeTruthy();
  });
});
