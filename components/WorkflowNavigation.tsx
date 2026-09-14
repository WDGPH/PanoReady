import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function WorkflowNavigation({ onBack, backLabel = "Back", backActions, onNext, disabled = false, nextLabel, nextDescription, secondaryAction }: {
  onBack: () => void;
  backLabel?: string;
  secondaryAction?: ReactNode;
  backActions?: ReactNode;
  onNext?: () => void;
  disabled?: boolean;
  nextLabel?: string;
  nextDescription?: string;
}) {
  return <nav className="workflow-navigation" aria-label="Workflow navigation">
    {backActions ?? <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => { onBack(); window.scrollTo({ top: 0 }); }}><ArrowLeft size={16} /> {backLabel}</button>}
    <div className="workflow-next-actions">
      {nextLabel && <button type="button" className="btn btn-primary" disabled={disabled || !onNext} title={nextDescription} onClick={() => { onNext?.(); window.scrollTo({ top: 0 }); }}>{nextLabel}<ArrowRight size={16} /></button>}
      {secondaryAction}
    </div>
  </nav>;
}
