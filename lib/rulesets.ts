/**
 * Custom ruleset persistence and validation.
 *
 * Rulesets are stored in localStorage so they survive page refreshes and can
 * be shared between the main Validate workflow and the Reports page.
 * All localStorage access is guarded against SSR environments.
 */

import type { CustomRuleset, RulesProfile, CleaningProfile } from "./types";
import defaultRulesJson from "../config/rules.stix.default.json";

/** The built-in ruleset, cast to the explicit (widened) RulesProfile type. */
export const defaultRules: RulesProfile = defaultRulesJson as RulesProfile;

/** Sentinel ID for the built-in ruleset — never written to localStorage. */
export const BUILTIN_ID = "builtin" as const;

const LS_RULESETS_KEY = "panoready_rulesets_v1";
const LS_ACTIVE_KEY = "panoready_active_ruleset_v1";

// ── localStorage helpers ──────────────────────────────────────────────────────

function lsGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function lsSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, value); } catch { /* quota exceeded */ }
}

// ── Ruleset CRUD ──────────────────────────────────────────────────────────────

export function listCustomRulesets(): CustomRuleset[] {
  const raw = lsGet(LS_RULESETS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as CustomRuleset[]; } catch { return []; }
}

export function saveCustomRuleset(rs: CustomRuleset): void {
  const rest = listCustomRulesets().filter((r) => r.id !== rs.id);
  lsSet(LS_RULESETS_KEY, JSON.stringify([...rest, rs]));
}

export function deleteCustomRuleset(id: string): void {
  lsSet(LS_RULESETS_KEY, JSON.stringify(listCustomRulesets().filter((r) => r.id !== id)));
  if (getActiveRulesetId() === id) setActiveRulesetId(BUILTIN_ID);
}

export function getActiveRulesetId(): string {
  return lsGet(LS_ACTIVE_KEY) ?? BUILTIN_ID;
}

export function setActiveRulesetId(id: string): void {
  lsSet(LS_ACTIVE_KEY, id);
}

/**
 * Return the RulesProfile for the currently active ruleset.
 * Falls back to the built-in default if the stored ID is unknown.
 */
export function getActiveRules(): RulesProfile {
  const id = getActiveRulesetId();
  if (id === BUILTIN_ID) return defaultRules;
  const found = listCustomRulesets().find((r) => r.id === id);
  return found?.rules ?? defaultRules;
}

/**
 * Return the CleaningProfile for the currently active ruleset, or null if the
 * active ruleset is built-in or has no cleaning configured.
 */
export function getActiveCleaning(): CleaningProfile | null {
  const id = getActiveRulesetId();
  if (id === BUILTIN_ID) return null;
  const found = listCustomRulesets().find((r) => r.id === id);
  return found?.cleaning ?? null;
}

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Parse and validate a JSON string as a CustomRuleset.
 * Throws a descriptive Error if the JSON is malformed or the schema is invalid.
 */
export function importRulesetFromJson(jsonText: string): CustomRuleset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("File is not valid JSON.");
  }
  return validateRulesetSchema(parsed);
}

/**
 * Validate an unknown value against the CustomRuleset schema.
 * Throws with a human-readable message on the first problem found.
 */
export function validateRulesetSchema(raw: unknown): CustomRuleset {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Ruleset must be a JSON object.");
  }
  const obj = raw as Record<string, unknown>;

  requireString(obj, "id");
  requireString(obj, "name");
  requireString(obj, "createdAt");
  if ("description" in obj && obj.description !== undefined && typeof obj.description !== "string") {
    throw new Error("'description' must be a string.");
  }
  if (typeof obj.rules !== "object" || obj.rules === null || Array.isArray(obj.rules)) {
    throw new Error("'rules' must be an object.");
  }

  const r = obj.rules as Record<string, unknown>;
  requireStringArray(r, "requiredFields");
  requireStringArray(r, "allowedGradeValues");
  requireStringArray(r, "allowedGenderValues");
  requireStringArray(r, "allowedProvinceValues");
  requireStringArray(r, "allowedLanguageValues");
  requireStringArray(r, "allowedCountryValues");
  requireStringArray(r, "allowedStreetTypeValues");
  requireStringArray(r, "allowedRelationshipValues");
  requireStringArray(r, "allowedPhoneTypeValues");
  requireStringArray(r, "allowedStreetDirectionValues");
  requireStringArray(r, "allowedFullLoadTypeValues");
  requireStringArray(r, "dateFields");
  requireRecordOf(r, "fieldLengths", "number");
  requireString(r, "postalCodePattern");
  requireRecordOf(r, "gradeAliases", "string");
  requireRecordOf(r, "genderAliases", "string");

  try {
    new RegExp(r.postalCodePattern as string);
  } catch {
    throw new Error(
      `'postalCodePattern' is not a valid regular expression: "${r.postalCodePattern}"`
    );
  }

  if (typeof r.phoneConfig !== "object" || r.phoneConfig === null || Array.isArray(r.phoneConfig)) {
    throw new Error("'rules.phoneConfig' must be an object.");
  }
  const phoneConfig = r.phoneConfig as Record<string, unknown>;
  requireStringArray(phoneConfig, "placeholderNumbers");
  if (
    "canadianAreaCodeCheck" in phoneConfig &&
    phoneConfig.canadianAreaCodeCheck !== undefined &&
    !["off", "info", "warning"].includes(String(phoneConfig.canadianAreaCodeCheck))
  ) {
    throw new Error(
      "'rules.phoneConfig.canadianAreaCodeCheck' must be 'off', 'info', or 'warning'."
    );
  }

  if (
    typeof r.duplicateDetection !== "object" ||
    r.duplicateDetection === null ||
    Array.isArray(r.duplicateDetection)
  ) {
    throw new Error("'rules.duplicateDetection' must be an object.");
  }
  const dd = r.duplicateDetection as Record<string, unknown>;
  if (typeof dd.checkOen !== "boolean") {
    throw new Error("'rules.duplicateDetection.checkOen' must be a boolean.");
  }
  if (typeof dd.checkNameDobSchool !== "boolean") {
    throw new Error("'rules.duplicateDetection.checkNameDobSchool' must be a boolean.");
  }
  if ("freeTextCharacterChecks" in r && r.freeTextCharacterChecks !== undefined) {
    if (
      typeof r.freeTextCharacterChecks !== "object" ||
      r.freeTextCharacterChecks === null ||
      Array.isArray(r.freeTextCharacterChecks)
    ) {
      throw new Error("'rules.freeTextCharacterChecks' must be an object.");
    }
    const checks = r.freeTextCharacterChecks as Record<string, unknown>;
    const knownChecks = new Set(["apostrophe", "quotation", "accent", "other"]);
    for (const [check, fields] of Object.entries(checks)) {
      if (!knownChecks.has(check)) throw new Error(`Unknown free-text character check '${check}'.`);
      if (!Array.isArray(fields) || !fields.every((field) => typeof field === "string")) {
        throw new Error(`'rules.freeTextCharacterChecks.${check}' must be an array of strings.`);
      }
    }
  }
  if ("freeTextAllowedCharacters" in r && r.freeTextAllowedCharacters !== undefined) {
    requireRecordOf(r, "freeTextAllowedCharacters", "string");
  }

  // Collects extra warnings from cleaning validation, merged with rules warnings below
  const extraWarnings: string[] = [];

  // ── Validate optional cleaning profile ────────────────────────────────────
  if ("cleaning" in obj && obj.cleaning !== undefined) {
    if (typeof obj.cleaning !== "object" || obj.cleaning === null || Array.isArray(obj.cleaning)) {
      throw new Error("'cleaning' must be an object.");
    }
    const c = obj.cleaning as Record<string, unknown>;

    if (!Array.isArray(c.enabledFields) || !(c.enabledFields as unknown[]).every((v) => typeof v === "string")) {
      throw new Error("'cleaning.enabledFields' must be an array of strings.");
    }

    if (typeof c.mappings !== "object" || c.mappings === null || Array.isArray(c.mappings)) {
      throw new Error("'cleaning.mappings' must be an object.");
    }
    for (const [fieldName, list] of Object.entries(c.mappings as Record<string, unknown>)) {
      if (!Array.isArray(list)) {
        throw new Error(`'cleaning.mappings.${fieldName}' must be an array.`);
      }
      for (let i = 0; i < (list as unknown[]).length; i++) {
        const entry = (list as unknown[])[i];
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
          throw new Error(`'cleaning.mappings.${fieldName}[${i}]' must be an object.`);
        }
        const e = entry as Record<string, unknown>;
        if (typeof e.raw !== "string") throw new Error(`'cleaning.mappings.${fieldName}[${i}].raw' must be a string.`);
        if (typeof e.canonical !== "string") throw new Error(`'cleaning.mappings.${fieldName}[${i}].canonical' must be a string.`);
        if ("matchCase" in e && e.matchCase !== undefined && typeof e.matchCase !== "boolean") {
          throw new Error(`'cleaning.mappings.${fieldName}[${i}].matchCase' must be a boolean.`);
        }
      }
    }

    // Collect warnings for unknown keys inside cleaning (merged below)
    const knownCleaningKeys = new Set(["enabledFields", "mappings"]);
    extraWarnings.push(
      ...Object.keys(c)
        .filter((k) => !knownCleaningKeys.has(k))
        .map((k) => `Unknown field in cleaning: '${k}' — will be ignored`)
    );
  }

  const knownRulesKeys = new Set([
    "requiredFields", "allowedGradeValues", "allowedGenderValues", "allowedProvinceValues",
    "allowedLanguageValues", "allowedCountryValues", "allowedStreetTypeValues",
    "allowedRelationshipValues", "allowedPhoneTypeValues", "allowedStreetDirectionValues",
    "allowedFullLoadTypeValues", "dateFields", "fieldLengths", "postalCodePattern",
    "gradeAliases", "genderAliases", "phoneConfig", "duplicateDetection", "freeTextCharacterChecks", "freeTextAllowedCharacters",
  ]);
  const unknownKeys = Object.keys(r).filter((k) => !knownRulesKeys.has(k));
  const allWarnings: string[] = [
    ...(unknownKeys.length > 0 ? unknownKeys.map((k) => `Unknown field in rules: '${k}' — will be ignored`) : []),
    ...extraWarnings,
  ];
  const warnings: string[] | undefined = allWarnings.length > 0 ? allWarnings : undefined;

  const result = obj as unknown as CustomRuleset;
  if (warnings) result.warnings = warnings;
  return result;
}

// ── Schema guard helpers ──────────────────────────────────────────────────────

function requireString(obj: Record<string, unknown>, key: string): void {
  if (typeof obj[key] !== "string" || (obj[key] as string).trim() === "") {
    throw new Error(`'${key}' must be a non-empty string.`);
  }
}

function requireStringArray(obj: Record<string, unknown>, key: string): void {
  if (
    !Array.isArray(obj[key]) ||
    !(obj[key] as unknown[]).every((v) => typeof v === "string")
  ) {
    throw new Error(`'${key}' must be an array of strings.`);
  }
}

function requireRecordOf(
  obj: Record<string, unknown>,
  key: string,
  valueType: "string" | "number"
): void {
  if (typeof obj[key] !== "object" || obj[key] === null || Array.isArray(obj[key])) {
    throw new Error(`'${key}' must be an object.`);
  }
  for (const [k, v] of Object.entries(obj[key] as Record<string, unknown>)) {
    if (typeof v !== valueType) {
      throw new Error(`'${key}.${k}' must be a ${valueType}, got ${typeof v}.`);
    }
  }
}
