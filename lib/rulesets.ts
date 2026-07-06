/**
 * Custom ruleset persistence and validation.
 *
 * Rulesets are stored in localStorage so they survive page refreshes and can
 * be shared between the main Validate workflow and the Reports page.
 * All localStorage access is guarded against SSR environments.
 */

import type { CustomRuleset, RulesProfile } from "./types";
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
  requireStringArray(r.phoneConfig as Record<string, unknown>, "placeholderNumbers");

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

  const knownRulesKeys = new Set([
    "requiredFields", "allowedGradeValues", "allowedGenderValues", "allowedProvinceValues",
    "allowedLanguageValues", "allowedCountryValues", "allowedStreetTypeValues",
    "allowedRelationshipValues", "allowedPhoneTypeValues", "allowedStreetDirectionValues",
    "allowedFullLoadTypeValues", "dateFields", "fieldLengths", "postalCodePattern",
    "gradeAliases", "genderAliases", "phoneConfig", "duplicateDetection",
  ]);
  const unknownKeys = Object.keys(r).filter((k) => !knownRulesKeys.has(k));
  const warnings: string[] | undefined =
    unknownKeys.length > 0
      ? unknownKeys.map((k) => `Unknown field in rules: '${k}' — will be ignored`)
      : undefined;

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
