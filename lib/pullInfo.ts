/**
 * Browser-native port of pull_info.py
 * Reshapes StudentRecord[] (parseSTIXXml, lib/validator.ts) → Student records → filtered/summarized datasets
 */

import { validRealDate } from "./calendarDate";
import type { Student, ExportResult, SchoolCount, GradeCount, StudentRecord } from "./types";
import { parseSTIXXml } from "./validator";

export function birthYearFromDate(birthDate: string): number | null {
  return validRealDate(birthDate) ? Number(birthDate.slice(0, 4)) : null;
}

export function studentFromRecord(record: StudentRecord): Student {
  return {
    ...record.fields,
    BirthYear: birthYearFromDate(record.fields.BirthDate ?? ""),
  } as unknown as Student;
}

export function parseXml(xmlText: string): Student[] {
  return parseSTIXXml(xmlText).map(studentFromRecord);
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
