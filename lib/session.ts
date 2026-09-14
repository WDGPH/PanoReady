import {
  flattenCanonicalStudent,
  type CanonicalGuardian,
  type CanonicalSchool,
  type CanonicalStudent,
  type CanonicalUpload,
} from "./canonical";
import type { AppliedChangeGroup, AppliedFix, ChangeOrigin, ValidateSession } from "./types";

type ChangeTarget = Pick<AppliedFix, "recordId" | "targetId" | "field">;

/** Draft identity follows the target, never a validation finding's array position. */
export function draftTargetKey(target: { recordId?: string; targetId?: string; field?: string }): string {
  const field = normalizedTargetField(target);
  return JSON.stringify([target.recordId, target.targetId ?? "", field]);
}

function normalizedTargetField(target: { targetId?: string; field?: string }): string | undefined {
  return target.targetId ? target.field?.replace(/^Guardian2?/, "Guardian") : target.field;
}

type GroupOptions = {
  label: string;
  origin: ChangeOrigin;
  appliedAt?: number;
};

function cloneUpload(upload: CanonicalUpload): CanonicalUpload {
  return structuredClone(upload);
}

type UploadIndex = {
  schools: Map<string, CanonicalSchool>;
  students: Map<string, { school: CanonicalSchool; student: CanonicalStudent }>;
};

function indexUpload(upload: CanonicalUpload): UploadIndex {
  const schools = new Map<string, CanonicalSchool>();
  const students = new Map<string, { school: CanonicalSchool; student: CanonicalStudent }>();
  for (const school of upload.schools) {
    schools.set(school.schoolId, school);
    for (const student of school.students) students.set(student.recordId, { school, student });
  }
  return { schools, students };
}

function findStudent(index: UploadIndex, recordId: string): { school: CanonicalSchool; student: CanonicalStudent } {
  const target = index.students.get(recordId);
  if (target) return target;
  throw new Error(`Change target ${recordId} no longer exists.`);
}

function guardianIndex(student: CanonicalStudent, fix: ChangeTarget): number {
  if (fix.targetId) {
    const index = student.guardians.findIndex((guardian) => guardian.guardianId === fix.targetId);
    if (index < 0) throw new Error(`Nested change target ${fix.targetId} no longer exists.`);
    return index;
  }
  return fix.field.startsWith("Guardian2") ? 1 : 0;
}

function ensureGuardian(student: CanonicalStudent, fix: AppliedFix): CanonicalGuardian {
  const index = fix.targetId ? guardianIndex(student, fix) : fix.field.startsWith("Guardian2") ? 1 : 0;
  while (student.guardians.length <= index) {
    student.guardians.push({
      guardianId: fix.targetId ?? `${student.recordId}:guardian${student.guardians.length}`,
      name: { first: "", middle: "", last: "" },
      relationship: "",
      phone: null,
    });
  }
  return student.guardians[index];
}

function readValue(upload: CanonicalUpload, index: UploadIndex, fix: ChangeTarget): string {
  if (fix.recordId === "metadata") {
    const metadata: Record<string, string> = {
      CreateDate: upload.metadata.createDate,
      CreateTime: upload.metadata.createTime,
      CreatedBy: upload.metadata.createdBy,
      ContactEmail: upload.metadata.contactEmail,
      FullUpload: upload.metadata.fullUpload,
      BoardNumber: upload.metadata.boardNumber,
      BoardName: upload.metadata.boardName,
      MetadataContactPhone: upload.metadata.contactPhone?.number ?? "",
      MetadataContactPhoneType: upload.metadata.contactPhone?.type ?? "",
    };
    if (!(fix.field in metadata)) throw new Error(`Unsupported metadata field ${fix.field}.`);
    return metadata[fix.field];
  }
  const schoolTarget = index.schools.get(fix.recordId);
  if (schoolTarget) {
    if (fix.field === "SchoolName") return schoolTarget.name;
    if (fix.field === "SchoolNumber") return schoolTarget.schoolNumber;
    throw new Error(`Unsupported school field ${fix.field}.`);
  }
  const { school, student } = findStudent(index, fix.recordId);
  if (fix.field === "Guardian" || fix.field === "Guardian2") {
    guardianIndex(student, fix);
    return "";
  }
  const guardianMatch = fix.field.match(/^Guardian(2)?(FirstName|MiddleName|LastName|Relationship|PhoneNumber|PhoneType)$/);
  if (guardianMatch && fix.targetId) {
    const guardian = student.guardians[guardianIndex(student, fix)];
    const part = guardianMatch[2];
    if (part === "FirstName") return guardian.name.first;
    if (part === "MiddleName") return guardian.name.middle;
    if (part === "LastName") return guardian.name.last;
    if (part === "Relationship") return guardian.relationship;
    if (part === "PhoneNumber") return guardian.phone?.number ?? "";
    return guardian.phone?.type ?? "";
  }
  const fields = flattenCanonicalStudent(student, school);
  if (!(fix.field in fields)) throw new Error(`Unsupported editable field ${fix.field}.`);
  return fields[fix.field];
}

/** Compare drafts with the full working document, regardless of review filters or rules. */
export function staleDraftKeys(upload: CanonicalUpload, drafts: ValidateSession["drafts"]): { values: string[]; addresses: string[] } {
  if (!Object.keys(drafts.values).length && !Object.keys(drafts.addresses).length) return { values: [], addresses: [] };
  const index = indexUpload(upload);
  const values = Object.entries(drafts.values).filter(([, draft]) => {
    try { return readValue(upload, index, draft.expected) !== draft.expected.oldValue; }
    catch { return true; } // Removed records and nested targets cannot accept the old draft.
  }).map(([key]) => key);
  const addresses = Object.entries(drafts.addresses).filter(([recordId, draft]) => {
    try { return Object.entries(draft.expectedValues).some(([field, oldValue]) => readValue(upload, index, { recordId, field }) !== oldValue); }
    catch { return true; }
  }).map(([key]) => key);
  return { values, addresses };
}

function setValue(upload: CanonicalUpload, index: UploadIndex, fix: AppliedFix, value: string): void {
  if (fix.recordId === "metadata") {
    const metadata = upload.metadata;
    if (fix.field === "CreateDate") metadata.createDate = value;
    else if (fix.field === "CreateTime") metadata.createTime = value;
    else if (fix.field === "CreatedBy") metadata.createdBy = value;
    else if (fix.field === "ContactEmail") metadata.contactEmail = value;
    else if (fix.field === "FullUpload") metadata.fullUpload = value;
    else if (fix.field === "BoardNumber") metadata.boardNumber = value;
    else if (fix.field === "BoardName") metadata.boardName = value;
    else if (fix.field === "MetadataContactPhone") metadata.contactPhone = { number: value, type: metadata.contactPhone?.type ?? "" };
    else if (fix.field === "MetadataContactPhoneType") metadata.contactPhone = { number: metadata.contactPhone?.number ?? "", type: value };
    else throw new Error(`Unsupported metadata field ${fix.field}.`);
    return;
  }

  const schoolTarget = index.schools.get(fix.recordId);
  if (schoolTarget) {
    if (fix.field === "SchoolName") schoolTarget.name = value;
    else if (fix.field === "SchoolNumber") schoolTarget.schoolNumber = value;
    else throw new Error(`Unsupported school field ${fix.field}.`);
    return;
  }

  const { school, student } = findStudent(index, fix.recordId);
  const direct: Record<string, keyof Pick<CanonicalStudent, "oen" | "grade" | "className" | "gender" | "birthDate" | "language" | "countryOfOrigin">> = {
    OEN: "oen", Grade: "grade", Class: "className", Gender: "gender", BirthDate: "birthDate", Language: "language", CountryOfOrigin: "countryOfOrigin",
  };
  if (direct[fix.field]) { student[direct[fix.field]] = value; return; }
  if (fix.field === "SchoolName") { school.name = value; return; }
  if (fix.field === "SchoolNumber") { school.schoolNumber = value; return; }

  const names: Record<string, ["name" | "aliasName", "first" | "middle" | "last"]> = {
    FirstName: ["name", "first"], MiddleName: ["name", "middle"], LastName: ["name", "last"],
    AliasFirstName: ["aliasName", "first"], AliasMiddleName: ["aliasName", "middle"], AliasLastName: ["aliasName", "last"],
  };
  if (names[fix.field]) {
    const [container, part] = names[fix.field];
    if (container === "aliasName" && !student.aliasName) student.aliasName = { first: "", middle: "", last: "" };
    student[container]![part] = value;
    return;
  }

  const address: Record<string, keyof CanonicalStudent["address"]> = {
    Unit: "unit", StreetNumber: "streetNumber", StreetNumberSuffix: "streetNumberSuffix", StreetName: "streetName",
    StreetType: "streetType", StreetDirection: "streetDirection", RuralRoute: "ruralRoute", PoBoxNumber: "poBoxNumber",
    City: "city", Province: "province", PostalCode: "postalCode",
  };
  if (address[fix.field]) { student.address[address[fix.field]] = value; return; }
  if (fix.field === "Phone") { student.phone = { number: value, type: student.phone?.type ?? "" }; return; }
  if (fix.field === "PhoneType") { student.phone = { number: student.phone?.number ?? "", type: value }; return; }

  const guardianMatch = fix.field.match(/^Guardian(2)?(FirstName|MiddleName|LastName|Relationship|PhoneNumber|PhoneType)$/);
  if (guardianMatch) {
    const guardian = ensureGuardian(student, fix);
    const part = guardianMatch[2];
    if (part === "FirstName") guardian.name.first = value;
    else if (part === "MiddleName") guardian.name.middle = value;
    else if (part === "LastName") guardian.name.last = value;
    else if (part === "Relationship") guardian.relationship = value;
    else if (part === "PhoneNumber") guardian.phone = { number: value, type: guardian.phone?.type ?? "" };
    else guardian.phone = { number: guardian.phone?.number ?? "", type: value };
    return;
  }
  throw new Error(`Unsupported editable field ${fix.field}.`);
}

function targetKey(fix: AppliedFix): string {
  return `${fix.recordId}\0${fix.targetId ?? ""}\0${normalizedTargetField(fix)}`;
}

function commitTargetKey(index: UploadIndex, fix: AppliedFix): string {
  if (fix.field === "SchoolName" || fix.field === "SchoolNumber") {
    const directSchool = index.schools.get(fix.recordId);
    if (directSchool) return `${directSchool.schoolId}\0${fix.field}`;
    const { school } = findStudent(index, fix.recordId);
    return `${school.schoolId}\0${fix.field}`;
  }
  return targetKey(fix);
}

export function commitChangeGroup(upload: CanonicalUpload, requested: AppliedFix[], options: GroupOptions): { document: CanonicalUpload; group: AppliedChangeGroup } {
  if (!requested.length) throw new Error("A change group must contain at least one change.");
  const sourceIndex = indexUpload(upload);
  const targets = new Map<string, string>();
  for (const fix of requested) {
    if (fix.ruleId === "OEN_DUPLICATE" || fix.ruleId === "OEN_DUAL_ENROLLMENT") throw new Error("Resolve duplicate OENs in the source file; a replacement OEN is not a supported correction.");
    const key = commitTargetKey(sourceIndex, fix);
    const prior = targets.get(key);
    if (prior !== undefined && prior !== fix.newValue) throw new Error(`Change group contains contradictory writes to ${fix.field}.`);
    if (prior !== undefined) throw new Error(`Change group contains the same target more than once: ${fix.field}.`);
    targets.set(key, fix.newValue);
    if (fix.oldValue === fix.newValue && fix.field !== "Guardian" && fix.field !== "Guardian2") throw new Error(`Change for ${fix.field} does not change the value.`);
    const actual = readValue(upload, sourceIndex, fix);
    if (actual !== fix.oldValue) throw new Error(`Stale change for ${fix.field}: expected "${fix.oldValue}" but found "${actual}".`);
  }

  const document = cloneUpload(upload);
  const documentIndex = indexUpload(document);
  const undoSnapshots: Record<string, string> = {};
  for (const fix of requested) {
    if (fix.field === "Guardian" || fix.field === "Guardian2") {
      const { student } = findStudent(documentIndex, fix.recordId);
      const index = guardianIndex(student, fix);
      undoSnapshots[targetKey(fix)] = JSON.stringify(student.guardians[index]);
      student.guardians.splice(index, 1);
    } else {
      setValue(document, documentIndex, fix, fix.newValue);
    }
  }
  const changedTargets = new Set(requested.map(targetKey));
  const removedDiagnostics = document.diagnostics.filter((finding) => finding.recordId && finding.field && changedTargets.has(targetKey({ recordId: finding.recordId, targetId: finding.targetId, field: finding.field } as AppliedFix)));
  document.diagnostics = document.diagnostics.filter((finding) => !removedDiagnostics.includes(finding));
  const appliedAt = options.appliedAt ?? Date.now();
  return {
    document,
    group: {
      id: crypto.randomUUID(), label: options.label, origin: options.origin,
      appliedAt, changes: requested.map((fix) => ({ ...fix, appliedAt })), undoSnapshots, undoDiagnostics: removedDiagnostics, status: "applied",
    },
  };
}

export function reconcileChangeStatuses(upload: CanonicalUpload, history: AppliedChangeGroup[]): AppliedChangeGroup[] {
  const uploadIndex = indexUpload(upload);
  const laterTargets = new Set<string>();
  const reconciled = [...history];
  for (let index = reconciled.length - 1; index >= 0; index--) {
    const group = reconciled[index];
    if (group.status === "undone") continue;
    const targets = group.changes.map((change) => commitTargetKey(uploadIndex, change));
    reconciled[index] = { ...group, status: targets.some((target) => laterTargets.has(target)) ? "changed-again" : "applied" };
    for (const target of targets) laterTargets.add(target);
  }
  return reconciled;
}

export function undoChangeGroup(upload: CanonicalUpload, group: AppliedChangeGroup): CanonicalUpload {
  if (group.status !== "applied") throw new Error("Only the latest applied action can be undone.");
  const document = cloneUpload(upload);
  const index = indexUpload(document);
  for (const fix of [...group.changes].reverse()) {
    if (fix.field === "Guardian" || fix.field === "Guardian2") {
      const snapshot = group.undoSnapshots?.[targetKey(fix)];
      if (!snapshot) throw new Error(`Undo data for ${fix.targetId ?? fix.field} is missing.`);
      const { student } = findStudent(index, fix.recordId);
      if (fix.targetId && student.guardians.some((guardian) => guardian.guardianId === fix.targetId)) throw new Error(`Cannot undo: ${fix.targetId} already exists.`);
      const restored = JSON.parse(snapshot) as CanonicalGuardian;
      const requestedIndex = fix.field === "Guardian2" ? 1 : 0;
      student.guardians.splice(Math.min(requestedIndex, student.guardians.length), 0, restored);
      continue;
    }
    const actual = readValue(document, index, fix);
    if (actual !== fix.newValue) throw new Error(`Cannot undo ${fix.field}: the value changed again.`);
    setValue(document, index, fix, fix.oldValue);
  }
  if (group.undoDiagnostics?.length) document.diagnostics.push(...structuredClone(group.undoDiagnostics));
  return document;
}
