import { studentFromRecord } from "./pullInfo";
import { flattenCanonicalStudent, parseCanonicalXml, type CanonicalUpload } from "./canonical";
import type { ComparisonFieldChange, ComparisonRecordChange, ComparisonSchoolChange, ComparisonSchoolTransfer, STIXComparison, Student } from "./types";

export const COMPARED_FIELDS: Array<{ key: keyof Student; label: string }> = [
  { key: "SchoolName", label: "School name" }, { key: "SchoolNumber", label: "School number" },
  { key: "FirstName", label: "First name" }, { key: "MiddleName", label: "Middle name" }, { key: "LastName", label: "Last name" },
  { key: "BirthDate", label: "Birth date" }, { key: "Grade", label: "Grade" }, { key: "Class", label: "Class" },
  { key: "Gender", label: "Gender" }, { key: "Language", label: "Language" }, { key: "CountryOfOrigin", label: "Country of origin" },
  { key: "Unit", label: "Unit" }, { key: "StreetNumber", label: "Street number" }, { key: "StreetNumberSuffix", label: "Street suffix" },
  { key: "StreetName", label: "Street name" }, { key: "StreetType", label: "Street type" }, { key: "City", label: "City" },
  { key: "Province", label: "Province" }, { key: "PostalCode", label: "Postal code" },
];

type Entry = { student: Student; index: number; recordId: string; schoolId: string };
const value = (student: Student, field: keyof Student) => String(student[field] ?? "").trim().toLowerCase();
const name = (student: Student) => [student.FirstName, student.MiddleName, student.LastName].filter(Boolean).join(" ") || "Unnamed student";
const oen = (entry: Entry) => value(entry.student, "OEN");
const fallback = (entry: Entry) => {
  if (oen(entry) || !value(entry.student, "SchoolNumber") || !value(entry.student, "FirstName") || !value(entry.student, "LastName") || !value(entry.student, "BirthDate")) return "";
  return ["SchoolNumber", "FirstName", "MiddleName", "LastName", "BirthDate"].map((field) => value(entry.student, field as keyof Student)).join("|");
};

function entries(document: CanonicalUpload): Entry[] {
  const result: Entry[] = [];
  for (const school of document.schools) {
    for (const student of school.students) {
      result.push({
        student: studentFromRecord({ id: student.recordId, xmlPath: "", fields: flattenCanonicalStudent(student, school) }),
        index: result.length,
        recordId: student.recordId,
        schoolId: school.schoolId,
      });
    }
  }
  return result;
}

function groups(items: Entry[], key: (entry: Entry) => string): Map<string, Entry[]> {
  const result = new Map<string, Entry[]>();
  for (const item of items) {
    const identity = key(item);
    if (!identity || identity === "||||") continue;
    const group = result.get(identity) ?? [];
    group.push(item);
    result.set(identity, group);
  }
  return result;
}

function matchEntries(previous: Entry[], current: Entry[]) {
  const matches = new Map<Entry, Entry>();
  const usedPrevious = new Set<Entry>();
  const ambiguousCurrent = new Set<Entry>();
  const ambiguousPrevious = new Set<Entry>();
  const byOenPrevious = groups(previous, oen);
  const byOenCurrent = groups(current, oen);
  for (const identity of new Set([...byOenPrevious.keys(), ...byOenCurrent.keys()])) {
    const before = byOenPrevious.get(identity) ?? [];
    const after = byOenCurrent.get(identity) ?? [];
    if (before.length === 1 && after.length === 1) {
      matches.set(after[0], before[0]);
      usedPrevious.add(before[0]);
    } else if (before.length && after.length) {
      before.forEach((entry) => ambiguousPrevious.add(entry));
      after.forEach((entry) => ambiguousCurrent.add(entry));
    }
  }
  const remainingPrevious = previous.filter((entry) => !usedPrevious.has(entry) && !ambiguousPrevious.has(entry));
  const remainingCurrent = current.filter((entry) => !matches.has(entry) && !ambiguousCurrent.has(entry));
  const byFallbackPrevious = groups(remainingPrevious, fallback);
  const byFallbackCurrent = groups(remainingCurrent, fallback);
  for (const identity of new Set([...byFallbackPrevious.keys(), ...byFallbackCurrent.keys()])) {
    const before = byFallbackPrevious.get(identity) ?? [];
    const after = byFallbackCurrent.get(identity) ?? [];
    if (before.length === 1 && after.length === 1) {
      matches.set(after[0], before[0]);
      usedPrevious.add(before[0]);
    } else if (before.length && after.length) {
      before.forEach((entry) => ambiguousPrevious.add(entry));
      after.forEach((entry) => ambiguousCurrent.add(entry));
    }
  }
  return { matches, usedPrevious, ambiguousCurrent, ambiguousPrevious };
}

function schoolCounts(document: CanonicalUpload, side: "previous" | "current"): Map<string, { schoolId: string; name: string; count: number }> {
  const result = new Map<string, { schoolId: string; name: string; count: number }>();
  document.schools.forEach((school, index) => {
    const key = school.schoolNumber.trim() ? `number:${school.schoolNumber.trim().toLowerCase()}` : `${side}:missing:${index}`;
    result.set(key, { schoolId: side === "current" ? school.schoolId : `previous:${school.schoolId}`, name: school.name.trim() || `Unknown school ${index + 1}`, count: school.students.length });
  });
  return result;
}

export function compareSTIXFiles(previousXml: string, currentXml: string, previousFileName: string, currentFileName: string): STIXComparison {
  const previousDocument = parseCanonicalXml(previousXml);
  const currentDocument = parseCanonicalXml(currentXml);
  for (const [label, document] of [["previous", previousDocument], ["current", currentDocument]] as const) {
    const numbers = document.schools.map((school) => school.schoolNumber.trim()).filter(Boolean);
    if (new Set(numbers).size !== numbers.length) throw new Error(`The ${label} file has duplicate SchoolNumber containers; comparison scope would be ambiguous.`);
  }
  const previous = entries(previousDocument);
  const current = entries(currentDocument);
  const { matches, usedPrevious, ambiguousCurrent, ambiguousPrevious } = matchEntries(previous, current);
  const fieldCounts = new Map<string, number>();
  const recordChanges: ComparisonRecordChange[] = [];
  const transfers = new Map<string, ComparisonSchoolTransfer>();
  let unchangedCount = 0;
  let changedCount = 0;
  let movedCount = 0;

  for (const after of current) {
    const before = matches.get(after);
    if (!before) {
      recordChanges.push({ key: after.recordId, schoolId: after.schoolId, kind: "added", matchStatus: ambiguousCurrent.has(after) ? "ambiguous" : "unmatched", studentName: name(after.student), schoolName: after.student.SchoolName || "Unknown school", changedFields: [], fieldDiffs: [] });
      continue;
    }
    const diffs = COMPARED_FIELDS.filter(({ key }) => value(before.student, key) !== value(after.student, key));
    if (!diffs.length) { unchangedCount++; continue; }
    changedCount++;
    for (const field of diffs) fieldCounts.set(String(field.key), (fieldCounts.get(String(field.key)) ?? 0) + 1);
    const beforeSchool = before.student.SchoolNumber.trim().toLowerCase();
    const afterSchool = after.student.SchoolNumber.trim().toLowerCase();
    if (beforeSchool && afterSchool && beforeSchool !== afterSchool) {
      movedCount++;
      const transferKey = `${beforeSchool}\0${afterSchool}`;
      const transfer = transfers.get(transferKey) ?? { fromSchool: before.student.SchoolName || before.student.SchoolNumber, toSchool: after.student.SchoolName || after.student.SchoolNumber, count: 0, students: [] };
      transfer.count++;
      transfer.students.push(name(after.student));
      transfers.set(transferKey, transfer);
    }
    recordChanges.push({
      key: after.recordId, schoolId: after.schoolId, kind: "changed", matchStatus: "matched",
      studentName: name(after.student), schoolName: after.student.SchoolName || "Unknown school",
      changedFields: diffs.map(({ label }) => label),
      fieldDiffs: diffs.map(({ key, label }) => ({ field: String(key), label, previousValue: String(before.student[key] ?? "").trim(), currentValue: String(after.student[key] ?? "").trim() })),
    });
  }
  for (const before of previous.filter((entry) => !usedPrevious.has(entry))) {
    recordChanges.push({ key: `previous:${before.index}`, schoolId: `previous:${before.schoolId}`, kind: "removed", matchStatus: ambiguousPrevious.has(before) ? "ambiguous" : "unmatched", studentName: name(before.student), schoolName: before.student.SchoolName || "Unknown school", changedFields: [], fieldDiffs: [] });
  }

  const addedCount = current.filter((entry) => !matches.has(entry) && !ambiguousCurrent.has(entry)).length;
  const removedCount = previous.filter((entry) => !usedPrevious.has(entry) && !ambiguousPrevious.has(entry)).length;
  const ambiguousCount = ambiguousCurrent.size + ambiguousPrevious.size;
  const changeRate = previous.length ? ((addedCount + removedCount + changedCount) / previous.length) * 100 : current.length ? 100 : 0;
  const signal = changeRate <= 1 ? "stable" : changeRate <= 5 ? "moderate" : "high";
  const previousSchools = schoolCounts(previousDocument, "previous");
  const currentSchools = schoolCounts(currentDocument, "current");
  const schoolAliases = new Map<string, string>();
  for (const [key, prior] of previousSchools) schoolAliases.set(prior.schoolId, currentSchools.get(key)?.schoolId ?? prior.schoolId);
  for (const record of recordChanges) if (record.schoolId) record.schoolId = schoolAliases.get(record.schoolId) ?? record.schoolId;
  const schoolKeys = new Set([...previousSchools.keys(), ...currentSchools.keys()]);
  const schoolChanges: ComparisonSchoolChange[] = [...schoolKeys].map((key) => {
    const prior = previousSchools.get(key);
    const next = currentSchools.get(key);
    return { schoolId: next?.schoolId ?? prior?.schoolId ?? key, schoolName: next?.name ?? prior?.name ?? "Unknown school", previousCount: prior?.count ?? 0, currentCount: next?.count ?? 0, added: 0, removed: 0, changed: 0 };
  });
  const schoolChangeById = new Map(schoolChanges.map((school) => [school.schoolId, school]));
  for (const record of recordChanges) {
    if (record.matchStatus === "ambiguous") continue;
    const school = schoolChangeById.get(record.schoolId ?? "");
    if (!school) continue;
    if (record.kind === "added") school.added++;
    else if (record.kind === "removed") school.removed++;
    else school.changed++;
  }
  const fieldChanges: ComparisonFieldChange[] = COMPARED_FIELDS.map(({ key, label }) => ({ field: String(key), label, count: fieldCounts.get(String(key)) ?? 0 })).filter(({ count }) => count > 0).sort((a, b) => b.count - a.count);
  return {
    previousFileName, currentFileName,
    previousStudentCount: previous.length, currentStudentCount: current.length,
    previousSchoolCount: previousSchools.size, currentSchoolCount: currentSchools.size,
    matchedCount: matches.size, unchangedCount, addedCount, removedCount, ambiguousCount, changedCount, movedCount, changeRate,
    fieldChanges, recordChanges: recordChanges.sort((a, b) => a.schoolName.localeCompare(b.schoolName) || a.studentName.localeCompare(b.studentName)),
    schoolTransfers: [...transfers.values()], schoolChanges: schoolChanges.sort((a, b) => (b.added + b.removed + b.changed) - (a.added + a.removed + a.changed)),
    signal,
    recommendation: signal === "stable" ? "Consider requesting files less frequently" : signal === "moderate" ? "Consider keeping the current request cadence" : "Consider requesting files more frequently",
    recommendationDetail: signal === "stable" ? "Very little changed between these snapshots. Confirm required reporting timelines before extending the interval." : signal === "moderate" ? "Some records changed, so the current cadence may be appropriate." : "A substantial portion of the file changed. More frequent requests may reduce stale records.",
  };
}
