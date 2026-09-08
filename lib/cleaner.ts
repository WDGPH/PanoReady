/**
 * Browser-native port of stix_cleaner.py
 * Uses fast-xml-parser v5 for XML parsing/building.
 * All processing is synchronous and in-memory.
 */

import { XMLParser, XMLBuilder } from "fast-xml-parser";

// ─── Unit Standardization ────────────────────────────────────────────────────

/** Returns [standardized, wasChanged, needsReview] */
export function standardizeUnit(text: string): [string, boolean, boolean] {
  if (!text) return ["", false, false];
  const raw = text;
  const trimmed = raw.trim();

  // Already within limit — just trim whitespace if needed
  if (trimmed.length <= 5) {
    return trimmed !== raw ? [trimmed, true, false] : [raw, false, false];
  }

  // Named floor/location designators (Panorama-safe abbreviations)
  if (/^basem/i.test(trimmed)) return ["BSMT", true, false];
  if (/^d\s*lower/i.test(trimmed)) return ["LOWR", true, false];
  if (/^lower\s*(un|ap|fl)/i.test(trimmed)) return ["LOWR", true, false];
  if (/^(upper|top)\s*(lev|un|ap|fl)/i.test(trimmed)) return ["UPPR", true, false];
  if (/^(main\s*flo|mainflo)/i.test(trimmed)) return ["MAIN", true, false];
  if (/^second$/i.test(trimmed)) return ["2ND", true, false];
  if (/^2nd\s*fl/i.test(trimmed)) return ["2F", true, false];
  if (/^ground/i.test(trimmed)) return ["GRD", true, false];

  // Parenthetical notation: "14 (B)" → "14B"
  if (/\(/.test(trimmed)) {
    const cleaned = trimmed.replace(/\s*\(([^)]*)\)/, "$1").replace(/\s+/g, "").trim();
    if (cleaned.length <= 5) return [cleaned, true, false];
    const noParens = trimmed.replace(/\s*\([^)]*\)/, "").trim();
    if (noParens.length <= 5) return [noParens, true, false];
  }

  // "Unit X", "APT X", "Apt. X", "Ph X", "PH X" → extract identifier
  const prefixMatch = trimmed.match(/^(?:unit|apt\.?|ph\.?)\s+(.+)$/i);
  if (prefixMatch) {
    const id = prefixMatch[1].trim();
    if (id.length <= 5) return [id, true, false];
  }

  return [raw, false, true];
}

/** Pretty-print XML without any cleaning */
export function prettyPrintXml(xmlText: string): string {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTagValue: false,
    textNodeName: "#text",
  });
  const doc = parser.parse(xmlText);
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    format: true,
    indentBy: "  ",
    suppressEmptyNode: false,
  });
  return `<?xml version="1.0" encoding="utf-8"?>\n` + builder.build(doc);
}
