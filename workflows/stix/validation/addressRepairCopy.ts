import type { AddressAutofixPlan } from "@/lib/types";
import { issueDescription, issueFieldLabel } from "@/lib/issueDescription";

type RepairStep = AddressAutofixPlan["steps"][number];
export const addressFieldLabel = issueFieldLabel;

/** Describe the problem in the Issue column; actions belong in Repair steps. */
export function addressRepairIssueText(step: RepairStep): string {
  switch (step.ruleId) {
    case "STREET_TYPE_IN_STREET_NAME": return step.changes.some(change => change.field === "StreetDirection")
      ? "Street name contains the street type and direction." : "Street name contains the street type.";
    case "FIELD_LENGTH":
      if (step.field === "StreetNumber") return "Street number contains the street name.";
      if (step.field === "Unit" && step.changes.length > 1) return "Unit contains street address details.";
      return issueDescription(step);
    default: return issueDescription(step);
  }
}

export function addressRepairStepTitle(step: RepairStep): string {
  switch (step.ruleId) {
    case "ALTERNATE_DELIVERY_IN_STREET_FIELD": return "Separate the PO box from the street address";
    case "RURAL_ROUTE_IN_STREET_FIELD": return "Move the rural route into its own field";
    case "STREET_TYPE_IN_STREET_NAME": return step.changes.some(change => change.field === "StreetDirection")
      ? "Separate the street type and direction" : "Separate the street type";
    case "FIELD_LENGTH":
      if (step.field === "StreetNumber") return "Separate the street number and name";
      if (step.field === "Unit" && step.changes.length > 1) return "Move street details out of the unit field";
      return `Standardize the ${addressFieldLabel(step.field)}`;
    case "POSTAL_CODE_REPAIR": return "Correct the postal code transcription";
    case "PO_BOX_NUMBER_FORMAT":
    case "RURAL_ROUTE_FORMAT":
    case "POSTAL_CODE_NORMALIZE": return `Standardize the ${addressFieldLabel(step.field)}`;
    default: return step.ruleId.startsWith("FREE_TEXT_")
      ? `Clean up characters in the ${addressFieldLabel(step.field)}`
      : `Correct the ${addressFieldLabel(step.field)}`;
  }
}
