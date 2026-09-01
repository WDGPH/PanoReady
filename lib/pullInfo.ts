/**
 * Browser-native port of pull_info.py
 * Parses STIX XML → Student records → filtered/summarized datasets
 */

import { XMLParser } from "fast-xml-parser";
import type { Student, ExportResult, SchoolCount, GradeCount } from "./types";
import { flattenCanonicalStudent, parseCanonicalXml } from "./canonical";

function ensureArray<T>(x: T | T[] | null | undefined): T[] {
  if (x === null || x === undefined) return [];
  return Array.isArray(x) ? x : [x];
}

function str(x: unknown): string {
  if (x === null || x === undefined) return "";
  if (typeof x === "object") {
    const obj = x as Record<string, unknown>;
    if (obj["#text"] !== undefined) return String(obj["#text"]);
    return "";
  }
  return String(x);
}

export function legacyParseXml(xmlText: string): Student[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTagValue: false,
    textNodeName: "#text",
    isArray: (name) => {
      return name === "ns1:School" || name === "ns1:Student";
    },
  });

  const doc = parser.parse(xmlText);
  const root = doc["ns1:SchoolUpload"] ?? doc;
  const schools = ensureArray(root["ns1:School"]);
  const students: Student[] = [];

  for (const school of schools) {
    const schoolName = str(school["ns1:Name"]);
    const schoolNumber = str(school["ns1:SchoolNumber"]);
    const studentsNode = school["ns1:Students"] ?? {};
    const studentNodes = ensureArray(studentsNode["ns1:Student"]);

    for (const s of studentNodes) {
      const nameNode = s["ns1:Name"] ?? {};
      const aliasNode = s["ns1:AliasName"] ?? {};
      const addrNode = s["ns1:Address"] ?? {};

      const birthDateRaw = str(s["ns1:BirthDate"]);
      let birthYear: number | null = null;
      if (birthDateRaw) {
        const d = new Date(birthDateRaw);
        if (!isNaN(d.getTime())) birthYear = d.getFullYear();
        else {
          // Try YYYY-MM-DD or YYYYMMDD
          const m = birthDateRaw.match(/^(\d{4})/);
          if (m) birthYear = parseInt(m[1]);
        }
      }

      students.push({
        SchoolName: schoolName,
        SchoolNumber: schoolNumber,
        FirstName: str(nameNode["ns1:First"]),
        MiddleName: str(nameNode["ns1:Middle"]),
        LastName: str(nameNode["ns1:Last"]),
        AliasFirstName: str(aliasNode["ns1:First"]),
        AliasMiddleName: str(aliasNode["ns1:Middle"]),
        AliasLastName: str(aliasNode["ns1:Last"]),
        BirthDate: birthDateRaw,
        BirthYear: birthYear,
        Grade: str(s["ns1:Grade"]),
        Class: str(s["ns1:Class"]),
        OEN: str(s["ns1:OEN"]),
        Gender: str(s["ns1:Gender"]),
        Language: str(s["ns1:Language"]),
        CountryOfOrigin: str(s["ns1:CountryOfOrigin"]),
        StreetDirection: str(s["ns1:StreetDirection"]),
        RuralRoute: str(s["ns1:RuralRoute"]),
        PoBoxNumber: str(s["ns1:PoBoxNumber"]),
        PhoneType: str(s["ns1:PhoneType"]),
        GuardianFirstName: str(s["ns1:GuardianFirstName"]),
        GuardianLastName: str(s["ns1:GuardianLastName"]),
        GuardianRelationship: str(s["ns1:GuardianRelationship"]),
        GuardianPhoneNumber: str(s["ns1:GuardianPhoneNumber"]),
        GuardianPhoneType: str(s["ns1:GuardianPhoneType"]),
        Guardian2FirstName: str(s["ns1:Guardian2FirstName"]),
        Guardian2LastName: str(s["ns1:Guardian2LastName"]),
        Guardian2Relationship: str(s["ns1:Guardian2Relationship"]),
        Guardian2PhoneNumber: str(s["ns1:Guardian2PhoneNumber"]),
        Guardian2PhoneType: str(s["ns1:Guardian2PhoneType"]),
        Unit: str(addrNode["ns1:Unit"]),
        StreetNumber: str(addrNode["ns1:StreetNumber"]),
        StreetNumberSuffix: str(addrNode["ns1:StreetNumberSuffix"]),
        StreetName: str(addrNode["ns1:StreetName"]),
        StreetType: str(addrNode["ns1:StreetType"]),
        City: str(addrNode["ns1:City"]),
        Province: str(addrNode["ns1:Province"]),
        PostalCode: str(addrNode["ns1:PostalCode"]),
      });
    }
  }

  return students;
}

export function parseXml(xmlText: string): Student[] {
  const upload = parseCanonicalXml(xmlText);
  return upload.schools.flatMap((school) => school.students.map((student) => {
    const fields = flattenCanonicalStudent(student, school);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(student.birthDate) ? new Date(`${student.birthDate}T00:00:00Z`) : null;
    return { ...fields, BirthYear: date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : null } as unknown as Student;
  }));
}

export function filterStudents(students: Student[]): Student[] {
  return students.filter(
    (s) =>
      (s.BirthYear === 2012 || s.BirthYear === 2013) &&
      (s.Grade === "GR7" || s.Grade === "GR8")
  );
}

export function buildSchoolCounts(students: Student[]): SchoolCount[] {
  const map = new Map<string, number>();
  for (const s of students) {
    const key = `${s.SchoolName}__${s.BirthYear}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([key, count]) => {
    const [schoolName, byStr] = key.split("__");
    return {
      SchoolName: schoolName,
      BirthYear: byStr ? parseInt(byStr) : null,
      StudentCount: count,
    };
  });
}

export function buildGradeCounts(students: Student[]): GradeCount[] {
  const map = new Map<string, number>();
  for (const s of students) {
    const key = `${s.SchoolName}__${s.Grade}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([key, count]) => {
    const [schoolName, grade] = key.split("__");
    return { SchoolName: schoolName, Grade: grade, GradeCount: count };
  });
}

export function processExport(xmlText: string): ExportResult {
  const allStudents = parseXml(xmlText);
  const filteredStudents = filterStudents(allStudents);
  const schoolCounts = buildSchoolCounts(allStudents);
  const gradeCounts = buildGradeCounts(allStudents);
  return { allStudents, filteredStudents, schoolCounts, gradeCounts };
}
