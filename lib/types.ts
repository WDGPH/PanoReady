export type Workflow = "clean" | "export" | "pretty";

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
