/**
 * Create a school-scoped STIX XML file without mapping the XML through the
 * comparison table's Student shape. This deliberately uses the browser XML
 * DOM so namespaces, tag names, attributes, ordering, and fields unknown to
 * the app remain in the exported document.
 */
export function extractSchoolXml(xmlText: string, schoolName: string): string {
  if (schoolName === "all") return xmlText;

  const document = new DOMParser().parseFromString(xmlText, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error("The current STIX file could not be parsed as XML.");
  }

  const schools = Array.from(document.getElementsByTagName("*"))
    .filter((element) => element.localName === "School");
  if (schools.length === 0) throw new Error("No school records were found in the current STIX file.");

  let matched = 0;
  for (const school of schools) {
    const nameElement = Array.from(school.children).find((child) => child.localName === "Name");
    const name = nameElement?.textContent?.trim() ?? "";
    if (name === schoolName) matched++;
    else school.parentNode?.removeChild(school);
  }
  if (matched === 0) throw new Error(`School “${schoolName}” was not found in the current STIX file.`);

  return new XMLSerializer().serializeToString(document);
}

const FIELD_PATHS: Record<string, string[]> = {
  SchoolName: ["School", "Name"],
  SchoolNumber: ["School", "SchoolNumber"],
  FirstName: ["Student", "Name", "First"],
  MiddleName: ["Student", "Name", "Middle"],
  LastName: ["Student", "Name", "Last"],
  AliasFirstName: ["Student", "AliasName", "First"],
  AliasMiddleName: ["Student", "AliasName", "Middle"],
  AliasLastName: ["Student", "AliasName", "Last"],
  BirthDate: ["Student", "BirthDate"],
  Grade: ["Student", "Grade"],
  Class: ["Student", "Class"],
  OEN: ["Student", "OEN"],
  Gender: ["Student", "Gender"],
  Language: ["Student", "Language"],
  CountryOfOrigin: ["Student", "CountryOfOrigin"],
  Unit: ["Student", "Address", "Unit"],
  StreetNumber: ["Student", "Address", "StreetNumber"],
  StreetNumberSuffix: ["Student", "Address", "StreetNumberSuffix"],
  StreetName: ["Student", "Address", "StreetName"],
  StreetType: ["Student", "Address", "StreetType"],
  City: ["Student", "Address", "City"],
  Province: ["Student", "Address", "Province"],
  PostalCode: ["Student", "Address", "PostalCode"],
};

function childByLocalName(element: Element, localName: string): Element | undefined {
  return Array.from(element.children).find((child) => child.localName === localName);
}

function valueOf(element: Element | undefined): string {
  return element?.textContent?.trim().toLowerCase() ?? "";
}

function currentRecordKey(student: Element, school: Element, index: number): string {
  const oen = valueOf(childByLocalName(student, "OEN"));
  if (oen) return `oen:${oen}`;
  const name = childByLocalName(student, "Name");
  const parts = [
    valueOf(childByLocalName(school, "SchoolNumber")),
    valueOf(childByLocalName(name!, "First")),
    valueOf(childByLocalName(name!, "Middle")),
    valueOf(childByLocalName(name!, "Last")),
    valueOf(childByLocalName(student, "BirthDate")),
  ];
  const fallback = parts.join("|");
  return fallback === "||||" ? `unidentified:${index}` : `fallback:${fallback}`;
}

/** Apply review corrections to the original current XML before exporting it. */
export function applyReviewCorrections(
  xmlText: string,
  records: ComparisonRecordChange[],
  corrections: Record<string, string>,
): string {
  if (Object.keys(corrections).length === 0) return xmlText;
  const document = new DOMParser().parseFromString(xmlText, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("The current STIX file could not be parsed as XML.");

  const schools = Array.from(document.getElementsByTagName("*")).filter((element) => element.localName === "School");
  const studentEntries: Array<{ student: Element; school: Element; index: number }> = [];
  for (const school of schools) {
    const studentsContainer = Array.from(school.getElementsByTagName("*")).find((element) => element.localName === "Students");
    if (!studentsContainer) continue;
    for (const student of Array.from(studentsContainer.children).filter((element) => element.localName === "Student")) {
      studentEntries.push({ student, school, index: studentEntries.length });
    }
  }

  const usedKeys = new Set<string>();
  for (const { student, school, index } of studentEntries) {
    const baseKey = currentRecordKey(student, school, index);
    let key = baseKey;
    let duplicate = 2;
    while (usedKeys.has(key)) key = `${baseKey}#${duplicate++}`;
    usedKeys.add(key);

    const record = records.find((candidate) => candidate.key === key);
    if (!record) continue;
    for (const field of record.fieldDiffs) {
      const correctionKey = `${record.key}::${field.field}`;
      if (!(correctionKey in corrections)) continue;
      const path = FIELD_PATHS[field.field];
      if (!path) continue;
      let parent: Element = path[0] === "School" ? school : student;
      const names = path.slice(path[0] === "School" ? 1 : 1);
      for (const name of names) {
        const child = childByLocalName(parent, name);
        if (!child) { parent = undefined as unknown as Element; break; }
        parent = child;
      }
      if (parent) parent.textContent = corrections[correctionKey];
    }
  }
  return new XMLSerializer().serializeToString(document);
}

export function safeExportPart(value: string): string {
  return value.trim().replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "school";
}
import type { ComparisonRecordChange } from "./types";
