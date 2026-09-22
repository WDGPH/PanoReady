"use client";

import { useCallback, useState } from "react";
import CleaningSummaryView from "@/components/CleaningSummaryView";
import CleaningView from "@/components/CleaningView";
import { BUILTIN_ID, defaultRules, getActiveRulesetId, listCustomRulesets, saveCustomRuleset, setActiveRulesetId } from "@/lib/rulesets";
import { validateXml } from "@/lib/validator";
import { applyReviewChanges, undoLastReviewAction } from "@/lib/reviewHistory";
import type { ApplyReviewProgress } from "@/lib/reviewHistory";
import type { AppliedFix, CleaningProfile, CleaningSummaryEntry, RulesProfile, StudentRecord, ValidateSession } from "@/lib/types";
import type { ValidateWorkflowInput } from "./STIXIntake";
import DownloadView from "./validation/DownloadView";
import FixView from "./validation/FixView";
import IssuesView from "./validation/IssuesView";
import RevalidateView from "./validation/RevalidateView";
import AssessmentView from "./validation/AssessmentView";
import ActionHistory from "./validation/ActionHistory";
import { WorkflowNavigationActions } from "@/components/WorkflowNavigation";
import SaveProgress from "@/components/SaveProgress";
import styles from "./ValidateAndFixWorkflow.module.css";

import RulesetSelector from "@/components/RulesetSelector";
import WorkflowProgress from "./validation/WorkflowProgress";
import type { ReviewFilter, ReviewExclusion } from "./validation/overview";

type ValidateWorkflowState =
  | { step: "assessing"; xml: string; fileName: string; rules: RulesProfile }
  | { step: "clean-summary"; input: ValidateWorkflowInput; session: ValidateSession; cleanedRecords: StudentRecord[]; summary: CleaningSummaryEntry[] }
  | { step: "issues" | "fix" | "manual" | "revalidate" | "download"; session: ValidateSession; filter?: ReviewFilter };

export default function ValidateAndFixWorkflow({ input, onExit, onRequestExit }: {
  input: ValidateWorkflowInput;
  onExit: () => void;
  onRequestExit: (trigger?: HTMLButtonElement) => void;
}) {
  const [applying, setApplying] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [reviewRevision, setReviewRevision] = useState(0);
  const [unappliedFixCount, setUnappliedFixCount] = useState(0);

  const [profile, setProfile] = useState<{ id: string; rules: RulesProfile; cleaning: CleaningProfile | null; revision: number }>(() => {
    const saved = listCustomRulesets().find((candidate) => candidate.id === getActiveRulesetId());
    return { id: saved?.id ?? BUILTIN_ID, rules: saved?.rules ?? defaultRules, cleaning: saved?.cleaning ?? null, revision: 0 };
  });
  const [draftCleaning, setDraftCleaning] = useState<CleaningProfile | null>(profile.cleaning);
  const [state, setState] = useState<ValidateWorkflowState>({ step: "assessing", xml: input.xml, fileName: input.fileName, rules: profile.rules });
  const [exclusions, setExclusions] = useState<ReviewExclusion[]>([]);
  const [selectorRevision, setSelectorRevision] = useState(0);
  const completeRecheck = useCallback((session: ValidateSession) => {
    setState((current) => current.step === "revalidate" ? { ...current, session } : current);
  }, []);

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
    if (state.step === "assessing") return <AssessmentView xml={state.xml} rules={state.rules} onBack={onRequestExit} onComplete={(result) => setState({ step: "issues", session: { fileName: state.fileName, originalXml: state.xml, initialResult: result, fixes: [], validationRules: state.rules } })} />;

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
          try {
            const session = applyReviewChanges({ ...state.session, fixes: [...state.session.fixes, ...fixes] }, "Cleaning mappings");
            setHistoryError(null);
            setState({ step: "fix", session });
          } catch {
            setHistoryError("Cleaning mappings could not be applied. Your file is unchanged.");
          }
        }}
      />
    );

    const session = state.session;
    if (state.step === "issues") return <IssuesView onBack={onRequestExit} advancedOptions={<RulesetSelector key={selectorRevision} compact initialId={profile.id} notifyOnMount={false} onRulesChange={(rules, cleaning, id) => {
      setProfile((current) => ({ id, rules, cleaning, revision: current.revision + 1 }));
      setDraftCleaning(cleaning);
      setExclusions([]);
      setState({ step: "issues", session: { ...session, validationRules: rules, revalidatedResult: validateXml(session.finalXml ?? session.originalXml, rules) } });
    }} />} session={session} exclusions={exclusions} onExclusionsChange={setExclusions} onFix={(filter) => setState({ step: "fix", session, filter })} onSkipToDownload={() => setState({ step: "download", session })} />;
    if (state.step === "fix" || state.step === "manual") return <FixView onBack={() => setState({ step: state.step === "fix" ? "issues" : "fix", session })} advancedOptions={state.step === "fix" ? cleaningOptions(session) : undefined} key={JSON.stringify([state.step, state.filter ?? {}, exclusions, reviewRevision])} view={state.step === "fix" ? "automatic" : "manual"} exclusions={exclusions} session={session} filter={state.filter} onBusyChange={setApplying} onPendingChange={setUnappliedFixCount} onContinue={() => setState({ step: "manual", session, filter: state.filter })} onAutoApply={(batch, onProgress) => new Promise<void>((resolve, reject) => {
      const worker = new Worker(new URL("../../lib/apply-fixes.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<
        | { type: "progress"; progress: ApplyReviewProgress }
        | { type: "complete"; session: ValidateSession }
        | { type: "error"; message: string }
      >) => {
        const message = event.data;
        if (message.type === "progress") onProgress(message.progress);
        else if (message.type === "complete") {
          worker.terminate();
          setHistoryError(null);
          setState(current => current.step === "fix" ? { ...current, session: message.session } : current);
          resolve();
        } else {
          worker.terminate();
          reject(new Error(message.message));
        }
      };
      worker.onerror = () => {
        worker.terminate();
        reject(new Error("Unable to apply fixes."));
      };
      worker.postMessage({ session, fixes: batch });
    })} onClearFilter={() => setState({ step: state.step, session })} onApply={(fixes) => setState({ step: "revalidate", session: { ...session, fixes } })} />;
    if (state.step === "revalidate") return <RevalidateView onComplete={completeRecheck} onBack={() => setState({ step: "manual", session: { ...session, fixes: session.fixes.slice(0, session.appliedFixCount ?? 0) } })} session={session} onReturnToFixes={(updated, step) => { setState({ step, session: updated }); window.scrollTo({ top: 0 }); }} onContinue={(updated) => setState({ step: "download", session: updated })} />;
    return <DownloadView onReturnToFixes={(step) => { setState({ step, session }); window.scrollTo({ top: 0 }); }} session={session} onStartOver={onExit} />;
  };

  const stage = state.step === "issues" || state.step === "assessing" ? 1 : state.step === "fix" || state.step === "clean-summary" ? 2 : state.step === "manual" ? 3 : state.step === "revalidate" ? 4 : 5;
  const pendingChanges = "session" in state && state.session.fixes.length > (state.session.appliedFixCount ?? 0);
  const canNavigate = (target: number) => state.step !== "assessing" && !applying && !pendingChanges && target < stage && (target !== 4 || ("session" in state && Boolean(state.session.revalidatedResult)));
  const navigate = (target: number) => {
    if (!canNavigate(target) || !("session" in state)) return;
    const session = state.session;
    if (target === 1) setState({ step: "issues", session });
    if (target === 2) setState({ step: "fix", session });
    if (target === 3) setState({ step: "manual", session });
    if (target === 4) setState({ step: "revalidate", session });
    window.scrollTo({ top: 0 });
  };
  return <div className={styles.workflow}>
    <WorkflowProgress canNavigate={canNavigate} onNavigate={navigate} stage={stage} />
    <p className="sr-only" role="status">{announcement}</p>
    {historyError && <p role="alert">{historyError}</p>}
    <div className={styles.layout}>
      <WorkflowNavigationActions value={"session" in state ? <SaveProgress fileName={state.session.fileName} xml={state.session.finalXml ?? state.session.originalXml} disabled={applying || pendingChanges} unappliedFixCount={unappliedFixCount} /> : null}>
        {renderStep()}
      </WorkflowNavigationActions>
      {"session" in state && <ActionHistory
        history={state.session.history ?? []} disabled={applying || pendingChanges || state.step === "clean-summary"} onUndo={() => {
        try {
          const session = undoLastReviewAction(state.session);
          const action = state.session.history?.findLast((entry) => entry.status === "applied");
          setHistoryError(null);
          setAnnouncement(`${action?.label} undone. Unapplied selections cleared.`);
          setReviewRevision((revision) => revision + 1);
          setState({ step: state.step === "manual" ? "manual" : "fix", session });
        } catch {
          setHistoryError("The last action could not be undone. Your file is unchanged.");
        }
      }} />}
    </div>
  </div>;
}
