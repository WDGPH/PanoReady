"use client";

import { useState } from "react";
import { applyPhixFixes } from "@/lib/phixFixer";
import { validatePhix } from "@/lib/phixValidator";
import defaultPhixRules from "@/config/rules.phix.default.json";
import type { AppliedFix, PhixSession } from "@/lib/types";
import type { PHIXWorkflowInput } from "./PHIXIntake";
import IssuesView from "./validation/IssuesView";
import AutoFixView from "./validation/AutoFixView";
import FixView from "./validation/FixView";
import RevalidateView from "./validation/RevalidateView";
import DownloadView from "./validation/DownloadView";
import WorkflowProgress from "./validation/WorkflowProgress";

type PHIXWorkflowState =
  | { step: "issues";     session: PhixSession }
  | { step: "auto-fix";   session: PhixSession }
  | { step: "manual";     session: PhixSession }
  | { step: "revalidate"; session: PhixSession }
  | { step: "download";   session: PhixSession };

export default function PHIXWorkflow({ input, onExit }: { input: PHIXWorkflowInput; onExit: () => void }) {
  const [state, setState] = useState<PHIXWorkflowState>({
    step: "issues",
    session: { fileName: input.fileName, originalCsv: input.csvText, initialResult: input.result, fixes: [] },
  });

  const session = state.session;

  // stage: issues=1, auto-fix=2, manual=3, revalidate+download=4
  const stage =
    state.step === "issues"   ? 1 :
    state.step === "auto-fix" ? 2 :
    state.step === "manual"   ? 3 : 4;

  const canNavigate = (target: number) =>
    target < stage && (target !== 4 || Boolean(session.revalidatedResult));

  const navigate = (target: number) => {
    if (!canNavigate(target)) return;
    if (target === 1) setState({ step: "issues",   session });
    if (target === 2) setState({ step: "auto-fix", session });
    if (target === 3) setState({ step: "manual",   session });
    window.scrollTo({ top: 0 });
  };

  const renderStep = () => {
    if (state.step === "issues") {
      return (
        <IssuesView
          result={session.initialResult}
          fileName={session.fileName}
          onStartOver={onExit}
          onFix={() => setState({ step: "auto-fix", session })}
        />
      );
    }

    if (state.step === "auto-fix") {
      return (
        <AutoFixView
          session={session}
          onBack={() => setState({ step: "issues", session })}
          onAutoApply={(batch: AppliedFix[]) => {
            if (batch.length === 0) {
              setState({ step: "manual", session });
              return;
            }
            const fixes = [...session.fixes, ...batch];
            const fixedCsv = applyPhixFixes(session.originalCsv, fixes);
            const revalidatedResult = validatePhix(fixedCsv, defaultPhixRules as Parameters<typeof validatePhix>[1]);
            setState({ step: "manual", session: { ...session, fixes, revalidatedResult } });
          }}
        />
      );
    }

    if (state.step === "manual") {
      return (
        <FixView
          session={session}
          onBack={() => setState({ step: "auto-fix", session })}
          onApply={(newFixes: AppliedFix[]) =>
            setState({ step: "revalidate", session: { ...session, fixes: [...session.fixes, ...newFixes] } })
          }
          requiredFields={(defaultPhixRules as Parameters<typeof validatePhix>[1]).requiredFields}
        />
      );
    }

    if (state.step === "revalidate") {
      return (
        <RevalidateView
          session={session}
          onBack={(updated: PhixSession) => setState({ step: "manual", session: updated })}
          onContinue={(updated: PhixSession) => setState({ step: "download", session: updated })}
        />
      );
    }

    return (
      <DownloadView
        session={session}
        onStartOver={onExit}
      />
    );
  };

  return (
    <>
      <WorkflowProgress stage={stage} canNavigate={canNavigate} onNavigate={navigate} />
      {renderStep()}
    </>
  );
}
