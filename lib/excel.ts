import * as XLSX from "xlsx";

const HEADER_ALIASES: Record<string, string> = {
  // Keep canonical STIX field names for headers that would otherwise be
  // normalized to lowercase (for example, "Gender" -> "gender").
  oen: "OEN", "o e n": "OEN", grade: "Grade", gender: "Gender", sex: "Gender",
  "gender type": "Gender", "gender code": "Gender", "student gender": "Gender",
  language: "Language", class: "Class",
  "first name": "FirstName", "middle name": "MiddleName", "last name": "LastName",
  "alias first name": "AliasFirstName", "alias middle name": "AliasMiddleName", "alias last name": "AliasLastName",
  birthdate: "BirthDate", "country of origin": "CountryOfOrigin", "street number": "StreetNumber",
  "street name": "StreetName", "street type": "StreetType", "street direction": "StreetDirection",
  "postal code": "PostalCode", "phone number": "Phone", "phone type": "PhoneType",
};

const text = (value: unknown) => value === null || value === undefined ? "" : String(value).trim();
const escapeXml = (value: unknown) => text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const child = (tag: string, value: unknown) => text(value) ? `<ns1:${tag}>${escapeXml(value)}</ns1:${tag}>` : "";
const childWithType = (tag: string, value: unknown, type: unknown) => text(value) ? `<ns1:${tag} type="${escapeXml(type)}">${escapeXml(value)}</ns1:${tag}>` : "";
const fieldName = (value: unknown) => {
  const raw = text(value).toLowerCase().replace(/\s+/g, " ");
  return HEADER_ALIASES[raw] ?? raw.replace(/[^a-z0-9]+(.)/g, (_, c: string) => c.toUpperCase());
};

function filenameSchoolName(fileName: string): string {
  return fileName.replace(/\.xlsm?$/i, "").replace(/\s*\(\d+\)$/, "").trim() || "Unknown school";
}

export interface XlsmMetadata {
  requiredFields: string[];
  dateCreated: string;
  timeCreated: string;
  createdBy: string;
  contactPhone: string;
  phoneType: string;
  contactEmail: string;
  fullUpload: string;
  boardNumber: string;
  boardName: string;
  schoolNumber: string;
  schoolName: string;
}

function readFileInfo(workbook: XLSX.WorkBook, fileName: string): XlsmMetadata {
  const values: Record<string, string> = {};
  const sheet = workbook.Sheets["File Info"];
  if (sheet) for (const row of XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false })) {
    const key = text(row[0]);
    if (key && key !== "Field") values[key] = text(row[2]);
  }
  return {
    requiredFields: [],
    dateCreated: values["Date Created"], timeCreated: values["Time Created"], createdBy: values["Created By"],
    contactPhone: values["Contact Phone"], phoneType: values["Phone Type"], contactEmail: values["PHU Contact Email"],
    fullUpload: values["Full Upload"], boardNumber: values["Board Number"], boardName: values["Board Name"],
    schoolNumber: values["School Number"], schoolName: values["School Name"] || filenameSchoolName(fileName),
  };
}

export function xlsmMetadata(data: ArrayBuffer, fileName: string): XlsmMetadata {
  const workbook = XLSX.read(data, { type: "array", cellDates: false, raw: false });
  const metadata = readFileInfo(workbook, fileName);
  const sheet = workbook.Sheets["Student Info"];
  if (sheet) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
    const headerIndex = rows.findIndex((row) => row.some((cell) => text(cell).toLowerCase() === "first name"));
    if (headerIndex >= 0) {
      const headers = rows[headerIndex].map(fieldName);
      const requiredRow = rows[headerIndex + 1] ?? [];
      metadata.requiredFields = headers.filter((header, index) => text(requiredRow[index]).toUpperCase() === "Y" && header);
    }
  }
  return metadata;
}

/** Converts the STIX Excel template's Student Info sheet into the XML shape used by the app. */
export function xlsmToStixXml(data: ArrayBuffer, fileName: string, metadataOverrides?: Partial<XlsmMetadata>): string {
  const workbook = XLSX.read(data, { type: "array", cellDates: false, raw: false });
  const sheet = workbook.Sheets["Student Info"];
  if (!sheet) throw new Error('Workbook is missing the "Student Info" sheet.');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const headerIndex = rows.findIndex((row) => row.some((cell) => text(cell).toLowerCase() === "first name"));
  if (headerIndex < 0) throw new Error("Could not find the Student Info column headers.");
  const headers = rows[headerIndex].map(fieldName);
  const requiredRow = rows[headerIndex + 1] ?? [];
  const requiredFields = headers.filter((header, index) => text(requiredRow[index]).toUpperCase() === "Y" && header);
  const markerIndex = rows.findIndex((row, index) => index > headerIndex && text(row[0]).toLowerCase().startsWith("enter data"));
  const firstDataRow = markerIndex >= 0 ? markerIndex + 1 : headerIndex + 1;
  const templatePlaceholder = /^(select from drop-down(?:\. see lists of values tab\.)?|yyyy-mm-dd|9 digit number|notes\/format|required|example)$/i;
  const students = rows.slice(firstDataRow)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, text(row[index])])))
    .filter((row) => Object.values(row).some((value) => value && !templatePlaceholder.test(value)));

  const metadata = { ...xlsmMetadata(data, fileName), ...metadataOverrides, requiredFields };
  const schoolName = metadata.schoolName || filenameSchoolName(fileName);
  const schoolNumber = metadata.schoolNumber;
  const studentXml = students.map((student) => {
    const get = (field: string) => text(student[field]);
    const name = [child("First", get("FirstName")), child("Middle", get("MiddleName")), child("Last", get("LastName"))].join("");
    const alias = [child("First", get("AliasFirstName")), child("Middle", get("AliasMiddleName")), child("Last", get("AliasLastName"))].join("");
    const address = ["Unit", "StreetNumber", "StreetName", "StreetType", "StreetDirection", "RuralRoute", "PoBoxNumber", "City", "Province", "PostalCode"].map((field) => child(field, get(field))).join("");
    const guardian = (first: string, last: string, relationship: string, phone: string, phoneType: string) => {
      if (![first, last, relationship, phone].some((field) => get(field))) return "";
      return `<ns1:Guardian><ns1:Name>${child("First", get(first))}${child("Last", get(last))}</ns1:Name>${child("Relationship", get(relationship))}${childWithType("Phone", get(phone), get(phoneType))}</ns1:Guardian>`;
    };
    const guardians = guardian("GuardianFirstName", "GuardianLastName", "GuardianRelationship", "GuardianPhoneNumber", "GuardianPhoneType")
      + guardian("Guardian2FirstName", "Guardian2LastName", "Guardian2Relationship", "Guardian2PhoneNumber", "Guardian2PhoneType");
    // Match the order emitted by the official workbook's Student XML sheet.
    return `<ns1:Student>${child("OEN", get("OEN"))}${child("Grade", get("Grade"))}${child("Class", get("Class"))}<ns1:Name>${name}</ns1:Name>${alias ? `<ns1:AliasName>${alias}</ns1:AliasName>` : ""}${child("Gender", get("Gender"))}${child("BirthDate", get("BirthDate"))}${child("Language", get("Language"))}${child("CountryOfOrigin", get("CountryOfOrigin"))}${guardians}<ns1:Address>${address}</ns1:Address>${childWithType("Phone", get("Phone"), get("PhoneType"))}</ns1:Student>`;
  }).join("");
  const fileMetadata = [
    child("CreateDate", metadata.dateCreated), child("CreateTime", metadata.timeCreated), child("CreatedBy", metadata.createdBy),
    metadata.contactPhone ? `<ns1:ContactPhone type="${escapeXml(metadata.phoneType)}">${escapeXml(metadata.contactPhone)}</ns1:ContactPhone>` : "",
    child("ContactEmail", metadata.contactEmail),
    child("FullUpload", metadata.fullUpload),
    metadata.boardNumber || metadata.boardName ? `<ns1:SchoolBoard>${child("BoardNumber", metadata.boardNumber)}${child("Name", metadata.boardName)}</ns1:SchoolBoard>` : "",
  ].join("");
  // These values come from the official Pano STIX workbook's XML-generation
  // macro. The namespace URI is part of the schema identity; the ns1 prefix
  // itself is only an alias and may be changed without changing the XML name.
  return `<?xml version="1.0" encoding="utf-8"?><ns1:SchoolUpload xmlns:ns1="http://ontario.ca" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://ontario.ca studentuploaddata.xsd"><ns1:Metadata>${fileMetadata}</ns1:Metadata><ns1:School>${child("SchoolNumber", schoolNumber)}${child("Name", schoolName)}<ns1:Students>${studentXml}</ns1:Students></ns1:School></ns1:SchoolUpload>`;
}
