import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { ValidationIssue } from "./types";

export const CANONICAL_SCHEMA_VERSION = "1.0.0";
export const ONTARIO_NAMESPACE = "http://ontario.ca";
const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

export type CanonicalName = { first: string; middle: string; last: string };
export type CanonicalPhone = { number: string; type: string };
export type CanonicalGuardian = {
  guardianId: string;
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
  return String(value);
}

function phone(value: unknown): CanonicalPhone | null {
  const n = node(value);
  const number = text(value);
  const type = text(n["@_type"]);
  return number || type ? { number, type } : null;
}

function name(value: unknown): CanonicalName {
  const n = node(value);
  return { first: text(n.First), middle: text(n.Middle), last: text(n.Last) };
}

type NamespaceContext = Map<string, string>;

const CHILDREN: Record<string, readonly string[]> = {
  SchoolUpload: ["Metadata", "School"],
  Metadata: ["CreateDate", "CreateTime", "CreatedBy", "ContactPhone", "ContactEmail", "FullUpload", "SchoolBoard"],
  SchoolBoard: ["BoardNumber", "Name"],
  School: ["SchoolNumber", "Name", "Students"],
  Students: ["Student"],
  Student: ["OEN", "Grade", "Class", "Name", "AliasName", "Gender", "BirthDate", "Language", "CountryOfOrigin", "Guardian", "Address", "Phone"],
  Guardian: ["Name", "Relationship", "Phone"],
  Address: ["Unit", "StreetNumber", "StreetNumberSuffix", "StreetName", "StreetType", "StreetDirection", "RuralRoute", "PoBoxNumber", "City", "Province", "PostalCode"],
};

const REPEATED_CHILDREN = new Set(["School", "Student"]);

function splitQName(qName: string): { prefix: string; local: string } {
  const separator = qName.indexOf(":");
  return separator < 0 ? { prefix: "", local: qName } : { prefix: qName.slice(0, separator), local: qName.slice(separator + 1) };
}

function declarations(attributes: XmlNode, inherited: NamespaceContext): NamespaceContext {
  const context = new Map(inherited);
  for (const [rawName, rawValue] of Object.entries(attributes)) {
    const name = rawName.replace(/^@_/, "");
    if (name === "xmlns") context.set("", String(rawValue));
    else if (name.startsWith("xmlns:")) context.set(name.slice(6), String(rawValue));
  }
  return context;
}

function elementNamespace(qName: string, context: NamespaceContext): string {
  return context.get(splitQName(qName).prefix) ?? "";
}

function validateAttributes(local: string, attributes: XmlNode, context: NamespaceContext, path: string) {
  for (const rawName of Object.keys(attributes)) {
    const qName = rawName.replace(/^@_/, "");
    if (qName === "xmlns" || qName.startsWith("xmlns:")) continue;
    const { prefix, local: attributeLocal } = splitQName(qName);
    const namespace = prefix ? context.get(prefix) ?? "" : "";
    if (local === "SchoolUpload" && attributeLocal === "schemaLocation" && namespace === XSI_NAMESPACE) continue;
    if ((local === "Phone" || local === "ContactPhone") && !prefix && attributeLocal === "type") continue;
    throw new Error(`Unsupported attribute ${path}/@${qName}.`);
  }
}

function validateElement(qName: string, orderedChildren: unknown, rawAttributes: unknown, inherited: NamespaceContext, path: string, parentLocal?: string) {
  const attributes = node(rawAttributes);
  const context = declarations(attributes, inherited);
  const { local } = splitQName(qName);
  if (elementNamespace(qName, context) !== ONTARIO_NAMESPACE) throw new Error(`Unexpected namespace on ${path}; every supported STIX element must use "${ONTARIO_NAMESPACE}".`);
  validateAttributes(local, attributes, context, path);

  const allowed = local === "AliasName" || (local === "Name" && (parentLocal === "Student" || parentLocal === "Guardian"))
    ? ["First", "Middle", "Last"]
    : CHILDREN[local];
  const entries = Array.isArray(orderedChildren) ? orderedChildren as XmlNode[] : [];
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const [childQName, value] of Object.entries(entry)) {
      if (childQName === ":@" || childQName === "#comment" || childQName === "?xml") continue;
      if (childQName === "#text") {
        if (allowed && String(value).trim()) throw new Error(`Unsupported mixed text content at ${path}.`);
        continue;
      }
      const childLocal = splitQName(childQName).local;
      if (!allowed?.includes(childLocal)) throw new Error(`Unsupported element ${path}/${childQName}.`);
      const count = (counts.get(childLocal) ?? 0) + 1;
      counts.set(childLocal, count);
      const maximum = childLocal === "Guardian" ? 2 : REPEATED_CHILDREN.has(childLocal) ? Infinity : 1;
      if (count > maximum) throw new Error(`Unsupported cardinality at ${path}/${childLocal}; expected at most ${maximum}.`);
      validateElement(childQName, value, entry[":@"], context, `${path}/${childLocal}[${count}]`, local);
    }
  }
}

/** Reject unsupported XML structure before projecting values into the working model. */
function assertSupportedXmlStructure(xml: string): void {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    commentPropName: "#comment",
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
  });
  const document = parser.parse(xml) as XmlNode[];
  const roots = document.flatMap((entry) => Object.entries(entry)
    .filter(([key]) => ![":@", "?xml", "#comment", "#text"].includes(key))
    .map(([qName, value]) => ({ qName, value, attributes: entry[":@"] })));
  for (const entry of document) if (typeof entry["#text"] === "string" && entry["#text"].trim()) throw new Error("Unsupported text outside the root element.");
  if (roots.length !== 1 || splitQName(roots[0].qName).local !== "SchoolUpload") throw new Error("Expected exactly one root element named SchoolUpload.");
  validateElement(roots[0].qName, roots[0].value, roots[0].attributes, new Map(), "SchoolUpload");
}

export function parseCanonicalXml(xml: string): CanonicalUpload {
  if (xml.length > 50_000_000) throw new Error("XML exceeds the 50 MB local processing limit.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("DOCTYPE and entity declarations are not supported.");
  const wellFormed = XMLValidator.validate(xml);
  if (wellFormed !== true) throw new Error(`XML parse error: ${wellFormed.err.msg}`);
  assertSupportedXmlStructure(xml);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    removeNSPrefix: true,
    processEntities: true,
    isArray: (tagName) => tagName === "School" || tagName === "Student" || tagName === "Guardian",
  });
  const parsed = parser.parse(xml) as XmlNode;
  const root = node(parsed.SchoolUpload);
  const metadataNode = node(root.Metadata);
  const board = node(metadataNode.SchoolBoard);
  const diagnostics: ValidationIssue[] = [];
  const schools = array(root.School as XmlNode | XmlNode[]).map((rawSchool, schoolIndex): CanonicalSchool => {
    const school = node(rawSchool);
    const studentsContainer = node(school.Students);
    const students = array(studentsContainer.Student as XmlNode | XmlNode[]).map((rawStudent, studentIndex): CanonicalStudent => {
      const student = node(rawStudent);
      const addressNode = node(student.Address);
      const guardians = array(student.Guardian as XmlNode | XmlNode[]).map((rawGuardian, guardianIndex): CanonicalGuardian => {
        const guardian = node(rawGuardian);
        return { guardianId: `school${schoolIndex}:student${studentIndex}:guardian${guardianIndex}`, name: name(guardian.Name), relationship: text(guardian.Relationship), phone: phone(guardian.Phone) };
      });
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
  return value && (value.number || value.type) ? `<${tag}${value.type ? ` type="${esc(value.type)}"` : ""}>${esc(value.number)}</${tag}>` : "";
}
function nameXml(tag: string, value: CanonicalName | null, required = false): string {
  if (!value) return required ? `<${tag}></${tag}>` : "";
  const body = element("First", value.first) + element("Middle", value.middle) + element("Last", value.last);
  return body || required ? `<${tag}>${body}</${tag}>` : "";
}

function indentSerializedXml(xml: string): string {
  const declarationEnd = xml.indexOf("?>") + 2;
  const declaration = xml.slice(0, declarationEnd);
  const body = xml.slice(declarationEnd);
  const tokens = body.match(/<[^>]+>|[^<]+/g) ?? [];
  const lines: string[] = [declaration];
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.startsWith("</")) depth--;
    const next = tokens[index + 1];
    if (token.startsWith("<") && next && !next.startsWith("<")) {
      const closing = tokens[index + 2];
      lines.push(`${"  ".repeat(depth)}${token}${next}${closing ?? ""}`);
      index += closing ? 2 : 1;
      continue;
    }
    lines.push(`${"  ".repeat(depth)}${token}`);
    if (token.startsWith("<") && !token.startsWith("</") && !token.endsWith("/>")) depth++;
  }
  return lines.join("\n");
}

export function serializeCanonicalXml(upload: CanonicalUpload): string {
  const m = upload.metadata;
  const metadata = element("CreateDate", m.createDate) + element("CreateTime", m.createTime)
    + element("CreatedBy", m.createdBy) + phoneElement("ContactPhone", m.contactPhone)
    + element("ContactEmail", m.contactEmail) + element("FullUpload", m.fullUpload)
    + (m.boardNumber || m.boardName ? `<SchoolBoard>${element("BoardNumber", m.boardNumber)}${element("Name", m.boardName)}</SchoolBoard>` : "");
  const schools = upload.schools.map((school) => {
    const students = school.students.map((student) => {
      const guardians = student.guardians.map((guardian) =>
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
  const serialized = `<?xml version="1.0" encoding="utf-8"?>${prefixed}`;
  return indentSerializedXml(serialized);
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
    GuardianMiddleName: g1?.name.middle ?? "",
    GuardianRelationship: g1?.relationship ?? "", GuardianPhoneNumber: g1?.phone?.number ?? "", GuardianPhoneType: g1?.phone?.type ?? "",
    Guardian2FirstName: g2?.name.first ?? "", Guardian2LastName: g2?.name.last ?? "",
    Guardian2MiddleName: g2?.name.middle ?? "",
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
