/**
 * Browser-native port of pull_info.py
 * Reshapes StudentRecord[] (parseStixXml, lib/validator.ts) → Student records → filtered/summarized datasets
 */

import type { Student, ExportResult, SchoolCount, GradeCount, StudentRecord } from "./types";
import { parseStixXml } from "./validator";

export function birthYearFromDate(birthDate: string): number | null {
  const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? year
    : null;
}

export function studentFromRecord(record: StudentRecord): Student {
  return {
    ...record.fields,
    BirthYear: birthYearFromDate(record.fields.BirthDate ?? ""),
  } as unknown as Student;
}

export function parseXml(xmlText: string): Student[] {
  return parseStixXml(xmlText).map(studentFromRecord);
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
