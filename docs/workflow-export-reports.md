# Export Reports

Export Reports reads STIX records into CSV files and Excel worksheets. It does not validate or correct field values. Run [Validate & Fix](workflow-validate-and-fix.md) first if you need to check the source data.

## Download reports

Select **Export Reports**, load a file, and review the student and school counts. Download individual CSVs or the workbook.

| Download | Contents |
|---|---|
| `{filename}_all_students.csv` | All extracted students |
| `{filename}_filtered_students.csv` | Students in `GR7` or `GR8` whose birth year is 2012 or 2013 |
| `{filename}_school_counts.csv` | Counts by school name and birth year |
| `{filename}_grade_counts.csv` | Counts by school name and grade |
| `{filename}_report.xlsx` | All four reports, in `All_Students`, `Filtered_Students`, `School_Counts`, and `Grade_Counts` sheets |

The built-in grade and birth-year filter is fixed; it does not advance each school year. Grade matching is case-sensitive.

## Custom report

Choose schools, grades, genders, and an age range to download `{filename}_custom_report.xlsx`. It contains `Students`, `School_Counts`, and `Grade_Counts` sheets.

Records with missing school, grade, or gender values are not excluded by those filters. Records whose age cannot be calculated are not excluded by the age range. Review the selected records before sharing the report.

## Columns and grouping

Student rows contain school identifiers, names and aliases, birth date and derived birth year, OEN, grade, class, gender, language, country of origin, address fields, and guardian fields. `Student` in `lib/types.ts` defines the complete field list; `parseXml()` in `lib/pullInfo.ts` defines the XML paths read for each column.

| Report | Columns |
|---|---|
| School counts | `SchoolName`, `BirthYear`, `StudentCount` |
| Grade counts | `SchoolName`, `Grade`, `GradeCount` |

Counts group by school **name**, so separate schools with the same name are combined. Student rows retain `SchoolNumber`.

Birth year comes from JavaScript date parsing, with a leading four-digit year as a fallback. Missing dates produce no birth year. This calculation does not establish that a date is valid.

## Input limits

The parser expects `ns1:SchoolUpload`, `ns1:School`, and `ns1:Students/ns1:Student`. Missing text fields become empty strings. Some exported guardian and address-related columns read direct student elements; nested guardian structures are not flattened into those columns. Check those fields against the source if they matter to your report.

Exports contain record data. Store and share them according to your organization's requirements.
