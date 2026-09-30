import { applyReviewChanges } from "./reviewHistory";
import { countAppliedCorrections } from "./fixSummary";
import type { AppliedFix, ValidateSession } from "./types";

type Request = { session: ValidateSession; fixes: AppliedFix[] };
type Progress = { stage: "applying" | "rechecking"; completed: number; total: number };
type Response =
  | { type: "progress"; progress: Progress }
  | { type: "complete"; session: ValidateSession }
  | { type: "error"; message: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: Response) => void;
};

workerScope.onmessage = (event: MessageEvent<Request>) => {
  const { session, fixes } = event.data;
  const correctionTotal = countAppliedCorrections(fixes);
  const completedCorrections = new Set<string>();
  const correctionFixTotals = new Map<string, number>();
  const correctionFixCompleted = new Map<string, number>();
  for (const fix of fixes) {
    const key = fix.repairId ? `repair\0${fix.repairId}` : `issue\0${fix.issueId}`;
    correctionFixTotals.set(key, (correctionFixTotals.get(key) ?? 0) + 1);
  }
  const reportEvery = Math.max(1, Math.ceil(fixes.length / 100));

  try {
    const updated = applyReviewChanges({ ...session, fixes: [...session.fixes, ...fixes] }, "Automatic fixes", (progress) => {
      if (progress.stage === "applying") {
        const fix = fixes[progress.completed - 1];
        if (fix) {
          const key = fix.repairId ? `repair\0${fix.repairId}` : `issue\0${fix.issueId}`;
          const completedFixes = (correctionFixCompleted.get(key) ?? 0) + 1;
          correctionFixCompleted.set(key, completedFixes);
          if (completedFixes === correctionFixTotals.get(key)) completedCorrections.add(key);
        }
        if (progress.completed % reportEvery !== 0 && progress.completed !== fixes.length) return;
        workerScope.postMessage({ type: "progress", progress: {
          stage: "applying", completed: completedCorrections.size, total: correctionTotal,
        } });
        return;
      }

      const recheckEvery = Math.max(1, Math.ceil(progress.total / 100));
      if (progress.completed !== 0 && progress.completed !== progress.total && progress.completed % recheckEvery !== 0) return;
      workerScope.postMessage({ type: "progress", progress });
    });
    workerScope.postMessage({ type: "complete", session: updated });
  } catch (error) {
    workerScope.postMessage({ type: "error", message: error instanceof Error ? error.message : "Unable to apply fixes." });
  }
};
