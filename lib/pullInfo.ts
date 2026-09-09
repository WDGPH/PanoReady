/**
 * Browser-native port of pull_info.py
 * Reshapes StudentRecord[] (parseStixXml, lib/validator.ts) → Student records → filtered/summarized datasets
 */

import type { Student, ExportResult, SchoolCount, GradeCount } from "./types";
import { parseStixXml } from "./validator";

export function parseXml(xmlText: string): Student[] {
  return parseStixXml(xmlText).map((record) => {
    const fields = record.fields;
    const birthDate = fields.BirthDate ?? "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? new Date(`${birthDate}T00:00:00Z`) : null;
    return { ...fields, BirthYear: date && !Number.isNaN(date.getTime()) ? date.getUTCFullYear() : null } as unknown as Student;
  });
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
