import { parseXml } from "./pullInfo";
import type { ComparisonFieldChange, ComparisonRecordChange, ComparisonSchoolChange, StixComparison, Student } from "./types";

const COMPARED_FIELDS: Array<{ key: keyof Student; label: string }> = [
  { key: "SchoolName", label: "School" },
  { key: "SchoolNumber", label: "School number" },
  { key: "FirstName", label: "First name" },
  { key: "MiddleName", label: "Middle name" },
  { key: "LastName", label: "Last name" },
  { key: "BirthDate", label: "Birth date" },
  { key: "Grade", label: "Grade" },
  { key: "Class", label: "Class" },
  { key: "Gender", label: "Gender" },
  { key: "Language", label: "Language" },
  { key: "CountryOfOrigin", label: "Country of origin" },
  { key: "Unit", label: "Unit" },
  { key: "StreetNumber", label: "Street number" },
  { key: "StreetNumberSuffix", label: "Street suffix" },
  { key: "StreetName", label: "Street name" },
  { key: "StreetType", label: "Street type" },
  { key: "City", label: "City" },
  { key: "Province", label: "Province" },
  { key: "PostalCode", label: "Postal code" },
];

function valueOf(student: Student, field: keyof Student): string {
  return String(student[field] ?? "").trim().toLowerCase();
}

function recordKey(student: Student, index: number): string {
  const oen = valueOf(student, "OEN");
  if (oen) return `oen:${oen}`;
  const fallback = ["SchoolNumber", "FirstName", "MiddleName", "LastName", "BirthDate"]
    .map((field) => valueOf(student, field as keyof Student))
    .join("|");
  return fallback === "||||" ? `unidentified:${index}` : `fallback:${fallback}`;
}

function indexStudents(students: Student[]): Map<string, Student> {
  const indexed = new Map<string, Student>();
  students.forEach((student, index) => {
    const baseKey = recordKey(student, index);
    let key = baseKey;
    let duplicate = 2;
    while (indexed.has(key)) key = `${baseKey}#${duplicate++}`;
    indexed.set(key, student);
  });
  return indexed;
}

function schoolCounts(students: Student[]): Map<string, number> {
  const counts = new Map<string, number>();
  students.forEach((student) => {
    const school = student.SchoolName.trim() || "Unknown school";
    counts.set(school, (counts.get(school) ?? 0) + 1);
  });
  return counts;
}

function studentName(student: Student): string {
  return [student.FirstName, student.MiddleName, student.LastName].filter(Boolean).join(" ") || "Unnamed student";
}

export function compareStixFiles(previousXml: string, currentXml: string, previousFileName: string, currentFileName: string): StixComparison {
  const previous = parseXml(previousXml);
  const current = parseXml(currentXml);
  const previousByKey = indexStudents(previous);
  const currentByKey = indexStudents(current);
  const fieldCounts = new Map<string, number>();
  let matchedCount = 0;
  let unchangedCount = 0;
  let changedCount = 0;
  const recordChanges: ComparisonRecordChange[] = [];

  currentByKey.forEach((currentStudent, key) => {
    const previousStudent = previousByKey.get(key);
    if (!previousStudent) return;
    matchedCount++;
    let recordChanged = false;
    COMPARED_FIELDS.forEach(({ key: field }) => {
      if (valueOf(previousStudent, field) === valueOf(currentStudent, field)) return;
      recordChanged = true;
      fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
    });
    if (recordChanged) {
      changedCount++;
      recordChanges.push({
        key,
        kind: "changed",
        studentName: studentName(currentStudent),
        schoolName: currentStudent.SchoolName || "Unknown school",
        changedFields: COMPARED_FIELDS.filter(({ key: field }) => valueOf(previousStudent, field) !== valueOf(currentStudent, field)).map(({ label }) => label),
      });
    } else unchangedCount++;
  });

  const addedKeys = Array.from(currentByKey.keys()).filter((key) => !previousByKey.has(key));
  const removedKeys = Array.from(previousByKey.keys()).filter((key) => !currentByKey.has(key));
  addedKeys.forEach((key) => {
    const student = currentByKey.get(key)!;
    recordChanges.push({ key, kind: "added", studentName: studentName(student), schoolName: student.SchoolName || "Unknown school", changedFields: [] });
  });
  removedKeys.forEach((key) => {
    const student = previousByKey.get(key)!;
    recordChanges.push({ key, kind: "removed", studentName: studentName(student), schoolName: student.SchoolName || "Unknown school", changedFields: [] });
  });
  const addedCount = addedKeys.length;
  const removedCount = removedKeys.length;
  const changeRate = previous.length === 0 ? (current.length === 0 ? 0 : 100) : ((addedCount + removedCount + changedCount) / previous.length) * 100;
  const signal = changeRate <= 1 ? "stable" : changeRate <= 5 ? "moderate" : "high";
  const recommendation = signal === "stable"
    ? "Consider requesting files less frequently"
    : signal === "moderate"
      ? "Consider keeping the current request cadence"
      : "Consider requesting files more frequently";
  const recommendationDetail = signal === "stable"
    ? "Very little changed between these snapshots. Confirm required reporting timelines before extending the interval."
    : signal === "moderate"
      ? "Some records changed, so the current cadence may be appropriate. Continue monitoring a few more snapshots before changing it."
      : "A substantial portion of the file changed. More frequent requests may reduce operational surprises and stale records.";

  const previousSchools = schoolCounts(previous);
  const currentSchools = schoolCounts(current);
  const schoolNames = new Set([...previousSchools.keys(), ...currentSchools.keys()]);
  const schoolChanges: ComparisonSchoolChange[] = Array.from(schoolNames).map((schoolName) => {
    const previousStudents = previous.filter((student) => (student.SchoolName.trim() || "Unknown school") === schoolName);
    const currentStudents = current.filter((student) => (student.SchoolName.trim() || "Unknown school") === schoolName);
    const previousKeys = new Set(previousStudents.map((student, index) => recordKey(student, index)));
    const currentKeys = new Set(currentStudents.map((student, index) => recordKey(student, index)));
    const added = currentStudents.filter((student, index) => !previousKeys.has(recordKey(student, index))).length;
    const removed = previousStudents.filter((student, index) => !currentKeys.has(recordKey(student, index))).length;
    const changed = currentStudents.filter((student, index) => {
      const old = previousByKey.get(recordKey(student, index));
      return old && COMPARED_FIELDS.some(({ key: field }) => valueOf(old, field) !== valueOf(student, field));
    }).length;
    return { schoolName, previousCount: previousSchools.get(schoolName) ?? 0, currentCount: currentSchools.get(schoolName) ?? 0, added, removed, changed };
  }).sort((a, b) => (b.added + b.removed + b.changed) - (a.added + a.removed + a.changed));

  const fieldChanges: ComparisonFieldChange[] = COMPARED_FIELDS
    .map(({ key: field, label }) => ({ field, label, count: fieldCounts.get(field) ?? 0 }))
    .filter((change) => change.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    previousFileName,
    currentFileName,
    previousStudentCount: previous.length,
    currentStudentCount: current.length,
    previousSchoolCount: previousSchools.size,
    currentSchoolCount: currentSchools.size,
    matchedCount,
    unchangedCount,
    addedCount,
    removedCount,
    changedCount,
    changeRate,
    fieldChanges,
    recordChanges: recordChanges.sort((a, b) => a.schoolName.localeCompare(b.schoolName) || a.studentName.localeCompare(b.studentName)),
    schoolChanges,
    signal,
    recommendation,
    recommendationDetail,
  };
}
