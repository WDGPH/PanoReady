import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { StudentRecord, ValidationIssue } from "../lib/types";
import { validateXml } from "../lib/validator";

const fixtureUrl = new URL(
  "../public/samples/stix-validation-demo.stix",
  import.meta.url
);
const result = validateXml(readFileSync(fixtureUrl, "utf8"));

function recordByName(firstName: string, lastName: string): StudentRecord {
  const record = result.records.find(
    ({ fields }) =>
      fields.FirstName === firstName && fields.LastName === lastName
  );
  expect(record, `fixture record ${firstName} ${lastName}`).toBeDefined();
  return record!;
}

function issuesFor(firstName: string, lastName: string): ValidationIssue[] {
  const record = recordByName(firstName, lastName);
  return result.issues.filter((issue) => issue.recordId === record.id);
}

function issueText(issue: ValidationIssue): string {
  return `${issue.field ?? ""} ${issue.message}`.toLocaleLowerCase("en-CA");
}

function expectErrorMentioning(
  issues: ValidationIssue[],
  ...terms: string[]
): void {
  expect(
    issues.some(
      (issue) =>
        issue.severity === "error" &&
        terms.every((term) => issueText(issue).includes(term.toLowerCase()))
    )
  ).toBe(true);
}

describe("canonical STIX integration fixture", () => {
  it("is shared by integration tests and contains the expanded scenario set", () => {
    expect(result.schoolCount).toBe(4);
    expect(result.studentCount).toBe(26);
    expect(recordByName("Pumpkin", "Clock")).toBeDefined();
    expect(recordByName("Double", "Dial")).toBeDefined();
    expect(recordByName("Turnip", "Annex")).toBeDefined();
  });

  it("preserves French names with accents, ligatures, hyphens, and apostrophes", () => {
    const record = recordByName("Élodie-Anne", "D’Artichaut");

    expect(record.fields).toMatchObject({
      FirstName: "Élodie-Anne",
      MiddleName: "François",
      LastName: "D’Artichaut",
      AliasFirstName: "Maëlle",
      AliasLastName: "L’Œillet",
      StreetName: "chemin de l’Érable",
      City: "Trois-Rivières",
    });
    expect(result.issues.filter((issue) => issue.recordId === record.id)).toEqual(
      []
    );
  });

  // `it.fails` executes each contract and is successful only while the current
  // validator misses it. Once a gap is implemented, Vitest will require this
  // marker to be removed and the case to become a normal regression test.
  describe("known validation gaps", () => {
    it.fails("reports impossible metadata date and time values", () => {
      expectErrorMentioning(result.issues, "create", "date");
      expectErrorMentioning(result.issues, "create", "time");
    });

    it.fails("reports an unexpected metadata upload mode", () => {
      expectErrorMentioning(result.issues, "full", "upload");
    });

    it.fails("reports impossible calendar dates with a familiar shape", () => {
      expectErrorMentioning(issuesFor("Pumpkin", "Clock"), "birth", "date");
    });

    it.fails("reports unexpected student elements", () => {
      expectErrorMentioning(
        issuesFor("Mango", "Mystery"),
        "favouritevegetable"
      );
    });

    it.fails("reports content from an unexpected namespace", () => {
      expectErrorMentioning(result.issues, "namespace", "unexpected");
    });

    it.fails("reports a third Guardian instead of silently ignoring it", () => {
      expectErrorMentioning(issuesFor("Kale", "Trio"), "guardian", "three");
    });

    it.fails("reports unsupported phone types and Guardian relationships", () => {
      const issues = issuesFor("Radish", "Rocket");
      expectErrorMentioning(issues, "phone", "type");
      expectErrorMentioning(issues, "guardian", "relationship");
    });

    it.fails("reports duplicate singleton fields as a structural problem", () => {
      const issues = issuesFor("Double", "Grade");
      expect(
        issues.some(
          (issue) =>
            issue.severity === "error" &&
            issueText(issue).includes("grade") &&
            /(duplicate|multiple|more than)/.test(issueText(issue))
        )
      ).toBe(true);
    });

    it.fails("reports a nil Address marker", () => {
      expectErrorMentioning(
        issuesFor("Invisible", "Asparagus"),
        "address",
        "nil"
      );
    });

    it.fails("reports duplicate Phone elements", () => {
      const issues = issuesFor("Double", "Dial");
      expect(
        issues.some(
          (issue) =>
            issue.severity === "error" &&
            issueText(issue).includes("phone") &&
            /(duplicate|multiple|more than)/.test(issueText(issue))
        )
      ).toBe(true);
    });

    it.fails("reports a missing School Name", () => {
      expect(
        result.issues.some(
          (issue) =>
            issue.schoolNumber === "67890" &&
            issue.severity === "error" &&
            issueText(issue).includes("name")
        )
      ).toBe(true);
    });
  });
});
