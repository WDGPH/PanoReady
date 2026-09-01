import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { flattenCanonicalStudent, parseCanonicalXml, serializeCanonicalXml } from "../lib/canonical";
import { importWorkbook } from "../lib/excel";
import { applyValidationFixes, parseStixXml, validateXml } from "../lib/validator";

const metadata = `<Metadata><CreateDate>2026-08-31</CreateDate><CreateTime>12:30:00</CreateTime><CreatedBy>Analyst</CreatedBy><ContactPhone type="WORK">519-555-1234</ContactPhone><ContactEmail>analyst@example.ca</ContactEmail><FullUpload>YES</FullUpload></Metadata>`;
const student = `<Student><Name><First>Ada</First><Last>Lovelace</Last></Name><Gender>F</Gender><BirthDate>2015-04-12</BirthDate><Language>en</Language><CountryOfOrigin>CA</CountryOfOrigin><Guardian><Name><First>Ann</First><Last>Lovelace</Last></Name><Relationship>MOTHER</Relationship><Phone type="MOBILE">519-555-2222</Phone></Guardian><Address><StreetName>Main</StreetName><StreetType>ST</StreetType><StreetDirection>N</StreetDirection><City>Guelph</City><Province>ON</Province><PostalCode>N1G 1A1</PostalCode></Address><Phone type="HOME">519-555-3333</Phone></Student>`;

function xml(prefix = "") {
  const p = prefix ? `${prefix}:` : "";
  const namespace = prefix ? `xmlns:${prefix}="http://ontario.ca"` : `xmlns="http://ontario.ca"`;
  const body = `${metadata}<School><SchoolNumber>123</SchoolNumber><Name>Test</Name><Students>${student}</Students></School>`;
  return `<?xml version="1.0"?><${p}SchoolUpload ${namespace}>${prefix ? body.replace(/<(\/?)([A-Z])/g, `<$1${p}$2`) : body}</${p}SchoolUpload>`;
}

test("default and arbitrary namespace prefixes parse to the same canonical model", () => {
  for (const source of [xml(), xml("stix")]) {
    const upload = parseCanonicalXml(source);
    assert.equal(upload.schools[0].students.length, 1);
    const fields = flattenCanonicalStudent(upload.schools[0].students[0], upload.schools[0]);
    assert.equal(fields.GuardianFirstName, "Ann");
    assert.equal(fields.GuardianPhoneNumber, "519-555-2222");
    assert.equal(fields.Phone, "519-555-3333");
    assert.equal(fields.StreetDirection, "N");
  }
});

test("canonical XML round trip preserves nested guardians, address, and typed phones", () => {
  const upload = parseCanonicalXml(xml());
  const roundTrip = parseCanonicalXml(serializeCanonicalXml(upload));
  assert.deepEqual(roundTrip.schools[0].students[0].guardians, upload.schools[0].students[0].guardians);
  assert.deepEqual(roundTrip.schools[0].students[0].phone, upload.schools[0].students[0].phone);
  assert.deepEqual(roundTrip.schools[0].students[0].address, upload.schools[0].students[0].address);
});

test("validator enforces metadata and every populated controlled field", () => {
  const invalid = xml().replace("<Language>en</Language>", "<Language>bad</Language>")
    .replace("<CountryOfOrigin>CA</CountryOfOrigin>", "<CountryOfOrigin>bad</CountryOfOrigin>")
    .replace("<StreetType>ST</StreetType>", "<StreetType>bad</StreetType>")
    .replace("<StreetDirection>N</StreetDirection>", "<StreetDirection>bad</StreetDirection>")
    .replace("<Relationship>MOTHER</Relationship>", "<Relationship>bad</Relationship>")
    .replace("type=\"MOBILE\"", "type=\"bad\"")
    .replace("<FullUpload>YES</FullUpload>", "<FullUpload>bad</FullUpload>");
  const result = validateXml(invalid);
  const fields = new Set(result.issues.filter((finding) => finding.severity === "error").map((finding) => finding.field));
  for (const field of ["Language", "CountryOfOrigin", "StreetType", "StreetDirection", "GuardianRelationship", "GuardianPhoneType", "FullUpload"]) assert.ok(fields.has(field), `${field} should be rejected`);
  assert.equal(result.gate, "BLOCKED");
});

test("valid canonical checks require XSD review until the official schema is bundled", () => {
  const result = validateXml(xml());
  assert.equal(result.issues.filter((finding) => finding.severity === "error").length, 0);
  assert.equal(result.gate, "REVIEW_REQUIRED");
  assert.ok(result.issues.some((finding) => finding.ruleId === "XSD_SCHEMA_UNAVAILABLE"));
});

test("workbook adapter detects alternate sheets and headers and normalizes values", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Child First Name", "Surname", "DOB", "Sex", "Student Phone", "Guardian 1 First Name", "Guardian 1 Last Name", "Guardian 1 Relationship"],
    ["Ada", "Lovelace", "2015-04-12", "x", "(519) 555-3333", "Ann", "Lovelace", "MOTHER"],
  ]), "Child Information");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "Value"], ["Date Created", "2026-08-31"], ["Time Created", "12:30:00"], ["Created By", "Analyst"],
    ["Contact Phone", "5195551234"], ["Phone Type", "WORK"], ["PHU Contact Email", "analyst@example.ca"], ["Full Upload", "YES"], ["School Number", "123"], ["School Name", "Test"],
  ]), "Submission Details");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const result = importWorkbook(bytes, "altered.xlsx");
  assert.equal(result.preview.worksheet, "Child Information");
  assert.equal(result.preview.canonicalStudentCount, 1);
  assert.equal(result.preview.diagnostics.filter((finding) => finding.severity === "error").length, 0);
  const imported = result.upload.schools[0].students[0];
  assert.equal(imported.gender, "Other");
  assert.equal(imported.phone?.number, "519-555-3333");
  assert.equal(imported.guardians[0].name.first, "Ann");
});

test("fixes operate through the canonical model for default-namespace XML", () => {
  const records = parseStixXml(xml());
  assert.equal(records[0].fields.FirstName, "Ada");
  const fixed = applyValidationFixes(xml(), [{ issueId: "manual", recordId: "school0:student0", field: "FirstName", oldValue: "Ada", newValue: "Augusta", ruleId: "MANUAL", appliedAt: 1 }]);
  assert.equal(parseStixXml(fixed)[0].fields.FirstName, "Augusta");
});
