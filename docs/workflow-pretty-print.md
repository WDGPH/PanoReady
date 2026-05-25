# Workflow: Pretty Print

The Pretty Print workflow reformats a STIX XML file with consistent 2-space indentation, making it easier to read in a text editor without changing any data.

## When to Use

Use this workflow when you need to:
- Inspect a minified or poorly indented STIX XML file in a readable format.
- Prepare a file for manual review or diffing before running other workflows.

This workflow makes no changes to field values, structure, or content — only whitespace and formatting.

---

## Step-by-Step Flow

### Step 0 — Upload

On the home screen, drop or select your STIX XML file, then click the **Pretty Print** card.

The app reformats the XML immediately. If the XML is not well-formed, an error is displayed.

### Step 1 — Download

The result screen shows a confirmation message and a single download button.

**Download:**

| File | Contents |
|---|---|
| `{original-filename}_pretty.xml` | The original XML reformatted with 2-space indentation |

---

## Formatting Rules

- Each child element is indented 2 spaces relative to its parent.
- Opening and closing tags that were on the same line remain on the same line only if the element has no child elements (i.e. leaf nodes).
- The XML declaration (`<?xml version="1.0" encoding="UTF-8"?>`) is preserved at the top of the file if present.
- Namespace declarations and attribute ordering are preserved.
- No elements, attributes, or text content are modified.

---

## Key Files

| File | Role |
|---|---|
| `lib/cleaner.ts` | `prettyPrintXml()` — reformats XML string with indentation |
| `app/page.tsx` | `ResultView` screen (pretty-print variant) |

---

## Data Flow

```
Upload XML
    │
    ▼
prettyPrintXml(xmlText)        ← lib/cleaner.ts
    │
    ▼
formattedXml
    │
    ▼
Download {filename}_pretty.xml
```

---

## Limitations

- This workflow does not validate or clean the file. Run [Validate & Fix](./workflow-validate-and-fix.md) separately if you need to check field values.
- Formatting is applied with a simple XML serialiser. Comment nodes and processing instructions may be dropped or moved — use this workflow on data files, not on files where XML comments carry important information.
