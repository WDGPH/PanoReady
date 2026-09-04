import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { ValidationIssue } from "./types";

export const CANONICAL_SCHEMA_VERSION = "1.0.0";
export const ONTARIO_NAMESPACE = "http://ontario.ca";

export type CanonicalName = { first: string; middle: string; last: string };
export type CanonicalPhone = { number: string; type: string };
export type CanonicalGuardian = {
  name: CanonicalName;
  relationship: string;
  phone: CanonicalPhone | null;
};
export type CanonicalAddress = {
  unit: string;
  streetNumber: string;
  streetNumberSuffix: string;
  streetName: string;
  streetType: string;
  streetDirection: string;
  ruralRoute: string;
  poBoxNumber: string;
  city: string;
  province: string;
  postalCode: string;
};
export type CanonicalStudent = {
  recordId: string;
  oen: string;
  grade: string;
  className: string;
  name: CanonicalName;
  aliasName: CanonicalName | null;
  gender: string;
  birthDate: string;
  language: string;
  countryOfOrigin: string;
  guardians: CanonicalGuardian[];
  address: CanonicalAddress;
  phone: CanonicalPhone | null;
  provenance?: Record<string, { raw: string; sourceLocation: string }>;
};
export type CanonicalMetadata = {
  createDate: string;
  createTime: string;
  createdBy: string;
  contactPhone: CanonicalPhone | null;
  contactEmail: string;
  fullUpload: string;
  boardNumber: string;
  boardName: string;
};
export type CanonicalSchool = {
  schoolId: string;
  schoolNumber: string;
  name: string;
  students: CanonicalStudent[];
};
export type CanonicalUpload = {
  schemaVersion: string;
  batchId: string;
  metadata: CanonicalMetadata;
  schools: CanonicalSchool[];
  diagnostics: ValidationIssue[];
};

type XmlNode = Record<string, unknown>;

const emptyName = (): CanonicalName => ({ first: "", middle: "", last: "" });
const emptyAddress = (): CanonicalAddress => ({
  unit: "", streetNumber: "", streetNumberSuffix: "", streetName: "", streetType: "",
  streetDirection: "", ruralRoute: "", poBoxNumber: "", city: "", province: "", postalCode: "",
});

function array<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function node(value: unknown): XmlNode {
  return value && typeof value === "object" && !Array.isArray(value) ? value as XmlNode : {};
}

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return text((value as XmlNode)["#text"]);
  return String(value).trim();
}

function phone(value: unknown): CanonicalPhone | null {
  const n = node(value);
  const number = text(value);
  return number ? { number, type: text(n["@_type"]) } : null;
}

function name(value: unknown): CanonicalName {
  const n = node(value);
  return { first: text(n.First), middle: text(n.Middle), last: text(n.Last) };
}

function hasGuardianInformation(guardian: CanonicalGuardian): boolean {
  return Boolean(
    guardian.name.first.trim() || guardian.name.middle.trim() || guardian.name.last.trim()
      || guardian.relationship.trim() || guardian.phone?.number.trim(),
  );
}

function rootNamespace(xml: string): string | null {
  const withoutProlog = xml.replace(/^\s*<\?xml[\s\S]*?\?>/i, "").replace(/^\s*<!--([\s\S]*?)-->/, "").trimStart();
  const match = withoutProlog.match(/^<([A-Za-z_][\w.-]*:)?SchoolUpload\b([^>]*)>/i);
  if (!match) return null;
  const prefix = match[1]?.slice(0, -1) ?? "";
  const attrs = match[2];
  const declaration = prefix
    ? new RegExp(`\\bxmlns:${prefix}\\s*=\\s*["']([^"']+)["']`, "i")
    : /\bxmlns\s*=\s*["']([^"']+)["']/i;
  return attrs.match(declaration)?.[1] ?? "";
}

function inspectKeys(target: XmlNode, allowed: string[], path: string, diagnostics: ValidationIssue[]) {
  for (const [key, value] of Object.entries(target)) {
    if (key.startsWith("@_") || key === "#text") continue;
    if (!allowed.includes(key)) diagnostics.push({ id: `xml-unknown-${path}-${key}`, severity: "warning", ruleId: "XML_UNKNOWN_ELEMENT", layer: "XML", message: `Unknown element ${path}/${key} is preserved only in the original XML and requires review.`, xmlPath: `${path}/${key}`, autoFixable: false });
    else if (Array.isArray(value) && !["School", "Student", "Guardian"].includes(key)) diagnostics.push({ id: `xml-duplicate-${path}-${key}`, severity: "error", ruleId: "XML_DUPLICATE_ELEMENT", layer: "XML", message: `Duplicate singleton element ${path}/${key} is not allowed.`, xmlPath: `${path}/${key}`, autoFixable: false });
  }
}

export function parseCanonicalXml(xml: string): CanonicalUpload {
  if (xml.length > 50_000_000) throw new Error("XML exceeds the 50 MB local processing limit.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("DOCTYPE and entity declarations are not supported.");
  const wellFormed = XMLValidator.validate(xml);
  if (wellFormed !== true) throw new Error(`XML parse error: ${wellFormed.err.msg}`);
  const namespace = rootNamespace(xml);
  if (namespace === null) throw new Error("Root element <SchoolUpload> not found.");
  if (namespace !== ONTARIO_NAMESPACE) throw new Error(`Unexpected SchoolUpload namespace "${namespace || "(none)"}".`);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseTagValue: false,
    parseAttributeValue: false,
    removeNSPrefix: true,
    processEntities: false,
    isArray: (tagName) => tagName === "School" || tagName === "Student" || tagName === "Guardian",
  });
  const parsed = parser.parse(xml) as XmlNode;
  const root = node(parsed.SchoolUpload);
  const metadataNode = node(root.Metadata);
  const board = node(metadataNode.SchoolBoard);
  const diagnostics: ValidationIssue[] = [];
  inspectKeys(root, ["Metadata", "School"], "SchoolUpload", diagnostics);
  inspectKeys(metadataNode, ["CreateDate", "CreateTime", "CreatedBy", "ContactPhone", "ContactEmail", "FullUpload", "SchoolBoard"], "SchoolUpload/Metadata", diagnostics);
  inspectKeys(board, ["BoardNumber", "Name"], "SchoolUpload/Metadata/SchoolBoard", diagnostics);
  const schools = array(root.School as XmlNode | XmlNode[]).map((rawSchool, schoolIndex): CanonicalSchool => {
    const school = node(rawSchool);
    inspectKeys(school, ["SchoolNumber", "Name", "Students"], `SchoolUpload/School[${schoolIndex}]`, diagnostics);
    const studentsContainer = node(school.Students);
    inspectKeys(studentsContainer, ["Student"], `SchoolUpload/School[${schoolIndex}]/Students`, diagnostics);
    const students = array(studentsContainer.Student as XmlNode | XmlNode[]).map((rawStudent, studentIndex): CanonicalStudent => {
      const student = node(rawStudent);
      const addressNode = node(student.Address);
      const studentPath = `SchoolUpload/School[${schoolIndex}]/Students/Student[${studentIndex}]`;
      inspectKeys(student, ["OEN", "Grade", "Class", "Name", "AliasName", "Gender", "BirthDate", "Language", "CountryOfOrigin", "Guardian", "Address", "Phone"], studentPath, diagnostics);
      inspectKeys(node(student.Name), ["First", "Middle", "Last"], `${studentPath}/Name`, diagnostics);
      inspectKeys(node(student.AliasName), ["First", "Middle", "Last"], `${studentPath}/AliasName`, diagnostics);
      inspectKeys(addressNode, ["Unit", "StreetNumber", "StreetNumberSuffix", "StreetName", "StreetType", "StreetDirection", "RuralRoute", "PoBoxNumber", "City", "Province", "PostalCode"], `${studentPath}/Address`, diagnostics);
      const guardians = array(student.Guardian as XmlNode | XmlNode[]).slice(0, 2).map((rawGuardian): CanonicalGuardian => {
        const guardian = node(rawGuardian);
        inspectKeys(guardian, ["Name", "Relationship", "Phone"], `${studentPath}/Guardian`, diagnostics);
        inspectKeys(node(guardian.Name), ["First", "Middle", "Last"], `${studentPath}/Guardian/Name`, diagnostics);
        return { name: name(guardian.Name), relationship: text(guardian.Relationship), phone: phone(guardian.Phone) };
      }).filter(hasGuardianInformation);
      const alias = name(student.AliasName);
      const hasAlias = alias.first || alias.middle || alias.last;
      return {
        recordId: `school${schoolIndex}:student${studentIndex}`,
        oen: text(student.OEN), grade: text(student.Grade), className: text(student.Class),
        name: name(student.Name), aliasName: hasAlias ? alias : null,
        gender: text(student.Gender), birthDate: text(student.BirthDate), language: text(student.Language),
        countryOfOrigin: text(student.CountryOfOrigin), guardians,
        address: {
          unit: text(addressNode.Unit), streetNumber: text(addressNode.StreetNumber),
          streetNumberSuffix: text(addressNode.StreetNumberSuffix), streetName: text(addressNode.StreetName),
          streetType: text(addressNode.StreetType), streetDirection: text(addressNode.StreetDirection),
          ruralRoute: text(addressNode.RuralRoute), poBoxNumber: text(addressNode.PoBoxNumber),
          city: text(addressNode.City), province: text(addressNode.Province), postalCode: text(addressNode.PostalCode),
        },
        phone: phone(student.Phone),
      };
    });
    return {
      schoolId: `school${schoolIndex}`,
      schoolNumber: text(school.SchoolNumber),
      name: text(school.Name),
      students,
    };
  });
  const studentCount = schools.reduce((count, school) => count + school.students.length, 0);
  if (schools.length > 10_000 || studentCount > 250_000) throw new Error("XML exceeds supported school or student record limits.");
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    batchId: "xml-import",
    metadata: {
      createDate: text(metadataNode.CreateDate), createTime: text(metadataNode.CreateTime),
      createdBy: text(metadataNode.CreatedBy), contactPhone: phone(metadataNode.ContactPhone),
      contactEmail: text(metadataNode.ContactEmail), fullUpload: text(metadataNode.FullUpload),
      boardNumber: text(board.BoardNumber), boardName: text(board.Name),
    },
    schools,
    diagnostics,
  };
}

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function element(tag: string, value: string): string {
  return value ? `<${tag}>${esc(value)}</${tag}>` : "";
}
function phoneElement(tag: string, value: CanonicalPhone | null): string {
  return value?.number ? `<${tag} type="${esc(value.type)}">${esc(value.number)}</${tag}>` : "";
}
function nameXml(tag: string, value: CanonicalName | null, required = false): string {
  if (!value) return required ? `<${tag}></${tag}>` : "";
  const body = element("First", value.first) + element("Middle", value.middle) + element("Last", value.last);
  return body || required ? `<${tag}>${body}</${tag}>` : "";
}

export function serializeCanonicalXml(upload: CanonicalUpload): string {
  const m = upload.metadata;
  const metadata = element("CreateDate", m.createDate) + element("CreateTime", m.createTime)
    + element("CreatedBy", m.createdBy) + phoneElement("ContactPhone", m.contactPhone)
    + element("ContactEmail", m.contactEmail) + element("FullUpload", m.fullUpload)
    + (m.boardNumber || m.boardName ? `<SchoolBoard>${element("BoardNumber", m.boardNumber)}${element("Name", m.boardName)}</SchoolBoard>` : "");
  const schools = upload.schools.map((school) => {
    const students = school.students.map((student) => {
      const guardians = student.guardians.slice(0, 2).filter(hasGuardianInformation).map((guardian) =>
        `<Guardian>${nameXml("Name", guardian.name, true)}${element("Relationship", guardian.relationship)}${phoneElement("Phone", guardian.phone)}</Guardian>`
      ).join("");
      const a = student.address;
      const address = element("Unit", a.unit) + element("StreetNumber", a.streetNumber)
        + element("StreetNumberSuffix", a.streetNumberSuffix) + element("StreetName", a.streetName)
        + element("StreetType", a.streetType) + element("StreetDirection", a.streetDirection)
        + element("RuralRoute", a.ruralRoute) + element("PoBoxNumber", a.poBoxNumber)
        + element("City", a.city) + element("Province", a.province) + element("PostalCode", a.postalCode);
      return `<Student>${element("OEN", student.oen)}${element("Grade", student.grade)}${element("Class", student.className)}`
        + `${nameXml("Name", student.name, true)}${nameXml("AliasName", student.aliasName)}${element("Gender", student.gender)}`
        + `${element("BirthDate", student.birthDate)}${element("Language", student.language)}${element("CountryOfOrigin", student.countryOfOrigin)}`
        + `${guardians}<Address>${address}</Address>${phoneElement("Phone", student.phone)}</Student>`;
    }).join("");
    return `<School>${element("SchoolNumber", school.schoolNumber)}${element("Name", school.name)}<Students>${students}</Students></School>`;
  }).join("");
  const xml = `<SchoolUpload xmlns:ns1="${ONTARIO_NAMESPACE}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${ONTARIO_NAMESPACE} studentuploaddata.xsd"><Metadata>${metadata}</Metadata>${schools}</SchoolUpload>`;
  const prefixed = xml.replace(/<(\/?)([A-Z][A-Za-z0-9]*)(?=[\s>])/g, "<$1ns1:$2");
  return `<?xml version="1.0" encoding="utf-8"?>${prefixed}`;
}

export function flattenCanonicalStudent(student: CanonicalStudent, school: CanonicalSchool): Record<string, string> {
  const g1 = student.guardians[0];
  const g2 = student.guardians[1];
  return {
    SchoolName: school.name, SchoolNumber: school.schoolNumber,
    FirstName: student.name.first, MiddleName: student.name.middle, LastName: student.name.last,
    AliasFirstName: student.aliasName?.first ?? "", AliasMiddleName: student.aliasName?.middle ?? "", AliasLastName: student.aliasName?.last ?? "",
    BirthDate: student.birthDate, Grade: student.grade, Class: student.className, Gender: student.gender,
    OEN: student.oen, Language: student.language, CountryOfOrigin: student.countryOfOrigin,
    Unit: student.address.unit, StreetNumber: student.address.streetNumber, StreetNumberSuffix: student.address.streetNumberSuffix,
    StreetName: student.address.streetName, StreetType: student.address.streetType, StreetDirection: student.address.streetDirection,
    RuralRoute: student.address.ruralRoute, PoBoxNumber: student.address.poBoxNumber, City: student.address.city,
    Province: student.address.province, PostalCode: student.address.postalCode,
    Phone: student.phone?.number ?? "", PhoneType: student.phone?.type ?? "",
    GuardianFirstName: g1?.name.first ?? "", GuardianLastName: g1?.name.last ?? "",
    GuardianRelationship: g1?.relationship ?? "", GuardianPhoneNumber: g1?.phone?.number ?? "", GuardianPhoneType: g1?.phone?.type ?? "",
    Guardian2FirstName: g2?.name.first ?? "", Guardian2LastName: g2?.name.last ?? "",
    Guardian2Relationship: g2?.relationship ?? "", Guardian2PhoneNumber: g2?.phone?.number ?? "", Guardian2PhoneType: g2?.phone?.type ?? "",
  };
}

export function emptyCanonicalUpload(batchId: string): CanonicalUpload {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION, batchId,
    metadata: { createDate: "", createTime: "", createdBy: "", contactPhone: null, contactEmail: "", fullUpload: "", boardNumber: "", boardName: "" },
    schools: [{ schoolId: "school0", schoolNumber: "", name: "", students: [] }], diagnostics: [],
  };
}

export { emptyName, emptyAddress };
