import * as XLSX from "xlsx";
import defaultRules from "../config/rules.stix.default.json";
import {
  emptyCanonicalUpload, emptyAddress, serializeCanonicalXml, parseCanonicalXml,
  type CanonicalStudent, type CanonicalUpload,
} from "./canonical";
import type { ImportColumnMapping, ImportPreview, ValidationIssue } from "./types";
import { CANONICAL_FIELDS, type CanonicalField } from "./fields";
export { CANONICAL_FIELDS, type CanonicalField } from "./fields";
/** Column overrides, keyed by 1-based column number (matches ImportColumnMapping.column). "IGNORE" drops the column instead of mapping it. */
export type ColumnOverrides = Record<number, CanonicalField | "IGNORE">;

const BASE_LABELS: Record<CanonicalField, string[]> = {
  OEN: ["oen", "o e n", "ontario education number", "student oen"],
  Grade: ["grade", "grade code", "student grade"], Class: ["class", "class name", "homeroom"],
  FirstName: ["first name", "firstname", "student first name", "child first name", "given name"],
  MiddleName: ["middle name", "middlename", "student middle name", "child middle name"],
  LastName: ["last name", "lastname", "student last name", "child last name", "surname", "family name"],
  AliasFirstName: ["alias first name", "preferred first name"], AliasMiddleName: ["alias middle name"], AliasLastName: ["alias last name", "preferred last name"],
  Gender: ["gender", "sex", "gender type", "gender code", "student gender"], BirthDate: ["birthdate", "birth date", "date of birth", "dob"],
  Language: ["language", "language code", "first language"], CountryOfOrigin: ["country of origin", "country", "country code"],
  Unit: ["unit", "unit number", "apartment", "apt"], StreetNumber: ["street number", "house number"], StreetNumberSuffix: ["street number suffix"],
  StreetName: ["street name"], StreetType: ["street type"], StreetDirection: ["street direction", "street direction type"],
  RuralRoute: ["rural route", "rr"], PoBoxNumber: ["po box number", "poboxnumber", "po box"], City: ["city", "town", "municipality"],
  Province: ["province", "province code"], PostalCode: ["postal code", "postalcode", "zip code"], Phone: ["phone", "phone number", "student phone", "student phone number"],
  PhoneType: ["phone type", "student phone type"],
  GuardianFirstName: ["guardian first name", "guardian1 first name", "guardian 1 first name", "parent first name"],
  GuardianLastName: ["guardian last name", "guardian1 last name", "guardian 1 last name", "parent last name"],
  GuardianRelationship: ["guardian relationship", "guardian1 relationship", "guardian 1 relationship", "parent relationship"],
  GuardianPhoneNumber: ["guardian phone number", "guardian1 phone number", "guardian 1 phone number", "parent phone"],
  GuardianPhoneType: ["guardian phone type", "guardian1 phone type", "guardian 1 phone type"],
  Guardian2FirstName: ["guardian2 first name", "guardian 2 first name", "second guardian first name"],
  Guardian2LastName: ["guardian2 last name", "guardian 2 last name", "second guardian last name"],
  Guardian2Relationship: ["guardian2 relationship", "guardian 2 relationship", "second guardian relationship"],
  Guardian2PhoneNumber: ["guardian2 phone number", "guardian 2 phone number", "second guardian phone"],
  Guardian2PhoneType: ["guardian2 phone type", "guardian 2 phone type", "second guardian phone type"],
};

const normalizeLabel = (value: unknown) => String(value ?? "").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
const display = (value: unknown) => value === null || value === undefined ? "" : String(value).trim();
const FIELD_BY_LABEL = new Map<string, CanonicalField>();
for (const field of CANONICAL_FIELDS) for (const label of [field, ...BASE_LABELS[field]]) FIELD_BY_LABEL.set(normalizeLabel(label), field);

export interface XlsmMetadata {
  requiredFields: string[];
  dateCreated: string; timeCreated: string; createdBy: string; contactPhone: string; phoneType: string;
  contactEmail: string; fullUpload: string; boardNumber: string; boardName: string; schoolNumber: string; schoolName: string;
}

export interface WorkbookImportResult {
  upload: CanonicalUpload;
  xml: string;
  metadata: XlsmMetadata;
  preview: ImportPreview;
}

function filenameSchoolName(fileName: string): string {
  return fileName.replace(/\.xlsm?$/i, "").replace(/\s*\(\d+\)$/, "").trim() || "Unknown school";
}

function rows(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
}

function findStudentSheet(workbook: XLSX.WorkBook): { name: string; rows: unknown[][]; headerIndex: number } {
  let best: { name: string; rows: unknown[][]; headerIndex: number; score: number } | null = null;
  for (const name of workbook.SheetNames) {
    const sheetRows = rows(workbook.Sheets[name]);
    for (let index = 0; index < Math.min(sheetRows.length, 60); index++) {
      const mapped = new Set(sheetRows[index].map((cell) => FIELD_BY_LABEL.get(normalizeLabel(cell))).filter(Boolean));
      const identity = ["FirstName", "LastName", "BirthDate"].filter((field) => mapped.has(field as CanonicalField)).length;
      const score = mapped.size + identity * 4;
      if (identity >= 2 && (!best || score > best.score)) best = { name, rows: sheetRows, headerIndex: index, score };
    }
  }
  if (!best) throw new Error("Could not identify a student worksheet and header row. Map at least two identity columns such as First Name, Last Name, or Birth Date.");
  return best;
}

function findMetadata(workbook: XLSX.WorkBook, fileName: string): XlsmMetadata {
  const labels: Record<string, keyof XlsmMetadata> = {
    datecreated: "dateCreated", timecreated: "timeCreated", createdby: "createdBy", contactphone: "contactPhone",
    phonetype: "phoneType", phucontactemail: "contactEmail", contactemail: "contactEmail", fullupload: "fullUpload",
    boardnumber: "boardNumber", boardname: "boardName", schoolnumber: "schoolNumber", schoolname: "schoolName",
  };
  const metadata: XlsmMetadata = { requiredFields: [], dateCreated: "", timeCreated: "", createdBy: "", contactPhone: "", phoneType: "", contactEmail: "", fullUpload: "", boardNumber: "", boardName: "", schoolNumber: "", schoolName: filenameSchoolName(fileName) };
  let best: unknown[][] | null = null;
  let bestScore = 0;
  for (const name of workbook.SheetNames) {
    const sheetRows = rows(workbook.Sheets[name]);
    const score = sheetRows.reduce((count, row) => count + (labels[normalizeLabel(row[0])] ? 1 : 0), 0);
    if (score > bestScore) { best = sheetRows; bestScore = score; }
  }
  if (!best) return metadata;
  const heading = best.find((row) => normalizeLabel(row[0]) === "field");
  const valueColumn = heading ? Math.max(1, heading.findIndex((cell) => normalizeLabel(cell) === "value")) : 2;
  for (const row of best) {
    const key = labels[normalizeLabel(row[0])];
    if (key && key !== "requiredFields") metadata[key] = display(row[valueColumn]);
  }
  return metadata;
}

type Lookup = Map<string, string>;
function controlledLookups(workbook: XLSX.WorkBook): Record<string, Lookup> {
  const result: Record<string, Lookup> = {};
  for (const name of workbook.SheetNames) {
    const sheetRows = rows(workbook.Sheets[name]);
    const headerIndex = sheetRows.findIndex((row) => row.filter((cell) => normalizeLabel(cell) === "value").length >= 3);
    if (headerIndex < 1) continue;
    const groupRow = sheetRows[headerIndex - 1];
    for (let col = 0; col < sheetRows[headerIndex].length; col++) {
      if (normalizeLabel(sheetRows[headerIndex][col]) !== "value") continue;
      const group = display(groupRow[col]);
      const lookup = new Map<string, string>();
      for (let r = headerIndex + 1; r < sheetRows.length; r++) {
        const code = display(sheetRows[r][col]);
        const definition = display(sheetRows[r][col + 1]);
        if (!code) continue;
        lookup.set(normalizeLabel(code), code);
        if (definition) lookup.set(normalizeLabel(definition), code);
      }
      if (lookup.size) result[normalizeLabel(group)] = lookup;
    }
  }
  const addCodes = (group: string, values: string[]) => {
    const lookup = result[normalizeLabel(group)] ?? new Map<string, string>();
    for (const value of values) lookup.set(normalizeLabel(value), value);
    result[normalizeLabel(group)] = lookup;
  };
  addCodes("Grade", defaultRules.allowedGradeValues); addCodes("Gender Type", defaultRules.allowedGenderValues);
  addCodes("Language", defaultRules.allowedLanguageValues); addCodes("Country of Origin", defaultRules.allowedCountryValues);
  addCodes("Street Type", defaultRules.allowedStreetTypeValues); addCodes("Province", defaultRules.allowedProvinceValues);
  addCodes("Relationship", defaultRules.allowedRelationshipValues); addCodes("Phone Type", defaultRules.allowedPhoneTypeValues);
  addCodes("Street Direction Type", defaultRules.allowedStreetDirectionValues); addCodes("Full Load Type", defaultRules.allowedFullLoadTypeValues);
  return result;
}

const GROUP_BY_FIELD: Partial<Record<CanonicalField | "FullUpload", string>> = {
  Grade: "Grade", Gender: "Gender Type", Language: "Language", CountryOfOrigin: "Country of Origin", StreetType: "Street Type",
  Province: "Province", GuardianRelationship: "Relationship", Guardian2Relationship: "Relationship",
  PhoneType: "Phone Type", GuardianPhoneType: "Phone Type", Guardian2PhoneType: "Phone Type",
  StreetDirection: "Street Direction Type", FullUpload: "Full Load Type",
};

function diagnostic(id: string, severity: "error" | "warning" | "info", message: string, ruleId: string, sourceLocation?: string, field?: string): ValidationIssue {
  return { id, severity, message, ruleId, sourceLocation, field, autoFixable: false, layer: "IMPORT" };
}

function canonicalValue(field: CanonicalField | "FullUpload", raw: string, lookups: Record<string, Lookup>, diagnostics: ValidationIssue[], location: string): string {
  if (!raw) return "";
  // The official template's Gender dropdown offers X/N for data entry, but the official
  // export macro maps both to "Other" before writing XML, since the schema's genderType
  // enum only has M/F/Unk/Other. Match that exactly rather than exporting X/N literally.
  if (field === "Gender" && ["x", "n"].includes(raw.trim().toLowerCase())) return "Other";
  const group = GROUP_BY_FIELD[field];
  if (!group) return raw.trim();
  const value = lookups[normalizeLabel(group)]?.get(normalizeLabel(raw));
  if (value) return field === "Gender" && ["X", "N"].includes(value.toUpperCase()) ? "Other" : value;
  diagnostics.push(diagnostic(`import-controlled-${location}-${field}`, "error", `${field} value "${raw}" is not in the official controlled-value list.`, "IMPORT_CONTROLLED_VALUE", location, field));
  return raw.trim();
}

function normalizePhone(raw: string, diagnostics: ValidationIssue[], location: string, field: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/[;/]|\bor\b/i.test(value)) {
    diagnostics.push(diagnostic(`import-phone-multiple-${location}`, "error", `${field} contains multiple phone numbers and requires review.`, "IMPORT_PHONE_AMBIGUOUS", location, field));
    return value;
  }
  const extension = value.match(/(?:x|ext\.?|extension)\s*(\d{1,5})\s*$/i)?.[1] ?? "";
  const withoutExtension = extension ? value.replace(/(?:x|ext\.?|extension)\s*\d{1,5}\s*$/i, "") : value;
  let digits = withoutExtension.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}${extension ? `x${extension}` : ""}`;
}

function normalizeDate(raw: string, diagnostics: ValidationIssue[], location: string): string {
  const value = raw.trim();
  if (!value) return "";
  const iso = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const numeric = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numeric) {
    const a = Number(numeric[1]); const b = Number(numeric[2]);
    if (a <= 12 && b <= 12) {
      diagnostics.push(diagnostic(`import-date-ambiguous-${location}`, "error", `BirthDate "${value}" is ambiguous; use YYYY-MM-DD.`, "IMPORT_DATE_AMBIGUOUS", location, "BirthDate"));
      return value;
    }
    const month = a > 12 ? b : a; const day = a > 12 ? a : b;
    return `${numeric[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return value;
}

function makeStudent(values: Record<string, string>, index: number, worksheet: string, rowNumber: number, lookups: Record<string, Lookup>, diagnostics: ValidationIssue[]): CanonicalStudent {
  const provenance: CanonicalStudent["provenance"] = {};
  const get = (field: CanonicalField) => {
    const raw = values[field] ?? "";
    if (raw) provenance[field] = { raw, sourceLocation: `${worksheet}!${rowNumber}` };
    const location = `${worksheet}!${rowNumber}`;
    if (field === "BirthDate") return normalizeDate(raw, diagnostics, location);
    if (["Phone", "GuardianPhoneNumber", "Guardian2PhoneNumber"].includes(field)) return normalizePhone(raw, diagnostics, location, field);
    if (field === "PostalCode") return raw.replace(/\s/g, "").toUpperCase().replace(/^(.{3})(.{3})$/, "$1 $2");
    return canonicalValue(field, raw, lookups, diagnostics, location);
  };
  const guardian = (second = false) => {
    const prefix = second ? "Guardian2" : "Guardian";
    const first = get(`${prefix}FirstName` as CanonicalField); const last = get(`${prefix}LastName` as CanonicalField);
    const relationship = get(`${prefix}Relationship` as CanonicalField); const number = get(`${prefix}PhoneNumber` as CanonicalField);
    const type = get(`${prefix}PhoneType` as CanonicalField);
    return first || last || relationship || number ? { name: { first, middle: "", last }, relationship, phone: number ? { number, type } : null } : null;
  };
  const g1 = guardian(); const g2 = guardian(true);
  const alias = { first: get("AliasFirstName"), middle: get("AliasMiddleName"), last: get("AliasLastName") };
  const studentPhone = get("Phone");
  return {
    recordId: `school0:student${index}`, oen: get("OEN"), grade: get("Grade"), className: get("Class"),
    name: { first: get("FirstName"), middle: get("MiddleName"), last: get("LastName") },
    aliasName: alias.first || alias.middle || alias.last ? alias : null, gender: get("Gender"), birthDate: get("BirthDate"),
    language: get("Language"), countryOfOrigin: get("CountryOfOrigin"), guardians: [g1, g2].filter((g): g is NonNullable<typeof g> => Boolean(g)),
    address: { ...emptyAddress(), unit: get("Unit"), streetNumber: get("StreetNumber"), streetNumberSuffix: get("StreetNumberSuffix"), streetName: get("StreetName"), streetType: get("StreetType"), streetDirection: get("StreetDirection"), ruralRoute: get("RuralRoute"), poBoxNumber: get("PoBoxNumber"), city: get("City"), province: get("Province"), postalCode: get("PostalCode") },
    phone: studentPhone ? { number: studentPhone, type: get("PhoneType") } : null, provenance,
  };
}

export function importWorkbook(data: ArrayBuffer, fileName: string, metadataOverrides?: Partial<XlsmMetadata>, columnOverrides?: ColumnOverrides): WorkbookImportResult {
  if (data.byteLength > 50_000_000) throw new Error("Workbook exceeds the 50 MB local processing limit.");
  const workbook = XLSX.read(data, { type: "array", cellDates: false, raw: false });
  const source = findStudentSheet(workbook);
  const metadata = { ...findMetadata(workbook, fileName), ...metadataOverrides };
  const diagnostics: ValidationIssue[] = [];
  const sourceSheet = workbook.Sheets[source.name];
  for (const address of Object.keys(sourceSheet)) {
    if (address.startsWith("!")) continue;
    const cell = sourceSheet[address];
    if (!cell?.f) continue;
    diagnostics.push(diagnostic(`import-formula-${address}`, cell.v === undefined || cell.v === null || cell.v === "" ? "error" : "warning", cell.v === undefined || cell.v === null || cell.v === "" ? `Formula ${source.name}!${address} has no cached value and cannot be imported safely.` : `Formula ${source.name}!${address} was not executed; its cached value was used.`, "IMPORT_FORMULA", `${source.name}!${address}`));
  }
  if ((sourceSheet["!merges"]?.length ?? 0) > 0) diagnostics.push(diagnostic("import-merged-cells", "warning", `Worksheet "${source.name}" contains merged cells; verify the detected header and row boundaries.`, "IMPORT_MERGED_CELLS", source.name));
  const sheetInfo = workbook.Workbook?.Sheets?.find((sheet) => sheet.name === source.name);
  if (sheetInfo?.Hidden) diagnostics.push(diagnostic("import-hidden-sheet", "warning", `The selected student worksheet "${source.name}" is hidden.`, "IMPORT_HIDDEN_CONTENT", source.name));
  const headers = source.rows[source.headerIndex];
  const autoDestinations = headers.map((header) => FIELD_BY_LABEL.get(normalizeLabel(header)));
  const ignoredColumns = new Set(Object.entries(columnOverrides ?? {}).filter(([, value]) => value === "IGNORE").map(([column]) => Number(column)));
  const destinations = autoDestinations.map((field, index) => {
    const override = columnOverrides?.[index + 1];
    if (override === "IGNORE") return undefined;
    if (override) return override;
    return field;
  });
  const duplicateFields = new Set(destinations.filter((field, index) => field && destinations.indexOf(field) !== index));
  const markerIndex = source.rows.findIndex((row, index) => index > source.headerIndex && normalizeLabel(row[0]).startsWith("enterdata"));
  const scanStart = markerIndex >= 0 ? markerIndex + 1 : source.headerIndex + 1;
  const excludedLabels = new Set(["required", "example", "notesformat", "notes", "field", "enterdataselectvaluesinthisrow"]);
  // A row whose every populated mapped cell exactly restates its own column header (e.g. a
  // decorative repeated-header row with a blank leading cell) is never real student data —
  // no actual record has FirstName "First Name" and OEN "OEN" at once.
  const isHeaderEchoRow = (row: unknown[]) => {
    let populated = 0;
    let echoed = 0;
    destinations.forEach((field, index) => {
      if (!field) return;
      const value = display(row[index]);
      if (!value) return;
      populated++;
      if (normalizeLabel(value) === normalizeLabel(headers[index])) echoed++;
    });
    return populated >= 2 && echoed === populated;
  };
  let skippedHeaderEchoRows = 0;
  const candidates = source.rows.slice(scanStart).map((row, offset) => ({ row, index: scanStart + offset }))
    .filter(({ row }) => !excludedLabels.has(normalizeLabel(row[0])))
    .filter(({ row }) => {
      if (!isHeaderEchoRow(row)) return true;
      skippedHeaderEchoRows++;
      return false;
    })
    .filter(({ row }) => {
      const values = Object.fromEntries(destinations.map((field, index) => field ? [field, display(row[index])] : ["", ""]));
      const identity = [values.FirstName, values.LastName, values.BirthDate, values.OEN].filter(Boolean).length;
      const populated = destinations.filter((field, index) => field && display(row[index])).length;
      return identity > 0 && populated >= 2;
    });
  if (skippedHeaderEchoRows > 0) diagnostics.push(diagnostic("import-header-echo-rows", "warning", `Skipped ${skippedHeaderEchoRows} row(s) that only repeated the column headers as values.`, "IMPORT_HEADER_ECHO_ROW", source.name));
  const columns: ImportColumnMapping[] = headers.map((header, index) => {
    const canonicalField = destinations[index];
    const populatedCount = candidates.filter(({ row }) => display(row[index])).length;
    const status: ImportColumnMapping["status"] = ignoredColumns.has(index + 1) ? "IGNORED"
      : !canonicalField ? "UNMAPPED" : duplicateFields.has(canonicalField) ? "DUPLICATE" : "MAPPED";
    if (status === "UNMAPPED" && populatedCount > 0) diagnostics.push(diagnostic(`import-unmapped-${index}`, "error", `Populated column "${display(header)}" is not mapped.`, "IMPORT_UNMAPPED_COLUMN", `${source.name}!${XLSX.utils.encode_col(index)}`));
    if (status === "DUPLICATE") diagnostics.push(diagnostic(`import-duplicate-${index}`, "error", `Column "${display(header)}" duplicates the ${canonicalField} destination.`, "IMPORT_DUPLICATE_COLUMN", `${source.name}!${XLSX.utils.encode_col(index)}`, canonicalField));
    return { column: index + 1, sourceHeader: display(header), canonicalField, status, populatedCount };
  });
  if (markerIndex < 0) diagnostics.push(diagnostic("import-marker-missing", "warning", "No data marker row was found; positive identity evidence was used to identify student rows.", "IMPORT_MARKER_MISSING", source.name));
  const lookups = controlledLookups(workbook);
  const students = candidates.map(({ row, index }, studentIndex) => {
    const values: Record<string, string> = {};
    destinations.forEach((field, column) => { if (field && !duplicateFields.has(field)) values[field] = display(row[column]); });
    return makeStudent(values, studentIndex, source.name, index + 1, lookups, diagnostics);
  });
  const upload = emptyCanonicalUpload(`${fileName}:${Date.now()}`);
  upload.metadata = {
    createDate: metadata.dateCreated.trim(), createTime: metadata.timeCreated.trim(), createdBy: metadata.createdBy.trim(),
    contactPhone: metadata.contactPhone ? { number: normalizePhone(metadata.contactPhone, diagnostics, "metadata", "ContactPhone"), type: canonicalValue("PhoneType", metadata.phoneType, lookups, diagnostics, "metadata") } : null,
    contactEmail: metadata.contactEmail.trim(), fullUpload: canonicalValue("FullUpload", metadata.fullUpload, lookups, diagnostics, "metadata"),
    boardNumber: metadata.boardNumber.trim(), boardName: metadata.boardName.trim(),
  };
  upload.schools[0] = { schoolId: "school0", schoolNumber: metadata.schoolNumber.trim(), name: metadata.schoolName.trim() || filenameSchoolName(fileName), students };
  upload.diagnostics = diagnostics;
  const xml = serializeCanonicalXml(upload);
  let reconciled = false;
  try {
    const reparsed = parseCanonicalXml(xml);
    reconciled = reparsed.schools.length === upload.schools.length && reparsed.schools.reduce((n, s) => n + s.students.length, 0) === students.length;
  } catch { reconciled = false; }
  if (!reconciled) diagnostics.push({ ...diagnostic("reconciliation-failed", "error", "Serialized and reparsed student counts do not agree.", "RECONCILIATION_COUNT"), layer: "RECONCILIATION" });
  const transformationCount = students.reduce((count, student) => count + Object.entries(student.provenance ?? {}).filter(([field, p]) => {
    const transformed = field === "BirthDate" ? student.birthDate : field === "Gender" ? student.gender : field === "PostalCode" ? student.address.postalCode : "";
    return transformed && transformed !== p.raw;
  }).length, 0);
  return { upload, xml, metadata, preview: { worksheet: source.name, headerRow: source.headerIndex + 1, firstDataRow: scanStart + 1, sourceRowCount: candidates.length, canonicalStudentCount: students.length, columns, diagnostics, transformationCount, reconciled } };
}

export function xlsmMetadata(data: ArrayBuffer, fileName: string): XlsmMetadata {
  const workbook = XLSX.read(data, { type: "array", cellDates: false, raw: false });
  const metadata = findMetadata(workbook, fileName);
  try {
    const source = findStudentSheet(workbook);
    const required = source.rows[source.headerIndex + 1] ?? [];
    metadata.requiredFields = source.rows[source.headerIndex].map((header, index) => display(required[index]).toUpperCase() === "Y" ? FIELD_BY_LABEL.get(normalizeLabel(header)) : undefined).filter((field): field is CanonicalField => Boolean(field));
  } catch { /* metadata remains editable even when import inspection fails */ }
  return metadata;
}

export function xlsmToSTIXXml(data: ArrayBuffer, fileName: string, metadataOverrides?: Partial<XlsmMetadata>, columnOverrides?: ColumnOverrides): string {
  return importWorkbook(data, fileName, metadataOverrides, columnOverrides).xml;
}
