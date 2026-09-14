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
  GuardianMiddleName: string;
  GuardianLastName: string;
  GuardianRelationship: string;
  GuardianPhoneNumber: string;
  GuardianPhoneType: string;
  Guardian2FirstName: string;
  Guardian2MiddleName: string;
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
  schoolId: string;
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
  matchStatus?: "matched" | "unmatched" | "ambiguous";
  kind: ComparisonRecordChangeKind;
  studentName: string;
  schoolName: string;
  schoolId?: string;
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
  previousSourceSystem?: string;
  currentSourceSystem?: string;
  reviewer?: string;
  previousStudentCount: number;
  currentStudentCount: number;
  previousSchoolCount: number;
  currentSchoolCount: number;
  matchedCount: number;
  unchangedCount: number;
  addedCount: number;
  removedCount: number;
  ambiguousCount: number;
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
    canadianAreaCodeCheck: "off" | "info" | "warning";
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

// ─── Validation types ────────────────────────────────────────────────────────

export type ValidationSeverity = "error" | "warning" | "info";

export type DiagnosticLayer =
  | "IMPORT"
  | "CANONICAL"
  | "PROFILE"
  | "IDENTITY"
  | "XML"
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
  /** Stable session-local identity for a nested editable record. */
  targetId?: string;
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
  /** Stable nested target identity when the change affects a guardian. */
  targetId?: string;
  field: string;
  oldValue: string;
  newValue: string;
  ruleId: string;
  appliedAt: number;
  /** Links multiple field changes applied from one repair card. */
  repairId?: string;
};

export type ChangeOrigin = "automatic" | "manual" | "cleaning" | "setup";

export type AppliedChangeGroup = {
  id: string;
  label: string;
  origin: ChangeOrigin;
  appliedAt: number;
  changes: AppliedFix[];
  /** Serialized nested values required to restore removals. */
  undoSnapshots?: Record<string, string>;
  /** Import findings retired by this action and restored if it is undone. */
  undoDiagnostics?: ValidationIssue[];
  status: "applied" | "undone" | "changed-again";
};

export type StudentRecord = {
  id: string;
  xmlPath: string;
  fields: Record<string, string>;
};

export type GateState = "READY" | "REVIEW_REQUIRED" | "BLOCKED";

export type ValidationResult = {
  issues: ValidationIssue[];
  records: StudentRecord[];
  schoolCount: number;
  studentCount: number;
  gate: GateState;
};

export type ImportMappingStatus = "MAPPED" | "DUPLICATE" | "UNMAPPED";

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
  fileName: string;
  /** The only editable authority for the current browser session. */
  document: import("./canonical").CanonicalUpload;
  initialIssueCount: number;
  currentResult: ValidationResult;
  history: AppliedChangeGroup[];
  validationRules?: RulesProfile;
  inputFormat?: "STIX XML" | "XLSM workbook";
  importTransformationCount?: number;
  originalCreatedBy?: string;
  dateAssumption?: string;
  /** Calendar date used for deterministic age calculations in this session. */
  referenceDate: string;
  drafts: {
    /** Keyed by stable record/nested target/field, not finding IDs. */
    values: Record<string, {
      value: string;
      expected: { recordId: string; targetId?: string; field: string; oldValue: string };
    }>;
    /** One coordinated address draft per student record ID. */
    addresses: Record<string, {
      values: Record<string, string>;
      expectedValues: Record<string, string>;
      selected: boolean;
    }>;
  };
};

export function activeSessionFixes(session: ValidateSession): AppliedFix[] {
  return session.history.filter((group) => group.status !== "undone").flatMap((group) => group.changes);
}
