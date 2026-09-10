const stages = ["Prepare & clean", "Validate", "Review & fix", "Recheck", "Download"];

export default function WorkflowProgress({ stage, cleaningSkipped, noFixes, hasIssues, canNavigate, onNavigate }: { stage: number; cleaningSkipped: boolean; noFixes: boolean; hasIssues: boolean; canNavigate: (stage: number) => boolean; onNavigate: (stage: number) => void }) {
  const overview = <ol className="workflow-progress-list">
    {stages.map((label, index) => {
      const number = index + 1;
      const status = number === 1 && stage > 1 && cleaningSkipped ? "Skipped"
        : stage === 5 && noFixes && number === 3 ? (hasIssues ? "Skipped" : "Not needed")
        : stage === 5 && noFixes && number === 4 ? "Not needed"
        : number < stage ? "Complete" : number === stage ? "Current step" : number === stage + 1 ? "Next" : "";
      const content = <><span className="workflow-progress-number">{number}</span><span>{label}{status && <small>{status}</small>}</span></>;
      return <li key={label} aria-current={number === stage ? "step" : undefined}>
        {canNavigate(number) ? <button type="button" className="workflow-step-link" aria-label={`Return to ${label}`} onClick={() => onNavigate(number)} title={number === 1 ? "Return to preparation and clear validation results and fixes" : number === 2 ? "Return to validation results and discard staged fixes" : "Return to this step"}>{content}</button> : content}
      </li>;
    })}
  </ol>;
  return <nav className="workflow-progress" aria-label="Validate and fix progress">
    <div className="workflow-progress-desktop">{overview}</div>
    <details className="workflow-progress-mobile">
      <summary>Step {stage} of 5 — {stages[stage - 1]}</summary>
      {overview}
    </details>
  </nav>;
}
