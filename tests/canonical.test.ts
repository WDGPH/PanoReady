import assert from "node:assert/strict";
import { test } from "vitest";
import * as XLSX from "xlsx";
import { flattenCanonicalStudent, parseCanonicalXml, serializeCanonicalXml } from "../lib/canonical";
import { importWorkbook } from "../lib/excel";
import { applyValidationFixes, parseSTIXXml, validateXml } from "../lib/validator";
import { standardizeUnit } from "../lib/cleaner";

const metadata = `<Metadata><CreateDate>2026-08-31</CreateDate><CreateTime>12:30:00</CreateTime><CreatedBy>Analyst</CreatedBy><ContactPhone type="WORK">519-555-1234</ContactPhone><ContactEmail>analyst@example.ca</ContactEmail><FullUpload>YES</FullUpload></Metadata>`;
const student = `<Student><Name><First>Ada</First><Last>Lovelace</Last></Name><Gender>F</Gender><BirthDate>2015-04-12</BirthDate><Language>en</Language><CountryOfOrigin>CA</CountryOfOrigin><Guardian><Name><First>Ann</First><Last>Lovelace</Last></Name><Relationship>MOTHER</Relationship><Phone type="MOBILE">519-555-2222</Phone></Guardian><Address><StreetName>Main</StreetName><StreetType>ST</StreetType><StreetDirection>N</StreetDirection><City>Guelph</City><Province>ON</Province><PostalCode>N1G1A1</PostalCode></Address><Phone type="HOME">519-555-3333</Phone></Student>`;

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

test("preserves empty guardians and flags partial guardians without a relationship", () => {
  const source = xml().replace(
    "<Guardian><Name><First>Ann</First><Last>Lovelace</Last></Name><Relationship>MOTHER</Relationship><Phone type=\"MOBILE\">519-555-2222</Phone></Guardian>",
    "<Guardian><Name></Name></Guardian><Guardian><Name><First>Ann</First></Name></Guardian>",
  );
  const upload = parseCanonicalXml(source);
  assert.equal(upload.schools[0].students[0].guardians.length, 2);
  const result = validateXml(source);
  const emptyGuardianErrors = result.issues.filter((issue) => issue.ruleId === "EMPTY_GUARDIAN");
  const guardianErrors = result.issues.filter((issue) => issue.ruleId === "GUARDIAN_RELATIONSHIP_REQUIRED");
  assert.deepEqual(emptyGuardianErrors.map((issue) => issue.field), ["Guardian"]);
  assert.deepEqual(guardianErrors.map((issue) => issue.field), ["Guardian2Relationship"]);
  assert.equal(result.gate, "BLOCKED");
  assert.equal(serializeCanonicalXml(upload).match(/<ns1:Guardian>/g)?.length, 2);

  const fixes = [...emptyGuardianErrors, ...guardianErrors].map((issue) => ({
    issueId: issue.id,
    recordId: issue.recordId!,
    field: issue.field!,
    oldValue: "",
    newValue: issue.ruleId === "EMPTY_GUARDIAN" ? "" : "FATHER",
    ruleId: issue.ruleId,
    appliedAt: 0,
  }));
  const fixed = applyValidationFixes(source, fixes);
  assert.equal(fixed.match(/<ns1:Guardian>/g)?.length, 1);
  assert.ok(fixed.includes("<ns1:Relationship>FATHER</ns1:Relationship>"));
  assert.equal(validateXml(fixed).issues.filter((issue) => issue.ruleId === "EMPTY_GUARDIAN").length, 0);
  assert.equal(validateXml(fixed).issues.filter((issue) => issue.ruleId === "GUARDIAN_RELATIONSHIP_REQUIRED").length, 0);
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

test("a fully clean canonical file reaches READY with zero issues", () => {
  const result = validateXml(xml());
  assert.deepEqual(result.issues, []);
  assert.equal(result.gate, "READY");
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

function duplicateStudent(oen: string, first: string, last: string, birthDate = "2015-04-12") {
  return `<Student><OEN>${oen}</OEN><Name><First>${first}</First><Last>${last}</Last></Name><Gender>F</Gender><BirthDate>${birthDate}</BirthDate></Student>`;
}

function twoSchoolXml(schoolAStudents: string, schoolBStudents: string) {
  const schoolA = `<School><SchoolNumber>111</SchoolNumber><Name>School A</Name><Students>${schoolAStudents}</Students></School>`;
  const schoolB = `<School><SchoolNumber>222</SchoolNumber><Name>School B</Name><Students>${schoolBStudents}</Students></School>`;
  return `<?xml version="1.0"?><SchoolUpload xmlns="http://ontario.ca">${metadata}${schoolA}${schoolB}</SchoolUpload>`;
}

test("same-school OEN and name+DOB matches block the gate as errors", () => {
  const source = twoSchoolXml(
    duplicateStudent("123456789", "Priya", "Nair") + duplicateStudent("123456789", "Priya", "Nair"),
    "",
  );
  const result = validateXml(source);
  const errorRuleIds = result.issues.filter((i) => i.severity === "error").map((i) => i.ruleId);
  assert.ok(errorRuleIds.includes("OEN_DUPLICATE"));
  assert.ok(errorRuleIds.includes("NAME_DOB_DUPLICATE"));
  assert.equal(result.gate, "BLOCKED");
});

test("cross-school OEN and name+DOB matches warn about dual enrollment instead of blocking", () => {
  const source = twoSchoolXml(
    duplicateStudent("987654321", "Jordan", "Reyes"),
    duplicateStudent("987654321", "Jordan", "Reyes"),
  );
  const result = validateXml(source);
  const dupRuleIds = result.issues.filter((i) => ["OEN_DUPLICATE", "NAME_DOB_DUPLICATE", "OEN_DUAL_ENROLLMENT", "IDENTITY_REVIEW"].includes(i.ruleId));
  assert.ok(dupRuleIds.every((i) => i.severity === "warning"));
  assert.ok(dupRuleIds.some((i) => i.ruleId === "OEN_DUAL_ENROLLMENT" && i.message.includes("School A")));
  assert.ok(dupRuleIds.some((i) => i.ruleId === "IDENTITY_REVIEW" && i.message.includes("School A")));
  assert.equal(result.issues.filter((i) => i.severity === "error").length, 0);
  assert.equal(result.gate, "REVIEW_REQUIRED");
});

test("column overrides resolve unmapped and duplicate columns that would otherwise block import", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["First Name", "Last Name", "DOB", "Gender", "Notes", "Phone", "Phone Number"],
    ["Ada", "Lovelace", "2015-04-12", "F", "stray column", "519-555-3333", "519-555-4444"],
  ]), "Students");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "Value"], ["Date Created", "2026-08-31"], ["Time Created", "12:30:00"], ["Created By", "Analyst"],
    ["Contact Phone", "5195551234"], ["Phone Type", "WORK"], ["PHU Contact Email", "analyst@example.ca"], ["Full Upload", "YES"], ["School Number", "123"], ["School Name", "Test"],
  ]), "Submission Details");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  const blocked = importWorkbook(bytes, "unresolved.xlsx");
  const blockedRuleIds = blocked.preview.diagnostics.filter((finding) => finding.severity === "error").map((finding) => finding.ruleId);
  assert.ok(blockedRuleIds.includes("IMPORT_UNMAPPED_COLUMN"));
  assert.ok(blockedRuleIds.includes("IMPORT_DUPLICATE_COLUMN"));

  const notesColumn = blocked.preview.columns.find((c) => c.sourceHeader === "Notes")!.column;
  const phoneNumberColumn = blocked.preview.columns.find((c) => c.sourceHeader === "Phone Number")!.column;
  const resolved = importWorkbook(bytes, "resolved.xlsx", undefined, { [notesColumn]: "IGNORE", [phoneNumberColumn]: "IGNORE" });
  assert.equal(resolved.preview.diagnostics.filter((finding) => finding.severity === "error").length, 0);
  const statuses = Object.fromEntries(resolved.preview.columns.map((c) => [c.sourceHeader, c.status]));
  assert.equal(statuses["Notes"], "IGNORED");
  assert.equal(statuses["Phone Number"], "IGNORED");
  assert.equal(statuses["Phone"], "MAPPED");
  assert.equal(resolved.upload.schools[0].students[0].phone?.number, "519-555-3333");
});

test("a decorative row that only repeats the column headers is skipped, not imported as a student", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "OEN", "First Name", "Last Name", "DOB", "Gender"],
    ["Required", "", "Y", "Y", "Y", "Y"],
    // Header-echo row: leading cell blank, every other populated cell restates its header.
    ["", "OEN", "First Name", "Last Name", "", ""],
    ["", "123456789", "Luke", "Ball", "2015-04-12", "M"],
  ]), "Students");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "Value"], ["Date Created", "2026-08-31"], ["Time Created", "12:30:00"], ["Created By", "Analyst"],
    ["Contact Phone", "5195551234"], ["Phone Type", "WORK"], ["PHU Contact Email", "analyst@example.ca"], ["Full Upload", "YES"], ["School Number", "123"], ["School Name", "Test"],
  ]), "Submission Details");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const result = importWorkbook(bytes, "echo-row.xlsx", undefined, { 1: "IGNORE" });
  assert.equal(result.preview.canonicalStudentCount, 1);
  assert.equal(result.upload.schools[0].students[0].name.first, "Luke");
  assert.ok(result.preview.diagnostics.some((finding) => finding.ruleId === "IMPORT_HEADER_ECHO_ROW"));
});

test("validateXml suggests deterministic fixes for aliasable, oversized, and reformattable values", () => {
  const source = xml()
    .replace("<Gender>F</Gender>", "<Gender>MALE</Gender>")
    .replace("<Last>Lovelace</Last>", `<Last>${"X".repeat(55)}</Last>`)
    .replace("519-555-3333", "5195553333");
  const result = validateXml(source);
  const byRule = Object.fromEntries(result.issues.map((i) => [i.ruleId, i]));
  assert.equal(byRule.GENDER_ALLOWED_VALUE?.suggestedFix, "M");
  assert.equal(byRule.GENDER_ALLOWED_VALUE?.autoFixable, true);
  assert.equal(byRule.FIELD_LENGTH?.suggestedFix, "X".repeat(50));
  assert.equal(byRule.FIELD_LENGTH?.autoFixable, true);
  assert.equal(byRule.PHONE_FORMAT?.suggestedFix, "519-555-3333");
  assert.equal(byRule.PHONE_FORMAT?.autoFixable, true);
});

test("canonical XML Gender accepts the configured four output values", () => {
  const genderXml = (gender: string) => xml().replace("<Gender>F</Gender>", `<Gender>${gender}</Gender>`);
  for (const gender of ["M", "F", "Unk", "Other"]) {
    const result = validateXml(genderXml(gender));
    assert.ok(!result.issues.some((i) => i.ruleId === "GENDER_ALLOWED_VALUE"), `Gender "${gender}" should be accepted`);
  }
  // X and N are workbook-input aliases that normalize to Other. Canonical output
  // must use one of the four configured values, so the validator rejects literals.
  for (const gender of ["X", "N", "Bogus"]) {
    const result = validateXml(genderXml(gender));
    assert.ok(result.issues.some((i) => i.ruleId === "GENDER_ALLOWED_VALUE"), `Gender "${gender}" should be rejected`);
  }
});

test("Excel import maps Gender x/n aliases to Other", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["First Name", "Last Name", "DOB", "Gender"],
    ["Ada", "Lovelace", "2015-04-12", "x"],
    ["Bob", "Smith", "2015-04-12", "n"],
  ]), "Students");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "Value"], ["Date Created", "2026-08-31"], ["Time Created", "12:30:00"], ["Created By", "Analyst"],
    ["Contact Phone", "5195551234"], ["Phone Type", "WORK"], ["PHU Contact Email", "analyst@example.ca"], ["Full Upload", "YES"], ["School Number", "123"], ["School Name", "Test"],
  ]), "Submission Details");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const result = importWorkbook(bytes, "gender-xn.xlsx");
  assert.deepEqual(result.upload.schools[0].students.map((s) => s.gender), ["Other", "Other"]);
});

test("standardizeUnit treats 'Top Floor' as the same real-world unit as 'Upper', not a separate invented code", () => {
  assert.deepEqual(standardizeUnit("Top Floor"), ["UPPR", true, false]);
  assert.deepEqual(standardizeUnit("Top Flo"), ["UPPR", true, false]);
  assert.deepEqual(standardizeUnit("top floor"), ["UPPR", true, false]);
});

test("standardizeUnit abbreviates 'Upper Un'/'Upper Ap' the same way it already did 'Lower Un'", () => {
  assert.deepEqual(standardizeUnit("Upper Un"), ["UPPR", true, false]);
  assert.deepEqual(standardizeUnit("Upper Ap"), ["UPPR", true, false]);
  assert.deepEqual(standardizeUnit("UpperLev"), ["UPPR", true, false]);
});

test("an empty Students element is an error, matching Panorama's real rejection of it", () => {
  const emptySchool = xml().replace(`<Students>${student}</Students>`, "<Students></Students>");
  const result = validateXml(emptySchool);
  const issue = result.issues.find((i) => i.ruleId === "EMPTY_STUDENTS");
  assert.equal(issue?.severity, "error");
  assert.equal(result.gate, "BLOCKED");
});

test("phone fixes strip real-world trailing call notes and recognize 'ex' as an extension marker", () => {
  const cases: Array<[string, string]> = [
    ["519-938-0734 call 1st", "519-938-0734"],
    ["519-546-8814 CALL 2ND", "519-546-8814"],
    ["519-830 6506-call first", "519-830-6506"],
    ["519-362-0305 **1st", "519-362-0305"],
    ["226-500-2616(call 1st)", "226-500-2616"],
    ["416-894-8985 (1St)", "416-894-8985"],
    ["905-877-5200 ex 233", "905-877-5200x233"],
    ["548) 255-2714", "548-255-2714"],
    ["226-929-13-92", "226-929-1392"],
  ];
  for (const [raw, expected] of cases) {
    const source = xml().replace("519-555-3333", raw);
    const result = validateXml(source);
    const issue = result.issues.find((i) => i.ruleId === "PHONE_FORMAT");
    assert.equal(issue?.suggestedFix, expected, `expected fix for "${raw}"`);
    assert.equal(issue?.autoFixable, true, `expected autoFixable for "${raw}"`);
  }
});

test("StreetNumber overflow splits into StreetNumber + StreetName when the shape is confident, stays manual when ambiguous", () => {
  const confident: Array<[string, string, string]> = [
    ["46 Curzon", "46", "Curzon"],
    ["97 Lynch", "97", "Lynch"],
    ["66 Downey", "66", "Downey"],
  ];
  const addressXml = (streetNumber: string) => xml().replace(
    `<Address><StreetName>Main</StreetName><StreetType>ST</StreetType><StreetDirection>N</StreetDirection><City>Guelph</City><Province>ON</Province><PostalCode>N1G1A1</PostalCode></Address>`,
    `<Address><StreetNumber>${streetNumber}</StreetNumber><StreetType>ST</StreetType><StreetDirection>N</StreetDirection><City>Guelph</City><Province>ON</Province><PostalCode>N1G1A1</PostalCode></Address>`
  );
  for (const [raw, expectedNumber, expectedName] of confident) {
    const result = validateXml(addressXml(raw));
    const numberIssue = result.issues.find((i) => i.field === "StreetNumber" && i.ruleId === "FIELD_LENGTH");
    assert.equal(numberIssue?.suggestedFix, expectedNumber, `expected StreetNumber fix for "${raw}"`);
    assert.equal(numberIssue?.repairProposal?.confidence, "safe");
    assert.deepEqual(numberIssue?.repairProposal?.changes.map((change) => [change.field, change.proposedValue]), [
      ["StreetNumber", expectedNumber],
      ["StreetName", expectedName],
    ]);
  }
  for (const ambiguous of ["406 unit", "13 - 142", "302-380", "B-2C-360"]) {
    const result = validateXml(addressXml(ambiguous));
    const numberIssue = result.issues.find((i) => i.field === "StreetNumber" && i.ruleId === "FIELD_LENGTH");
    assert.equal(numberIssue?.suggestedFix, undefined, `expected no auto-split for "${ambiguous}"`);
    assert.equal(numberIssue?.autoFixable, false);
    // No confident split, but still surfaced as a manual repair card (not a dead-end "Manual" label)
    // so the address can be reviewed and fixed inline instead of in the source file.
    assert.equal(numberIssue?.repairProposal?.confidence, "manual");
    assert.deepEqual(numberIssue?.repairProposal?.changes, []);
  }
});

test("fixes operate through the canonical model for default-namespace XML", () => {
  const records = parseSTIXXml(xml());
  assert.equal(records[0].fields.FirstName, "Ada");
  const fixed = applyValidationFixes(xml(), [{ issueId: "manual", recordId: "school0:student0", field: "FirstName", oldValue: "Ada", newValue: "Augusta", ruleId: "MANUAL", appliedAt: 1 }]);
  assert.equal(parseSTIXXml(fixed)[0].fields.FirstName, "Augusta");
});

test("removes a populated first guardian while applying edits to the second guardian", () => {
  const source = xml().replace("</Guardian>", "</Guardian><Guardian><Name><First>Second</First></Name><Relationship>OTHER</Relationship></Guardian>");
  const changes = [
    { field: "Guardian", newValue: "" },
    { field: "Guardian2FirstName", newValue: "Retained" },
  ].map(change => ({ ...change, issueId: change.field, recordId: "school0:student0", oldValue: "", ruleId: "MANUAL_STUDENT_EDIT", appliedAt: 0 }));
  const fixed = parseCanonicalXml(applyValidationFixes(source, changes));
  assert.equal(fixed.schools[0].students[0].guardians.length, 1);
  assert.equal(fixed.schools[0].students[0].guardians[0].name.first, "Retained");
});
