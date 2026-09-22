"use client";

import { createContext, useContext, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const WorkflowNavigationActions = createContext<ReactNode>(null);

export default function WorkflowNavigation({ onBack, backActions, onNext, disabled = false, nextLabel, nextDescription }: {
  onBack: (trigger?: HTMLButtonElement) => void;
  backActions?: ReactNode;
  onNext?: () => void;
  disabled?: boolean;
  nextLabel?: string;
  nextDescription?: string;
}) {
  const actions = useContext(WorkflowNavigationActions);
  return <nav className="workflow-navigation" aria-label="Workflow navigation">
    {backActions ?? <button type="button" className="btn btn-secondary" disabled={disabled} onClick={(event) => { onBack(event.currentTarget); window.scrollTo({ top: 0 }); }}><ArrowLeft size={16} /> Back</button>}
    <div className="workflow-navigation-actions">
    {nextLabel && <button type="button" className="btn btn-primary" disabled={disabled || !onNext} title={nextDescription} onClick={() => { onNext?.(); window.scrollTo({ top: 0 }); }}>{nextLabel}<ArrowRight size={16} /></button>}
    {actions}
    </div>
  </nav>;
}
