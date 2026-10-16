import { describe, expect, it } from "vitest";
import { issueCategory, CATEGORY_LABELS } from "../lib/issueCategories";
import type { IssueCategory } from "../lib/issueCategories";

describe("issueCategories", () => {
  it("maps STIX rule IDs to the correct category", () => {
    expect(issueCategory("REQUIRED_FIELD", "stix")).toBe("required");
    expect(issueCategory("FIELD_LENGTH", "stix")).toBe("text-constraint");
    expect(issueCategory("BIRTHDATE_FORMAT", "stix")).toBe("date");
    expect(issueCategory("OEN_DUPLICATE", "stix")).toBe("identity");
    expect(issueCategory("POSTAL_CODE_FORMAT", "stix")).toBe("address");
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
      "file-structure", "metadata", "required", "date", "identity", "vaccine",
      "coded-value", "address", "contact", "text-constraint", "other",
    ];
    for (const cat of categories) expect(CATEGORY_LABELS[cat]).toBeTruthy();
  });
});
