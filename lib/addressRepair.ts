import type { AddressRepairProposal } from "./types";

export const ADDRESS_REPAIR_FIELDS = [
  "Unit", "StreetNumber", "StreetNumberSuffix", "StreetName", "StreetType",
  "StreetDirection", "RuralRoute", "PoBoxNumber", "City", "Province", "PostalCode",
] as const;

const NON_STREET_NAME_WORDS = /^(?:unit|apt|apartment|suite|ste|basement|bsmt|floor|fl|upper|lower|box|po|p\.o\.|rr|rural\s+route|rear|front)\b/i;

function comparable(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

const COMMON_STREET_TYPES: Record<string, string> = {
  ST: "ST", STREET: "ST",
  RD: "RD", ROAD: "RD",
  AV: "AVE", AVE: "AVE", AVENUE: "AVE",
  CRES: "CRES", CRESCENT: "CRES",
  DR: "DR", DRIVE: "DR",
  BLVD: "BLVD", BOULEVARD: "BLVD",
  CRT: "CRT", CT: "CRT", COURT: "CRT",
  LANE: "LANE", LN: "LANE",
  HWY: "HWY", HIGHWAY: "HWY",
  PL: "PL", PLACE: "PL",
  PKY: "PKY", PARKWAY: "PKY",
  TERR: "TERR", TERRACE: "TERR",
  TRAIL: "TRAIL", TRL: "TRAIL",
  CIR: "CIR", CIRCLE: "CIR",
  WAY: "WAY",
};

const COMMON_STREET_DIRECTIONS: Record<string, string> = {
  N: "N", NORTH: "N",
  S: "S", SOUTH: "S",
  E: "E", EAST: "E",
  W: "W", WEST: "W",
  NE: "NE", NORTHEAST: "NE", "NORTH EAST": "NE",
  NW: "NW", NORTHWEST: "NW", "NORTH WEST": "NW",
  SE: "SE", SOUTHEAST: "SE", "SOUTH EAST": "SE",
  SW: "SW", SOUTHWEST: "SW", "SOUTH WEST": "SW",
};

function suffixKey(value: string): string {
  return value.toUpperCase().replace(/[.,]/g, "").trim();
}

/**
 * Detect a common street type, optionally followed by a direction, at the end
 * of StreetName. The proposal is safe only when populated destination fields
 * already agree; conflicting address data is surfaced without guessing.
 */
export function analyzeStreetNameSuffix(
  fields: Record<string, string>,
  allowedStreetTypes: readonly string[],
  allowedStreetDirections: readonly string[],
  proposalId = "address-street-name-suffix",
): AddressRepairProposal | undefined {
  const rawName = (fields.StreetName ?? "").trim();
  const words = rawName.split(/\s+/);
  if (words.length < 2) return undefined;

  let direction: string | undefined;
  let directionWordCount = 0;
  for (const count of [2, 1]) {
    if (words.length <= count) continue;
    const candidate = suffixKey(words.slice(-count).join(" "));
    const canonical = COMMON_STREET_DIRECTIONS[candidate];
    if (canonical && allowedStreetDirections.includes(canonical)) {
      direction = canonical;
      directionWordCount = count;
      break;
    }
  }

  const typeIndex = words.length - directionWordCount - 1;
  if (typeIndex < 1) return undefined;
  const streetType = COMMON_STREET_TYPES[suffixKey(words[typeIndex])];
  if (!streetType || !allowedStreetTypes.includes(streetType)) return undefined;

  const streetName = words.slice(0, typeIndex).join(" ").trim();
  if (!streetName || !/[A-Za-z]/.test(streetName)) return undefined;

  const currentType = (fields.StreetType ?? "").trim();
  const currentDirection = (fields.StreetDirection ?? "").trim();
  const typeConflict = currentType !== "" && suffixKey(currentType) !== streetType;
  const directionConflict = direction !== undefined
    && currentDirection !== ""
    && suffixKey(currentDirection) !== direction;

  if (typeConflict || directionConflict) {
    const conflicts = [
      typeConflict ? "StreetType is already “" + currentType + "”" : "",
      directionConflict ? "StreetDirection is already “" + currentDirection + "”" : "",
    ].filter(Boolean).join("; ");
    return {
      kind: "address",
      id: proposalId,
      confidence: "review",
      title: "Review a street type found in the street name",
      explanation: "“" + rawName + "” ends with street type “" + streetType + "”"
        + (direction ? " and direction “" + direction + "”" : "")
        + ", but " + conflicts + ". Review the complete address before applying changes.",
      changes: [],
    };
  }

  const changes: AddressRepairProposal["changes"] = [
    { field: "StreetName", currentValue: fields.StreetName ?? "", proposedValue: streetName },
  ];
  if (!currentType) changes.push({ field: "StreetType", currentValue: fields.StreetType ?? "", proposedValue: streetType });
  if (direction && !currentDirection) {
    changes.push({ field: "StreetDirection", currentValue: fields.StreetDirection ?? "", proposedValue: direction });
  }

  return {
    kind: "address",
    id: proposalId,
    confidence: "safe",
    title: "Move the street type out of the street name",
    explanation: "“" + rawName + "” can be separated into street name “" + streetName
      + "”, street type “" + streetType + "”"
      + (direction ? ", and direction “" + direction + "”" : "") + ".",
    changes,
  };
}

/**
 * Detect a street number with a street-name fragment accidentally pasted into it.
 * Confidence distinguishes unambiguous splits from suggestions with field conflicts.
 */
export function analyzeStreetNumberRepair(
  fields: Record<string, string>,
  maxStreetNumberLength: number,
  proposalId = "address-street-number",
): AddressRepairProposal | undefined {
  const raw = (fields.StreetNumber ?? "").trim();
  const match = raw.match(/^(\d+)([A-Za-z])?[\s,–—-]+(.+)$/);
  if (!match) return undefined;

  const [, number, suffix = "", remainderRaw] = match;
  const remainder = remainderRaw.trim();
  if (
    number.length > maxStreetNumberLength ||
    !/[A-Za-z]/.test(remainder) ||
    NON_STREET_NAME_WORDS.test(remainder)
  ) return undefined;

  const currentName = (fields.StreetName ?? "").trim();
  const currentSuffix = (fields.StreetNumberSuffix ?? "").trim();
  const sameName = currentName !== "" && comparable(currentName) === comparable(remainder);
  const sameSuffix = suffix === "" || currentSuffix === "" || comparable(currentSuffix) === comparable(suffix);
  const hasConflict = (currentName !== "" && !sameName) || !sameSuffix;

  const changes: AddressRepairProposal["changes"] = [
    { field: "StreetNumber", currentValue: fields.StreetNumber ?? "", proposedValue: number },
  ];
  if (suffix && !currentSuffix) {
    changes.push({ field: "StreetNumberSuffix", currentValue: fields.StreetNumberSuffix ?? "", proposedValue: suffix.toUpperCase() });
  }
  if (!currentName) {
    changes.push({ field: "StreetName", currentValue: fields.StreetName ?? "", proposedValue: remainder });
  }

  if (hasConflict) {
    const conflicts = [
      currentName && !sameName ? `StreetName is already “${currentName}”` : "",
      suffix && currentSuffix && !sameSuffix ? `StreetNumberSuffix is already “${currentSuffix}”` : "",
    ].filter(Boolean).join("; ");
    return {
      kind: "address",
      id: proposalId,
      confidence: "review",
      title: "Review a combined street number and name",
      explanation: `“${raw}” looks like street number “${number}” plus street name “${remainder}”, but ${conflicts}. Review the complete address before applying changes.`,
      changes,
    };
  }

  return {
    kind: "address",
    id: proposalId,
    confidence: "safe",
    title: sameName ? "Remove the duplicated street name" : "Split street number and street name",
    explanation: sameName
      ? `StreetName already contains “${currentName}”, so StreetNumber can safely change from “${raw}” to “${number}”.`
      : `“${raw}” can be separated into street number “${number}”${suffix ? `, suffix “${suffix.toUpperCase()}”` : ""}, and street name “${remainder}”.`,
    changes,
  };
}

/**
 * Detect a street number and name that landed in Unit instead, e.g. "437 Pine".
 * Moving data out of Unit into two other fields is a bigger structural change
 * than a same-field split, so this is never proposed as "safe" — always review.
 */
export function analyzeUnitOverflow(
  fields: Record<string, string>,
  maxStreetNumberLength: number,
  proposalId = "address-unit-overflow",
): AddressRepairProposal | undefined {
  const raw = (fields.Unit ?? "").trim();
  const match = raw.match(/^(\d+)[\s,–—-]+(.+)$/);
  if (!match) return undefined;

  const [, number, remainderRaw] = match;
  const remainder = remainderRaw.trim();
  if (
    number.length > maxStreetNumberLength ||
    !/[A-Za-z]/.test(remainder) ||
    NON_STREET_NAME_WORDS.test(remainder)
  ) return undefined;

  const currentNumber = (fields.StreetNumber ?? "").trim();
  const currentName = (fields.StreetName ?? "").trim();
  const sameNumber = currentNumber !== "" && currentNumber === number;
  const sameName = currentName !== "" && comparable(currentName) === comparable(remainder);
  const conflicts = [
    currentNumber && !sameNumber ? `StreetNumber is already “${currentNumber}”` : "",
    currentName && !sameName ? `StreetName is already “${currentName}”` : "",
  ].filter(Boolean).join("; ");

  // A conflict means we can't tell whether "437" was a genuine unit number or just
  // duplicated street data — propose nothing rather than guess and silently drop it.
  const changes: AddressRepairProposal["changes"] = conflicts ? [] : [
    { field: "Unit", currentValue: fields.Unit ?? "", proposedValue: "" },
    ...(currentNumber === "" ? [{ field: "StreetNumber", currentValue: fields.StreetNumber ?? "", proposedValue: number }] : []),
    ...(currentName === "" ? [{ field: "StreetName", currentValue: fields.StreetName ?? "", proposedValue: remainder }] : []),
  ];

  return {
    kind: "address",
    id: proposalId,
    confidence: "review",
    title: conflicts ? "Review a street number and name found in Unit" : "Move a street number and name out of Unit",
    explanation: conflicts
      ? `“${raw}” in Unit looks like street number “${number}” plus street name “${remainder}”, but ${conflicts}. Review the complete address before applying changes.`
      : `“${raw}” in Unit looks like street number “${number}” plus street name “${remainder}”, which likely belongs in StreetNumber/StreetName instead. Review the complete address before applying changes.`,
    changes,
  };
}

/**
 * Detect a small unit number fused to a street number with a bare dash, e.g. "4-51".
 * Deliberately narrow (unit 1-2 digits, street number 2-6 digits, no surrounding
 * spaces) so it never overlaps with genuinely ambiguous ranges like "302-380" or
 * "13 - 142" — those are left alone rather than guessed.
 */
export function analyzeStreetNumberUnitPrefix(
  fields: Record<string, string>,
  proposalId = "address-street-number-unit-prefix",
): AddressRepairProposal | undefined {
  const raw = (fields.StreetNumber ?? "").trim();
  const match = raw.match(/^(\d{1,2})-(\d{2,6})$/);
  if (!match) return undefined;

  const [, unit, streetNumber] = match;
  const currentUnit = (fields.Unit ?? "").trim();
  const conflict = currentUnit !== "" && currentUnit !== unit;

  const changes: AddressRepairProposal["changes"] = [
    { field: "StreetNumber", currentValue: fields.StreetNumber ?? "", proposedValue: streetNumber },
  ];
  if (!conflict) changes.push({ field: "Unit", currentValue: fields.Unit ?? "", proposedValue: unit });

  return {
    kind: "address",
    id: proposalId,
    confidence: "review",
    title: "Review a possible unit prefix on the street number",
    explanation: conflict
      ? `“${raw}” looks like unit “${unit}” plus street number “${streetNumber}”, but Unit is already “${currentUnit}”. Review the complete address before applying changes.`
      : `“${raw}” looks like unit “${unit}” plus street number “${streetNumber}”. Confirm before applying — this shape can also be a legitimate combined street number.`,
    changes,
  };
}

const PO_BOX_PATTERN = /^(?:P\.?\s*O\.?\s*BOX|BOX)\s*#?\s*(\w+)$/i;
const PO_BOX_PREFIX = /^(?:P\.?\s*O\.?\s*BOX|BOX)\b/i;
const RURAL_ROUTE_PATTERN = /^(?:R\.?\s*R\.?|RURAL\s+ROUTE)\s*#?\s*(\d+)$/i;
const RURAL_ROUTE_PREFIX = /^(?:R\.?\s*R\.?|RURAL\s+ROUTE)\b/i;

export type AlternateDeliveryRepairProposal = AddressRepairProposal & {
  deliveryType: "poBox" | "ruralRoute";
  sourceField: "StreetName" | "StreetNumber";
};

function ruralRouteNumber(value: string): string | undefined {
  const match = value.trim().match(RURAL_ROUTE_PATTERN);
  return match?.[1] === undefined ? undefined : String(Number(match[1]));
}

/**
 * Detect PO Box / rural-route delivery text typed into a street field instead
 * of PoBoxNumber/RuralRoute. A clean match proposes moving it for confirmation
 * because clearing a street field is a bigger structural change. A
 * recognizable-but-unparsable prefix is surfaced as a manual finding with no
 * guessed value.
 */
export function analyzeAlternateDeliveryInStreetFields(
  fields: Record<string, string>,
  proposalId = "address-alternate-delivery",
): AlternateDeliveryRepairProposal | undefined {
  for (const field of ["StreetName", "StreetNumber"] as const) {
    const raw = (fields[field] ?? "").trim();
    if (!raw) continue;

    const poMatch = raw.match(PO_BOX_PATTERN);
    if (poMatch) {
      const boxId = poMatch[1];
      const currentBox = (fields.PoBoxNumber ?? "").trim();
      const conflict = currentBox !== "" && currentBox !== boxId;
      return {
        kind: "address",
        deliveryType: "poBox",
        sourceField: field,
        id: proposalId,
        confidence: "review",
        title: conflict ? "Review PO Box text found in the street address" : "Move PO Box text out of the street address",
        explanation: conflict
          ? `“${raw}” in ${field} looks like a PO Box, but PoBoxNumber is already “${currentBox}”. Review the complete address before applying changes.`
          : `“${raw}” in ${field} looks like a PO Box and can be moved to PoBoxNumber (proposed “${boxId}”).`,
        changes: conflict ? [] : [
          { field, currentValue: fields[field] ?? "", proposedValue: "" },
          { field: "PoBoxNumber", currentValue: fields.PoBoxNumber ?? "", proposedValue: boxId },
        ],
      };
    }
    if (PO_BOX_PREFIX.test(raw)) {
      return {
        kind: "address", deliveryType: "poBox", sourceField: field,
        id: proposalId, confidence: "manual",
        title: "Review possible PO Box text in the street address",
        explanation: `“${raw}” in ${field} looks like it starts with a PO Box reference, but the box number couldn't be parsed. Review the complete address and edit the fields directly.`,
        changes: [],
      };
    }

    const routeNumber = ruralRouteNumber(raw);
    if (routeNumber) {
      const proposedRoute = `RR ${routeNumber}`;
      const currentRoute = (fields.RuralRoute ?? "").trim();
      const conflict = currentRoute !== ""
        && ruralRouteNumber(currentRoute) !== routeNumber;
      return {
        kind: "address",
        deliveryType: "ruralRoute",
        sourceField: field,
        id: proposalId,
        confidence: "review",
        title: conflict ? "Review rural route text found in the street address" : "Move rural route text out of the street address",
        explanation: conflict
          ? `“${raw}” in ${field} looks like a rural route, but RuralRoute is already “${currentRoute}”. Review the complete address before applying changes.`
          : `“${raw}” in ${field} looks like a rural route and can be moved to RuralRoute (proposed “${proposedRoute}”).`,
        changes: conflict ? [] : [
          { field, currentValue: fields[field] ?? "", proposedValue: "" },
          { field: "RuralRoute", currentValue: fields.RuralRoute ?? "", proposedValue: proposedRoute },
        ],
      };
    }
    if (RURAL_ROUTE_PREFIX.test(raw)) {
      return {
        kind: "address", deliveryType: "ruralRoute", sourceField: field,
        id: proposalId, confidence: "manual",
        title: "Review possible rural route text in the street address",
        explanation: `“${raw}” in ${field} looks like it starts with a rural route reference, but the route number couldn't be parsed. Review the complete address and edit the fields directly.`,
        changes: [],
      };
    }
  }
  return undefined;
}
