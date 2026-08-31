# Workflow: Compare Files

Compare Files measures changes between a previous STIX snapshot and a current snapshot. It helps identify additions, removals, transfers, field-level changes, and changes in school counts.

## When to use it

Use this workflow to review how an updated submission differs from an earlier file, identify records added or removed, review transfers between schools, inspect changed fields, or export current records.

Comparison is a review aid. It does not replace validation of the current file.

## Run a comparison

1. Select **Compare Files**.
2. Choose the previous file.
3. Choose the current file.
4. If either file is an Excel workbook, review its detected metadata.
5. Select **Compare Files** to process both snapshots.

Both inputs may be STIX XML or supported `.xlsm` workbooks. Files are parsed locally in the browser.

## Review the result

The comparison summarizes school-level counts, students added or removed, student transfers, and individual field changes. Review ambiguous or unexpected results against the source systems before acting on them.

## Export current data

You can export the current snapshot as XML for all schools or for a selected school. Downloads are available as plain XML or as an AES-256 encrypted ZIP.

!!! note "Encrypted ZIP compatibility"
    The password is not stored by PanoReady. Share it separately from the archive. Use an AES-capable archive tool such as 7-Zip, WinRAR, or PeaZip; Windows File Explorer cannot extract AES-encrypted ZIP files.

## Privacy

Both input files and all comparison results remain in the browser. Downloaded exports still contain record data and must be handled according to your organization's requirements.
