/**
 * PHIX CSV validator.
 *
 * Validates parsed PHIX immunization records against a PhixRulesProfile and
 * returns a PhixValidationResult with issues, records, counts, and gate state.
 *
 * Rule ID convention: PHIX_<CATEGORY>_<DETAIL>
 * Severities:
 *   error   — blocks submission (parse failure, missing required fields,
 *              IMMUNIZING AGENT and TRADE NAME both absent/invalid, conflict between
 *              them, DOB/DATE ADMINISTERED format or range problems, missing headers)
 *   warning — data quality concern (HCN format/check-digit, case-insensitive agent
 *              match suggestion, trade name mapped via human-readable string or ci
 *              match, agent derived from trade name, invalid trade name when agent
 *              is valid, field length, postal code invalid/repaired, phone format
 *              when ambiguous, optional date format, duplicates, city↔province mismatch)
 *   info    — safe cosmetic normalization that can be applied without review (postal
 *              code whitespace removal, unambiguous phone digit reformat)
 */

import { isValidISODate } from "./date";
import { parsePhixCsv } from "./phixParser";
import { normalizeCanadianPostalCode } from "./postalCode";
import { validateHcn } from "./hcn";
import type { PhixRecord, PhixValidationResult, PhixRulesProfile, ValidationIssue, GateState, PhixRepairProposal } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _issueCounter = 0;
function nextId(): string {
  return `phix-${++_issueCounter}`;
}

function issue(
  severity: ValidationIssue["severity"],
  ruleId: string,
  message: string,
  record?: PhixRecord,
  field?: string,
  extra: Partial<Pick<ValidationIssue, "suggestedFix" | "autoFixable" | "repairProposal">> = {},
): ValidationIssue {
  return {
    id: nextId(),
    severity,
    ruleId,
    message,
    autoFixable: extra.autoFixable ?? false,
    suggestedFix: extra.suggestedFix,
    repairProposal: extra.repairProposal,
    recordId: record?.id,
    rowPath: record?.rowPath,
    field,
  };
}

/** Reformat a phone number string to XXX-XXX-XXXX if possible, or return undefined. */
function reformatPhixPhone(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return undefined;
}

/** Parse YYYY-MM-DD → Date, or null. */
function parseDate(s: string): Date | null {
  if (!isValidISODate(s)) return null;
  return new Date(s);
}

const PHONE_RE = /^\d{3}-\d{3}-\d{4}$/;

// ─── Main validator ───────────────────────────────────────────────────────────

export function validatePhix(
  csvText: string,
  rules: PhixRulesProfile,
): PhixValidationResult {
  _issueCounter = 0;
  const issues: ValidationIssue[] = [];

  // ── Parse ────────────────────────────────────────────────────────────────

  const parseResult = parsePhixCsv(csvText);

  if (!parseResult.ok) {
    issues.push(issue("error", "PHIX_PARSE_FAILURE", parseResult.error));
    return { issues, records: [], clientCount: 0, recordCount: 0, gate: "BLOCKED" };
  }

  const { records, headers } = parseResult;

  // ── Header presence check ─────────────────────────────────────────────────

  // Required headers must exist as columns (even if all values are blank).
  for (const req of rules.requiredFields) {
    if (!headers.includes(req.toUpperCase())) {
      issues.push(
        issue("error", "PHIX_MISSING_HEADER", `Required column "${req}" is missing from the CSV.`),
      );
    }
  }

  if (records.length === 0) {
    issues.push(issue("error", "PHIX_NO_DATA", "The CSV file contains no data rows."));
    return { issues, records: [], clientCount: 0, recordCount: 0, gate: "BLOCKED" };
  }

  // ── Per-record validation ─────────────────────────────────────────────────

  const today = new Date();
  const minDob = new Date("1900-01-01");

  // For duplicate detection
  const hcnSeen = new Map<string, string[]>(); // hcn → rowIds
  const hcnAgentDateSeen = new Map<string, string>(); // "hcn|agent|date" → rowId

  for (const rec of records) {
    const f = (col: string) => (rec.fields[col.toUpperCase()] ?? "").trim();
    const requiredFieldsUpper = new Set(rules.requiredFields.map((s) => s.toUpperCase()));

    // ── Required fields ─────────────────────────────────────────────────────

    for (const req of rules.requiredFields) {
      if (f(req) === "") {
        issues.push(issue("error", "PHIX_REQUIRED_FIELD", `Required field "${req}" is missing.`, rec, req));
      }
    }

    // ── IMMUNIZING AGENT / TRADE NAME — cross-field validation ───────────────
    //
    // Both fields are case-sensitive for exact-match validity. A case-insensitive
    // match can only produce a suggested fix (warning), never silent acceptance.
    //
    // Trade Name resolution (in order):
    //   1. Exact match in allowedTradeNameValues (SNOMED codes) → valid, no issue.
    //   2. Exact match in tradeNameMap[].tradeName → silently map to SNOMED (valid).
    //   3. Case-insensitive match in tradeNameMap[].tradeName → invalid; warn with
    //      repair proposal suggesting the canonical SNOMED.
    //   4. No match → invalid.
    //
    // Immunizing Agent resolution (in order):
    //   1. Exact match in allowedImmunizingAgentValues → valid, no issue.
    //   2. Case-insensitive match in allowedImmunizingAgentValues → invalid; warn
    //      with repair proposal suggesting the exact-case canonical value.
    //   3. No match → invalid.
    //
    // Cross-field rules (applied after resolution):
    //   A. Both absent → error.
    //   B. Both invalid → error.
    //   C. Agent invalid + Trade Name valid → derive agent from tradeNameMap + warning.
    //   D. Agent valid + Trade Name provided but invalid → warning.
    //   E. Both valid but tradeNameMap[].immunizingAgent ≠ agent → error (conflict).

    const agent = f("IMMUNIZING AGENT");
    const tradeName = f("TRADE NAME");

    // ── Resolve Trade Name ────────────────────────────────────────────────────
    // resolvedTradeName is the SNOMED code we will treat as the effective value.
    let resolvedTradeName: string | undefined;
    let tradeNameEntry: (typeof rules.tradeNameMap)[number] | undefined;

    if (tradeName !== "" && rules.allowedTradeNameValues.length > 0) {
      if (rules.allowedTradeNameValues.includes(tradeName)) {
        // Step 1: exact SNOMED match — valid as-is.
        resolvedTradeName = tradeName;
        tradeNameEntry = rules.tradeNameMap.find((m) => m.snomed === tradeName);
      } else {
        // Step 2: exact tradeName string match — silent correction to SNOMED.
        const exactEntry = rules.tradeNameMap.find((m) => m.tradeName === tradeName);
        if (exactEntry) {
          resolvedTradeName = exactEntry.snomed;
          tradeNameEntry = exactEntry;
        } else {
          // Step 3: case-insensitive tradeName match — invalid; suggest fix.
          const ciEntry = rules.tradeNameMap.find(
            (m) => m.tradeName.toLowerCase() === tradeName.toLowerCase(),
          );
          if (ciEntry) {
            const tradeProposal: PhixRepairProposal = {
              kind: "phix",
              id: `${rec.id}-trade-name`,
              confidence: "safe",
              title: "Correct TRADE NAME to SNOMED CT code",
              explanation: `"${tradeName}" matches the known trade name "${ciEntry.tradeName}" (SNOMED ${ciEntry.snomed}). The field requires the SNOMED CT code; applying this fix will replace the value with "${ciEntry.snomed}".`,
              field: "TRADE NAME",
              currentValue: tradeName,
              proposedValue: ciEntry.snomed,
              options: rules.allowedTradeNameValues,
            };
            issues.push(issue("warning", "PHIX_TRADE_NAME_VALUE",
              `TRADE NAME "${tradeName}" is not a recognised SNOMED CT code. Did you mean SNOMED ${ciEntry.snomed} ("${ciEntry.tradeName}")?`,
              rec, "TRADE NAME",
              { suggestedFix: ciEntry.snomed, autoFixable: true, repairProposal: tradeProposal }));
          }
          // Step 4: no match — resolvedTradeName remains undefined (invalid).
        }
      }
    }

    const tradeNameValid = resolvedTradeName !== undefined;

    // ── Resolve Immunizing Agent ──────────────────────────────────────────────
    const agentValid = agent !== "" &&
      rules.allowedImmunizingAgentValues.length > 0 &&
      rules.allowedImmunizingAgentValues.includes(agent);

    if (agent !== "" && !agentValid && rules.allowedImmunizingAgentValues.length > 0) {
      // Case-insensitive match — invalid but suggest fix.
      const ciMatch = rules.allowedImmunizingAgentValues.find(
        (v) => v.toLowerCase() === agent.toLowerCase(),
      );
      // Also check immunizingAgentMap for a SNOMED hint.
      const mapEntry = rules.immunizingAgentMap.find(
        (m) => m.name.toLowerCase() === agent.toLowerCase(),
      );
      const proposedAgent = ciMatch ?? mapEntry?.name;
      const snomedHint = mapEntry ? ` (SNOMED ${mapEntry.snomed})` : "";
      const agentProposal: PhixRepairProposal = proposedAgent
        ? {
            kind: "phix",
            id: `${rec.id}-immunizing-agent`,
            confidence: "safe",
            title: "Normalize IMMUNIZING AGENT value",
            explanation: `"${agent}" matches the known agent "${proposedAgent}"${snomedHint}. IMMUNIZING AGENT is case-sensitive; applying this fix will update the field to the canonical value.`,
            field: "IMMUNIZING AGENT",
            currentValue: agent,
            proposedValue: proposedAgent,
            options: rules.allowedImmunizingAgentValues,
          }
        : {
            kind: "phix",
            id: `${rec.id}-immunizing-agent`,
            confidence: "manual",
            title: "Review IMMUNIZING AGENT value",
            explanation: `"${agent}" is not a recognised IMMUNIZING AGENT value and has no known case-insensitive match. Select the correct value from the list.`,
            field: "IMMUNIZING AGENT",
            currentValue: agent,
            proposedValue: "",
            options: rules.allowedImmunizingAgentValues,
          };
      issues.push(issue("warning", "PHIX_IMMUNIZING_AGENT_VALUE",
        `IMMUNIZING AGENT "${agent}" is not a recognised value${proposedAgent ? `. Did you mean "${proposedAgent}"${snomedHint}?` : "."}`,
        rec, "IMMUNIZING AGENT",
        { suggestedFix: proposedAgent, autoFixable: !!proposedAgent, repairProposal: agentProposal }));
    }

    // ── Cross-field rules ─────────────────────────────────────────────────────
    const agentImpliedByTradeName = tradeNameEntry?.immunizingAgent;

    if (agent === "" && tradeName === "") {
      // Rule A
      issues.push(
        issue("error", "PHIX_AGENT_OR_TRADENAME_REQUIRED",
          "At least one of IMMUNIZING AGENT or TRADE NAME must be provided.", rec),
      );
    } else if (!agentValid && !tradeNameValid) {
      // Rule B — neither field is usable; reject.
      const parts: string[] = [];
      if (agent !== "") parts.push(`IMMUNIZING AGENT "${agent}" is not a recognised value`);
      else parts.push("IMMUNIZING AGENT is not provided");
      if (tradeName !== "") parts.push(`TRADE NAME "${tradeName}" is not a recognised SNOMED CT`);
      else parts.push("TRADE NAME is not provided");
      issues.push(
        issue("error", "PHIX_AGENT_AND_TRADENAME_INVALID",
          `${parts.join(" and ")}. At least one must be valid; the file cannot be accepted.`, rec),
      );
    } else if (!agentValid && tradeNameValid) {
      // Rule C — derive agent from Trade Name; warn.
      issues.push(
        issue("warning", "PHIX_IMMUNIZING_AGENT_DERIVED",
          `IMMUNIZING AGENT ${agent === "" ? "is not provided" : `"${agent}" is not a recognised value`}. ` +
          `It will be derived from TRADE NAME "${resolvedTradeName}"` +
          (agentImpliedByTradeName ? ` as "${agentImpliedByTradeName}"` : "") + ".",
          rec, "IMMUNIZING AGENT",
          { suggestedFix: agentImpliedByTradeName, autoFixable: !!agentImpliedByTradeName }),
      );
    } else if (agentValid && !tradeNameValid && tradeName !== "") {
      // Rule D — agent valid, Trade Name provided but invalid; warn.
      issues.push(
        issue("warning", "PHIX_TRADE_NAME_INVALID",
          `TRADE NAME "${tradeName}" is not a recognised SNOMED CT value and cannot be mapped. ` +
          `The record will be accepted using IMMUNIZING AGENT "${agent}".`,
          rec, "TRADE NAME"),
      );
    } else if (agentValid && tradeNameValid && agentImpliedByTradeName && agentImpliedByTradeName !== agent) {
      // Rule E — both valid but conflict; reject.
      issues.push(
        issue("error", "PHIX_AGENT_TRADENAME_CONFLICT",
          `IMMUNIZING AGENT "${agent}" and TRADE NAME "${resolvedTradeName}" conflict: ` +
          `the Trade Name maps to immunizing agent "${agentImpliedByTradeName}". ` +
          `Both fields are valid but must agree.`, rec),
      );
    }

    // ── STREET NAME — required when STREET TYPE or STREET DIRECTION present ──

    const streetName = f("STREET NAME");
    const streetType = f("STREET TYPE");
    const streetDir = f("STREET DIRECTION");
    if (streetName === "" && (streetType !== "" || streetDir !== "")) {
      issues.push(
        issue("error", "PHIX_STREET_NAME_REQUIRED",
          "STREET NAME is required when STREET TYPE or STREET DIRECTION is provided.", rec, "STREET NAME"),
      );
    }

    // ── DATE OF BIRTH ──────────────────────────────────────────────────────

    const dob = f("DATE OF BIRTH");
    if (dob !== "") {
      if (!isValidISODate(dob)) {
        issues.push(issue("error", "PHIX_DOB_FORMAT",
          `DATE OF BIRTH "${dob}" is not a valid date (expected YYYY-MM-DD).`, rec, "DATE OF BIRTH"));
      } else {
        const dobDate = parseDate(dob)!;
        if (dobDate < minDob || dobDate > today) {
          issues.push(issue("error", "PHIX_DOB_RANGE",
            `DATE OF BIRTH "${dob}" is outside the plausible range (1900-01-01 to today).`, rec, "DATE OF BIRTH"));
        }
      }
    }

    // ── DATE ADMINISTERED ─────────────────────────────────────────────────

    const dateAdm = f("DATE ADMINISTERED");
    if (dateAdm !== "") {
      if (!isValidISODate(dateAdm)) {
        issues.push(issue("error", "PHIX_DATE_ADMINISTERED_FORMAT",
          `DATE ADMINISTERED "${dateAdm}" is not a valid date (expected YYYY-MM-DD).`, rec, "DATE ADMINISTERED"));
      } else {
        const admDate = parseDate(dateAdm)!;
        if (admDate > today) {
          issues.push(issue("error", "PHIX_DATE_ADMINISTERED_FUTURE",
            `DATE ADMINISTERED "${dateAdm}" is in the future.`, rec, "DATE ADMINISTERED"));
        }
        if (admDate < minDob) {
          issues.push(issue("error", "PHIX_DATE_ADMINISTERED_RANGE",
            `DATE ADMINISTERED "${dateAdm}" is before 1900-01-01.`, rec, "DATE ADMINISTERED"));
        }
        // DOB vs DATE ADMINISTERED cross-check
        const dobDate = parseDate(dob);
        if (dobDate && admDate < dobDate) {
          issues.push(issue("error", "PHIX_DATE_ADMINISTERED_BEFORE_DOB",
            `DATE ADMINISTERED "${dateAdm}" is before DATE OF BIRTH "${dob}".`, rec, "DATE ADMINISTERED"));
        }
      }
    }

    // ── HCN ──────────────────────────────────────────────────────────────

    const hcn = f("HEALTH CARD NUMBER");
    if (hcn !== "") {
      const hcnResult = validateHcn(hcn);
      if (!hcnResult.valid) {
        const msg = hcnResult.reason === "format"
          ? `HEALTH CARD NUMBER "${hcn}" must be exactly 10 digits with no spaces or version code.`
          : `HEALTH CARD NUMBER "${hcn}" fails the Luhn check digit test.`;
        issues.push(issue("warning", "PHIX_HCN_FORMAT", msg, rec, "HEALTH CARD NUMBER"));
      }
    }

    // ── GENDER ────────────────────────────────────────────────────────────

    const gender = f("GENDER");
    if (gender !== "" && rules.allowedGenderValues.length > 0) {
      const alias = rules.genderAliases[gender] ?? rules.genderAliases[gender.trim().toUpperCase()];
      const proposedValue = alias && rules.allowedGenderValues.includes(alias) ? alias : undefined;
      if (!rules.allowedGenderValues.includes(gender)) {
        const proposal: PhixRepairProposal = proposedValue
          ? {
              kind: "phix",
              id: `${rec.id}-gender`,
              confidence: "safe",
              title: "Normalize GENDER code",
              explanation: `"${gender}" is a known alias for "${proposedValue}". Applying this fix will update the GENDER field to the allowed canonical value.`,
              field: "GENDER",
              currentValue: gender,
              proposedValue,
              options: rules.allowedGenderValues,
            }
          : {
              kind: "phix",
              id: `${rec.id}-gender`,
              confidence: "manual",
              title: "Review GENDER value",
              explanation: `"${gender}" is not an allowed value and has no known alias. Select the correct value from the list.`,
              field: "GENDER",
              currentValue: gender,
              proposedValue: "",
              options: rules.allowedGenderValues,
            };
        issues.push(issue(requiredFieldsUpper.has("GENDER") ? "error" : "warning", "PHIX_GENDER_VALUE",
          `GENDER "${gender}" is not an allowed value.${proposedValue ? ` Did you mean "${proposedValue}"?` : ""}`,
          rec, "GENDER",
          { suggestedFix: proposedValue, autoFixable: !!proposedValue, repairProposal: proposal }));
      }
    }

    // ── Optional date fields ──────────────────────────────────────────────

    for (const dateField of ["EXPIRY DATE", "LOT EXPIRY DATE"]) {
      const val = f(dateField);
      if (val !== "" && !isValidISODate(val)) {
        issues.push(issue("warning", "PHIX_DATE_FORMAT",
          `${dateField} "${val}" is not a valid date (expected YYYY-MM-DD).`, rec, dateField));
      }
    }

    // ── Postal code ───────────────────────────────────────────────────────

    const postal = f("POSTAL CODE");
    if (postal !== "") {
      const pcResult = normalizeCanadianPostalCode(postal);
      if (pcResult.status === "invalid") {
        issues.push(issue("warning", "PHIX_POSTAL_CODE",
          `POSTAL CODE "${postal}" is not a valid Canadian postal code.`, rec, "POSTAL CODE"));
      } else if (pcResult.status === "normalized") {
        issues.push(issue("info", "PHIX_POSTAL_CODE_NORMALIZE",
          `POSTAL CODE "${postal}" can be normalized to "${pcResult.value}" (whitespace removed).`, rec, "POSTAL CODE",
          {
            suggestedFix: pcResult.value,
            autoFixable: true,
            repairProposal: {
              kind: "phix",
              id: `${rec.id}-postal-code`,
              confidence: "safe",
              title: "Normalize postal code",
              explanation: `"${postal}" can be safely normalized to the canonical form "${pcResult.value}" by removing whitespace.`,
              field: "POSTAL CODE",
              currentValue: postal,
              proposedValue: pcResult.value,
            },
          }));
      } else if (pcResult.status === "repaired") {
        issues.push(issue("warning", "PHIX_POSTAL_CODE_REPAIR",
          `POSTAL CODE "${postal}" contains an O/I/L transcription error; repair it to "${pcResult.value}".`, rec, "POSTAL CODE",
          {
            suggestedFix: pcResult.value,
            autoFixable: true,
            repairProposal: {
              kind: "phix",
              id: `${rec.id}-postal-code`,
              confidence: "safe",
              title: "Repair postal code",
              explanation: `"${postal}" contains an O/I/L transcription error in a numeric position and can be safely repaired to "${pcResult.value}".`,
              field: "POSTAL CODE",
              currentValue: postal,
              proposedValue: pcResult.value,
            },
          }));
      }
    }

    // ── Phone fields ──────────────────────────────────────────────────────

    for (const phoneField of ["SUBMITTER PHONE NUMBER 1", "SUBMITTER PHONE NUMBER 2"]) {
      const phone = f(phoneField);
      if (phone !== "") {
        const isPlaceholder = rules.phoneConfig.placeholderNumbers.includes(phone);
        if (!isPlaceholder && !PHONE_RE.test(phone)) {
          const formatted = reformatPhixPhone(phone);
          const safeId = `${rec.id}-${phoneField.toLowerCase().replace(/ /g, "-")}`;
          if (formatted) {
            issues.push(issue("info", "PHIX_PHONE_FORMAT_NORMALIZE",
              `${phoneField} "${phone}" can be reformatted to "${formatted}".`, rec, phoneField,
              {
                suggestedFix: formatted,
                autoFixable: true,
                repairProposal: {
                  kind: "phix",
                  id: safeId,
                  confidence: "safe",
                  title: `Reformat ${phoneField}`,
                  explanation: `"${phone}" can be safely reformatted to the canonical XXX-XXX-XXXX format as "${formatted}".`,
                  field: phoneField,
                  currentValue: phone,
                  proposedValue: formatted,
                },
              }));
          } else {
            issues.push(issue("warning", "PHIX_PHONE_FORMAT",
              `${phoneField} "${phone}" is not in XXX-XXX-XXXX format and could not be automatically reformatted.`, rec, phoneField));
          }
        }
      }
    }

    // ── Field length ──────────────────────────────────────────────────────

    for (const [col, maxLen] of Object.entries(rules.fieldLengths)) {
      const val = f(col);
      if (val.length > maxLen) {
        issues.push(issue("warning", "PHIX_FIELD_LENGTH",
          `${col} exceeds maximum length of ${maxLen} (got ${val.length}).`, rec, col));
      }
    }

    // ── Allowed-value checks for other coded fields ───────────────────────

    const allowedValueChecks: Array<[string, string[], string]> = [
      ["ADDRESS TYPE",               rules.allowedAddressTypeValues,           "PHIX_ADDRESS_TYPE_VALUE"],
      ["STREET TYPE",                rules.allowedStreetTypeValues,            "PHIX_STREET_TYPE_VALUE"],
      ["STREET DIRECTION",           rules.allowedStreetDirectionValues,       "PHIX_STREET_DIRECTION_VALUE"],
      ["RELATIONSHIP",               rules.allowedRelationshipValues,          "PHIX_RELATIONSHIP_VALUE"],
      ["PHONE TYPE",                 rules.allowedPhoneTypeValues,             "PHIX_PHONE_TYPE_VALUE"],
      ["PROVINCE",                   rules.allowedProvinceValues,              "PHIX_PROVINCE_VALUE"],
      ["ESTIMATED INDICATOR",        rules.allowedEstimatedIndicatorValues,    "PHIX_ESTIMATED_INDICATOR_VALUE"],
      ["TIMEZONE",                   rules.allowedTimezoneValues,              "PHIX_TIMEZONE_VALUE"],
      ["DOSAGE UOM",                 rules.allowedDosageUomValues,             "PHIX_DOSAGE_UOM_VALUE"],
      ["SITE",                       rules.allowedSiteValues,                  "PHIX_SITE_VALUE"],
      ["ROUTE",                      rules.allowedRouteValues,                 "PHIX_ROUTE_VALUE"],
      ["REASON",                     rules.allowedReasonValues,                "PHIX_REASON_VALUE"],
      ["PROVIDER ROLE",              rules.allowedProviderRoleValues,          "PHIX_PROVIDER_ROLE_VALUE"],
    ];

    // Fields where an unrecognised value is saved as an immunization comment instead of flagged for manual correction
    const commentFallbackChecks: Array<[string, string[], string]> = [
      ["ORGANIZATION",              rules.allowedOrganizationValues,             "PHIX_ORGANIZATION_VALUE"],
      ["SERVICE DELIVERY LOCATION", rules.allowedServiceDeliveryLocationValues,  "PHIX_SDL_VALUE"],
    ];

    for (const [col, allowedList, ruleIdStr] of allowedValueChecks) {
      if (allowedList.length === 0) continue; // empty list → skip check
      const val = f(col);
      if (val !== "" && !allowedList.includes(val)) {
        const safeId = `${rec.id}-${col.toLowerCase().replace(/ /g, "-")}`;
        const isMandatory = requiredFieldsUpper.has(col.toUpperCase());
        const proposal: PhixRepairProposal = {
          kind: "phix",
          id: safeId,
          confidence: "manual",
          title: `Review ${col} value`,
          explanation: `"${val}" is not an allowed value for ${col}. Select the correct value from the list.`,
          field: col,
          currentValue: val,
          proposedValue: "",
          options: allowedList,
        };
        issues.push(issue(isMandatory ? "error" : "warning", ruleIdStr,
          `${col} "${val}" is not an allowed value.`, rec, col,
          { repairProposal: proposal }));
      }
    }

    for (const [col, allowedList, ruleIdStr] of commentFallbackChecks) {
      if (allowedList.length === 0) continue; // empty list → skip check
      const val = f(col);
      if (val !== "" && !allowedList.includes(val)) {
        const safeId = `${rec.id}-${col.toLowerCase().replace(/ /g, "-")}`;
        const existingComment = f("OTHER DETAILS");
        const commentValue = existingComment ? `${existingComment}; ${col}: ${val}` : `${col}: ${val}`;
        const proposal: PhixRepairProposal = {
          kind: "phix",
          id: safeId,
          confidence: "review",
          title: `${col} not in Panorama`,
          explanation: `"${val}" is not in Panorama. By default, the field will be cleared and the value saved as an immunization comment in OTHER DETAILS. Alternatively, select a valid ${col} from the list to use that instead (no comment will be written).`,
          field: col,
          currentValue: val,
          proposedValue: "",
          options: allowedList,
          additionalChanges: [
            { field: "OTHER DETAILS", currentValue: existingComment, proposedValue: commentValue },
          ],
        };
        issues.push(issue("warning", ruleIdStr,
          `${col} "${val}" is not in Panorama. The value will be saved as an immunization comment.`, rec, col,
          { repairProposal: proposal }));
      }
    }

    // ── City ↔ Province cross-field check ─────────────────────────────────

    const city = f("CITY");
    const province = f("PROVINCE");
    if (city !== "" && province !== "") {
      const citiesForProvince = rules.cityByProvince[province];
      if (citiesForProvince && citiesForProvince.length > 0) {
        if (!citiesForProvince.includes(city)) {
          const caseMatch = citiesForProvince.find(c => c.toLowerCase() === city.toLowerCase());
          const proposal: PhixRepairProposal = caseMatch
            ? {
                kind: "phix",
                id: `${rec.id}-city`,
                confidence: "safe",
                title: "Fix CITY capitalization",
                explanation: `"${city}" matches "${caseMatch}" when case is ignored. Applying this fix will correct the capitalization.`,
                field: "CITY",
                currentValue: city,
                proposedValue: caseMatch,
                options: citiesForProvince,
              }
            : {
                kind: "phix",
                id: `${rec.id}-city`,
                confidence: "manual",
                title: "Review CITY for province",
                explanation: `"${city}" is not a known city in ${province}. Select the correct city from the list or confirm this is correct.`,
                field: "CITY",
                currentValue: city,
                proposedValue: "",
                options: citiesForProvince,
              };
          issues.push(issue("warning", "PHIX_CITY_PROVINCE_MISMATCH",
            `CITY "${city}" is not a known city in province "${province}".`, rec, "CITY",
            caseMatch
              ? { suggestedFix: caseMatch, autoFixable: true, repairProposal: proposal }
              : { repairProposal: proposal }));
        }
      }
    }

    // ── Duplicate detection ───────────────────────────────────────────────

    if (rules.duplicateDetection.checkHcn && hcn !== "") {
      const existing = hcnSeen.get(hcn) ?? [];
      existing.push(rec.id);
      hcnSeen.set(hcn, existing);
    }

    if (rules.duplicateDetection.checkNameDobAgent && hcn !== "" && agent !== "" && dateAdm !== "") {
      const key = `${hcn}|${agent}|${dateAdm}`;
      const firstSeen = hcnAgentDateSeen.get(key);
      if (firstSeen) {
        issues.push(issue("warning", "PHIX_DUPLICATE_SUBMISSION",
          `Possible duplicate: same HCN, IMMUNIZING AGENT, and DATE ADMINISTERED as ${firstSeen}.`,
          rec));
      } else {
        hcnAgentDateSeen.set(key, rec.rowPath);
      }
    }
  }

  // ── Post-loop: HCN appears on multiple rows (expected for multiple vaccines) ─

  if (rules.duplicateDetection.checkHcn) {
    for (const [hcn, rowIds] of hcnSeen.entries()) {
      if (rowIds.length > 1) {
        // This is normal (multiple vaccines for same client), flag as info-level
        // duplicate only — not an error. Already caught exact duplicates above.
        // No issue needed here; exact-match duplicates already emitted above.
      }
    }
  }

  // ── Client count (distinct clients) ──────────────────────────────────────

  // A "client" is identified by HCN when present; otherwise by FIRST NAME + LAST NAME + DOB.
  const clientKeys = new Set<string>();
  for (const rec of records) {
    const hcn = (rec.fields["HEALTH CARD NUMBER"] ?? "").trim();
    if (hcn !== "") {
      clientKeys.add(`hcn:${hcn}`);
    } else {
      const fn = (rec.fields["FIRST NAME"] ?? "").trim().toLowerCase();
      const ln = (rec.fields["LAST NAME"] ?? "").trim().toLowerCase();
      const dob = (rec.fields["DATE OF BIRTH"] ?? "").trim();
      clientKeys.add(`namedob:${fn}|${ln}|${dob}`);
    }
  }

  // ── Gate ──────────────────────────────────────────────────────────────────

  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");
  const gate: GateState = hasErrors ? "BLOCKED" : hasWarnings ? "REVIEW_REQUIRED" : "READY";

  return {
    issues,
    records,
    clientCount: clientKeys.size,
    recordCount: records.length,
    gate,
  };
}
