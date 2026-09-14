import { parseCanonicalXml, serializeCanonicalXml } from "./canonical";
import { gateForIssues, validateCanonicalUpload } from "./validator";
import type { RulesProfile, ValidationResult } from "./types";
import type { CanonicalUpload } from "./canonical";

/** Serialize the working document and verify that it reconciles before download. */
export function prepareCheckedOutput(
  document: CanonicalUpload,
  rules: RulesProfile | undefined,
): { xml: string; result: ValidationResult } {
  const xml = serializeCanonicalXml(document);
  const result = validateSerializedOutput(document, xml, rules);
  const boundaryFailure = result.issues.find((issue) => issue.ruleId === "XML_PARSE_OR_NAMESPACE" || issue.ruleId === "OUTPUT_RECONCILIATION");
  if (boundaryFailure) throw new Error(`Output boundary check failed: ${boundaryFailure.message}`);
  return { xml, result };
}

/** Validate serialized output and retain source diagnostics that cannot be represented in XML. */
export function validateSerializedOutput(
  document: CanonicalUpload,
  xml: string,
  rules?: RulesProfile,
): ValidationResult {
  let outputDocument: CanonicalUpload;
  try {
    outputDocument = parseCanonicalXml(xml);
  } catch (error) {
    const issues = [...document.diagnostics, {
      id: "XML_PARSE_OR_NAMESPACE-0",
      severity: "error" as const,
      ruleId: "XML_PARSE_OR_NAMESPACE",
      layer: "XML" as const,
      message: error instanceof Error ? error.message : String(error),
      autoFixable: false,
    }];
    return { issues, records: [], schoolCount: 0, studentCount: 0, gate: "BLOCKED" };
  }
  const output = validateCanonicalUpload(document, rules);
  const reconciles = serializeCanonicalXml(outputDocument) === serializeCanonicalXml(document);
  const issues = [
    ...output.issues,
    ...(reconciles ? [] : [{
      id: "OUTPUT_RECONCILIATION-0",
      severity: "error" as const,
      ruleId: "OUTPUT_RECONCILIATION",
      layer: "XML" as const,
      message: "The serialized output did not reconcile to the current working document.",
      autoFixable: false,
    }]),
  ];
  return { ...output, issues, gate: gateForIssues(issues) };
}
