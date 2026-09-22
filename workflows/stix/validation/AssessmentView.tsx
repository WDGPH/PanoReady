"use client";
import WorkflowNavigation from "@/components/WorkflowNavigation";

import { useEffect, useState } from "react";
import type { RulesProfile, ValidationResult } from "@/lib/types";

export default function AssessmentView({ xml, rules, onComplete, onBack }: {
  xml: string;
  rules: RulesProfile;
  onComplete: (result: ValidationResult) => void;
  onBack: (trigger?: HTMLButtonElement) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  useEffect(() => {
    const worker = new Worker(new URL("../../../lib/validator.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ type: "progress"; completed: number; total: number } | { type: "complete"; result: ValidationResult } | { type: "error"; message: string }>) => {
      const message = event.data;
      if (message.type === "progress") setProgress({ completed: message.completed, total: message.total });
      else if (message.type === "complete") { onComplete(message.result); worker.terminate(); }
      else { setError(message.message); worker.terminate(); }
    };
    worker.onerror = () => { setError("Unable to assess this file."); worker.terminate(); };
    worker.postMessage({ xml, rules });
    return () => worker.terminate();
  }, [xml, rules, onComplete]);
  const percent = progress.total ? Math.round(progress.completed / progress.total * 100) : 0;
  return <main className="fix-operation">
    <WorkflowNavigation onBack={onBack} nextLabel="Automatic fixes" nextDescription="Assessment in progress" />
    {error ? <><p role="alert">{error}</p></> : <div role="status" aria-live="polite">
      <p>{progress.total ? `Assessing student ${progress.completed} of ${progress.total}…` : "Reading file and preparing assessment…"}</p>
      <div className="fix-operation-track" role="progressbar" aria-label="File assessment" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
    </div>}
  </main>;
}
