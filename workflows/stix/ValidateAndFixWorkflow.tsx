"use client";

import { useState } from "react";
import CleaningSummaryView from "@/components/CleaningSummaryView";
import CleaningView from "@/components/CleaningView";
import { BUILTIN_ID, getActiveCleaning, getActiveRulesetId, listCustomRulesets, saveCustomRuleset } from "@/lib/rulesets";
import { applyValidationFixes, validateXml } from "@/lib/validator";
import type { AppliedFix, CleaningSummaryEntry, StudentRecord, ValidateSession } from "@/lib/types";
import type { ValidateWorkflowInput } from "./STIXIntake";
import DownloadView from "./validation/DownloadView";
import FixView from "./validation/FixView";
import IssuesView from "./validation/IssuesView";
import RevalidateView from "./validation/RevalidateView";

type ValidateWorkflowState =
  | { step: "clean"; input: ValidateWorkflowInput }
  | { step: "clean-summary"; input: ValidateWorkflowInput; cleanedRecords: StudentRecord[]; summary: CleaningSummaryEntry[] }
  | { step: "issues" | "fix" | "revalidate" | "download"; session: ValidateSession };

export default function ValidateAndFixWorkflow({ input, onExit }: { input: ValidateWorkflowInput; onExit: () => void }) {
  const [state, setState] = useState<ValidateWorkflowState>({ step: "clean", input });

  const runValidation = (xml: string, fileName: string, validationRules = input.validationRules) => {
    const result = validateXml(xml, validationRules);
    setState({ step: "issues", session: { fileName, originalXml: xml, initialResult: result, fixes: [], validationRules } });
  };

  if (state.step === "clean") return (
    <CleaningView
      records={state.input.records}
      activeRules={state.input.validationRules}
      initialProfile={getActiveCleaning()}
      onApply={(cleanedRecords, summary) => setState({ step: "clean-summary", input: state.input, cleanedRecords, summary })}
      onSkip={() => runValidation(state.input.xml, state.input.fileName, state.input.validationRules)}
      onBack={onExit}
      onSaveToRuleset={(profile) => {
        const id = getActiveRulesetId();
        if (id === BUILTIN_ID) { alert("Switch to a custom ruleset first before saving cleaning rules."); return false; }
        const ruleset = listCustomRulesets().find((candidate) => candidate.id === id);
        if (!ruleset) return false;
        const updated = { ...ruleset };
        if (profile.enabledFields.length === 0) delete updated.cleaning;
        else updated.cleaning = profile;
        saveCustomRuleset(updated);
        return true;
      }}
    />
  );

  if (state.step === "clean-summary") return (
    <CleaningSummaryView
      summary={state.summary}
      onBack={() => setState({ step: "clean", input: state.input })}
      onContinue={() => {
        const fixes: AppliedFix[] = [];
        const fixed = new Set<string>();
        let fixIndex = 0;
        for (const entry of state.summary) {
          if (entry.count === 0) continue;
          for (let index = 0; index < state.input.records.length; index++) {
            const original = state.input.records[index];
            const cleaned = state.cleanedRecords[index];
            const key = `${original.id}\0${entry.field}`;
            if (!fixed.has(key) && original.fields[entry.field] !== cleaned.fields[entry.field] && cleaned.fields[entry.field] === entry.canonical) {
              fixes.push({ issueId: `cleaning-${fixIndex++}`, recordId: original.id, field: entry.field, oldValue: original.fields[entry.field] ?? "", newValue: entry.canonical, ruleId: "cleaning", appliedAt: Date.now() });
              fixed.add(key);
            }
          }
        }
        const xml = fixes.length ? applyValidationFixes(state.input.xml, fixes) : state.input.xml;
        runValidation(xml, state.input.fileName, state.input.validationRules);
      }}
    />
  );

  const session = state.session;
  if (state.step === "issues") return <IssuesView session={session} onBack={onExit} onFix={(fixes) => setState({ step: "fix", session: { ...session, fixes: [...session.fixes.filter((fix) => !fix.repairId), ...fixes] } })} onApply={(fixes) => setState({ step: "revalidate", session: { ...session, fixes: [...session.fixes.filter((fix) => !fix.repairId), ...fixes] } })} onSkipToDownload={() => setState({ step: "download", session })} />;
  if (state.step === "fix") return <FixView session={session} onBack={() => setState({ step: "issues", session })} onApply={(fixes) => setState({ step: "revalidate", session: { ...session, fixes } })} />;
  if (state.step === "revalidate") return <RevalidateView session={session} onBack={() => setState({ step: "fix", session })} onContinue={(updated) => setState({ step: "download", session: updated })} />;
  return <DownloadView session={session} onStartOver={onExit} />;
}
