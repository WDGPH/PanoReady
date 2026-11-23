/**
 * The address rule order lives here. Assessment reports findings without mutation;
 * the planner uses the same rules, restarting at the top after each complete repair.
 */
import {
  ADDRESS_REPAIR_FIELDS, analyzeAlternateDeliveryInStreetFields, analyzeStreetNameSuffix,
  analyzeStreetNumberRepair, analyzeStreetNumberUnitPrefix, analyzeUnitOverflow,
  isCanonicalRuralRoute, normalizePoBoxNumber, normalizeRuralRoute,
} from "./addressRepair";
import { standardizeUnit } from "./cleaner";
import { allowedValuesForField, fieldValueMeetsRules, postalCodeFinding } from "./fieldValidation";
import { FREE_TEXT_FIELDS } from "./fields";
import { freeTextCharacterFindings } from "./freeTextCharacters";
import defaultRules from "../config/rules.stix.default.json";
import type { AddressRepairProposal, RulesProfile, ValidationIssue } from "./types";

export const isAddressField = (field: string): boolean => (ADDRESS_REPAIR_FIELDS as readonly string[]).includes(field);
export type AddressFinding = Omit<ValidationIssue, "id" | "recordId" | "studentName" | "schoolNumber">;
type AddressContext = {
  fields: Record<string, string>;
  rules: RulesProfile;
  recordId: string;
  /** Only the planner may defer field validity until the entire sequence is known. */
  allowIntermediate: boolean;
};
export type AddressRule = {
  name: string;
  assess: (context: AddressContext, previous: readonly AddressFinding[]) => AddressFinding[];
};

function repairFinding(field: string, ruleId: string, proposal: AddressRepairProposal, severity: ValidationIssue["severity"] = "warning"): AddressFinding {
  return { field, ruleId, severity, message: proposal.explanation, repairProposal: proposal,
    suggestedFix: severity === "error" && proposal.confidence === "safe" ? proposal.changes.find(change => change.field === field)?.proposedValue : undefined,
    autoFixable: proposal.confidence === "safe" && proposal.changes.some(change => change.currentValue !== change.proposedValue) };
}

const boxFormat: AddressRule = {
  name: "Normalize the dedicated PO box field",
  assess: ({ fields, rules }) => {
    const value = fields.PoBoxNumber;
    if (!value || fieldValueMeetsRules("PoBoxNumber", value, rules)) return [];
    const normalized = normalizePoBoxNumber(value);
    const suggestedFix = normalized !== undefined && fieldValueMeetsRules("PoBoxNumber", normalized, rules) ? normalized : undefined;
    return [{ field: "PoBoxNumber", currentValue: value, ruleId: "PO_BOX_NUMBER_FORMAT",
      severity: value.length > (rules.fieldLengths.PoBoxNumber ?? Infinity) ? "error" : "warning",
      message: suggestedFix
        ? `PoBoxNumber "${value}" can be normalized to "${suggestedFix}". Store only the box number, without a PO Box prefix.`
        : `PoBoxNumber "${value}" must contain only the box number in digits, within its configured length limit. Do not include a PO Box prefix or other address text.`,
      suggestedFix, autoFixable: suggestedFix !== undefined }];
  },
};
const routeFormat: AddressRule = {
  name: "Normalize the dedicated rural route field",
  assess: ({ fields }) => {
    const value = fields.RuralRoute;
    if (!value || isCanonicalRuralRoute(value)) return [];
    const suggestedFix = normalizeRuralRoute(value);
    return [{ field: "RuralRoute", currentValue: value, ruleId: "RURAL_ROUTE_FORMAT", severity: "warning",
      message: suggestedFix ? `RuralRoute "${value}" can be normalized to "${suggestedFix}".`
        : `RuralRoute "${value}" must use RR followed by one space and a 1–4 digit route number, such as RR 4. Do not use # or punctuation.`,
      suggestedFix, autoFixable: suggestedFix !== undefined }];
  },
};
const alternateDelivery: AddressRule = {
  name: "Separate PO box or rural route text before interpreting street text",
  assess: ({ fields, rules, recordId, allowIntermediate }) => {
    const proposal = analyzeAlternateDeliveryInStreetFields(fields, `${recordId}-address-alternate-delivery`);
    if (!proposal) return [];
    // Legacy single-step suggestions must already meet field rules. The sequence
    // planner can temporarily retain a long street value if later repairs resolve it.
    if (!allowIntermediate && proposal.deliveryType === "poBox"
      && proposal.changes.some(change => !fieldValueMeetsRules(change.field, change.proposedValue, rules))) {
      proposal.confidence = "manual";
      proposal.changes = [];
      proposal.explanation = "The separated PO Box number or remaining street value does not meet its field rules. Review the complete address and edit the fields directly.";
    }
    return [repairFinding(proposal.sourceField, proposal.deliveryType === "ruralRoute"
      ? "RURAL_ROUTE_IN_STREET_FIELD" : "ALTERNATE_DELIVERY_IN_STREET_FIELD", proposal)];
  },
};
const lengthAndStructure: AddressRule = {
  name: "Repair overflowing Unit and StreetNumber; report other address length limits",
  assess: ({ fields, rules, recordId }, previous) => {
    const findings: AddressFinding[] = [];
    // Unit precedes StreetNumber, which precedes StreetName. Never depend on JSON key order.
    for (const field of ADDRESS_REPAIR_FIELDS) {
      const value = fields[field] ?? "";
      const limit = rules.fieldLengths[field] ?? Infinity;
      if (field === "PostalCode" || field === "PoBoxNumber" || value.length <= limit) continue;
      const manual: AddressRepairProposal = {
        kind: "address", id: `${recordId}-address-manual-${field}`, confidence: "manual",
        title: `Review ${field} manually`,
        explanation: `${field} "${value}" exceeds its ${limit}-character limit and can't be safely auto-split. Review the complete address and edit the fields directly.`, changes: [],
      };
      if (field === "Unit") {
        const [standardized, changed] = standardizeUnit(value);
        if (changed && standardized.length <= limit) {
          findings.push({ field, severity: "error", ruleId: "FIELD_LENGTH", message: `${field} exceeds its ${limit}-character limit.`, suggestedFix: standardized, autoFixable: true });
          continue;
        }
        findings.push(repairFinding(field, "FIELD_LENGTH", analyzeUnitOverflow(fields, rules.fieldLengths.StreetNumber ?? limit, `${recordId}-address-unit-overflow`) ?? manual, "error"));
      } else if (field === "StreetNumber") {
        const delivery = previous.find(finding => finding.field === field && finding.repairProposal)?.repairProposal;
        findings.push(repairFinding(field, "FIELD_LENGTH", delivery
          ?? analyzeStreetNumberRepair(fields, limit, `${recordId}-address-street-number`)
          ?? analyzeStreetNumberUnitPrefix(fields, `${recordId}-address-street-number-unit-prefix`)
          ?? manual, "error"));
      } else findings.push(repairFinding(field, "FIELD_LENGTH", manual, "error"));
    }
    return findings;
  },
};
const unitPrefix: AddressRule = {
  name: "Report ambiguous unit prefixes for manual review",
  assess: ({ fields, rules, recordId }) => {
    if ((fields.StreetNumber ?? "").length > (rules.fieldLengths.StreetNumber ?? Infinity)) return [];
    const proposal = analyzeStreetNumberUnitPrefix(fields, `${recordId}-address-unit-prefix`);
    return proposal ? [repairFinding("StreetNumber", "STREET_NUMBER_UNIT_PREFIX", proposal)] : [];
  },
};
const streetSuffix: AddressRule = {
  name: "Separate street type and direction after structural repairs",
  assess: ({ fields, rules, recordId }, previous) => {
    // Do not interpret a suffix while delivery text still owns StreetName,
    // including a conflicting or ambiguous delivery reference.
    if (previous.some(finding => finding.field === "StreetName" && ["ALTERNATE_DELIVERY_IN_STREET_FIELD", "RURAL_ROUTE_IN_STREET_FIELD"].includes(finding.ruleId))) return [];
    const proposal = analyzeStreetNameSuffix(fields, rules.allowedStreetTypeValues, rules.allowedStreetDirectionValues, `${recordId}-address-street-name-suffix`);
    return proposal ? [repairFinding("StreetName", "STREET_TYPE_IN_STREET_NAME", proposal)] : [];
  },
};
const postalCode: AddressRule = {
  name: "Normalize or repair the postal code",
  assess: ({ fields, rules }) => {
    const finding = fields.PostalCode ? postalCodeFinding(fields.PostalCode, rules) : null;
    return finding ? [{ field: "PostalCode", currentValue: fields.PostalCode, ...finding }] : [];
  },
};
const constraints: AddressRule = {
  name: "Report required address fields and controlled values",
  assess: ({ fields, rules }) => {
    const findings: AddressFinding[] = [];
    for (const field of ADDRESS_REPAIR_FIELDS) {
      const value = fields[field] ?? "";
      if (rules.requiredFields.includes(field) && !value.trim()) findings.push({ field, ruleId: "REQUIRED_FIELD", severity: "error", message: `${field} is required but missing or empty.`, autoFixable: false });
      const allowed = allowedValuesForField(field, rules);
      if (value && allowed && !allowed.includes(value)) findings.push({ field, ruleId: `${field.toUpperCase()}_ALLOWED_VALUE`, severity: "error", message: `${field} value "${value}" is not allowed.`, autoFixable: false });
    }
    return findings;
  },
};
const characters: AddressRule = {
  name: "Apply configured character policies only after specialized checks",
  assess: ({ fields, rules }, previous) => {
    const claimed = new Set(previous.map(finding => finding.field));
    return ADDRESS_REPAIR_FIELDS.flatMap(field => {
      if (!FREE_TEXT_FIELDS.includes(field) || !fields[field] || claimed.has(field)) return [];
      return freeTextCharacterFindings(fields[field], field, rules).map(finding => ({ ...finding, field, currentValue: fields[field], severity: "info" as const, autoFixable: true }));
    });
  },
};

/** Execution priority, not severity order. Add a rule here deliberately; see docs/autofix-sequencing.md. */
export const ADDRESS_RULES: readonly AddressRule[] = [
  boxFormat, routeFormat, alternateDelivery, lengthAndStructure, unitPrefix,
  streetSuffix, postalCode, constraints, characters,
];

export function assessAddress(fields: Record<string, string>, rules: RulesProfile, recordId: string, allowIntermediate = false): AddressFinding[] {
  const effectiveRules: RulesProfile = { ...rules,
    freeTextCharacterChecks: { ...defaultRules.freeTextCharacterChecks, ...rules.freeTextCharacterChecks },
    freeTextAllowedCharacters: { ...defaultRules.freeTextAllowedCharacters, ...rules.freeTextAllowedCharacters },
  };
  const findings: AddressFinding[] = [];
  for (const rule of ADDRESS_RULES) findings.push(...rule.assess({ fields, rules: effectiveRules, recordId, allowIntermediate }, findings));
  return findings;
}
