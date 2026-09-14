"use client";

import { useState } from "react";
import CleaningSummaryView from "@/components/CleaningSummaryView";
import CleaningView from "@/components/CleaningView";
import RulesetSelector from "@/components/RulesetSelector";
import { BUILTIN_ID, defaultRules, getActiveRulesetId, listCustomRulesets, saveCustomRuleset, setActiveRulesetId } from "@/lib/rulesets";
import { commitChangeGroup, draftTargetKey, reconcileChangeStatuses, undoChangeGroup } from "@/lib/session";
import { chooseAgeReferenceDate, validateCanonicalUpload } from "@/lib/validator";
import type { AppliedFix, ChangeOrigin, CleaningProfile, CleaningSummaryEntry, RulesProfile, StudentRecord, ValidateSession } from "@/lib/types";
import type { ValidateWorkflowInput } from "./STIXIntake";
import AssessmentView from "./validation/AssessmentView";
import DownloadView from "./validation/DownloadView";
import FixView from "./validation/FixView";
import IssuesView from "./validation/IssuesView";
import WorkflowProgress from "./validation/WorkflowProgress";
import ActionHistory from "./validation/ActionHistory";
import type { ReviewExclusion, ReviewFilter } from "./validation/overview";
import SaveProgress from "@/components/SaveProgress";
import { prepareCheckedOutput } from "@/lib/stixExport";

type ValidateWorkflowState =
  | { step: "assessing"; xml: string; fileName: string; rules: RulesProfile }
  | { step: "clean-summary"; session: ValidateSession; baseRecords: StudentRecord[]; cleanedRecords: StudentRecord[]; summary: CleaningSummaryEntry[] }
  | { step: "issues" | "fix" | "manual" | "download"; session: ValidateSession; filter?: ReviewFilter };

function withDocument(session: ValidateSession, document: ValidateSession["document"], history = session.history): ValidateSession {
  return { ...session, document, history, currentResult: validateCanonicalUpload(document, session.validationRules) };
}

function applyGroup(session: ValidateSession, fixes: AppliedFix[], label: string, origin: ChangeOrigin): ValidateSession {
  if (!fixes.length) return session;
  const committed = commitChangeGroup(session.document, fixes, { label, origin });
  const history = reconcileChangeStatuses(committed.document, [...session.history, committed.group]);
  return withDocument(session, committed.document, history);
}

function clearAppliedDrafts(session: ValidateSession, fixes: AppliedFix[]): ValidateSession {
  const issueIds = new Set(fixes.map(draftTargetKey));
  const repairIds = new Set(fixes.filter((fix) => fix.repairId).map((fix) => fix.recordId));
  return {
    ...session,
    drafts: {
      values: Object.fromEntries(Object.entries(session.drafts.values).filter(([key]) => !issueIds.has(key))),
      addresses: Object.fromEntries(Object.entries(session.drafts.addresses).filter(([key]) => !repairIds.has(key))),
    },
  };
}

export default function ValidateAndFixWorkflow({ input, onExit }: { input: ValidateWorkflowInput; onExit: () => void }) {
  const [profile, setProfile] = useState<{ id: string; rules: RulesProfile; cleaning: CleaningProfile | null; revision: number }>(() => {
    const saved = listCustomRulesets().find((candidate) => candidate.id === getActiveRulesetId());
    return { id: saved?.id ?? BUILTIN_ID, rules: saved?.rules ?? defaultRules, cleaning: saved?.cleaning ?? null, revision: 0 };
  });
  const [draftCleaning, setDraftCleaning] = useState<CleaningProfile | null>(profile.cleaning);
  const [state, setState] = useState<ValidateWorkflowState>(() => ({ step: "assessing", xml: input.xml, fileName: input.fileName, rules: profile.rules }));
  const [exclusions, setExclusions] = useState<ReviewExclusion[]>([]);
  const [selectorRevision, setSelectorRevision] = useState(0);

  const cleaningOptions = (session: ValidateSession) => <CleaningView
    key={profile.revision}
    records={session.currentResult.records}
    initialProfile={draftCleaning}
    onProfileChange={setDraftCleaning}
    isBuiltin={profile.id === BUILTIN_ID}
    onApply={(cleanedRecords, summary) => setState({ step: "clean-summary", session, baseRecords: session.currentResult.records, cleanedRecords, summary })}
    onSaveToRuleset={(cleaning, name) => {
      const existing = listCustomRulesets().find((candidate) => candidate.id === profile.id);
      const updated = existing ? { ...existing, rules: profile.rules } : {
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
  />;

  const saveProgress = "session" in state ? <SaveProgress fileName={state.session.fileName} prepare={() =>
    prepareCheckedOutput(state.session.document, state.session.validationRules).xml
  } /> : undefined;

  const renderStep = () => {
    if (state.step === "assessing") return <AssessmentView xml={state.xml} document={input.document} rules={state.rules} onBack={onExit} onComplete={(result, document) => {
      const referenceDate = chooseAgeReferenceDate(document.metadata.createDate, new Date().toISOString().slice(0, 10));
      const setupChanges = input.initialSetupChanges ?? [];
      const appliedAt = Date.now();
      const history = setupChanges.length ? [{ id: crypto.randomUUID(), label: `Applied ${setupChanges.length} workbook setup change${setupChanges.length === 1 ? "" : "s"}`, origin: "setup" as const, appliedAt, changes: setupChanges.map((change) => ({ ...change, appliedAt })), status: "applied" as const }] : [];
      setState({ step: "issues", session: { fileName: state.fileName, document, initialIssueCount: result.issues.length, currentResult: result, history, validationRules: state.rules, inputFormat: input.inputFormat, importTransformationCount: input.importTransformationCount, originalCreatedBy: input.originalCreatedBy ?? document.metadata.createdBy, dateAssumption: input.dateAssumption, referenceDate, drafts: { values: {}, addresses: {} } } });
    }} />;

    if (state.step === "clean-summary") return <CleaningSummaryView summary={state.summary} onBack={() => setState({ step: "fix", session: state.session })} onContinue={() => {
      const fixes: AppliedFix[] = [];
      const seen = new Set<string>();
      for (const entry of state.summary) for (let index = 0; index < state.baseRecords.length; index++) {
        const original = state.baseRecords[index];
        const cleaned = state.cleanedRecords[index];
        const key = `${original.id}\0${entry.field}`;
        if (!seen.has(key) && original.fields[entry.field] !== cleaned.fields[entry.field] && cleaned.fields[entry.field] === entry.canonical) {
          fixes.push({ issueId: `cleaning-${fixes.length}`, recordId: original.id, field: entry.field, oldValue: original.fields[entry.field] ?? "", newValue: entry.canonical, ruleId: "cleaning", appliedAt: Date.now() });
          seen.add(key);
        }
      }
      setState({ step: "fix", session: applyGroup(state.session, fixes, `Cleaned ${fixes.length} value${fixes.length === 1 ? "" : "s"}`, "cleaning") });
    }} />;

    const session = state.session;
    if (state.step === "issues") return <IssuesView
      saveProgress={saveProgress}
      onBack={onExit}
      advancedOptions={<RulesetSelector key={selectorRevision} compact initialId={profile.id} notifyOnMount={false} onRulesChange={(rules, cleaning, id) => {
        setProfile((current) => ({ id, rules, cleaning, revision: current.revision + 1 }));
        setDraftCleaning(cleaning);
        setExclusions([]);
        setState({ step: "issues", session: { ...session, validationRules: rules, currentResult: validateCanonicalUpload(session.document, rules) } });
      }} />}
      session={session}
      exclusions={exclusions}
      onExclusionsChange={setExclusions}
      onFix={(filter, view = "automatic") => setState({ step: view === "automatic" ? "fix" : "manual", session, filter })}
      onSkipToDownload={() => setState({ step: "download", session })}
    />;
    if (state.step === "fix" || state.step === "manual") return <FixView
      saveProgress={saveProgress}
      onBack={() => setState({ step: state.step === "fix" ? "issues" : "fix", session })}
      advancedOptions={state.step === "fix" ? cleaningOptions(session) : undefined}
      key={JSON.stringify([state.step, state.filter ?? {}, exclusions])}
      view={state.step === "fix" ? "automatic" : "manual"}
      exclusions={exclusions}
      session={session}
      filter={state.filter}
      onContinue={() => setState({ step: state.step === "fix" ? "manual" : "download", session, filter: state.filter })}
      onAutoApply={(batch) => setState({ ...state, session: clearAppliedDrafts(applyGroup(session, batch, `Applied ${batch.length} automatic fix${batch.length === 1 ? "" : "es"}`, "automatic"), batch) })}
      onDraftsChange={(drafts) => setState({ ...state, session: { ...session, drafts } })}
      onClearFilter={() => setState({ step: state.step, session })}
      onApply={(batch) => {
        const schoolIds = new Set(session.document.schools.map((school) => school.schoolId));
        const setup = batch.every((change) => change.recordId === "metadata" || schoolIds.has(change.recordId));
        setState({ step: "manual", session: clearAppliedDrafts(applyGroup(session, batch, `Applied ${batch.length} ${setup ? "file or school setup" : "reviewed"} change${batch.length === 1 ? "" : "s"}`, setup ? "setup" : "manual"), batch) });
      }}
    />;
    return <DownloadView saveProgress={saveProgress} onReturnToFixes={(step) => { setState({ step, session }); window.scrollTo({ top: 0 }); }} session={session} onStartOver={onExit} />;
  };

  const stage = state.step === "issues" || state.step === "assessing" ? 1 : state.step === "fix" || state.step === "clean-summary" ? 2 : state.step === "manual" ? 3 : 4;
  const canNavigate = (target: number) => state.step !== "assessing" && target < stage;
  const navigate = (target: number) => {
    if (!canNavigate(target) || !("session" in state)) return;
    const session = state.session;
    if (target === 1) setState({ step: "issues", session });
    if (target === 2) setState({ step: "fix", session });
    if (target === 3) setState({ step: "manual", session });
    window.scrollTo({ top: 0 });
  };
  const undoLatest = () => {
    if (!("session" in state)) return;
    const index = state.session.history.findLastIndex((group) => group.status === "applied");
    if (index < 0) return;
    const latest = state.session.history[index];
    const document = undoChangeGroup(state.session.document, latest);
    const history = reconcileChangeStatuses(document, state.session.history.map((group, groupIndex) => groupIndex === index ? { ...group, status: "undone" as const } : group));
    setState({ ...state, session: withDocument(state.session, document, history) });
  };
  const history = "session" in state ? state.session.history : [];
  return <div className="validation-workflow">
    <WorkflowProgress canNavigate={canNavigate} onNavigate={navigate} stage={stage} />
    <div className="validation-layout">
      {history.length > 0 && <ActionHistory history={history} onUndo={undoLatest} />}
      {renderStep()}
    </div>
  </div>;
}
