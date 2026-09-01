/**
 * Browser-native port of stix_cleaner.py
 * Uses fast-xml-parser v5 for XML parsing/building.
 * All processing is synchronous and in-memory.
 */

import { XMLParser, XMLBuilder } from "fast-xml-parser";
import type { CleanStats, Issue } from "./types";

const INVALID_AREA_CODES = new Set(["163", "081"]);

// ─── Phone Cleaning ──────────────────────────────────────────────────────────

export function cleanPhone(text: string): string {
  let digits = text.replace(/\D/g, "");

  if (digits.startsWith("1") && digits.length > 10) {
    digits = digits.slice(1);
  }

  if (digits.length < 10) return "";

  // Extension present?
  const extMatch = text.match(/x(\d{1,4})$/i);
  if (digits.length > 10 && extMatch) {
    const ext = extMatch[1];
    digits = digits.slice(0, 3) + "-" + digits.slice(3, 6) + "-" + digits.slice(6, 10) + "x" + ext;
    return digits;
  }

  if (digits.length > 10) {
    digits = digits.slice(0, 10);
  }

  const formatted = digits.slice(0, 3) + "-" + digits.slice(3, 6) + "-" + digits.slice(6, 10);
  const areaCode = digits.slice(0, 3);

  if (INVALID_AREA_CODES.has(areaCode)) return "";
  if (formatted === "519-000-0000") return "";

  return formatted;
}

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
  if (/^(lower un|lower ap|d lower|lower fl)/i.test(trimmed)) return ["LOWR", true, false];
  if (/^(upper(lev|un|ap|fl)|upperlev)/i.test(trimmed)) return ["UPPR", true, false];
  if (/^(main\s*flo|mainflo)/i.test(trimmed)) return ["MAIN", true, false];
  if (/^top\s*flo/i.test(trimmed)) return ["TOP", true, false];
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

// ─── XML Tree Walking ────────────────────────────────────────────────────────

interface XmlNode {
  [key: string]: unknown;
}

/** Recursively walk a parsed XML object, calling visitor for each node */
function walk(
  node: unknown,
  visitor: (tag: string, obj: XmlNode, key: string, parent: XmlNode) => void,
  _tag = "",
  _parent: XmlNode | null = null,
  _parentKey = ""
) {
  if (typeof node !== "object" || node === null) return;

  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, visitor, _tag, _parent, _parentKey);
    }
    return;
  }

  const obj = node as XmlNode;

  if (_parent && _parentKey) {
    visitor(_tag, obj, _parentKey, _parent);
  }

  for (const [key, value] of Object.entries(obj)) {
    if (!key.startsWith("#") && !key.startsWith("@")) {
      walk(value, visitor, key, obj, key);
    }
  }
}

// ─── Flat element list (to mirror Python's root.iter()) ──────────────────────

interface FlatElement {
  tag: string;
  parent: XmlNode;
  key: string; // key in parent that holds this element
  value: XmlNode | string;
  /** path context for school resolution */
  ancestors: Array<{ tag: string; obj: XmlNode }>;
}

function flattenTree(root: XmlNode): FlatElement[] {
  const results: FlatElement[] = [];

  function recurse(
    node: unknown,
    tag: string,
    parent: XmlNode,
    key: string,
    ancestors: Array<{ tag: string; obj: XmlNode }>
  ) {
    if (node === null || node === undefined) return;

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        recurse(node[i], tag, parent, key, ancestors);
      }
      return;
    }

    if (typeof node === "object") {
      const obj = node as XmlNode;
      results.push({ tag, parent, key, value: obj, ancestors });
      const newAncestors = [...ancestors, { tag, obj }];
      for (const [k, v] of Object.entries(obj)) {
        if (!k.startsWith("#") && !k.startsWith("@")) {
          recurse(v, k, obj, k, newAncestors);
        }
      }
    } else {
      // leaf text node — represented as a primitive value in the parent
      // already handled via parent["#text"] or direct string value
    }
  }

  for (const [k, v] of Object.entries(root)) {
    if (!k.startsWith("#") && !k.startsWith("@")) {
      recurse(v, k, root, k, []);
    }
  }

  return results;
}

// ─── Core clean pass ────────────────────────────────────────────────────────

function getTextValue(node: XmlNode | string | unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (node && typeof node === "object") {
    const obj = node as XmlNode;
    if (typeof obj["#text"] === "string") return obj["#text"];
    if (typeof obj["#text"] === "number") return String(obj["#text"]);
  }
  return "";
}

function setTextValue(parent: XmlNode, key: string, value: string) {
  const existing = parent[key];
  if (typeof existing === "object" && existing !== null && !Array.isArray(existing)) {
    (existing as XmlNode)["#text"] = value;
  } else {
    parent[key] = value;
  }
}

function findSchoolInfo(ancestors: Array<{ tag: string; obj: XmlNode }>): [string, string] {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const { tag, obj } = ancestors[i];
    const localTag = tag.split(":").pop() ?? tag;
    if (localTag === "School") {
      const nameNode = obj["ns1:Name"] ?? obj["Name"] ?? "";
      const numNode = obj["ns1:SchoolNumber"] ?? obj["SchoolNumber"] ?? "";
      return [getTextValue(nameNode), getTextValue(numNode)];
    }
  }
  return ["", ""];
}

function findAddressContext(
  ancestors: Array<{ tag: string; obj: XmlNode }>
): Record<string, string> {
  // the address node is the direct parent (Address contains Unit, StreetNumber, etc.)
  if (ancestors.length === 0) return {};
  const addrNode = ancestors[ancestors.length - 1].obj;
  return {
    street_number: getTextValue(addrNode["ns1:StreetNumber"] ?? addrNode["StreetNumber"] ?? ""),
    street_name: getTextValue(addrNode["ns1:StreetName"] ?? addrNode["StreetName"] ?? ""),
  };
}

export interface CleanResult {
  cleanedXml: string;
  issues: Issue[];
  stats: CleanStats;
}

export function cleanXml(xmlText: string): CleanResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTagValue: false,
    textNodeName: "#text",
    isArray: (_name, _jpath, _isLeafNode, isAttribute) => {
      if (isAttribute) return false;
      // always treat School and Student as arrays
      return false;
    },
  });

  const doc = parser.parse(xmlText) as XmlNode;

  const stats: CleanStats = {
    phones_cleaned: 0,
    phones_blank: 0,
    units_standardized: 0,
    units_review: 0,
    street_review: 0,
  };

  const issues: Issue[] = [];
  let streetCount = 0;
  let unitCount = 0;

  // We need a flat list that we can index by position (mirrors Python's root.iter())
  // Walk the full tree manually with ancestor tracking
  function processNode(
    node: unknown,
    tag: string,
    parentObj: XmlNode,
    ancestors: Array<{ tag: string; obj: XmlNode }>
  ) {
    if (node === null || node === undefined) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        processNode(item, tag, parentObj, ancestors);
      }
      return;
    }

    const localTag = tag.split(":").pop() ?? tag;

    if (typeof node === "string" || typeof node === "number") {
      const text = String(node);
      // Phone
      if (localTag.includes("Phone") && text) {
        const cleaned = cleanPhone(text);
        if (cleaned !== text) {
          stats.phones_cleaned++;
          parentObj[tag] = cleaned;
          if (cleaned === "") stats.phones_blank++;
        }
      }
      return;
    }

    if (typeof node === "object") {
      const obj = node as XmlNode;
      const text = getTextValue(obj);
      const newAncestors = [...ancestors, { tag, obj }];

      // Phone node (object form)
      if (localTag.includes("Phone") && text) {
        const cleaned = cleanPhone(text);
        if (cleaned !== text) {
          stats.phones_cleaned++;
          setTextValue(obj, "#text", cleaned);
          if (cleaned === "") stats.phones_blank++;
        }
      }

      // StreetNumber
      if (localTag === "StreetNumber" && text && text.length > 6) {
        streetCount++;
        const [schoolName, schoolNumber] = findSchoolInfo(ancestors);
        const ctx = findAddressContext(ancestors);
        issues.push({
          id: `street_${streetCount}`,
          type: "street_number",
          index: streetCount - 1,
          current: text,
          street_name: ctx.street_name,
          school_name: schoolName,
          school_number: schoolNumber,
        });
        stats.street_review++;
      }

      // Unit
      if (localTag === "Unit" && text) {
        const [standardized, changed, needsReview] = standardizeUnit(text);
        if (changed) {
          setTextValue(obj, "#text", standardized);
          stats.units_standardized++;
        } else if (needsReview) {
          unitCount++;
          const [schoolName, schoolNumber] = findSchoolInfo(ancestors);
          const ctx = findAddressContext(ancestors);
          issues.push({
            id: `unit_${unitCount}`,
            type: "unit",
            index: unitCount - 1,
            current: text,
            street_number: ctx.street_number,
            street_name: ctx.street_name,
            school_name: schoolName,
            school_number: schoolNumber,
          });
          stats.units_review++;
        }
      }

      // Recurse into children
      for (const [k, v] of Object.entries(obj)) {
        if (!k.startsWith("#") && !k.startsWith("@")) {
          processNode(v, k, obj, newAncestors);
        }
      }
    }
  }

  for (const [k, v] of Object.entries(doc)) {
    if (!k.startsWith("#") && !k.startsWith("@")) {
      processNode(v, k, doc, []);
    }
  }

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    format: true,
    indentBy: "  ",
    suppressEmptyNode: false,
  });

  const cleanedXml = `<?xml version="1.0" encoding="utf-8"?>\n` + builder.build(doc);

  return { cleanedXml, issues, stats };
}

/** Apply manual review updates to already-cleaned XML */
export function applyReviewUpdates(
  xmlText: string,
  updates: Record<string, string>
): string {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTagValue: false,
    textNodeName: "#text",
  });

  const doc = parser.parse(xmlText) as XmlNode;

  // We need to match each issue update back to the XML node.
  // The update keys are: `street_${n}_number`, `unit_${n}_unit`
  // We'll do a second walk applying updates as we find the relevant tags.
  // Since the issue index tracks order of occurrence, we count occurrences.

  const streetNumberUpdates: string[] = [];
  const unitUpdates: string[] = [];

  for (const [key, val] of Object.entries(updates)) {
    const streetMatch = key.match(/^street_(\d+)_number$/);
    if (streetMatch) {
      const idx = parseInt(streetMatch[1]) - 1;
      streetNumberUpdates[idx] = val;
    }
    const unitMatch = key.match(/^unit_(\d+)_unit$/);
    if (unitMatch) {
      const idx = parseInt(unitMatch[1]) - 1;
      unitUpdates[idx] = val;
    }
  }

  let streetSeen = 0;
  let unitSeen = 0;

  function applyNode(node: unknown, tag: string) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) applyNode(item, tag);
      return;
    }

    const obj = node as XmlNode;
    const localTag = tag.split(":").pop() ?? tag;
    const text = getTextValue(obj);

    if (localTag === "StreetNumber" && text && text.length > 6) {
      const replacement = streetNumberUpdates[streetSeen];
      streetSeen++;
      if (replacement !== undefined) {
        setTextValue(obj, "#text", replacement);
      }
    }

    if (localTag === "Unit" && text) {
      const [, , needsReview] = standardizeUnit(text);
      if (needsReview) {
        const replacement = unitUpdates[unitSeen];
        unitSeen++;
        if (replacement !== undefined) {
          setTextValue(obj, "#text", replacement);
        }
      }
    }

    for (const [k, v] of Object.entries(obj)) {
      if (!k.startsWith("#") && !k.startsWith("@")) {
        applyNode(v, k);
      }
    }
  }

  for (const [k, v] of Object.entries(doc)) {
    if (!k.startsWith("#") && !k.startsWith("@")) {
      applyNode(v, k);
    }
  }

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
