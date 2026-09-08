# Pretty Print

Use Pretty Print to make a compact XML file easier to inspect.

1. Select **Pretty Print** and load the source file.
2. Download `{filename}_pretty.xml`.
3. Review the output in a text editor before replacing any source file.

The formatter parses and rebuilds XML with two-space indentation. It does not run STIX field validation or apply cleaning rules.

## Preservation limits

This is a serializer, so it does not preserve the original file byte for byte. Whitespace can be trimmed, comments can be lost, and empty tags can change form. Keep the source file when comments, processing instructions, mixed content, or exact formatting matter.

Use [Validate & Fix](workflow-validate-and-fix.md) to check record values. The implementation is `prettyPrintXml()` in `lib/cleaner.ts`.
