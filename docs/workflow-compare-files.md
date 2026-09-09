# Compare Files

Select **Compare Files**, then load the previous and current snapshots. Either input may be STIX XML or a supported `.xlsm` workbook. Workbook metadata can be reviewed before conversion; macros are not executed. Click **Compare Files** to review student counts, additions, removals, field changes, and school transfers.

## Matching

The comparison matches students by OEN when present. Without an OEN, it uses school number, first/middle/last name, and birth date. Comparisons ignore letter case and surrounding whitespace.

Repeated matching keys are paired in input order. A changed name or school can appear as an addition and removal when an OEN is missing. Review duplicate and ambiguous records against the source system.

The compared fields cover school identifiers, names, birth date, grade, class, gender, language, country of origin, and address values. Alias names and guardian fields are not compared. A record marked unchanged can still differ in those fields.

School summaries group by school name. Transfers are detected from changes in school name, so renaming a school can look like a transfer.

## Review and export

Use the school, record, field, and transfer views to inspect differences. In the record view, mark individual field changes as confirmed or needing a fix. A proposed correction is written to the downloaded current XML; the original input file is not modified.

Export `stix_comparison_school_changes.csv` for school counts and change totals, or `stix_change_review_log.csv` for field decisions and proposed corrections. You can also download the reviewed current XML for all schools or for the selected school. XML downloads can use an AES-256 password-protected ZIP.

The change rate is `(added + removed + changed) / previous student count`, expressed as a percentage. It can exceed 100%. With no previous students it is 0% for an empty current file and 100% otherwise. The interface labels rates up to 1% stable, up to 5% moderate, and higher rates high. These thresholds are fixed heuristics, not reporting-policy requirements.

ZIP passwords must contain at least eight characters and are not saved. Keep the password separate from the archive and use an archive tool that supports AES ZIP encryption. Source files, comparison results, and downloads contain record data.

The implementation is `compareStixFiles()` in `lib/compare.ts`.
