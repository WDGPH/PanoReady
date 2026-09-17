export type Workflow = "validate" | "compare";

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
  StreetDirection: string;
  RuralRoute: string;
  PoBoxNumber: string;
  City: string;
  Province: string;
  PostalCode: string;
  PhoneType: string;
  GuardianFirstName: string;
  GuardianLastName: string;
  GuardianRelationship: string;
  GuardianPhoneNumber: string;
  GuardianPhoneType: string;
  Guardian2FirstName: string;
  Guardian2LastName: string;
  Guardian2Relationship: string;
  Guardian2PhoneNumber: string;
  Guardian2PhoneType: string;
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

export interface STIXComparison {
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
  phoneConfig: {
    placeholderNumbers: string[];
    canadianAreaCodeCheck?: "off" | "info" | "warning";
  };
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

export type DiagnosticLayer =
  | "IMPORT"
  | "CANONICAL"
  | "PROFILE"
  | "IDENTITY"
  | "XML"
  | "XSD"
  | "RECONCILIATION";

export type RepairConfidence = "safe" | "review" | "manual";

export type RepairChange = {
  field: string;
  currentValue: string;
  proposedValue: string;
};

export type AddressRepairProposal = {
  kind: "address";
  id: string;
  confidence: RepairConfidence;
  title: string;
  explanation: string;
  changes: RepairChange[];
};

export type ValidationIssue = {
  id: string;
  severity: ValidationSeverity;
  recordId?: string;
  schoolNumber?: string;
  studentName?: string;
  field?: string;
  /** Source value for issues outside a student record, such as file metadata. */
  currentValue?: string;
  message: string;
  suggestedFix?: string;
  autoFixable: boolean;
  ruleId: string;
  xmlPath?: string;
  layer?: DiagnosticLayer;
  sourceLocation?: string;
  /** A coordinated, multi-field correction that can be reviewed as one unit. */
  repairProposal?: AddressRepairProposal;
};

export type AppliedFix = {
  issueId: string;
  recordId: string;
  field: string;
  oldValue: string;
  newValue: string;
  ruleId: string;
  appliedAt: number;
  /** Links multiple field changes applied from one repair card. */
  repairId?: string;
};

export type StudentRecord = {
  id: string;
  xmlPath: string;
  fields: Record<string, string>;
};

export type GateState = "READY" | "READY_WITH_WARNINGS" | "REVIEW_REQUIRED" | "BLOCKED" | "PENDING";

export type ValidationResult = {
  issues: ValidationIssue[];
  records: StudentRecord[];
  schoolCount: number;
  studentCount: number;
  gate: GateState;
  xsdValidated?: boolean;
};

export type ImportMappingStatus = "MAPPED" | "AMBIGUOUS" | "DUPLICATE" | "UNMAPPED" | "IGNORED";

export type ImportColumnMapping = {
  column: number;
  sourceHeader: string;
  canonicalField?: string;
  status: ImportMappingStatus;
  populatedCount: number;
};

export type ImportPreview = {
  worksheet: string;
  headerRow: number;
  firstDataRow: number;
  sourceRowCount: number;
  canonicalStudentCount: number;
  columns: ImportColumnMapping[];
  diagnostics: ValidationIssue[];
  transformationCount: number;
  reconciled: boolean;
};

export type ValidateSession = {
  /** Applied batches in review order, including actions subsequently undone. */
  history?: ReviewAction[];
  /** Number of audit entries already reflected in finalXml. */
  appliedFixCount?: number;
  fileName: string;
  originalXml: string;
  initialResult: ValidationResult;
  fixes: AppliedFix[];
  validationRules?: RulesProfile;
  revalidatedResult?: ValidationResult;
  finalXml?: string;
};

export type ReviewAction = {
  id: string;
  label: "Automatic fixes" | "Manual fixes" | "Cleaning mappings";
  changes: AppliedFix[];
  status: "applied" | "undone";
};
