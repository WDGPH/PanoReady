const stages = ["Quality assessment", "Automatic fixes", "Manual fixes", "Summary and Output"];

export default function WorkflowProgress({ stage, canNavigate, onNavigate }: { stage: number; canNavigate: (stage: number) => boolean; onNavigate: (stage: number) => void }) {
  const overview = <ol className="workflow-progress-list">
    {stages.map((label, index) => {
      const number = index + 1;
      const content = <><span className="workflow-progress-number">{number}</span><span>{label}</span></>;
      return <li key={label} aria-current={number === stage ? "step" : undefined}>
        {canNavigate(number) ? <button type="button" className="workflow-step-link" aria-label={`Return to ${label}`} onClick={() => onNavigate(number)} title={number === 1 ? "Return to the latest quality assessment" : "Return to this step"}>{content}</button> : content}
      </li>;
    })}
  </ol>;
  return <nav className="workflow-progress" aria-label="Validate and fix progress">
    <div className="workflow-progress-desktop">{overview}</div>
    <details className="workflow-progress-mobile">
      <summary>Step {stage} of 4 — {stages[stage - 1]}</summary>
      {overview}
    </details>
  </nav>;
}
