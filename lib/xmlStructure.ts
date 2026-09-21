import { XMLParser } from "fast-xml-parser";

const ONTARIO_NAMESPACE = "http://ontario.ca";
const XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";
type XmlNode = Record<string, unknown>;
const node = (value: unknown): XmlNode => value && typeof value === "object" ? value as XmlNode : {};

type NamespaceContext = Map<string, string>;

const CHILDREN: Record<string, readonly string[]> = {
  SchoolUpload: ["Metadata", "School"],
  Metadata: ["CreateDate", "CreateTime", "CreatedBy", "ContactPhone", "ContactEmail", "FullUpload", "SchoolBoard"],
  SchoolBoard: ["BoardNumber", "Name"],
  School: ["SchoolNumber", "Name", "Students"],
  Students: ["Student"],
  Student: ["OEN", "Grade", "Class", "Name", "AliasName", "Gender", "BirthDate", "Language", "CountryOfOrigin", "Guardian", "Address", "Phone"],
  Guardian: ["Name", "Relationship", "Phone"],
  Address: ["Unit", "StreetNumber", "StreetNumberSuffix", "StreetName", "StreetType", "StreetDirection", "RuralRoute", "PoBoxNumber", "City", "Province", "PostalCode"],
};

const REPEATED_CHILDREN = new Set(["School", "Student"]);

function splitQName(qName: string): { prefix: string; local: string } {
  const separator = qName.indexOf(":");
  return separator < 0 ? { prefix: "", local: qName } : { prefix: qName.slice(0, separator), local: qName.slice(separator + 1) };
}

function declarations(attributes: XmlNode, inherited: NamespaceContext): NamespaceContext {
  const context = new Map(inherited);
  for (const [rawName, rawValue] of Object.entries(attributes)) {
    const name = rawName.replace(/^@_/, "");
    if (name === "xmlns") context.set("", String(rawValue));
    else if (name.startsWith("xmlns:")) context.set(name.slice(6), String(rawValue));
  }
  return context;
}

function elementNamespace(qName: string, context: NamespaceContext): string {
  return context.get(splitQName(qName).prefix) ?? "";
}

function validateAttributes(local: string, attributes: XmlNode, context: NamespaceContext, path: string) {
  for (const rawName of Object.keys(attributes)) {
    const qName = rawName.replace(/^@_/, "");
    if (qName === "xmlns" || qName.startsWith("xmlns:")) continue;
    const { prefix, local: attributeLocal } = splitQName(qName);
    const namespace = prefix ? context.get(prefix) ?? "" : "";
    if (local === "SchoolUpload" && attributeLocal === "schemaLocation" && namespace === XSI_NAMESPACE) continue;
    if ((local === "Phone" || local === "ContactPhone") && !prefix && attributeLocal === "type") continue;
    throw new Error(`Unsupported attribute ${path}/@${qName}.`);
  }
}

function validateElement(qName: string, orderedChildren: unknown, rawAttributes: unknown, inherited: NamespaceContext, path: string, parentLocal?: string) {
  const attributes = node(rawAttributes);
  const context = declarations(attributes, inherited);
  const { local } = splitQName(qName);
  if (elementNamespace(qName, context) !== ONTARIO_NAMESPACE) throw new Error(`Unexpected namespace on ${path}; every supported STIX element must use "${ONTARIO_NAMESPACE}".`);
  validateAttributes(local, attributes, context, path);

  const allowed = local === "AliasName" || (local === "Name" && (parentLocal === "Student" || parentLocal === "Guardian"))
    ? ["First", "Middle", "Last"]
    : CHILDREN[local];
  const entries = Array.isArray(orderedChildren) ? orderedChildren as XmlNode[] : [];
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const [childQName, value] of Object.entries(entry)) {
      if (childQName === ":@" || childQName === "#comment" || childQName === "?xml") continue;
      if (childQName === "#text") {
        if (allowed && String(value).trim()) throw new Error(`Unsupported mixed text content at ${path}.`);
        continue;
      }
      const childLocal = splitQName(childQName).local;
      if (!allowed?.includes(childLocal)) throw new Error(`Unsupported element ${path}/${childQName}.`);
      const count = (counts.get(childLocal) ?? 0) + 1;
      counts.set(childLocal, count);
      const maximum = childLocal === "Guardian" ? 2 : REPEATED_CHILDREN.has(childLocal) ? Infinity : 1;
      if (count > maximum) throw new Error(`Unsupported cardinality at ${path}/${childLocal}; expected at most ${maximum}.`);
      validateElement(childQName, value, entry[":@"], context, `${path}/${childLocal}[${count}]`, local);
    }
  }
}

/** Reject unsupported XML structure before projecting values into the working model. */
export function assertSupportedXmlStructure(xml: string): void {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    commentPropName: "#comment",
    trimValues: false,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: true,
  });
  const document = parser.parse(xml) as XmlNode[];
  const roots = document.flatMap((entry) => Object.entries(entry)
    .filter(([key]) => ![":@", "?xml", "#comment", "#text"].includes(key))
    .map(([qName, value]) => ({ qName, value, attributes: entry[":@"] })));
  for (const entry of document) if (typeof entry["#text"] === "string" && entry["#text"].trim()) throw new Error("Unsupported text outside the root element.");
  if (roots.length !== 1 || splitQName(roots[0].qName).local !== "SchoolUpload") throw new Error("Expected exactly one root element named SchoolUpload.");
  validateElement(roots[0].qName, roots[0].value, roots[0].attributes, new Map(), "SchoolUpload");
}
