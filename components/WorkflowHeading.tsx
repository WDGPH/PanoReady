"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function WorkflowHeading({ title, advancedOptions }: { title: string; advancedOptions?: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  return <div className="workflow-heading">
    <div className="workflow-heading-row">
      <h1>{title}</h1>
      {advancedOptions && <button type="button" className="workflow-advanced-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Advanced options
      </button>}
    </div>
    {advancedOptions && <div id={panelId} hidden={!expanded} className="workflow-advanced-panel">{advancedOptions}</div>}
  </div>;
}
