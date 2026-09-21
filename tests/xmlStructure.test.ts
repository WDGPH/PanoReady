import { expect, it } from "vitest";
import { parseCanonicalXml, serializeCanonicalXml } from "../lib/canonical";
import { validateXml } from "../lib/validator";

const wrap = (body: string) => `<SchoolUpload xmlns="http://ontario.ca">${body}</SchoolUpload>`;
const student = (body: string) => `<School><Students><Student>${body}</Student></Students></School>`;

it.each([
  ["unknown element", "<PrivateData>secret</PrivateData>"],
  ["unknown attribute", "<School private='secret'/>"],
  ["foreign namespace", "<School xmlns='urn:other'/>"],
  ["nested namespace reset", student("<Name xmlns=''><First>Ada</First></Name>")],
  ["duplicate singleton", "<Metadata/><Metadata/>"],
  ["duplicate aliases", "<Metadata/><s:Metadata xmlns:s='http://ontario.ca'/>"],
  ["third guardian", student("<Guardian/><Guardian/><Guardian/>")],
  ["mixed content", "unmapped text<School/>"],
  ["nested leaf content", student("<BirthDate><Year>2015</Year></BirthDate>")],
  ["unsupported phone attribute", student("<Phone extension='1'>204-555-0100</Phone>")],
])("rejects %s before projecting data", (_, body) => {
  expect(() => parseCanonicalXml(wrap(body))).toThrow();
  expect(validateXml(wrap(body)).gate).toBe("BLOCKED");
});

it.each([
  wrap("") + wrap(""),
  `<!DOCTYPE SchoolUpload [<!ENTITY value 'secret'>]>${wrap("")}`,
  `<SchoolUpload xmlns='urn:other'/>`,
])("rejects unsupported documents", (xml) => {
  expect(() => parseCanonicalXml(xml)).toThrow();
});

it("accepts namespace aliases, comments, schema hints and repairable missing fields", () => {
  const xml = `<?xml version="1.0"?><!--one--><!--two--><s:SchoolUpload xmlns:s="http://ontario.ca" xmlns:i="http://www.w3.org/2001/XMLSchema-instance" i:schemaLocation="http://ontario.ca unused.xsd"><s:Metadata/><s:School><s:Students><s:Student><s:Name><s:First> A &amp; B </s:First></s:Name></s:Student></s:Students></s:School></s:SchoolUpload>`;
  const document = parseCanonicalXml(xml);
  expect(document.schools[0].students[0].name.first).toBe("A & B");
  expect(parseCanonicalXml(serializeCanonicalXml(document)).schools[0].students[0].name.first).toBe("A & B");
  expect(validateXml(xml).issues.some(issue => issue.ruleId === "METADATA_REQUIRED")).toBe(true);
});
