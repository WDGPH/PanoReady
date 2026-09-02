import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import type { AppliedFix, StudentRecord, ValidationIssue } from "../lib/types";
import { applyValidationFixes, validateXml } from "../lib/validator";

const fixtureUrl = new URL(
  "../public/samples/stix-validation-demo.stix",
  import.meta.url
);
const fixtureXml = readFileSync(fixtureUrl, "utf8");
const result = validateXml(fixtureXml);

type XmlNode = Record<string, unknown>;

function asArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

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

function fixtureFix(
  firstName: string,
  lastName: string,
  field: string,
  newValue: string
): AppliedFix {
  const record = recordByName(firstName, lastName);
  return {
    issueId: `expected-path-${field}`,
    recordId: record.id,
    field,
    oldValue: record.fields[field] ?? "",
    newValue,
    ruleId: "EXPECTED_PATH",
    appliedAt: 0,
  };
}

function fixedStudent(xml: string, firstName: string, lastName: string): XmlNode {
  const { id } = recordByName(firstName, lastName);
  const match = id.match(/^school(\d+):student(\d+)$/);
  expect(match).not.toBeNull();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    textNodeName: "#text",
    isArray: (name) => name === "ns1:School" || name === "ns1:Student",
  });
  const document = parser.parse(xml) as XmlNode;
  const root = document["ns1:SchoolUpload"] as XmlNode;
  const schools = asArray(root["ns1:School"] as XmlNode | XmlNode[]);
  const school = schools[Number(match![1])];
  const students = school["ns1:Students"] as XmlNode;
  return asArray(students["ns1:Student"] as XmlNode | XmlNode[])[
    Number(match![2])
  ];
}

describe("canonical STIX integration fixture", () => {
  it("is shared by integration tests and contains the expanded scenario set", () => {
    expect(result.schoolCount).toBe(4);
    expect(result.studentCount).toBe(29);
    expect(recordByName("Pumpkin", "Clock")).toBeDefined();
    expect(recordByName("Double", "Dial")).toBeDefined();
    expect(recordByName("Turnip", "Annex")).toBeDefined();
    expect(recordByName("Configuration", "Mirage")).toBeDefined();
    expect(recordByName("Addressless", "Avocado")).toBeDefined();
    expect(recordByName("Orderly", "Onion")).toBeDefined();
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
    it.fails("requires file Metadata", () => {
      const withoutMetadata = fixtureXml.replace(
        /\s*<ns1:Metadata>[\s\S]*?<\/ns1:Metadata>/,
        ""
      );
      expectErrorMentioning(validateXml(withoutMetadata).issues, "metadata");
    });

    it.fails("reports duplicate Metadata containers", () => {
      const metadata = fixtureXml.match(/<ns1:Metadata>[\s\S]*?<\/ns1:Metadata>/);
      expect(metadata).not.toBeNull();
      const duplicateMetadata = fixtureXml.replace(
        metadata![0],
        `${metadata![0]}\n${metadata![0]}`
      );
      expectErrorMentioning(
        validateXml(duplicateMetadata).issues,
        "metadata",
        "multiple"
      );
    });

    it.fails("rejects the expected prefix when it is bound to another namespace", () => {
      const wrongNamespace = fixtureXml.replace(
        'xmlns:ns1="http://ontario.ca"',
        'xmlns:ns1="urn:panoready:wrong-namespace"'
      );
      expectErrorMentioning(validateXml(wrongNamespace).issues, "namespace");
    });

    it.fails("accepts an equivalent document that uses another prefix", () => {
      const alternatePrefix = fixtureXml.replaceAll("ns1:", "stix:");
      const alternateResult = validateXml(alternatePrefix);

      expect(alternateResult.studentCount).toBe(29);
      expect(
        alternateResult.issues.some((issue) => issue.ruleId === "STRUCT_ROOT")
      ).toBe(false);
    });

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

    it.fails("requires the Student Address container", () => {
      expectErrorMentioning(issuesFor("Addressless", "Avocado"), "address");
    });

    it.fails("reports familiar Student fields in an unexpected order", () => {
      expectErrorMentioning(issuesFor("Orderly", "Onion"), "order");
    });

    it.fails("enforces the configured Language values", () => {
      expectErrorMentioning(issuesFor("Configuration", "Mirage"), "language");
    });

    it.fails("enforces the configured Country values", () => {
      expectErrorMentioning(issuesFor("Configuration", "Mirage"), "country");
    });

    it.fails("enforces the configured StreetType values", () => {
      expectErrorMentioning(
        issuesFor("Configuration", "Mirage"),
        "street",
        "type"
      );
    });

    it.fails("enforces the configured StreetDirection values", () => {
      expectErrorMentioning(
        issuesFor("Configuration", "Mirage"),
        "street",
        "direction"
      );
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

    it.fails("applies Address fixes inside the Address container", () => {
      const fixedXml = applyValidationFixes(fixtureXml, [
        fixtureFix("Configuration", "Mirage", "StreetDirection", "N"),
        fixtureFix("Configuration", "Mirage", "RuralRoute", "RR 1"),
        fixtureFix("Configuration", "Mirage", "PoBoxNumber", "25"),
      ]);
      const student = fixedStudent(fixedXml, "Configuration", "Mirage");
      const address = student["ns1:Address"] as XmlNode;

      expect(address["ns1:StreetDirection"]).toBe("N");
      expect(address["ns1:RuralRoute"]).toBe("RR 1");
      expect(address["ns1:PoBoxNumber"]).toBe("25");
      expect(student["ns1:StreetDirection"]).toBeUndefined();
      expect(student["ns1:RuralRoute"]).toBeUndefined();
      expect(student["ns1:PoBoxNumber"]).toBeUndefined();
    });

    it.fails("applies Guardian relationship fixes to the nested Guardian", () => {
      const fixedXml = applyValidationFixes(fixtureXml, [
        fixtureFix("Radish", "Rocket", "GuardianRelationship", "LEGALGRD"),
      ]);
      const student = fixedStudent(fixedXml, "Radish", "Rocket");
      const guardian = asArray(
        student["ns1:Guardian"] as XmlNode | XmlNode[]
      )[0];

      expect(guardian["ns1:Relationship"]).toBe("LEGALGRD");
      expect(student["ns1:GuardianRelationship"]).toBeUndefined();
    });

    it.fails("applies PhoneType fixes to the Phone attribute", () => {
      const fixedXml = applyValidationFixes(fixtureXml, [
        fixtureFix("Radish", "Rocket", "PhoneType", "MOBILE"),
      ]);
      const student = fixedStudent(fixedXml, "Radish", "Rocket");
      const phone = student["ns1:Phone"] as XmlNode;

      expect(phone["@_type"]).toBe("MOBILE");
      expect(student["ns1:PhoneType"]).toBeUndefined();
    });
  });
});
