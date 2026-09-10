"use client";

import { useState } from "react";
import CleaningSummaryView from "@/components/CleaningSummaryView";
import CleaningView from "@/components/CleaningView";
import { BUILTIN_ID, defaultRules, getActiveRulesetId, listCustomRulesets, saveCustomRuleset, setActiveRulesetId } from "@/lib/rulesets";
import { applyValidationFixes, validateXml } from "@/lib/validator";
import type { AppliedFix, CleaningProfile, CleaningSummaryEntry, RulesProfile, StudentRecord, ValidateSession } from "@/lib/types";
import type { ValidateWorkflowInput } from "./STIXIntake";
import DownloadView from "./validation/DownloadView";
import FixView from "./validation/FixView";
import IssuesView from "./validation/IssuesView";
import RevalidateView from "./validation/RevalidateView";

import RulesetSelector from "@/components/RulesetSelector";
import WorkflowProgress from "./validation/WorkflowProgress";
import type { ReviewFilter } from "./validation/overview";

type ValidateWorkflowState =
  | { step: "clean"; input: ValidateWorkflowInput }
  | { step: "clean-summary"; input: ValidateWorkflowInput; cleanedRecords: StudentRecord[]; summary: CleaningSummaryEntry[] }
  | { step: "issues" | "fix" | "revalidate" | "download"; session: ValidateSession; filter?: ReviewFilter };

export default function ValidateAndFixWorkflow({ input, onExit }: { input: ValidateWorkflowInput; onExit: () => void }) {
  const [state, setState] = useState<ValidateWorkflowState>({ step: "clean", input });

  const [profile, setProfile] = useState<{ id: string; rules: RulesProfile; cleaning: CleaningProfile | null; revision: number }>(() => {
    const saved = listCustomRulesets().find((candidate) => candidate.id === getActiveRulesetId());
    return { id: saved?.id ?? BUILTIN_ID, rules: saved?.rules ?? defaultRules, cleaning: saved?.cleaning ?? null, revision: 0 };
  });
  const [draftCleaning, setDraftCleaning] = useState<CleaningProfile | null>(profile.cleaning);
  const [cleaningSkipped, setCleaningSkipped] = useState(false);
  const [selectorRevision, setSelectorRevision] = useState(0);

  const runValidation = (xml: string, fileName: string, validationRules = profile.rules) => {
    const result = validateXml(xml, validationRules);
    setState({ step: "issues", session: { fileName, originalXml: xml, initialResult: result, fixes: [], validationRules } });
  };

  const renderStep = () => {
    if (state.step === "clean") return (
      <>
      <header className="preparation-header">
        <h1>Prepare your file</h1>
        <p>{input.fileName}</p>
          <RulesetSelector key={selectorRevision} compact initialId={profile.id} notifyOnMount={false} onRulesChange={(rules, cleaning, id) => {
            setProfile((current) => ({ id, rules, cleaning, revision: current.revision + 1 }));
            setDraftCleaning(cleaning);
          }} />
      </header>
      <CleaningView
        key={profile.revision}
        records={state.input.records}
        initialProfile={draftCleaning}
        onProfileChange={setDraftCleaning}
        isBuiltin={profile.id === BUILTIN_ID}
        onApply={(cleanedRecords, summary) => { setCleaningSkipped(false); setState({ step: "clean-summary", input: state.input, cleanedRecords, summary }); }}
        onSkip={() => { setCleaningSkipped(true); runValidation(state.input.xml, state.input.fileName); }}
        onBack={onExit}
        onSaveToRuleset={(cleaning, name) => {
          const ruleset = listCustomRulesets().find((candidate) => candidate.id === profile.id);
          const updated = ruleset ? { ...ruleset, rules: profile.rules } : {
            id: crypto.randomUUID(), name: name || "My STIX profile", createdAt: new Date().toISOString(), rules: profile.rules, cleaning,
          };
          if (cleaning.enabledFields.length === 0) delete updated.cleaning;
          else updated.cleaning = cleaning;
          saveCustomRuleset(updated);
          setActiveRulesetId(updated.id);
          setProfile((current) => ({ ...current, id: updated.id, cleaning }));
          setSelectorRevision((revision) => revision + 1);
          return true;
        }}
      />
      </>
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
          runValidation(xml, state.input.fileName, profile.rules);
        }}
      />
    );

    const session = state.session;
    if (state.step === "issues") return <IssuesView session={session} onFix={(filter) => setState({ step: "fix", session, filter })} onSkipToDownload={() => setState({ step: "download", session })} />;
    if (state.step === "fix") return <FixView key={JSON.stringify(state.filter ?? {})} session={session} filter={state.filter} onClearFilter={() => setState({ step: "fix", session })} onApply={(fixes) => setState({ step: "revalidate", session: { ...session, fixes } })} />;
    if (state.step === "revalidate") return <RevalidateView session={session} onContinue={(updated) => setState({ step: "download", session: updated })} />;
    return <DownloadView session={session} onStartOver={onExit} />;
  };

  const stage = state.step === "clean" || state.step === "clean-summary" ? 1 : state.step === "issues" ? 2 : state.step === "fix" ? 3 : state.step === "revalidate" ? 4 : 5;
  const canNavigate = (target: number) => target < stage && (target !== 4 || ("session" in state && Boolean(state.session.revalidatedResult)));
  const navigate = (target: number) => {
    if (!canNavigate(target)) return;
    if (target === 1) {
      setState({ step: "clean", input });
    } else if ("session" in state) {
      const session = { ...state.session, finalXml: undefined, revalidatedResult: undefined };
      if (target === 2) setState({ step: "issues", session: { ...session, fixes: [] } });
      if (target === 3) setState({ step: "fix", session });
      if (target === 4) setState({ step: "revalidate", session: state.session });
    }
    window.scrollTo({ top: 0 });
  };
  const noFixes = "session" in state && state.session.fixes.length === 0;
  return <>
    <WorkflowProgress canNavigate={canNavigate} onNavigate={navigate} stage={stage} cleaningSkipped={cleaningSkipped} noFixes={noFixes} hasIssues={"session" in state && state.session.initialResult.issues.length > 0} />
    {renderStep()}
  </>;
}
