import type { FreeTextCharacterCheck, RulesProfile } from "./types";

export type FreeTextCharacterFinding = {
  ruleId: string;
  message: string;
  suggestedFix: string;
};

const APOSTROPHES = new Set(["'", "\u2018", "\u2019", "\u02bc"]);
const QUOTATIONS = new Set(['"', "\u201c", "\u201d", "\u201e", "\u00ab", "\u00bb"]);
const ASCII_ALPHANUMERIC = /^[A-Za-z0-9]$/;
const WHITESPACE = /^\s$/u;

function accentReplacement(character: string): string | undefined {
  const decomposed = character.normalize("NFD");
  if (!/\p{M}/u.test(decomposed)) return undefined;
  const replacement = decomposed.replace(/\p{M}/gu, "");
  return /^[A-Za-z]$/.test(replacement) ? replacement : undefined;
}

function category(character: string, additionalAllowed = ""): FreeTextCharacterCheck | null {
  if (additionalAllowed.includes(character)) return null;
  if (APOSTROPHES.has(character)) return "apostrophe";
  if (QUOTATIONS.has(character)) return "quotation";
  if (accentReplacement(character) !== undefined) return "accent";
  if (ASCII_ALPHANUMERIC.test(character) || WHITESPACE.test(character) || ["-", "(", ")"].includes(character)) return null;
  return "other";
}

function protectedParentheticalIndexes(characters: string[]): Set<number> {
  const openings: number[] = [];
  const protectedIndexes = new Set<number>();
  for (let index = 0; index < characters.length; index++) {
    if (characters[index] === "(") {
      openings.push(index);
    } else if (characters[index] === ")" && openings.length > 0) {
      const opening = openings.pop()!;
      for (let protectedIndex = opening; protectedIndex <= index; protectedIndex++) {
        protectedIndexes.add(protectedIndex);
      }
    }
  }
  return protectedIndexes;
}

function enabledFields(rules: RulesProfile, check: FreeTextCharacterCheck): string[] {
  return rules.freeTextCharacterChecks?.[check] ?? [];
}

function normalizedValue(value: string, field: string, rules: RulesProfile): string {
  const enabled = new Set<FreeTextCharacterCheck>(
    (["apostrophe", "quotation", "accent", "other"] as const)
      .filter((check) => enabledFields(rules, check).includes(field)),
  );
  const additionalAllowed = rules.freeTextAllowedCharacters?.[field] ?? "";
  const characters = [...value.normalize("NFC")];
  const protectedIndexes = protectedParentheticalIndexes(characters);
  return characters.map((character, index) => {
    if (protectedIndexes.has(index)) return character;
    const check = category(character, additionalAllowed);
    if (!check || !enabled.has(check)) return character;
    return check === "accent" ? accentReplacement(character) ?? "" : "";
  }).join("");
}

const FINDING_COPY: Record<FreeTextCharacterCheck, { ruleId: string; description: string }> = {
  apostrophe: { ruleId: "FREE_TEXT_APOSTROPHE", description: "contains an apostrophe" },
  quotation: { ruleId: "FREE_TEXT_QUOTATION", description: "contains a quotation mark" },
  accent: { ruleId: "FREE_TEXT_ACCENT", description: "contains an accented letter" },
  other: { ruleId: "FREE_TEXT_SPECIAL_CHARACTER", description: "contains a character not allowed by its field policy" },
};

/** Return one independently configurable finding for each character category present. */
export function freeTextCharacterFindings(value: string, field: string, rules: RulesProfile): FreeTextCharacterFinding[] {
  const additionalAllowed = rules.freeTextAllowedCharacters?.[field] ?? "";
  const characters = [...value.normalize("NFC")];
  const protectedIndexes = protectedParentheticalIndexes(characters);
  const present = new Set(characters.map((character, index) => protectedIndexes.has(index) ? null : category(character, additionalAllowed)).filter((check): check is FreeTextCharacterCheck => check !== null));
  const suggestedFix = normalizedValue(value, field, rules);
  return (["apostrophe", "quotation", "accent", "other"] as const)
    .filter((check) => present.has(check) && enabledFields(rules, check).includes(field))
    .map((check) => ({
      ruleId: FINDING_COPY[check].ruleId,
      message: `${field} ${FINDING_COPY[check].description}; remove or replace it to improve downstream reporting and matching.`,
      suggestedFix,
    }));
}
