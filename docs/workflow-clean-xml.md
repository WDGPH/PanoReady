# Workflow: Clean XML

The Clean XML workflow automatically corrects phone numbers and address unit fields in a STIX XML file, then optionally lets you review and manually override anything the auto-cleaner flagged for human attention.

## When to Use

Use this workflow when you need to:
- Normalize phone numbers into a consistent `XXX-XXX-XXXX` format.
- Standardize address unit values (e.g. convert `BASEMENT` to `BSMT`, `main floor` to `MAIN`).
- Quickly clean a file without running the full structural validation.

For full field-level validation (required fields, grade codes, dates, OENs, etc.), use the [Validate & Fix](./workflow-validate-and-fix.md) workflow instead.

---

## Step-by-Step Flow

### Step 0 — Upload

On the home screen, drop or select your STIX XML file, then click the **Clean XML** card.

Auto-cleaning runs immediately on upload. If the XML is not well-formed, an error is displayed.

---

### Step 1 — Review (Conditional)

This screen only appears if the cleaner flagged any items that need human review — typically street numbers that look unusually long, or unit values it could not normalize with confidence.

**Review table columns:**

| Column | Description |
|---|---|
| School | School number the record belongs to |
| Student | Student name |
| Field | `StreetNumber` or `Unit` |
| Current Value | The value currently in the XML after auto-cleaning |
| Action | Editable text input and a **Clear** button |

**Controls per row:**
- **Text input** — Type a replacement value. Leave blank to keep the current value.
- **Clear** — Empty the field (removes the value from the XML entirely).

**Summary stats shown at the top:**

| Stat | Description |
|---|---|
| Phones cleaned | Number of phone fields reformatted successfully |
| Phones blanked | Number of phone fields that were unrecoverable and emptied |
| Units standardized | Number of unit fields normalized to a standard abbreviation |
| Need review | Number of items that require manual attention (shown in this table) |

**Actions:**
- **Apply & Download** — Writes your manual overrides into the XML and triggers the download.
- **Skip to Download** — Skips manual overrides and downloads the auto-cleaned XML as-is.

---

### Step 2 — Download

The result screen shows final stats and a download button.

**Download:**

| File | Contents |
|---|---|
| `{original-filename}_cleaned.xml` | The XML file after all auto-cleaning and any manual overrides |

---

## Cleaning Logic

### Phone Number Cleaning

Performed on all phone-related fields found in the XML.

**Steps applied:**
1. Strip all non-digit characters.
2. If the result has 11 digits and starts with `1`, remove the leading `1` (strips country code).
3. Check the result is exactly 10 digits.
4. Validate the area code is not in the known-invalid list (`163`, `081`).
5. Reject `519-000-0000` (a known placeholder value).
6. Format as `XXX-XXX-XXXX`.

**Outcome if cleaning fails:** The field is blanked (empty string written to XML) and counted under "Phones blanked."

**Extensions:** If an extension was present in the original value, it is preserved after the formatted number (e.g. `519-555-1234 ext. 5`).

---

### Unit Field Standardization

Performed on the `Unit` field for each student record.

**Steps applied:**
1. If the value is 5 characters or fewer, leave it unchanged (assumed already abbreviated).
2. Normalize to uppercase and trim whitespace.
3. Apply known-pattern mappings:

| Input pattern | Normalized to |
|---|---|
| `basement`, `bsmt`, `bsmnt` | `BSMT` |
| `lower`, `lower level`, `lower lev`, `lwr` | `LOWR` |
| `main`, `main floor`, `main flo`, `ground` | `MAIN` |
| `upper`, `upper level`, `upper lev` | `UPPR` |
| `rear`, `back` | `REAR` |

4. Remove surrounding parentheses (e.g. `(3B)` → `3B`).
5. Strip a leading `unit` or `apt` prefix followed by a space or dash (e.g. `unit 4A` → `4A`, `apt-2` → `2`).
6. If the value still does not match a known pattern, flag it for manual review.

**Outcome if pattern not recognized:** The value is kept as-is and added to the review list.

---

## Key Files

| File | Role |
|---|---|
| `lib/cleaner.ts` | `cleanXml()`, `cleanPhone()`, `standardizeUnit()`, `applyReviewUpdates()` |
| `lib/types.ts` | `CleanStats`, `CleanIssue`, `SessionData` |
| `app/page.tsx` | UI screens: `ReviewView`, `ResultView` |

---

## Data Flow

```
Upload XML
    │
    ▼
cleanXml(xmlText)              ← lib/cleaner.ts
    │
    ├── cleanPhone() per phone field
    └── standardizeUnit() per Unit field
    │
    ▼
{ cleanedXml, issues[], stats }
    │
    ├── issues empty? → Skip to download
    └── issues present? → ReviewView
                              │
                              ▼
                    applyReviewUpdates(xml, overrides)
                              │
                              ▼
                         Download cleaned XML
```

---

## Limitations

- This workflow does **not** check required fields, grade codes, OEN format, birth dates, or duplicate detection. Use [Validate & Fix](./workflow-validate-and-fix.md) for those checks.
- Phone cleaning is lossy for unrecoverable values — the original phone number is replaced with an empty string. Check the "Phones blanked" count and verify those records manually if needed.
- Unit standardization only recognizes a fixed set of English-language patterns. Unusual or non-standard values will be flagged for review.
