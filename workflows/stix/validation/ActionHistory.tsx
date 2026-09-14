"use client";

import { useId, useState, type ReactNode } from "react";
import type { ReviewAction } from "@/lib/types";
import styles from "./ActionHistory.module.css";

export default function ActionHistory({ history, disabled, onUndo, saveProgress }: {
  history: ReviewAction[];
  disabled: boolean;
  onUndo: () => void;
  saveProgress?: ReactNode;
}) {
  const headingId = useId();
  const listId = useId();
  const [expanded, setExpanded] = useState(true);
  const latest = history.findLast((action) => action.status === "applied");
  const last = history.at(-1);
  if (!last && !saveProgress) return null;
  return <aside className={styles.history} aria-label="Review actions">
    {saveProgress && <div className={styles.save}>{saveProgress}</div>}
    {last && <>
    <div className={styles.heading}>
      <button type="button" id={headingId} className={styles.action} aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)}>History ({history.length})</button>
      <button type="button" className={styles.action} disabled={disabled || !latest} onClick={onUndo}>Undo last action</button>
    </div>
    <ol id={listId} hidden={!expanded}>{[...history].reverse().map((action) => <li key={action.id}>
      <span>{action.label} ({action.changes.length})</span>
      {action.status === "undone" && <small>Undone</small>}
    </li>)}</ol>
    </>}
  </aside>;
}
