export type Workflow = "validate" | "clean" | "export" | "pretty" | "compare";

export interface CleanStats {
  phones_cleaned: number;
  phones_blank: number;
  units_standardized: number;
  units_review: number;
  street_review: number;
}

export type IssueType = "street_number" | "unit";

export interface Issue {
  id: string;
  type: IssueType;
  index: number;
  current: string;
  school_name: string;
  school_number: string;
  // street_number issues
  street_name?: string;
  // unit issues
  street_number?: string;
}

export interface ReviewUpdate {
  issueId: string;
  value: string; // empty string means clear
}

export interface Student {
  SchoolName: string;
  SchoolNumber: string;
  FirstName: string;
  MiddleName: string;
  LastName: string;
  AliasFirstName: string;
  AliasMiddleName: string;
  AliasLastName: string;
  BirthDate: string;
  BirthYear: number | null;
  Grade: string;
  Class: string;
  OEN: string;
  Gender: string;
  Language: string;
  CountryOfOrigin: string;
  Unit: string;
  StreetNumber: string;
  StreetNumberSuffix: string;
  StreetName: string;
  StreetType: string;
  City: string;
  Province: string;
  PostalCode: string;
}

export interface ExportResult {
  allStudents: Student[];
  filteredStudents: Student[];
  schoolCounts: SchoolCount[];
  gradeCounts: GradeCount[];
}

export interface SchoolCount {
  SchoolName: string;
  BirthYear: number | null;
  StudentCount: number;
}

export interface GradeCount {
  SchoolName: string;
  Grade: string;
  GradeCount: number;
}

export interface ComparisonFieldChange {
  field: string;
  label: string;
  count: number;
}

export interface ComparisonSchoolChange {
  schoolName: string;
  previousCount: number;
  currentCount: number;
  added: number;
  removed: number;
  changed: number;
}

export type ComparisonRecordChangeKind = "added" | "removed" | "changed";

export interface ComparisonRecordChange {
  key: string;
  kind: ComparisonRecordChangeKind;
  studentName: string;
  schoolName: string;
  changedFields: string[];
  fieldDiffs: ComparisonFieldDiff[];
}

export interface ComparisonFieldDiff {
  field: string;
  label: string;
  previousValue: string;
  currentValue: string;
}

export interface ComparisonSchoolTransfer {
  fromSchool: string;
  toSchool: string;
  count: number;
  students: string[];
}

export type ComparisonSignal = "stable" | "moderate" | "high";

export interface StixComparison {
  previousFileName: string;
  currentFileName: string;
  currentXml: string;
  previousStudentCount: number;
  currentStudentCount: number;
  previousSchoolCount: number;
  currentSchoolCount: number;
  matchedCount: number;
  unchangedCount: number;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  movedCount: number;
  changeRate: number;
  fieldChanges: ComparisonFieldChange[];
  recordChanges: ComparisonRecordChange[];
  schoolTransfers: ComparisonSchoolTransfer[];
  schoolChanges: ComparisonSchoolChange[];
  signal: ComparisonSignal;
  recommendation: string;
  recommendationDetail: string;
}

/** Shape stored in sessionStorage between pages */
export interface SessionData {
  workflow: Workflow;
  fileName: string;
  xmlContent: string;         // original XML text
  autoCleanXml?: string;      // XML after auto-clean pass (pre-review)
  cleanXml?: string;          // final clean XML (post-review)
  issues?: Issue[];
  stats?: CleanStats;
  exportResult?: ExportResult;
}

// ─── Rules & Ruleset types ────────────────────────────────────────────────────

export interface RulesProfile {
  requiredFields: string[];
  allowedGradeValues: string[];
  allowedGenderValues: string[];
  allowedProvinceValues: string[];
  allowedLanguageValues: string[];
  allowedCountryValues: string[];
  allowedStreetTypeValues: string[];
  allowedRelationshipValues: string[];
  allowedPhoneTypeValues: string[];
  allowedStreetDirectionValues: string[];
  allowedFullLoadTypeValues: string[];
  fieldLengths: Record<string, number>;
  dateFields: string[];
  postalCodePattern: string;
  phoneConfig: { placeholderNumbers: string[] };
  gradeAliases: Record<string, string>;
  genderAliases: Record<string, string>;
  duplicateDetection: { checkOen: boolean; checkNameDobSchool: boolean };
}

// ─── Cleaning types ───────────────────────────────────────────────────────────

export interface CleaningMapping {
  raw: string;        // exact string to match
  canonical: string;  // replacement value
  matchCase?: boolean; // true means case-sensitive match (default false)
}

export interface CleaningProfile {
  enabledFields: string[];                      // opt-in field whitelist
  mappings: Record<string, CleaningMapping[]>;  // field → ordered mapping list
}

export interface CleaningSummaryEntry {
  field: string;
  raw: string;
  canonical: string;
  count: number; // number of records changed
}

// ─────────────────────────────────────────────────────────────────────────────

export interface CustomRuleset {
  id: string;
  name: string;
  description?: string;
  createdAt: string; // ISO 8601
  rules: RulesProfile;
  cleaning?: CleaningProfile; // absent means no cleaning configured
  warnings?: string[];
}

// ─── Validation types (Phase 1 PLAN) ─────────────────────────────────────────

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationIssue = {
  id: string;
  severity: ValidationSeverity;
  recordId?: string;
  schoolNumber?: string;
  studentName?: string;
  field?: string;
  message: string;
  suggestedFix?: string;
  autoFixable: boolean;
  ruleId: string;
  xmlPath?: string;
};

export type AppliedFix = {
  issueId: string;
  recordId: string;
  field: string;
  oldValue: string;
  newValue: string;
  ruleId: string;
  appliedAt: number;
};

export type StudentRecord = {
  id: string;
  xmlPath: string;
  fields: Record<string, string>;
};

export type GateState = "READY" | "BLOCKED" | "PENDING";

export type ValidationResult = {
  issues: ValidationIssue[];
  records: StudentRecord[];
  schoolCount: number;
  studentCount: number;
  gate: GateState;
};

export type ValidateSession = {
  fileName: string;
  originalXml: string;
  initialResult: ValidationResult;
  fixes: AppliedFix[];
  revalidatedResult?: ValidationResult;
  finalXml?: string;
};
