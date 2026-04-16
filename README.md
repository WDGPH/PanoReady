# TWIG STIX Cleaner

A browser-based tool for cleaning, validating, and exporting Ontario school enrollment data in STIX XML format. All processing happens client-side — student records never leave your device.

Built by Wellington-Dufferin-Guelph Public Health.

## Features

| Workflow | Description |
|---|---|
| **Validate & Fix** | Full validation of required fields, code values, formats, and duplicates. Apply safe auto-fixes, revalidate, and download. |
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
