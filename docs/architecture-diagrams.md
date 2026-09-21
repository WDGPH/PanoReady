# Architecture diagrams

Visual companion to the [system design](system-design-panoready.md) document. Every diagram reflects the current implementation — component and module names match the files in the repository.

## 1. System overview

PanoReady has no backend. Everything below the browser boundary is a download the user explicitly triggers; nothing crosses the network.

```mermaid
flowchart TB
    User(["👤 User"])

    subgraph Browser["🌐 Browser sandbox — nothing leaves this box unless the user downloads it"]
        direction TB

        subgraph UI["UI layer — Next.js 16 / React 19"]
            Intake["STIXIntake\nfile selection + workbook preview"]
            ValidateWF["ValidateAndFixWorkflow\n6-stage review"]
            CompareWF["CompareWorkflow\nchange review + export"]
        end

        subgraph Adapters["Intake adapters"]
            XmlParser["fast-xml-parser\nSTIX XML → records"]
            XlsxImporter["lib/excel.ts\nXLSM → canonical fields"]
        end

        subgraph Core["Canonical model + engines"]
            Canonical["lib/canonical.ts\nCanonicalUpload model"]
            Validator["lib/validator.ts\nvalidation + gate"]
            Cleaner["lib/cleaning.ts + lib/cleaner.ts\nmapping cleanup, formatting"]
            Compare["lib/compare.ts\nsnapshot diffing"]
            Rules["lib/rulesets.ts\nbuilt-in + custom rules"]
        end

        subgraph Out["Output"]
            Export["lib/stixExport.ts\nstructure-preserving XML writes"]
            Reports["CSV / XLSX generators"]
            Zip["@zip.js/zip.js\nAES-256 ZIP"]
        end

        Storage[("localStorage\nrulesets · workbook metadata")]
    end

    Downloads(["⬇️ XML · reports · ZIP"])

    User -->|selects file| Intake
    Intake --> XmlParser & XlsxImporter
    XmlParser --> Canonical
    XlsxImporter --> Canonical
    Canonical --> Validator
    Validator <--> Rules
    Validator --> ValidateWF
    ValidateWF --> Cleaner
    Canonical --> Compare
    Compare --> CompareWF
    ValidateWF --> Export
    CompareWF --> Export
    Export --> Reports --> Zip
    Rules <--> Storage
    Zip --> Downloads
    Export --> Downloads
    Reports --> Downloads
    Downloads --> User

    classDef ui fill:#3b6ea5,stroke:#1c3f66,color:#fff
    classDef adapter fill:#5c8a3a,stroke:#33511f,color:#fff
    classDef core fill:#a55b3b,stroke:#6b3620,color:#fff
    classDef out fill:#7a4fa0,stroke:#4a2f61,color:#fff
    classDef store fill:#8a8a8a,stroke:#4d4d4d,color:#fff
    class Intake,ValidateWF,CompareWF ui
    class XmlParser,XlsxImporter adapter
    class Canonical,Validator,Cleaner,Compare,Rules core
    class Export,Reports,Zip out
    class Storage store
```

## 2. Component map

How the top-level React components route into the `lib/` engines. Arrows show direct imports/calls, not data direction.

```mermaid
flowchart LR
    Page["app/page.tsx"] --> Intake["STIXIntake.tsx"]
    Page --> VWF["ValidateAndFixWorkflow.tsx"]
    Page --> CWF["CompareWorkflow.tsx"]

    Intake -->|"importWorkbook / xlsmMetadata"| Excel["lib/excel.ts"]
    Intake -->|"parseSTIXXml"| Validator["lib/validator.ts"]
    Intake -->|"compareSTIXFiles"| Compare["lib/compare.ts"]

    VWF --> Assess["AssessmentView"]
    VWF --> CleanView["CleaningView / CleaningSummaryView"]
    VWF --> Issues["IssuesView"]
    VWF --> Fix["FixView"]
    VWF --> Revalidate["RevalidateView"]
    VWF --> Download["DownloadView"]

    Assess -->|"validateXml"| Validator
    Fix --> AddressCard["AddressRepairCard"]
    AddressCard -->|"analyze*"| AddressRepair["lib/addressRepair.ts"]
    Fix -->|"applyValidationFixes"| Validator
    CleanView -->|"applyCleaningProfile / discoverFieldValues"| Cleaning["lib/cleaning.ts"]
    Revalidate -->|"validateXml"| Validator
    Download -->|"prettyPrintXml"| Cleaner["lib/cleaner.ts"]
    Download -->|"processExport / buildSchoolCounts"| PullInfo["lib/pullInfo.ts"]
    Download -->|"generate*Csv"| Validator

    Validator -->|"parseCanonicalXml"| Canonical["lib/canonical.ts"]
    Validator -->|"analyzePhoneNumber"| Phone["lib/phoneNumber.ts"]
    Validator -->|"normalizeCanadianPostalCode"| Postal["lib/postalCode.ts"]

    VWF -->|"defaultRules / listCustomRulesets"| Rulesets["lib/rulesets.ts"]
    Intake --> RulesetSelector["RulesetSelector"] --> Rulesets

    CWF -->|"extractSchoolXml / applyReviewCorrections"| Export["lib/stixExport.ts"]
    CWF -->|"toCsv / downloadText / downloadBlob"| Utils["lib/utils.ts"]

    classDef page fill:#2f4f6f,stroke:#16283b,color:#fff
    classDef view fill:#3b6ea5,stroke:#1c3f66,color:#fff
    classDef lib fill:#a55b3b,stroke:#6b3620,color:#fff
    class Page page
    class Intake,VWF,CWF,Assess,CleanView,Issues,Fix,Revalidate,Download,AddressCard,RulesetSelector view
    class Excel,Validator,Compare,Canonical,Phone,Postal,AddressRepair,Cleaning,Cleaner,PullInfo,Rulesets,Export,Utils lib
```

## 3. Validate & Fix — stage flow

The six on-screen stages described in the [Validate & Fix workflow](workflow-validate-and-fix.md) guide, as `ValidateAndFixWorkflow`'s internal state machine. "Clean summary" is optional and only reachable from Automatic fixes.

```mermaid
stateDiagram-v2
    [*] --> Assessing

    Assessing: 1 · Assess quality\n(AssessmentView → validateXml)
    Issues: 1 · Review issues\n(IssuesView)
    CleanSummary: Cleaning applied\n(CleaningSummaryView, optional)
    Fix: 2 · Automatic fixes\n(FixView "automatic")
    Manual: 3 · Manual fixes\n(FixView "manual")
    Revalidate: 4 · Recheck\n(RevalidateView → validateXml)
    Download: 5 · Download\n(DownloadView)

    Assessing --> Issues: validation complete
    Issues --> Fix: choose fixes to review
    Issues --> Download: skip when gate is\nREADY / REVIEW_REQUIRED
    Fix --> CleanSummary: apply cleaning mapping\n(optional, in advanced options)
    CleanSummary --> Fix: continue\n(fixes recorded, xml revalidated)
    Fix --> Manual: continue
    Manual --> Revalidate: apply selected fixes
    Revalidate --> Manual: return to fixes
    Revalidate --> Download: continue
    Download --> Manual: return to fixes
    Download --> [*]: exit / start over

    note right of Issues
        Backward navigation via
        WorkflowProgress is allowed to
        any completed earlier stage.
    end note
```

## 4. Compare Files — data flow

```mermaid
flowchart TD
    Prev["Previous STIX/XLSM"] --> ParsePrev["parseCanonicalXml"]
    Curr["Current STIX/XLSM"] --> ParseCurr["parseCanonicalXml"]

    ParsePrev --> Diff["compareSTIXFiles()\nmatch by OEN / name+DOB,\ndiff fields, detect school moves"]
    ParseCurr --> Diff

    Diff --> Comparison["STIXComparison\nschool · record · field · transfer changes\n+ signal (stable/moderate/high)"]

    Comparison --> Dashboard["CompareWorkflow dashboard\nKPIs · signal banner"]
    Dashboard --> Schools["School overview"]
    Dashboard --> Records["Record details\n(per-record review)"]
    Dashboard --> Fields["Field changes"]
    Dashboard --> Transfers["Transfers"]

    Records --> Decision{"Reviewer decision\nper changed field"}
    Decision -->|Confirm| Confirmed["decisions[key] = confirmed"]
    Decision -->|Needs fix| Correction["corrections[key] = new value"]

    Confirmed --> ExportStep["applyReviewCorrections()\nover extractSchoolXml()"]
    Correction --> ExportStep

    ExportStep --> XmlOut["Current XML\n(full or school-scoped)"]
    ExportStep --> ZipOut["AES-256 encrypted ZIP"]
    Dashboard --> CsvOut["School-change CSV\nReview-log CSV"]

    classDef input fill:#5c8a3a,stroke:#33511f,color:#fff
    classDef engine fill:#a55b3b,stroke:#6b3620,color:#fff
    classDef ui fill:#3b6ea5,stroke:#1c3f66,color:#fff
    classDef output fill:#7a4fa0,stroke:#4a2f61,color:#fff
    class Prev,Curr input
    class ParsePrev,ParseCurr,Diff,ExportStep engine
    class Dashboard,Schools,Records,Fields,Transfers,Decision ui
    class Comparison,XmlOut,ZipOut,CsvOut,Confirmed,Correction output
```

## 5. Workbook (XLSM) intake pipeline

How `.xlsm` uploads become STIX XML before either workflow ever sees them (`lib/excel.ts`).

```mermaid
flowchart LR
    File[".xlsm file"] --> Meta["xlsmMetadata()\ndiscover worksheet,\nfile-level metadata fields"]
    Meta --> Cache[("localStorage\npanoready:xlsm-metadata:v2:…")]
    Cache -. restores prior edits .-> Meta

    Meta --> Import["importWorkbook()"]
    Import --> Header["Header discovery\ncanonical aliases, not fixed positions"]
    Header --> Mapping{"Column status"}
    Mapping -->|MAPPED| Values["Value normalization\ndates, phones, units, lookups"]
    Mapping -->|UNMAPPED / DUPLICATE| Override["User column override\n(map or ignore)"]
    Override --> Values
    Mapping -->|IGNORED| Skip["excluded from output"]

    Values --> Preview["ImportPreview\ncolumns · diagnostics · counts"]
    Preview -->|blocking diagnostics present| Blocked["Import blocked\n(unmapped/duplicate column,\nambiguous date/phone, formula, count mismatch)"]
    Preview -->|clean| XmlOut["Generated STIX XML text"]

    XmlOut --> Downstream["parseSTIXXml() / validateXml()\n(same path as native XML upload)"]

    classDef step fill:#a55b3b,stroke:#6b3620,color:#fff
    classDef decision fill:#c9962c,stroke:#7a5a15,color:#111
    classDef terminal fill:#7a4fa0,stroke:#4a2f61,color:#fff
    class Meta,Import,Header,Values,Preview step
    class Mapping decision
    class XmlOut,Blocked,Downstream terminal
```

## 6. Canonical data model

The shared in-memory contract that both workflows validate, diff, and export against (`lib/canonical.ts`, `lib/types.ts`).

```mermaid
classDiagram
    class CanonicalUpload {
        schemaVersion: string
        batchId: string
        metadata: CanonicalMetadata
        schools: CanonicalSchool[]
        diagnostics: ValidationIssue[]
    }
    class CanonicalMetadata {
        createDate, createTime, createdBy: string
        contactPhone: CanonicalPhone
        contactEmail, fullUpload: string
        boardNumber, boardName: string
    }
    class CanonicalSchool {
        schoolId, schoolNumber, name: string
        students: CanonicalStudent[]
    }
    class CanonicalStudent {
        recordId, oen, grade, className: string
        name, aliasName: CanonicalName
        gender, birthDate, language: string
        countryOfOrigin: string
        guardians: CanonicalGuardian[]
        address: CanonicalAddress
        phone: CanonicalPhone
        provenance: Map~field, raw+sourceLocation~
    }
    class CanonicalGuardian {
        name: CanonicalName
        relationship: string
        phone: CanonicalPhone
    }
    class CanonicalAddress {
        unit, streetNumber, streetNumberSuffix: string
        streetName, streetType, streetDirection: string
        ruralRoute, poBoxNumber: string
        city, province, postalCode: string
    }
    class CanonicalName {
        first, middle, last: string
    }
    class CanonicalPhone {
        number, type: string
    }
    class ValidationIssue {
        severity: error|warning|info
        ruleId, field, message: string
        autoFixable: bool
        repairProposal: AddressRepairProposal
    }
    class AppliedFix {
        issueId, recordId, field: string
        oldValue, newValue: string
        ruleId: string
        appliedAt: number
    }
    class ValidateSession {
        fileName, originalXml: string
        initialResult: ValidationResult
        revalidatedResult: ValidationResult
        fixes: AppliedFix[]
        finalXml: string
    }
    class ValidationResult {
        issues: ValidationIssue[]
        records: StudentRecord[]
        gate: GateState
    }

    CanonicalUpload "1" *-- "1" CanonicalMetadata
    CanonicalUpload "1" *-- "*" CanonicalSchool
    CanonicalSchool "1" *-- "*" CanonicalStudent
    CanonicalStudent "1" *-- "1" CanonicalAddress
    CanonicalStudent "1" *-- "0..2" CanonicalGuardian
    CanonicalStudent "1" o-- "0..1" CanonicalPhone
    CanonicalStudent "1" *-- "1..2" CanonicalName
    CanonicalGuardian "1" o-- "0..1" CanonicalPhone
    CanonicalGuardian "1" *-- "1" CanonicalName
    CanonicalMetadata "1" o-- "0..1" CanonicalPhone
    CanonicalUpload "1" *-- "*" ValidationIssue : diagnostics
    ValidationResult "1" *-- "*" ValidationIssue
    ValidateSession "1" *-- "2" ValidationResult
    ValidateSession "1" *-- "*" AppliedFix
```

## 7. Deployment topology

`next.config.ts` switches output mode by environment; there is still no server-side data path in any of them — only where the static assets are served from changes.

```mermaid
flowchart LR
    subgraph Dev["Local development"]
        NextDev["next dev / next start\nnode server, port 3000"]
    end

    subgraph Jupyter["JupyterHub / Kubeflow proxy"]
        Proxy["Notebook proxy\nstrips path prefix"] --> NextServer["next start\nassetPrefix = NB_PREFIX/proxy/3000"]
    end

    subgraph Pages["GitHub Pages (GITHUB_PAGES=true)"]
        StaticBuild["next build --webpack\noutput: 'export'"] --> StaticFiles["Static files\nbasePath /PanoReady"]
        StaticFiles --> CDN["GitHub Pages CDN"]
    end

    Browser1(["Browser"]) --> NextDev
    Browser2(["Browser"]) --> Proxy
    Browser3(["Browser"]) --> CDN

    classDef env fill:#3b6ea5,stroke:#1c3f66,color:#fff
    classDef host fill:#5c8a3a,stroke:#33511f,color:#fff
    class NextDev,NextServer,StaticBuild env
    class Proxy,StaticFiles,CDN host
```

---

*Diagrams are Mermaid and render directly on GitHub and in the published MkDocs site. Regenerate them when a workflow stage, module boundary, or data contract changes — see [`system-design-panoready.md`](system-design-panoready.md) for the prose description each diagram summarizes.*
