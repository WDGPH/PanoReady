"use client";
import WorkflowNavigation from "@/components/WorkflowNavigation";

import { useEffect, useState } from "react";
import { validateXml } from "@/lib/validator";
import type { RulesProfile, ValidationResult } from "@/lib/types";

export default function AssessmentView({ xml, rules, onComplete, onBack }: {
  xml: string;
  rules: RulesProfile;
  onComplete: (result: ValidationResult) => void;
  onBack: (trigger?: HTMLButtonElement) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const started = performance.now();
    let completionTimer: number;
    // Paint feedback before starting synchronous XML validation.
    const timer = window.setTimeout(() => {
      try {
        const result = validateXml(xml, rules);
        setProgress(100);
        completionTimer = window.setTimeout(() => onComplete(result), Math.max(200, 1000 - (performance.now() - started)));
      }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to assess this file."); }
    }, 80);
    return () => { window.clearTimeout(timer); window.clearTimeout(completionTimer); };
  }, [xml, rules, onComplete]);
  return <main className="fix-operation">
    <WorkflowNavigation onBack={onBack} nextLabel="Automatic fixes" nextDescription="Assessment in progress" />
    {error ? <><p role="alert">{error}</p></> : <div role="status" aria-live="polite">
      <p>Assessing file quality…</p>
      <div className="fix-operation-track" role="progressbar" aria-label="File assessment" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
    </div>}
  </main>;
}
