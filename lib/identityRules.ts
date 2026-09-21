/** Identity findings require source-system review, not a replacement identifier. */
export function isOenIdentityFinding(ruleId: string): boolean {
  return ruleId === "OEN_DUPLICATE" || ruleId === "OEN_DUAL_ENROLLMENT";
}
