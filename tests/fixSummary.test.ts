import { describe, expect, it } from "vitest";
import { countAppliedCorrections, deduplicateAppliedFixes, summarizeAppliedCorrections } from "../lib/fixSummary";
import type { AppliedFix, ReviewAction } from "../lib/types";

function fix(overrides: Partial<AppliedFix>): AppliedFix {
  return {
    issueId: "issue-1",
    recordId: "school0:student0",
    field: "StreetName",
    oldValue: "Main St.",
    newValue: "Main",
    ruleId: "test",
    appliedAt: 1,
    ...overrides,
  };
}

describe("fix summaries", () => {
  it("counts coordinated address field changes as one correction", () => {
    const fixes = [
      fix({ field: "StreetName", repairId: "address-1" }),
      fix({ field: "StreetType", oldValue: "", newValue: "ST", repairId: "address-1" }),
      fix({ issueId: "issue-2", field: "City", oldValue: "Exampleville.", newValue: "Exampleville" }),
    ];

    expect(fixes).toHaveLength(3);
    expect(countAppliedCorrections(fixes)).toBe(2);
  });

  it("deduplicates identical field writes from overlapping findings within a batch", () => {
    const fixes = [
      fix({ issueId: "apostrophe", ruleId: "FREE_TEXT_APOSTROPHE", oldValue: "O'Renée", newValue: "ORenee" }),
      fix({ issueId: "accent", ruleId: "FREE_TEXT_ACCENT", oldValue: "O'Renée", newValue: "ORenee" }),
      fix({ issueId: "other-record", recordId: "school0:student1", oldValue: "O'Renée", newValue: "ORenee" }),
    ];

    expect(deduplicateAppliedFixes(fixes)).toEqual([fixes[0], fixes[2]]);
  });

  it("reports automatic, manual, cleaning, and uncategorized corrections separately", () => {
    const automatic = [
      fix({ field: "StreetName", repairId: "address-1" }),
      fix({ field: "StreetType", oldValue: "", newValue: "ST", repairId: "address-1" }),
    ];
    const manual = [fix({ issueId: "manual-1", field: "City", oldValue: "Exampleville.", newValue: "Exampleville", appliedAt: 2 })];
    const cleaning = [fix({ issueId: "cleaning-1", field: "Class", oldValue: "01", newValue: "1", appliedAt: 3 })];
    const earlier = fix({ issueId: "legacy-1", field: "Province", oldValue: "Ont", newValue: "ON", appliedAt: 0 });
    const history: ReviewAction[] = [
      { id: "auto", label: "Automatic fixes", changes: automatic, status: "applied" },
      { id: "manual", label: "Manual fixes", changes: manual, status: "applied" },
      { id: "clean", label: "Cleaning mappings", changes: cleaning, status: "applied" },
      { id: "undone", label: "Automatic fixes", changes: [fix({ issueId: "undone" })], status: "undone" },
    ];

    expect(summarizeAppliedCorrections([...automatic, ...manual, ...cleaning, earlier], history)).toEqual({
      automatic: 1,
      manual: 1,
      cleaning: 1,
      uncategorized: 1,
      total: 4,
      fieldChanges: 5,
    });
  });
});
