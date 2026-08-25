# TWIG STIX Cleaner

A browser-based tool for cleaning, validating, and exporting Ontario school enrollment data in STIX XML format. All processing happens client-side — student records never leave your device.

Built by Wellington-Dufferin-Guelph Public Health.

## Features

| Workflow | Description |
|---|---|
| **Validate & Fix** | Optional cleaning step (raw → canonical value mappings), full validation of required fields, code values, formats, and duplicates. Apply safe auto-fixes, revalidate, and download. |
| **Clean XML** | Fix phone numbers, standardize unit fields, and flag suspicious street numbers for manual review. |
| **Export Reports** | Parse students into spreadsheets. Includes a filtered view for Gr7–8 students born 2012–2013 with per-school summaries. |
| **Pretty Print** | Reformat XML with consistent indentation. |

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Other scripts

```bash
npm run build        # Production build (webpack)
npm run start        # Serve the production build
npm run lint         # Run ESLint
```

## Custom Validation Rulesets

The built-in ruleset validates against STIX Wellington-Dufferin-Guelph defaults. If your board uses different grade codes, allows additional phone placeholder numbers, or has stricter required-field rules, you can create a custom ruleset without touching any code — changes only affect your browser session.

### Quick start

1. In the **Validate & Fix** or **Reports** workflow, open the **Validation ruleset** dropdown and click **Export** — this downloads the built-in rules as a `.json` file.
2. Edit the file in any text editor. See [docs/rulesets.md](docs/rulesets.md) for a full field-by-field guide.
3. Click **Import** to load it. Select it from the dropdown and validate as normal.

Rulesets are saved in your browser's localStorage and persist between sessions. They are never uploaded anywhere. To share a ruleset with a colleague, send them the exported `.json` file — they import it the same way.

## Tech Stack

- [Next.js 16](https://nextjs.org) — React framework
- [React 19](https://react.dev)
- [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) — XML parsing
- [xlsx](https://sheetjs.com) — Excel export
- [lucide-react](https://lucide.dev) — Icons

## Privacy

This app is 100% in-browser. No data is uploaded to any server. All XML processing, validation, and file generation runs locally in your browser.

## License

MIT
