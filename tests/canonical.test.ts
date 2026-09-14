import assert from "node:assert/strict";
import { test } from "vitest";
import * as XLSX from "xlsx";
import { flattenCanonicalStudent, parseCanonicalXml, serializeCanonicalXml } from "../lib/canonical";
import { importWorkbook, workbookSetupChanges } from "../lib/excel";
import { ageOnDate, applyValidationFixes, chooseAgeReferenceDate, generateAgeGroupReportCsv, parseSTIXXml, validateCanonicalUpload, validateXml } from "../lib/validator";
import { standardizeUnit } from "../lib/addressRepair";
import { commitChangeGroup, undoChangeGroup } from "../lib/session";
import { validateSerializedOutput } from "../lib/stixExport";

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

test("canonical output uses standard indented formatting", () => {
  const upload = parseCanonicalXml(xml());
  const output = serializeCanonicalXml(upload);
  assert.ok(output.includes("\n  <ns1:Metadata>"));
  assert.equal(serializeCanonicalXml(parseCanonicalXml(output)), output);
});

test("serialized bytes and source diagnostics determine output disposition", () => {
  const upload = parseCanonicalXml(xml());
  const serialized = serializeCanonicalXml(upload);
  const invalidBytes = serialized.replace("<ns1:ContactEmail>analyst@example.ca</ns1:ContactEmail>", "<ns1:ContactEmail></ns1:ContactEmail>");
  assert.equal(validateSerializedOutput(upload, invalidBytes).gate, "BLOCKED");

  upload.diagnostics.push({
    id: "source-diagnostic",
    severity: "error",
    ruleId: "WORKBOOK_SOURCE",
    layer: "IMPORT",
    message: "The source layout is not safe to release.",
    autoFixable: false,
  });
  const result = validateSerializedOutput(upload, serialized);
  assert.equal(result.gate, "BLOCKED");
  assert.ok(result.issues.some((finding) => finding.id === "source-diagnostic"));
});

test.each([
  ["unknown element", (source: string) => source.replace("</Student>", "<Notes></Notes></Student>"), "Unsupported element"],
  ["unknown attribute", (source: string) => source.replace("<Student>", '<Student source="hidden">'), "Unsupported attribute"],
  ["foreign familiar element", (source: string) => source.replace("<Gender>F</Gender>", '<evil:Gender xmlns:evil="urn:evil">F</evil:Gender>'), "Unexpected namespace"],
  ["duplicate singleton", (source: string) => source.replace("<Gender>F</Gender>", "<Gender>F</Gender><Gender>M</Gender>"), "Unsupported cardinality"],
  ["too many guardians", (source: string) => source.replace("</Student>", "<Guardian><Relationship>OTHER</Relationship></Guardian><Guardian><Relationship>OTHER</Relationship></Guardian></Student>"), "expected at most 2"],
  ["mixed container text", (source: string) => source.replace("<Name><First>", "<Name>unexpected<First>"), "mixed text content"],
] as const)("rejects % before projection: %s", (_label, mutate, expected) => {
  assert.throws(() => parseCanonicalXml(mutate(xml())), new RegExp(expected));
});

test("accepts equivalent prefixes, schema-location metadata, comments, and ordinary entities", () => {
  const source = xml("stix")
    .replace('xmlns:stix="http://ontario.ca"', 'xmlns:stix="http://ontario.ca" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ontario.ca studentuploaddata.xsd"')
    .replace("<stix:First>Ada</stix:First>", "<!-- presentation comment --><stix:First>Ada &amp; Ann</stix:First>");
  const upload = parseCanonicalXml(source);
  assert.equal(upload.schools[0].students[0].name.first, "Ada & Ann");
  const output = serializeCanonicalXml(upload);
  assert.ok(output.includes("<ns1:First>Ada &amp; Ann</ns1:First>"));
  assert.ok(!output.includes("&amp;amp;"));
});

test("preserves every supported nested value and type-only phones in explicit output", () => {
  const source = `<?xml version="1.0"?><SchoolUpload xmlns="http://ontario.ca"><Metadata><CreateDate>2026-08-31</CreateDate><CreateTime>12:30:00</CreateTime><CreatedBy>Analyst</CreatedBy><ContactPhone type="WORK"></ContactPhone><ContactEmail>a@example.invalid</ContactEmail><FullUpload>YES</FullUpload><SchoolBoard><BoardNumber>B12345</BoardNumber><Name>Board &amp; Area</Name></SchoolBoard></Metadata><School><SchoolNumber>123</SchoolNumber><Name>School</Name><Students><Student><OEN>123456789</OEN><Grade>GR5</Grade><Class>5A</Class><Name><First>Ada</First><Middle>Byron</Middle><Last>Lovelace</Last></Name><AliasName><First>A</First><Middle>B</Middle><Last>L</Last></AliasName><Gender>F</Gender><BirthDate>2015-04-12</BirthDate><Language>en</Language><CountryOfOrigin>CA</CountryOfOrigin><Guardian><Name><First>Ann</First><Middle>M</Middle><Last>Lovelace</Last></Name><Relationship>MOTHER</Relationship><Phone type="MOBILE"></Phone></Guardian><Address><Unit>4</Unit><StreetNumber>12</StreetNumber><StreetNumberSuffix>A</StreetNumberSuffix><StreetName>Main</StreetName><StreetType>ST</StreetType><StreetDirection>N</StreetDirection><RuralRoute>RR1</RuralRoute><PoBoxNumber>22</PoBoxNumber><City>Guelph</City><Province>ON</Province><PostalCode>N1G1A1</PostalCode></Address><Phone type="HOME">519-555-3333</Phone></Student></Students></School></SchoolUpload>`;
  const output = serializeCanonicalXml(parseCanonicalXml(source));
  for (const expected of [
    "<ns1:Name>Board &amp; Area</ns1:Name>",
    "<ns1:Middle>Byron</ns1:Middle>",
    "<ns1:Middle>M</ns1:Middle>",
    "<ns1:StreetNumberSuffix>A</ns1:StreetNumberSuffix>",
    "<ns1:RuralRoute>RR1</ns1:RuralRoute>",
    "<ns1:PoBoxNumber>22</ns1:PoBoxNumber>",
  ]) assert.ok(output.includes(expected), `missing ${expected}`);
  assert.match(output, /<ns1:ContactPhone type="WORK">\s*<\/ns1:ContactPhone>/);
  assert.match(output, /<ns1:AliasName>\s*<ns1:First>A<\/ns1:First>\s*<ns1:Middle>B<\/ns1:Middle>\s*<ns1:Last>L<\/ns1:Last>\s*<\/ns1:AliasName>/);
  assert.match(output, /<ns1:Phone type="MOBILE">\s*<\/ns1:Phone>/);
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
    targetId: issue.targetId,
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

test("XML and canonical validation share the same semantic result", () => {
  const source = xml().replace("<PostalCode>N1G1A1</PostalCode>", "<PostalCode>N1G 1A1</PostalCode>");
  assert.deepEqual(validateCanonicalUpload(parseCanonicalXml(source)), validateXml(source));
});

test("file and school findings retain editable stable targets after revalidation", () => {
  const upload = parseCanonicalXml(xml().replace("<CreatedBy>Analyst</CreatedBy>", "<CreatedBy></CreatedBy>").replace("<SchoolNumber>123</SchoolNumber>", "<SchoolNumber></SchoolNumber>"));
  upload.schools[0].schoolId = "local-school-7";
  const result = validateCanonicalUpload(upload);
  const createdBy = result.issues.find((finding) => finding.field === "CreatedBy")!;
  const schoolNumber = result.issues.find((finding) => finding.field === "SchoolNumber")!;
  assert.deepEqual({ recordId: createdBy.recordId, currentValue: createdBy.currentValue }, { recordId: "metadata", currentValue: "" });
  assert.deepEqual({ recordId: schoolNumber.recordId, targetId: schoolNumber.targetId, currentValue: schoolNumber.currentValue }, { recordId: "local-school-7", targetId: "local-school-7", currentValue: "" });
});

test("age reports use the supplied calendar reference date", () => {
  const records = [{ id: "one", xmlPath: "", fields: { BirthDate: "2015-09-13" } }];
  assert.match(generateAgeGroupReportCsv(records, "2025-09-12", [[9, 9], [10, 10]]), /9-9,1\n10-10,0/);
  assert.match(generateAgeGroupReportCsv(records, "2025-09-13", [[9, 9], [10, 10]]), /9-9,0\n10-10,1/);
  assert.throws(() => generateAgeGroupReportCsv(records, "today"), /valid YYYY-MM-DD reference date/);
  assert.equal(ageOnDate("2015-02-29", "2025-09-12"), null);
  assert.equal(ageOnDate("2026-01-01", "2025-09-12"), null);
  assert.equal(chooseAgeReferenceDate("2025-09-12", "2026-09-14"), "2025-09-12");
  assert.equal(chooseAgeReferenceDate("", "2026-09-14"), "2026-09-14");
  assert.equal(chooseAgeReferenceDate("2025-02-29", "2026-09-14"), "2026-09-14");
  assert.equal(chooseAgeReferenceDate("2027-01-01", "2026-09-14"), "2026-09-14");
});

test("workbook adapter accepts the supported Student Info and File Info sheets", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Child First Name", "Surname", "DOB", "Sex", "Student Phone", "Guardian 1 First Name", "Guardian 1 Last Name", "Guardian 1 Relationship"],
    ["Ada", "Lovelace", "2015-04-12", "x", "(519) 555-3333", "Ann", "Lovelace", "MOTHER"],
  ]), "Student Info");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "Value"], ["Date Created", "2026-08-31"], ["Time Created", "12:30:00"], ["Created By", "Analyst"],
    ["Contact Phone", "5195551234"], ["Phone Type", "WORK"], ["PHU Contact Email", "analyst@example.ca"], ["Full Upload", "YES"], ["School Number", "123"], ["School Name", "Test"],
  ]), "File Info");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const result = importWorkbook(bytes, "supported.xlsm");
  assert.equal(result.preview.worksheet, "Student Info");
  assert.equal(result.preview.canonicalStudentCount, 1);
  assert.equal(result.preview.diagnostics.filter((finding) => finding.severity === "error").length, 0);
  const imported = result.upload.schools[0].students[0];
  assert.equal(imported.gender, "Other");
  assert.equal(imported.phone?.number, "519-555-3333");
  assert.equal(imported.guardians[0].name.first, "Ann");
});

test("workbook setup overrides become reversible file and school changes", () => {
  const upload = parseCanonicalXml(xml());
  const detected = { requiredFields: [], dateCreated: "2026-08-31", timeCreated: "12:30:00", createdBy: "Original exporter", contactPhone: "519-555-1234", phoneType: "WORK", contactEmail: "analyst@example.ca", fullUpload: "YES", boardNumber: "", boardName: "", schoolNumber: "999", schoolName: "Original school" };
  upload.metadata.createdBy = "Reviewed exporter";
  upload.schools[0].schoolNumber = "123";
  const changes = workbookSetupChanges(detected, upload);
  assert.deepEqual(changes.map((change) => [change.recordId, change.field, change.oldValue, change.newValue]), [
    ["metadata", "CreatedBy", "Original exporter", "Reviewed exporter"],
    ["school0", "SchoolNumber", "999", "123"],
    ["school0", "SchoolName", "Original school", "Test"],
  ]);
  const group = { id: "setup", label: "Workbook setup", origin: "setup" as const, appliedAt: 1, changes: changes.map((change) => ({ ...change, appliedAt: 1 })), status: "applied" as const };
  const restored = undoChangeGroup(upload, group);
  assert.equal(restored.metadata.createdBy, "Original exporter");
  assert.equal(restored.schools[0].schoolNumber, "999");
  assert.equal(restored.schools[0].name, "Original school");
});

test("workbook adapter reads stored date cells and the workbook date system before display formatting", () => {
  for (const date1904 of [false, true]) {
    const workbook = XLSX.utils.book_new();
    const students = XLSX.utils.aoa_to_sheet([
      ["First Name", "Last Name", "Birthdate"],
      ["Ada", "One", date1904 ? 0 : 42007],
      ["Grace", "Two", date1904 ? 1 : 42008],
    ]);
    students.C2.z = "dd/mm/yyyy";
    students.C3.z = "m/d/yyyy";
    XLSX.utils.book_append_sheet(workbook, students, "Student Info");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Field", "Value"], ["School Number", "123"], ["School Name", "Test"]]), "File Info");
    workbook.Workbook = { WBProps: { date1904 } };
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const result = importWorkbook(bytes, "typed-dates.xlsm");
    assert.equal(result.dateAnalysis.classification, "typed-workbook-date");
    assert.equal(result.upload.schools[0].students[0].birthDate, date1904 ? "1904-01-01" : "2015-01-03");
    assert.equal(result.preview.diagnostics.filter((finding) => finding.ruleId.startsWith("IMPORT_DATE")).length, 0);
  }
});

test("workbook adapter blocks ambiguous and conflicting date text until meaning is explicit", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["First Name", "Last Name", "Birthdate"],
    ["Ada", "Ambiguous", "03/04/2015"],
    ["Grace", "Day", "13/04/2015"],
  ]), "Student Info");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Field", "Value"], ["School Number", "123"], ["School Name", "Test"]]), "File Info");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const blocked = importWorkbook(bytes, "dates.xlsm");
  assert.equal(blocked.dateAnalysis.conventionRequired, true);
  assert.ok(blocked.preview.diagnostics.some((finding) => finding.ruleId === "IMPORT_DATE_AMBIGUOUS"));
  const confirmed = importWorkbook(bytes, "dates.xlsm", undefined, "day-first");
  assert.equal(confirmed.dateAnalysis.ready, true);
  assert.deepEqual(confirmed.upload.schools[0].students.map((student) => student.birthDate), ["2015-04-03", "2015-04-13"]);

  workbook.Sheets["Student Info"].C2.v = "13/04/2015";
  workbook.Sheets["Student Info"].C3.v = "04/13/2015";
  const conflictBytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const conflicted = importWorkbook(conflictBytes, "dates.xlsm", undefined, "day-first");
  assert.equal(conflicted.dateAnalysis.conflict, true);
  assert.deepEqual(conflicted.upload.schools[0].students.map((student) => student.birthDate), ["13/04/2015", "04/13/2015"]);
  const finding = conflicted.upload.diagnostics.find((entry) => entry.recordId === "school0:student0" && entry.field === "BirthDate")!;
  const committed = commitChangeGroup(conflicted.upload, [{ issueId: finding.id, recordId: finding.recordId!, field: "BirthDate", oldValue: "13/04/2015", newValue: "2015-04-13", ruleId: finding.ruleId, appliedAt: 1 }], { label: "Repair one date", origin: "manual" });
  assert.equal(committed.document.diagnostics.filter((entry) => entry.ruleId === "IMPORT_DATE_CONFLICT").length, 1);
  assert.equal(undoChangeGroup(committed.document, committed.group).diagnostics.filter((entry) => entry.ruleId === "IMPORT_DATE_CONFLICT").length, 2);
});

function duplicateStudent(oen: string, first: string, last: string, birthDate = "2015-04-12") {
  return `<Student><OEN>${oen}</OEN><Name><First>${first}</First><Last>${last}</Last></Name><Gender>F</Gender><BirthDate>${birthDate}</BirthDate></Student>`;
}

function twoSchoolXml(schoolAStudents: string, schoolBStudents: string) {
  const schoolA = `<School><SchoolNumber>111</SchoolNumber><Name>School A</Name><Students>${schoolAStudents}</Students></School>`;
  const schoolB = `<School><SchoolNumber>222</SchoolNumber><Name>School B</Name><Students>${schoolBStudents}</Students></School>`;
  return `<?xml version="1.0"?><SchoolUpload xmlns="http://ontario.ca">${metadata}${schoolA}${schoolB}</SchoolUpload>`;
}

test("validates and round-trips a larger supported upload without dropping records", () => {
  const students = Array.from({ length: 1500 }, (_, index) => duplicateStudent(
    String(100_000_000 + index),
    `Student${index}`,
    `Family${index}`,
  )).join("");
  const source = `<?xml version="1.0"?><SchoolUpload xmlns="http://ontario.ca">${metadata}<School><SchoolNumber>111</SchoolNumber><Name>Large school</Name><Students>${students}</Students></School></SchoolUpload>`;
  const result = validateXml(source);
  assert.equal(result.studentCount, 1500);
  assert.equal(result.gate, "READY");
  assert.deepEqual(result.issues, []);
  const roundTrip = parseCanonicalXml(serializeCanonicalXml(parseCanonicalXml(source)));
  assert.equal(roundTrip.schools[0].students.length, 1500);
  assert.equal(roundTrip.schools[0].students.at(-1)?.oen, "100001499");
});

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

test("A/B/B duplicate occurrences find the within-B duplicate regardless of source order", () => {
  const a = duplicateStudent("111111111", "Alex", "Same");
  const b = duplicateStudent("111111111", "Alex", "Same");
  for (const source of [twoSchoolXml(a, b + b), twoSchoolXml(b, a + b)]) {
    const result = validateXml(source);
    assert.ok(result.issues.some((finding) => finding.ruleId === "OEN_DUPLICATE" && finding.schoolNumber === "222"));
    assert.ok(result.issues.some((finding) => finding.ruleId === "NAME_DOB_DUPLICATE" && finding.schoolNumber === "222"));
  }
});

test("populated unknown and duplicate workbook columns cannot be ignored", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["First Name", "Last Name", "DOB", "Gender", "Notes", "Phone", "Phone Number"],
    ["Ada", "Lovelace", "2015-04-12", "F", "stray column", "519-555-3333", "519-555-4444"],
  ]), "Student Info");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "Value"], ["Date Created", "2026-08-31"], ["Time Created", "12:30:00"], ["Created By", "Analyst"],
    ["Contact Phone", "5195551234"], ["Phone Type", "WORK"], ["PHU Contact Email", "analyst@example.ca"], ["Full Upload", "YES"], ["School Number", "123"], ["School Name", "Test"],
  ]), "File Info");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

  const blocked = importWorkbook(bytes, "unresolved.xlsm");
  const blockedRuleIds = blocked.preview.diagnostics.filter((finding) => finding.severity === "error").map((finding) => finding.ruleId);
  assert.ok(blockedRuleIds.includes("IMPORT_UNMAPPED_COLUMN"));
  assert.ok(blockedRuleIds.includes("IMPORT_DUPLICATE_COLUMN"));

  const statuses = Object.fromEntries(blocked.preview.columns.map((c) => [c.sourceHeader, c.status]));
  assert.equal(statuses["Notes"], "UNMAPPED");
  assert.equal(statuses["Phone Number"], "DUPLICATE");
  assert.equal(statuses["Phone"], "DUPLICATE");
});

test("workbook structural checks cover every populated and hidden data-bearing sheet", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["First Name", "Last Name", "Birthdate", "Gender"],
    ["Ada", "Lovelace", "2015-04-12", "F"],
  ]), "Student Info");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "Value"], ["Date Created", "2026-08-31"], ["Created By", "Analyst"],
  ]), "File Info");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["PRIVATE_MARKER"]]), "Unexpected Data");
  workbook.Workbook = { Sheets: [{ name: "Student Info", Hidden: 1 }, { name: "File Info", Hidden: 0 }, { name: "Unexpected Data", Hidden: 1 }] };
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const result = importWorkbook(bytes, "unsafe.xlsm");
  const ruleIds = result.preview.diagnostics.map((finding) => finding.ruleId);
  assert.ok(ruleIds.includes("IMPORT_UNKNOWN_SHEET"));
  assert.ok(ruleIds.includes("IMPORT_HIDDEN_CONTENT"));
});

test("workbook import diagnoses populated hidden rows but ignores formatting-only hidden rows", () => {
  const workbook = XLSX.utils.book_new();
  const students = XLSX.utils.aoa_to_sheet([
    ["First Name", "Last Name", "Birthdate"],
    ["Ada", "Lovelace", "2015-04-12"],
    ["", "", ""],
  ]);
  students["!rows"] = [];
  students["!rows"][1] = { hidden: true };
  students["!rows"][2] = { hidden: true };
  XLSX.utils.book_append_sheet(workbook, students, "Student Info");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Field", "Value"], ["School Name", "Test"]]), "File Info");
  const result = importWorkbook(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer, "hidden-row.xlsm");
  const hiddenFindings = result.preview.diagnostics.filter((finding) => finding.ruleId === "IMPORT_HIDDEN_CONTENT");
  assert.ok(hiddenFindings.some((finding) => finding.sourceLocation === "Student Info!2"));
  assert.equal(hiddenFindings.some((finding) => finding.sourceLocation === "Student Info!3"), false);
});

test("workbook import diagnoses populated hidden columns in File Info but ignores formatting-only hidden columns", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["First Name", "Last Name", "Birthdate"],
    ["Ada", "Lovelace", "2015-04-12"],
  ]), "Student Info");
  const metadataSheet = XLSX.utils.aoa_to_sheet([
    ["Field", "Value", ""],
    ["School Name", "Test", ""],
  ]);
  metadataSheet["!cols"] = [];
  metadataSheet["!cols"][1] = { hidden: true };
  metadataSheet["!cols"][2] = { hidden: true };
  XLSX.utils.book_append_sheet(workbook, metadataSheet, "File Info");
  const result = importWorkbook(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer, "hidden-column.xlsm");
  const hiddenFindings = result.preview.diagnostics.filter((finding) => finding.ruleId === "IMPORT_HIDDEN_CONTENT");
  assert.ok(hiddenFindings.some((finding) => finding.sourceLocation === "File Info!B"));
  assert.equal(hiddenFindings.some((finding) => finding.sourceLocation === "File Info!C"), false);
});

test("workbook metadata rejects unknown regions and duplicate labels", () => {
  const build = (metadataRows: unknown[][]) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["First Name", "Last Name", "Birthdate"], ["Ada", "Lovelace", "2015-04-12"]]), "Student Info");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(metadataRows), "File Info");
    return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  };
  assert.throws(() => importWorkbook(build([["Field", "Value"], ["School Name", "A"], ["Private note", "must not disappear"]]), "unknown.xlsm"), /unexpected populated metadata row/);
  assert.throws(() => importWorkbook(build([["Field", "Value"], ["School Name", "A"], ["School Name", "B"]]), "duplicate.xlsm"), /duplicate metadata field/);
});

test("workbook preserves type-only phones and unsafe phone notes for repair", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["First Name", "Last Name", "Birthdate", "Phone", "Phone Type", "Guardian Phone Type"],
    ["Ada", "Lovelace", "2015-04-12", "519-555-1234 call after 5", "HOME", "MOBILE"],
  ]), "Student Info");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Field", "Value"], ["School Name", "School"], ["Phone Type", "WORK"]]), "File Info");
  const result = importWorkbook(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer, "phones.xlsm");
  const imported = result.upload.schools[0].students[0];
  assert.equal(imported.phone?.number, "519-555-1234 call after 5");
  assert.equal(imported.phone?.type, "HOME");
  assert.equal(imported.guardians[0].phone?.type, "MOBILE");
  assert.deepEqual(result.upload.metadata.contactPhone, { number: "", type: "WORK" });
  assert.match(result.xml, /type="MOBILE">\s*<\/ns1:Phone>/);
  assert.ok(validateCanonicalUpload(result.upload).issues.some((finding) => finding.ruleId === "IMPORT_PHONE_REVIEW"));
});

test("second-only guardian and metadata import findings keep repairable stable targets", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["First Name", "Last Name", "Birthdate", "Guardian 2 First Name", "Guardian 2 Phone Number"],
    ["Ada", "Lovelace", "2015-04-12", "Second", "519-555-1234 call later"],
  ]), "Student Info");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Field", "Value"], ["Phone Type", "UNSUPPORTED"], ["School Name", "School"]]), "File Info");
  const result = importWorkbook(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer, "targets.xlsm");
  const guardian = result.upload.schools[0].students[0].guardians[0];
  const guardianFinding = result.upload.diagnostics.find((finding) => finding.field === "Guardian2PhoneNumber")!;
  assert.equal(guardianFinding.targetId, guardian.guardianId);
  assert.equal(guardianFinding.currentValue, "519-555-1234 call later");
  const guardianRepair = commitChangeGroup(result.upload, [{ issueId: guardianFinding.id, recordId: guardianFinding.recordId!, targetId: guardianFinding.targetId, field: guardianFinding.field!, oldValue: guardianFinding.currentValue!, newValue: "519-555-1234", ruleId: guardianFinding.ruleId, appliedAt: 1 }], { label: "Repair guardian phone", origin: "manual" });
  assert.equal(guardianRepair.document.schools[0].students[0].guardians.length, 1);
  assert.equal(guardianRepair.document.schools[0].students[0].guardians[0].guardianId, guardian.guardianId);

  const metadataFinding = result.upload.diagnostics.find((finding) => finding.field === "MetadataContactPhoneType")!;
  assert.equal(metadataFinding.recordId, "metadata");
  assert.equal(metadataFinding.currentValue, "UNSUPPORTED");
  const metadataRepair = commitChangeGroup(result.upload, [{ issueId: metadataFinding.id, recordId: "metadata", field: metadataFinding.field!, oldValue: metadataFinding.currentValue!, newValue: "WORK", ruleId: metadataFinding.ruleId, appliedAt: 1 }], { label: "Repair metadata phone type", origin: "setup" });
  assert.ok(!validateCanonicalUpload(metadataRepair.document).issues.some((finding) => finding.id === metadataFinding.id));
  const restored = undoChangeGroup(metadataRepair.document, metadataRepair.group);
  assert.ok(restored.diagnostics.some((finding) => finding.id === metadataFinding.id));
  assert.equal(restored.metadata.contactPhone?.type, "UNSUPPORTED");
});

test("workbook support does not guess missing sheets or accept other spreadsheet extensions", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["First Name", "Last Name", "Birthdate"]]), "Students");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  assert.throws(() => importWorkbook(bytes, "guess.xlsm"), /missing the "Student Info" sheet/);
  assert.throws(() => importWorkbook(bytes, "guess.xlsx"), /macro-enabled \.xlsm template/);
});

test("a decorative row that only repeats the column headers is skipped, not imported as a student", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "OEN", "First Name", "Last Name", "DOB", "Gender"],
    ["Required", "", "Y", "Y", "Y", "Y"],
    // Header-echo row: leading cell blank, every other populated cell restates its header.
    ["", "OEN", "First Name", "Last Name", "", ""],
    ["", "123456789", "Luke", "Ball", "2015-04-12", "M"],
  ]), "Student Info");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "Value"], ["Date Created", "2026-08-31"], ["Time Created", "12:30:00"], ["Created By", "Analyst"],
    ["Contact Phone", "5195551234"], ["Phone Type", "WORK"], ["PHU Contact Email", "analyst@example.ca"], ["Full Upload", "YES"], ["School Number", "123"], ["School Name", "Test"],
  ]), "File Info");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const result = importWorkbook(bytes, "echo-row.xlsm");
  assert.equal(result.preview.canonicalStudentCount, 1);
  assert.equal(result.upload.schools[0].students[0].name.first, "Luke");
  assert.ok(result.preview.diagnostics.some((finding) => finding.ruleId === "IMPORT_HEADER_ECHO_ROW"));
});

test("a header-echo row with an extra populated private cell is not discarded", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "OEN", "First Name", "Last Name", "DOB", "Gender", "Private"],
    ["Required", "", "Y", "Y", "Y", "Y", ""],
    ["", "OEN", "First Name", "Last Name", "", "", "do not drop"],
    ["", "123456789", "Luke", "Ball", "2015-04-12", "M", ""],
  ]), "Student Info");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "Value"], ["School Name", "Test"],
  ]), "File Info");
  const result = importWorkbook(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer, "echo-payload.xlsm");
  assert.equal(result.preview.diagnostics.some((finding) => finding.ruleId === "IMPORT_HEADER_ECHO_ROW"), false);
  assert.ok(result.preview.diagnostics.some((finding) => finding.ruleId === "IMPORT_UNMAPPED_COLUMN" && finding.sourceLocation === "Student Info!G"));
  assert.equal(result.preview.diagnostics.some((finding) => finding.ruleId === "IMPORT_UNRECOGNIZED_ROW"), false);
});

test("validateXml suggests deterministic fixes without shortening oversized identity values", () => {
  const source = xml()
    .replace("<Gender>F</Gender>", "<Gender>MALE</Gender>")
    .replace("<Last>Lovelace</Last>", `<Last>${"X".repeat(55)}</Last>`)
    .replace("519-555-3333", "5195553333");
  const result = validateXml(source);
  const byRule = Object.fromEntries(result.issues.map((i) => [i.ruleId, i]));
  assert.equal(byRule.GENDER_ALLOWED_VALUE?.suggestedFix, "M");
  assert.equal(byRule.GENDER_ALLOWED_VALUE?.autoFixable, true);
  assert.equal(byRule.FIELD_LENGTH?.suggestedFix, undefined);
  assert.equal(byRule.FIELD_LENGTH?.autoFixable, false);
  assert.equal(byRule.PHONE_FORMAT?.suggestedFix, "519-555-3333");
  assert.equal(byRule.PHONE_FORMAT?.autoFixable, true);
});

test.each([
  "2015-02-30",
  "2015-04-31",
  "03/04/2015",
  "13/04/2015",
  "April 3, 2015",
])("does not guess or fabricate a BirthDate from %s", (birthDate) => {
  const result = validateXml(xml().replace("2015-04-12", birthDate));
  const issue = result.issues.find((finding) => finding.ruleId === "BIRTHDATE_FORMAT");
  assert.equal(issue?.autoFixable, false);
  assert.equal(issue?.suggestedFix, undefined);
});

test("accepts a real leap day", () => {
  const result = validateXml(xml().replace("2015-04-12", "2016-02-29"));
  assert.equal(result.issues.some((finding) => finding.ruleId === "BIRTHDATE_FORMAT"), false);
});

test("does not offer to truncate an over-length OEN", () => {
  const result = validateXml(xml().replace("<Student>", "<Student><OEN>1234567890</OEN>"));
  const issues = result.issues.filter((finding) => finding.field === "OEN");
  assert.equal(issues.some((finding) => finding.suggestedFix !== undefined || finding.autoFixable), false);
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
  ]), "Student Info");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Field", "Value"], ["Date Created", "2026-08-31"], ["Time Created", "12:30:00"], ["Created By", "Analyst"],
    ["Contact Phone", "5195551234"], ["Phone Type", "WORK"], ["PHU Contact Email", "analyst@example.ca"], ["Full Upload", "YES"], ["School Number", "123"], ["School Name", "Test"],
  ]), "File Info");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const result = importWorkbook(bytes, "gender-xn.xlsm");
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
