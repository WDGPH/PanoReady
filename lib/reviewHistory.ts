import type { ReviewAction, ValidateSession } from "./types";
import { applyValidationFixes, validateXml } from "./validator";

/** Publish the XML, findings, audit entries and history only after validation succeeds. */
export function applyReviewChanges(session: ValidateSession, label: ReviewAction["label"]): ValidateSession {
  const changes = session.fixes.slice(session.appliedFixCount ?? 0);
  const finalXml = applyValidationFixes(session.finalXml ?? session.originalXml, changes);
  const revalidatedResult = validateXml(finalXml, session.validationRules);
  return {
    ...session, finalXml, revalidatedResult, appliedFixCount: session.fixes.length,
    history: changes.length ? [
      ...session.history ?? [],
      { id: crypto.randomUUID(), label, changes, status: "applied" },
    ] : session.history,
  };
}

/** Undo is strictly last-in-first-out; replay preserves positional Guardian targets. */
export function undoLastReviewAction(session: ValidateSession): ValidateSession {
  const history = session.history ?? [];
  const latest = history.findLastIndex((action) => action.status === "applied");
  if (latest < 0) return session;
  if (session.fixes.length !== (session.appliedFixCount ?? 0)) {
    throw new Error("Finish applying corrections before undoing an action.");
  }
  const updatedHistory = history.map((action, index) => index === latest ? { ...action, status: "undone" as const } : action);
  // Keep batch boundaries: removing Guardian 1 changes the next batch's Guardian positions.
  let finalXml = session.originalXml;
  const fixes = [];
  for (const action of updatedHistory) {
    if (action.status === "undone") continue;
    finalXml = applyValidationFixes(finalXml, action.changes);
    fixes.push(...action.changes);
  }
  const revalidatedResult = validateXml(finalXml, session.validationRules);
  return { ...session, finalXml, revalidatedResult, fixes, appliedFixCount: fixes.length, history: updatedHistory };
}
