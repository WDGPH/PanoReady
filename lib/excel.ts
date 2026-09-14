import * as XLSX from "xlsx";
import defaultRules from "../config/rules.stix.default.json";
import {
  emptyCanonicalUpload, emptyAddress, flattenCanonicalStudent, serializeCanonicalXml, parseCanonicalXml,
  type CanonicalStudent, type CanonicalUpload,
} from "./canonical";
import type { AppliedFix, ImportColumnMapping, ImportPreview, ValidationIssue } from "./types";
import { CANONICAL_FIELDS, type CanonicalField } from "./fields";
import { analyzeDateField, interpretDate, type DateConvention, type DateFieldAnalysis } from "./calendar";
import { analyzePhoneNumber } from "./phoneNumber";
export { CANONICAL_FIELDS, type CanonicalField } from "./fields";

const STUDENT_SHEET = "Student Info";
const METADATA_SHEET = "File Info";
const KNOWN_NON_DATA_SHEETS = new Set(["Lists of Values", "Student XML"]);

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
  GuardianMiddleName: ["guardian middle name", "guardian1 middle name", "guardian 1 middle name", "parent middle name"],
  GuardianLastName: ["guardian last name", "guardian1 last name", "guardian 1 last name", "parent last name"],
  GuardianRelationship: ["guardian relationship", "guardian1 relationship", "guardian 1 relationship", "parent relationship"],
  GuardianPhoneNumber: ["guardian phone number", "guardian1 phone number", "guardian 1 phone number", "parent phone"],
  GuardianPhoneType: ["guardian phone type", "guardian1 phone type", "guardian 1 phone type"],
  Guardian2FirstName: ["guardian2 first name", "guardian 2 first name", "second guardian first name"],
  Guardian2MiddleName: ["guardian2 middle name", "guardian 2 middle name", "second guardian middle name"],
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

/** One decoded workbook owned by the currently selected browser file. */
export type DecodedWorkbook = { fileName: string; workbook: XLSX.WorkBook };

export interface WorkbookImportResult {
  upload: CanonicalUpload;
  xml: string;
  metadata: XlsmMetadata;
  preview: ImportPreview;
  dateAnalysis: DateFieldAnalysis;
}

function rows(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
}

function findStudentSheet(workbook: XLSX.WorkBook): { name: string; rows: unknown[][]; headerIndex: number } {
  const sheet = workbook.Sheets[STUDENT_SHEET];
  if (!sheet) throw new Error(`Workbook is outside the supported input contract: missing the "${STUDENT_SHEET}" sheet.`);
  const sheetRows = rows(sheet);
  const candidates = sheetRows.slice(0, 60).map((row, headerIndex) => {
    const mapped = new Set(row.map((cell) => FIELD_BY_LABEL.get(normalizeLabel(cell))).filter(Boolean));
    return { headerIndex, mapped };
  }).filter(({ mapped }) => ["FirstName", "LastName", "BirthDate"].every((field) => mapped.has(field as CanonicalField)));
  if (candidates.length !== 1) throw new Error(`Workbook is outside the supported input contract: expected one header row in "${STUDENT_SHEET}" containing First Name, Last Name, and Birthdate.`);
  return { name: STUDENT_SHEET, rows: sheetRows, headerIndex: candidates[0].headerIndex };
}

function findMetadata(workbook: XLSX.WorkBook): XlsmMetadata {
  const labels: Record<string, keyof XlsmMetadata> = {
    datecreated: "dateCreated", timecreated: "timeCreated", createdby: "createdBy", contactphone: "contactPhone",
    phonetype: "phoneType", phucontactemail: "contactEmail", contactemail: "contactEmail", fullupload: "fullUpload",
    boardnumber: "boardNumber", boardname: "boardName", schoolnumber: "schoolNumber", schoolname: "schoolName",
  };
  const metadata: XlsmMetadata = { requiredFields: [], dateCreated: "", timeCreated: "", createdBy: "", contactPhone: "", phoneType: "", contactEmail: "", fullUpload: "", boardNumber: "", boardName: "", schoolNumber: "", schoolName: "" };
  const metadataSheet = workbook.Sheets[METADATA_SHEET];
  if (!metadataSheet) throw new Error(`Workbook is outside the supported input contract: missing the "${METADATA_SHEET}" sheet.`);
  const metadataRows = rows(metadataSheet);
  const headings = metadataRows.filter((row) => normalizeLabel(row[0]) === "field" && row.some((cell) => normalizeLabel(cell) === "value"));
  if (headings.length !== 1) throw new Error(`Workbook is outside the supported input contract: expected one Field / Value heading in "${METADATA_SHEET}".`);
  const valueColumn = headings[0].findIndex((cell) => normalizeLabel(cell) === "value");
  const seen = new Set<keyof XlsmMetadata>();
  for (let index = 0; index < metadataRows.length; index++) {
    const row = metadataRows[index];
    if (!row.some((cell) => display(cell)) || row === headings[0]) continue;
    const key = labels[normalizeLabel(row[0])];
    if (!key || key === "requiredFields") throw new Error(`Workbook is outside the supported input contract: unexpected populated metadata row ${index + 1} in "${METADATA_SHEET}".`);
    if (seen.has(key)) throw new Error(`Workbook is outside the supported input contract: duplicate metadata field "${display(row[0])}".`);
    if (row.some((cell, column) => column !== 0 && column !== valueColumn && display(cell))) throw new Error(`Workbook is outside the supported input contract: unexpected populated metadata cell in row ${index + 1}.`);
    seen.add(key);
    metadata[key] = display(row[valueColumn]);
  }
  return metadata;
}

type Lookup = Map<string, string>;
function controlledLookups(workbook: XLSX.WorkBook): Record<string, Lookup> {
  const result: Record<string, Lookup> = {};
  const lookupSheet = workbook.Sheets["Lists of Values"];
  if (lookupSheet) {
    const sheetRows = rows(lookupSheet);
    const headerIndex = sheetRows.findIndex((row) => row.filter((cell) => normalizeLabel(cell) === "value").length >= 3);
    if (headerIndex >= 1) {
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
  // X/N are supported workbook-input aliases. Canonical STIX output uses Other,
  // while the active output rule accepts M/F/Unk/Other.
  if (field === "Gender" && ["x", "n"].includes(raw.trim().toLowerCase())) return "Other";
  const group = GROUP_BY_FIELD[field];
  if (!group) return raw.trim();
  const value = lookups[normalizeLabel(group)]?.get(normalizeLabel(raw));
  if (value) return field === "Gender" && ["X", "N"].includes(value.toUpperCase()) ? "Other" : value;
  diagnostics.push(diagnostic(`import-controlled-${location}-${field}`, "error", `${field} value "${raw}" is not in the active controlled-value list.`, "IMPORT_CONTROLLED_VALUE", location, field));
  return raw.trim();
}

function normalizePhone(raw: string, diagnostics: ValidationIssue[], location: string, field: string): string {
  const value = raw.trim();
  if (!value) return "";
  const analysis = analyzePhoneNumber(value);
  if (analysis.status === "invalid") {
    diagnostics.push(diagnostic(`import-phone-review-${location}`, "error", `${field} could not be safely normalized (${analysis.reason}); the original value was preserved for review.`, "IMPORT_PHONE_REVIEW", location, field));
    return value;
  }
  return analysis.value;
}

function normalizeDate(raw: unknown, diagnostics: ValidationIssue[], location: string, convention?: DateConvention, fieldConflict = false): string {
  if (raw === "" || raw === null || raw === undefined) return "";
  const evidence = interpretDate(raw);
  if (fieldConflict && ["day-first", "month-first", "ambiguous", "same-day-month"].includes(evidence.classification)) {
    diagnostics.push(diagnostic(`import-date-conflict-${location}`, "error", `BirthDate "${evidence.input}" belongs to a field with conflicting day/month conventions and must be repaired explicitly.`, "IMPORT_DATE_CONFLICT", location, "BirthDate"));
    return typeof raw === "string" ? raw.trim() : String((raw as { v?: unknown }).v ?? raw);
  }
  const interpreted = interpretDate(raw, { convention });
  if (interpreted.canonical) return interpreted.canonical;
  diagnostics.push(diagnostic(`import-date-${location}`, "error", interpreted.explanation, interpreted.classification === "ambiguous" ? "IMPORT_DATE_AMBIGUOUS" : "IMPORT_DATE_INVALID", location, "BirthDate"));
  return typeof raw === "string" ? raw.trim() : String((raw as { v?: unknown }).v ?? raw);
}

function makeStudent(values: Record<string, unknown>, index: number, worksheet: string, rowNumber: number, lookups: Record<string, Lookup>, diagnostics: ValidationIssue[], convention?: DateConvention, dateFieldConflict = false): CanonicalStudent {
  const diagnosticStart = diagnostics.length;
  const provenance: CanonicalStudent["provenance"] = {};
  const get = (field: CanonicalField) => {
    const source = values[field] ?? "";
    const raw = display(typeof source === "object" && source ? (source as { w?: unknown; v?: unknown }).w ?? (source as { v?: unknown }).v : source);
    if (raw) provenance[field] = { raw, sourceLocation: `${worksheet}!${rowNumber}` };
    const location = `${worksheet}!${rowNumber}`;
    if (field === "BirthDate") return normalizeDate(source, diagnostics, location, convention, dateFieldConflict);
    if (["Phone", "GuardianPhoneNumber", "Guardian2PhoneNumber"].includes(field)) return normalizePhone(raw, diagnostics, location, field);
    if (field === "PostalCode") return raw.replace(/\s/g, "").toUpperCase().replace(/^(.{3})(.{3})$/, "$1 $2");
    return canonicalValue(field, raw, lookups, diagnostics, location);
  };
  const guardian = (second = false) => {
    const prefix = second ? "Guardian2" : "Guardian";
    const first = get(`${prefix}FirstName` as CanonicalField); const middle = get(`${prefix}MiddleName` as CanonicalField); const last = get(`${prefix}LastName` as CanonicalField);
    const relationship = get(`${prefix}Relationship` as CanonicalField); const number = get(`${prefix}PhoneNumber` as CanonicalField);
    const type = get(`${prefix}PhoneType` as CanonicalField);
    return first || middle || last || relationship || number || type ? { guardianId: `school0:student${index}:guardian${second ? 1 : 0}`, name: { first, middle, last }, relationship, phone: number || type ? { number, type } : null } : null;
  };
  const g1 = guardian(); const g2 = guardian(true);
  const alias = { first: get("AliasFirstName"), middle: get("AliasMiddleName"), last: get("AliasLastName") };
  const studentPhone = get("Phone");
  const student: CanonicalStudent = {
    recordId: `school0:student${index}`, oen: get("OEN"), grade: get("Grade"), className: get("Class"),
    name: { first: get("FirstName"), middle: get("MiddleName"), last: get("LastName") },
    aliasName: alias.first || alias.middle || alias.last ? alias : null, gender: get("Gender"), birthDate: get("BirthDate"),
    language: get("Language"), countryOfOrigin: get("CountryOfOrigin"), guardians: [g1, g2].filter((g): g is NonNullable<typeof g> => Boolean(g)),
    address: { ...emptyAddress(), unit: get("Unit"), streetNumber: get("StreetNumber"), streetNumberSuffix: get("StreetNumberSuffix"), streetName: get("StreetName"), streetType: get("StreetType"), streetDirection: get("StreetDirection"), ruralRoute: get("RuralRoute"), poBoxNumber: get("PoBoxNumber"), city: get("City"), province: get("Province"), postalCode: get("PostalCode") },
    phone: studentPhone || values.PhoneType ? { number: studentPhone, type: get("PhoneType") } : null, provenance,
  };
  const flat = flattenCanonicalStudent(student, { schoolId: "school0", schoolNumber: "", name: "", students: [] });
  for (const finding of diagnostics.slice(diagnosticStart)) {
    finding.recordId = student.recordId;
    const guardian = finding.field?.startsWith("Guardian2") ? g2 : finding.field?.startsWith("Guardian") ? g1 : null;
    if (guardian) {
      finding.targetId = guardian.guardianId;
      if (finding.field?.endsWith("PhoneNumber")) finding.currentValue = guardian.phone?.number ?? "";
      else if (finding.field?.endsWith("PhoneType")) finding.currentValue = guardian.phone?.type ?? "";
      else if (finding.field?.endsWith("Relationship")) finding.currentValue = guardian.relationship;
    } else if (finding.field) finding.currentValue = flat[finding.field] ?? "";
  }
  return student;
}

function hasPopulatedCells(sheet: XLSX.WorkSheet): boolean {
  return Object.keys(sheet).some((address) => !address.startsWith("!") && display(sheet[address]?.v) !== "");
}

function isPopulatedCell(cell: XLSX.CellObject | undefined): boolean {
  return Boolean(cell && (display(cell.v) !== "" || cell.f));
}

function hiddenContentDiagnostics(sheetName: string, sheet: XLSX.WorkSheet): ValidationIssue[] {
  const hiddenRows = new Set<number>();
  const hiddenColumns = new Set<number>();
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const cell = sheet[address] as XLSX.CellObject | undefined;
    if (!isPopulatedCell(cell)) continue;
    const { r, c } = XLSX.utils.decode_cell(address);
    if (sheet["!rows"]?.[r]?.hidden) hiddenRows.add(r);
    if (sheet["!cols"]?.[c]?.hidden) hiddenColumns.add(c);
  }
  return [
    ...[...hiddenRows].sort((a, b) => a - b).map((row) => diagnostic(
      `import-hidden-row-${sheetName}-${row + 1}`, "error",
      `Worksheet "${sheetName}" contains populated content in hidden row ${row + 1}. Unhide the row or remove its content before import.`,
      "IMPORT_HIDDEN_CONTENT", `${sheetName}!${row + 1}`,
    )),
    ...[...hiddenColumns].sort((a, b) => a - b).map((column) => {
      const label = XLSX.utils.encode_col(column);
      return diagnostic(
        `import-hidden-column-${sheetName}-${label}`, "error",
        `Worksheet "${sheetName}" contains populated content in hidden column ${label}. Unhide the column or remove its content before import.`,
        "IMPORT_HIDDEN_CONTENT", `${sheetName}!${label}`,
      );
    }),
  ];
}

export function decodeWorkbook(data: ArrayBuffer, fileName: string): DecodedWorkbook {
  if (data.byteLength > 50_000_000) throw new Error("Workbook exceeds the 50 MB local processing limit.");
  if (!/\.xlsm$/i.test(fileName)) throw new Error("The supported workbook input is the macro-enabled .xlsm template. Convert other spreadsheet layouts outside PanoReady before import.");
  return { fileName, workbook: XLSX.read(data, { type: "array", cellDates: false, cellNF: true, cellStyles: true }) };
}

export function importDecodedWorkbook(decoded: DecodedWorkbook, metadataOverrides?: Partial<XlsmMetadata>, dateConvention?: DateConvention): WorkbookImportResult {
  const { fileName, workbook } = decoded;
  const source = findStudentSheet(workbook);
  const metadata = { ...findMetadata(workbook), ...metadataOverrides };
  const diagnostics: ValidationIssue[] = [];
  for (const sheetName of [STUDENT_SHEET, METADATA_SHEET]) diagnostics.push(...hiddenContentDiagnostics(sheetName, workbook.Sheets[sheetName]));
  for (const sheetName of workbook.SheetNames) {
    if (sheetName === STUDENT_SHEET || sheetName === METADATA_SHEET || KNOWN_NON_DATA_SHEETS.has(sheetName)) continue;
    if (hasPopulatedCells(workbook.Sheets[sheetName])) diagnostics.push(diagnostic(`import-unknown-sheet-${sheetName}`, "error", `Populated worksheet "${sheetName}" is outside the supported workbook contract.`, "IMPORT_UNKNOWN_SHEET", sheetName));
  }
  const sourceSheet = workbook.Sheets[source.name];
  for (const sheetName of [STUDENT_SHEET, METADATA_SHEET]) {
    for (const address of Object.keys(workbook.Sheets[sheetName])) {
      if (address.startsWith("!") || !workbook.Sheets[sheetName][address]?.f) continue;
      diagnostics.push(diagnostic(`import-formula-${sheetName}-${address}`, "error", `Formula ${sheetName}!${address} is not accepted in an input field. Replace it with its reviewed value before import.`, "IMPORT_FORMULA", `${sheetName}!${address}`));
    }
  }
  if ((sourceSheet["!merges"]?.length ?? 0) > 0) diagnostics.push(diagnostic("import-merged-cells", "warning", `Worksheet "${source.name}" contains merged cells; verify the detected header and row boundaries.`, "IMPORT_MERGED_CELLS", source.name));
  for (const sheetName of [STUDENT_SHEET, METADATA_SHEET]) {
    const sheetInfo = workbook.Workbook?.Sheets?.find((sheet) => sheet.name === sheetName);
    if (sheetInfo?.Hidden) diagnostics.push(diagnostic(`import-hidden-sheet-${sheetName}`, "error", `Input worksheet "${sheetName}" must be visible.`, "IMPORT_HIDDEN_CONTENT", sheetName));
  }
  const headers = source.rows[source.headerIndex];
  const destinations = headers.map((header) => FIELD_BY_LABEL.get(normalizeLabel(header)));
  const duplicateFields = new Set(destinations.filter((field, index) => field && destinations.indexOf(field) !== index));
  const markerIndex = source.rows.findIndex((row, index) => index > source.headerIndex && normalizeLabel(row[0]).startsWith("enterdata"));
  const instructionLabels = new Set(["required", "example", "notesformat", "notes"]);
  for (let index = 0; index < source.headerIndex; index++) {
    if (source.rows[index].some((cell) => display(cell))) diagnostics.push(diagnostic(`import-preheader-${index + 1}`, "error", `Unexpected populated content before the header at ${STUDENT_SHEET}!${index + 1}.`, "IMPORT_UNKNOWN_REGION", `${STUDENT_SHEET}!${index + 1}`));
  }
  if (markerIndex >= 0) for (let index = source.headerIndex + 1; index < markerIndex; index++) {
    const row = source.rows[index];
    if (row.some((cell) => display(cell)) && !instructionLabels.has(normalizeLabel(row[0]))) diagnostics.push(diagnostic(`import-instruction-region-${index + 1}`, "error", `Unexpected populated content in the instruction region at ${STUDENT_SHEET}!${index + 1}.`, "IMPORT_UNKNOWN_REGION", `${STUDENT_SHEET}!${index + 1}`));
  }
  let scanStart = markerIndex >= 0 ? markerIndex + 1 : source.headerIndex + 1;
  if (markerIndex < 0) while (scanStart < source.rows.length && instructionLabels.has(normalizeLabel(source.rows[scanStart][0]))) scanStart++;
  // A row whose every populated cell exactly restates its mapped column header (e.g. a
  // decorative repeated-header row with a blank leading cell) is never real student data —
  // no actual record has FirstName "First Name" and OEN "OEN" at once.
  const isHeaderEchoRow = (row: unknown[]) => {
    let populated = 0;
    for (let index = 0; index < row.length; index++) {
      const value = display(row[index]);
      if (!value) continue;
      populated++;
      if (!destinations[index] || normalizeLabel(value) !== normalizeLabel(headers[index])) return false;
    }
    return populated >= 2;
  };
  let skippedHeaderEchoRows = 0;
  const inspectedRows = source.rows.slice(scanStart).map((row, offset) => ({ row, index: scanStart + offset }))
    .filter(({ row }) => {
      if (!isHeaderEchoRow(row)) return true;
      skippedHeaderEchoRows++;
      return false;
    });
  const candidates = inspectedRows.filter(({ row, index }) => {
      const values = Object.fromEntries(destinations.map((field, index) => field ? [field, display(row[index])] : ["", ""]));
      const identity = [values.FirstName, values.LastName, values.BirthDate, values.OEN].filter(Boolean).length;
      const populated = destinations.filter((field, index) => field && display(row[index])).length;
      const anyPopulated = row.some((cell) => display(cell));
      if (anyPopulated && !(identity > 0 && populated >= 2)) diagnostics.push(diagnostic(`import-unrecognized-row-${index + 1}`, "error", `Populated row ${index + 1} in "${STUDENT_SHEET}" does not have the supported student row shape.`, "IMPORT_UNRECOGNIZED_ROW", `${STUDENT_SHEET}!${index + 1}`));
      return identity > 0 && populated >= 2;
    });
  if (skippedHeaderEchoRows > 0) diagnostics.push(diagnostic("import-header-echo-rows", "warning", `Skipped ${skippedHeaderEchoRows} row(s) that only repeated the column headers as values.`, "IMPORT_HEADER_ECHO_ROW", source.name));
  const columns: ImportColumnMapping[] = headers.map((header, index) => {
    const canonicalField = destinations[index];
    const populatedCount = candidates.filter(({ row }) => display(row[index])).length;
    const status: ImportColumnMapping["status"] = !canonicalField ? "UNMAPPED" : duplicateFields.has(canonicalField) ? "DUPLICATE" : "MAPPED";
    if (status === "UNMAPPED" && populatedCount > 0) diagnostics.push(diagnostic(`import-unmapped-${index}`, "error", `Populated column "${display(header)}" is not mapped.`, "IMPORT_UNMAPPED_COLUMN", `${source.name}!${XLSX.utils.encode_col(index)}`));
    if (status === "DUPLICATE") diagnostics.push(diagnostic(`import-duplicate-${index}`, "error", `Column "${display(header)}" duplicates the ${canonicalField} destination.`, "IMPORT_DUPLICATE_COLUMN", `${source.name}!${XLSX.utils.encode_col(index)}`, canonicalField));
    return { column: index + 1, sourceHeader: display(header), canonicalField, status, populatedCount };
  });
  if (markerIndex < 0) diagnostics.push(diagnostic("import-marker-missing", "warning", "No data marker row was found; positive identity evidence was used to identify student rows.", "IMPORT_MARKER_MISSING", source.name));
  const lookups = controlledLookups(workbook);
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
  const sourceCell = (row: number, column: number): unknown => {
    const cell = sourceSheet[XLSX.utils.encode_cell({ r: row, c: column })];
    if (!cell) return "";
    if (cell.t === "d" || (cell.t === "n" && typeof cell.v === "number" && XLSX.SSF.is_date(cell.z ?? ""))) {
      return { t: cell.t, v: cell.v, w: cell.w, z: cell.z, date1904, location: `${source.name}!${XLSX.utils.encode_cell({ r: row, c: column })}` };
    }
    return display(cell.v);
  };
  const birthDateColumn = destinations.findIndex((field) => field === "BirthDate");
  const dateEntries = birthDateColumn < 0 ? [] : candidates.map(({ index }) => sourceCell(index, birthDateColumn));
  const dateAnalysis = analyzeDateField(dateEntries, { field: "BirthDate", convention: dateConvention });
  const students = candidates.map(({ index }, studentIndex) => {
    const values: Record<string, unknown> = {};
    destinations.forEach((field, column) => { if (field && !duplicateFields.has(field)) values[field] = sourceCell(index, column); });
    return makeStudent(values, studentIndex, source.name, index + 1, lookups, diagnostics, dateConvention, dateAnalysis.conflict);
  });
  for (const finding of diagnostics) {
    if (finding.recordId || !finding.sourceLocation) continue;
    const student = students.find((candidate) => Object.values(candidate.provenance ?? {}).some((source) => source.sourceLocation === finding.sourceLocation));
    if (student) finding.recordId = student.recordId;
    else if (finding.sourceLocation === "metadata") finding.recordId = "metadata";
  }
  const upload = emptyCanonicalUpload(`${fileName}:${Date.now()}`);
  upload.metadata = {
    createDate: metadata.dateCreated.trim(), createTime: metadata.timeCreated.trim(), createdBy: metadata.createdBy.trim(),
    contactPhone: metadata.contactPhone || metadata.phoneType ? { number: normalizePhone(metadata.contactPhone, diagnostics, "metadata", "MetadataContactPhone"), type: canonicalValue("PhoneType", metadata.phoneType, lookups, diagnostics, "metadata") } : null,
    contactEmail: metadata.contactEmail.trim(), fullUpload: canonicalValue("FullUpload", metadata.fullUpload, lookups, diagnostics, "metadata"),
    boardNumber: metadata.boardNumber.trim(), boardName: metadata.boardName.trim(),
  };
  upload.schools[0] = { schoolId: "school0", schoolNumber: metadata.schoolNumber.trim(), name: metadata.schoolName.trim(), students };
  for (const finding of diagnostics) if (finding.sourceLocation === "metadata") {
    finding.recordId = "metadata";
    if (finding.field === "PhoneType") finding.field = "MetadataContactPhoneType";
    if (finding.field === "MetadataContactPhone") finding.currentValue = upload.metadata.contactPhone?.number ?? "";
    if (finding.field === "MetadataContactPhoneType") finding.currentValue = upload.metadata.contactPhone?.type ?? "";
  }
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
  return { upload, xml, metadata, dateAnalysis, preview: { worksheet: source.name, headerRow: source.headerIndex + 1, firstDataRow: scanStart + 1, sourceRowCount: candidates.length, canonicalStudentCount: students.length, columns, diagnostics, transformationCount, reconciled } };
}

export function importWorkbook(data: ArrayBuffer, fileName: string, metadataOverrides?: Partial<XlsmMetadata>, dateConvention?: DateConvention): WorkbookImportResult {
  return importDecodedWorkbook(decodeWorkbook(data, fileName), metadataOverrides, dateConvention);
}

export function workbookMetadata(decoded: DecodedWorkbook): XlsmMetadata {
  const metadata = findMetadata(decoded.workbook);
  try {
    const source = findStudentSheet(decoded.workbook);
    const required = source.rows[source.headerIndex + 1] ?? [];
    metadata.requiredFields = source.rows[source.headerIndex].map((header, index) => display(required[index]).toUpperCase() === "Y" ? FIELD_BY_LABEL.get(normalizeLabel(header)) : undefined).filter((field): field is CanonicalField => Boolean(field));
  } catch { /* metadata remains editable even when import inspection fails */ }
  return metadata;
}

/** Describe operator changes made to detected workbook setup before import. */
export function workbookSetupChanges(detected: XlsmMetadata, document: CanonicalUpload): AppliedFix[] {
  const current: Record<string, string> = {
    CreateDate: document.metadata.createDate, CreateTime: document.metadata.createTime, CreatedBy: document.metadata.createdBy,
    MetadataContactPhone: document.metadata.contactPhone?.number ?? "", MetadataContactPhoneType: document.metadata.contactPhone?.type ?? "",
    ContactEmail: document.metadata.contactEmail, FullUpload: document.metadata.fullUpload,
    BoardNumber: document.metadata.boardNumber, BoardName: document.metadata.boardName,
    SchoolNumber: document.schools[0]?.schoolNumber ?? "", SchoolName: document.schools[0]?.name ?? "",
  };
  const original: Record<string, string> = {
    CreateDate: detected.dateCreated, CreateTime: detected.timeCreated, CreatedBy: detected.createdBy,
    MetadataContactPhone: detected.contactPhone, MetadataContactPhoneType: detected.phoneType,
    ContactEmail: detected.contactEmail, FullUpload: detected.fullUpload, BoardNumber: detected.boardNumber, BoardName: detected.boardName,
    SchoolNumber: detected.schoolNumber, SchoolName: detected.schoolName,
  };
  return Object.keys(current).filter((field) => current[field] !== original[field]).map((field, index) => {
    const school = field === "SchoolNumber" || field === "SchoolName";
    return { issueId: `workbook-setup-${index}`, recordId: school ? document.schools[0].schoolId : "metadata", targetId: school ? document.schools[0].schoolId : undefined, field, oldValue: original[field], newValue: current[field], ruleId: "WORKBOOK_SETUP", appliedAt: 0 };
  });
}
