"use client";

import { useId } from "react";
import type { ReviewAction } from "@/lib/types";
import styles from "./ActionHistory.module.css";

export default function ActionHistory({ history, disabled, onUndo }: {
  history: ReviewAction[];
  disabled: boolean;
  onUndo: () => void;
}) {
  const headingId = useId();
  const latest = history.findLast((action) => action.status === "applied");
  const last = history.at(-1);
  if (!last) return null;
  return <aside className={styles.history} aria-labelledby={headingId}>
    <details>
      <summary id={headingId}>History ({history.length})</summary>
      <ol reversed>{[...history].reverse().map((action) => <li key={action.id}>
        {action.label} ({action.changes.length}){action.status === "undone" ? " — Undone" : ""}
      </li>)}</ol>
    </details>
    <button type="button" className="btn btn-ghost" disabled={disabled || !latest} onClick={onUndo}>Undo last action</button>
  </aside>;
}
