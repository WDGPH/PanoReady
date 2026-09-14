"use client";
import WorkflowNavigation from "@/components/WorkflowNavigation";

import { useEffect, useState } from "react";
import { parseCanonicalXml, type CanonicalUpload } from "@/lib/canonical";
import type { RulesProfile, ValidationResult } from "@/lib/types";
import { validateCanonicalUpload } from "@/lib/validator";

export default function AssessmentView({ xml, document, rules, onComplete, onBack }: {
  xml: string;
  document?: CanonicalUpload;
  rules: RulesProfile;
  onComplete: (result: ValidationResult, document: CanonicalUpload) => void;
  onBack: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      try {
        if (!active) return;
        const currentDocument = document ?? parseCanonicalXml(xml);
        const result = validateCanonicalUpload(currentDocument, rules);
        if (active) onComplete(result, currentDocument);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to assess this file.");
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [xml, document, rules, onComplete]);
  const cancel = () => onBack();
  return <main className="fix-operation">
    <WorkflowNavigation onBack={cancel} nextLabel="Automatic fixes" nextDescription="Assessment in progress" />
    {error ? <><p role="alert">{error}</p></> : <div role="status" aria-live="polite">
      <p>Validating records…</p>
      <div className="fix-operation-track" role="progressbar" aria-label="File assessment"><span className="fix-operation-indeterminate" /></div>
    </div>}
  </main>;
}
