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
import AssessmentView from "./validation/AssessmentView";

import RulesetSelector from "@/components/RulesetSelector";
import WorkflowProgress from "./validation/WorkflowProgress";
import type { ReviewFilter, ReviewExclusion } from "./validation/overview";

type ValidateWorkflowState =
  | { step: "assessing"; xml: string; fileName: string; rules: RulesProfile }
  | { step: "clean-summary"; input: ValidateWorkflowInput; session: ValidateSession; cleanedRecords: StudentRecord[]; summary: CleaningSummaryEntry[] }
  | { step: "issues" | "fix" | "manual" | "revalidate" | "download"; session: ValidateSession; filter?: ReviewFilter };

export default function ValidateAndFixWorkflow({ input, onExit }: { input: ValidateWorkflowInput; onExit: () => void }) {
  const [applying, setApplying] = useState(false);

  const [profile, setProfile] = useState<{ id: string; rules: RulesProfile; cleaning: CleaningProfile | null; revision: number }>(() => {
    const saved = listCustomRulesets().find((candidate) => candidate.id === getActiveRulesetId());
    return { id: saved?.id ?? BUILTIN_ID, rules: saved?.rules ?? defaultRules, cleaning: saved?.cleaning ?? null, revision: 0 };
  });
  const [draftCleaning, setDraftCleaning] = useState<CleaningProfile | null>(profile.cleaning);
  const [state, setState] = useState<ValidateWorkflowState>({ step: "assessing", xml: input.xml, fileName: input.fileName, rules: profile.rules });
  const [exclusions, setExclusions] = useState<ReviewExclusion[]>([]);
  const [selectorRevision, setSelectorRevision] = useState(0);

  const cleaningOptions = (session: ValidateSession) => (
      <CleaningView
        key={profile.revision}
        records={(session.revalidatedResult ?? session.initialResult).records}
        initialProfile={draftCleaning}
        onProfileChange={setDraftCleaning}
        isBuiltin={profile.id === BUILTIN_ID}
        onApply={(cleanedRecords, summary) => { setState({ step: "clean-summary", session, input: { ...input, xml: session.finalXml ?? session.originalXml, records: (session.revalidatedResult ?? session.initialResult).records }, cleanedRecords, summary }); }}
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
  );
  const renderStep = () => {
    if (state.step === "assessing") return <AssessmentView xml={state.xml} rules={state.rules} onBack={onExit} onComplete={(result) => setState({ step: "issues", session: { fileName: state.fileName, originalXml: state.xml, initialResult: result, fixes: [], validationRules: state.rules } })} />;

    if (state.step === "clean-summary") return (
      <CleaningSummaryView
        summary={state.summary}
        onBack={() => setState({ step: "fix", session: state.session })}
        onContinue={() => {
          const fixes: AppliedFix[] = [];
          const fixed = new Set<string>();
          let fixIndex = state.session.fixes.length;
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
          const allFixes = [...state.session.fixes, ...fixes];
          setState({ step: "fix", session: { ...state.session, finalXml: xml, fixes: allFixes, appliedFixCount: allFixes.length, revalidatedResult: validateXml(xml, state.session.validationRules) } });
        }}
      />
    );

    const session = state.session;
    if (state.step === "issues") return <IssuesView onBack={onExit} advancedOptions={<RulesetSelector key={selectorRevision} compact initialId={profile.id} notifyOnMount={false} onRulesChange={(rules, cleaning, id) => {
      setProfile((current) => ({ id, rules, cleaning, revision: current.revision + 1 }));
      setDraftCleaning(cleaning);
      setExclusions([]);
      setState({ step: "issues", session: { ...session, validationRules: rules, revalidatedResult: validateXml(session.finalXml ?? session.originalXml, rules) } });
    }} />} session={session} exclusions={exclusions} onExclusionsChange={setExclusions} onFix={(filter) => setState({ step: "fix", session, filter })} onSkipToDownload={() => setState({ step: "download", session })} />;
    if (state.step === "fix" || state.step === "manual") return <FixView onBack={() => setState({ step: state.step === "fix" ? "issues" : "fix", session })} advancedOptions={state.step === "fix" ? cleaningOptions(session) : undefined} key={JSON.stringify([state.step, state.filter ?? {}, exclusions])} view={state.step === "fix" ? "automatic" : "manual"} exclusions={exclusions} session={session} filter={state.filter} onBusyChange={setApplying} onContinue={() => setState({ step: "manual", session, filter: state.filter })} onAutoApply={(batch) => {
      const fixes = [...session.fixes, ...batch];
      const finalXml = applyValidationFixes(session.finalXml ?? session.originalXml, batch);
      const revalidatedResult = validateXml(finalXml, session.validationRules);
      setState({ ...state, session: { ...session, fixes, finalXml, revalidatedResult, appliedFixCount: fixes.length } });
    }} onClearFilter={() => setState({ step: state.step, session })} onApply={(fixes) => setState({ step: "revalidate", session: { ...session, fixes } })} />;
    if (state.step === "revalidate") return <RevalidateView onBack={() => setState({ step: "manual", session })} session={session} onReturnToFixes={(updated, step) => { setState({ step, session: updated }); window.scrollTo({ top: 0 }); }} onContinue={(updated) => setState({ step: "download", session: updated })} />;
    return <DownloadView onReturnToFixes={(step) => { setState({ step, session }); window.scrollTo({ top: 0 }); }} session={session} onStartOver={onExit} />;
  };

  const stage = state.step === "issues" || state.step === "assessing" ? 1 : state.step === "fix" || state.step === "clean-summary" ? 2 : state.step === "manual" ? 3 : state.step === "revalidate" ? 4 : 5;
  const canNavigate = (target: number) => state.step !== "assessing" && !applying && target < stage && (target !== 4 || ("session" in state && Boolean(state.session.revalidatedResult)));
  const navigate = (target: number) => {
    if (!canNavigate(target) || !("session" in state)) return;
    const session = state.session;
    if (target === 1) setState({ step: "issues", session });
    if (target === 2) setState({ step: "fix", session });
    if (target === 3) setState({ step: "manual", session });
    if (target === 4) setState({ step: "revalidate", session });
    window.scrollTo({ top: 0 });
  };
  return <>
    <WorkflowProgress canNavigate={canNavigate} onNavigate={navigate} stage={stage} />
    {renderStep()}
  </>;
}
