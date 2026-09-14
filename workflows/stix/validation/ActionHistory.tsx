"use client";

import { useEffect, useState } from "react";
import type { AppliedChangeGroup } from "@/lib/types";

export default function ActionHistory({ history, onUndo }: { history: AppliedChangeGroup[]; onUndo: () => void }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1400px)");
    const update = () => setExpanded(desktop.matches);
    update();
    desktop.addEventListener("change", update);
    return () => desktop.removeEventListener("change", update);
  }, []);
  const latest = history.findLast((group) => group.status === "applied");
  return <aside className="workflow-action-history" aria-label="History">
    <div className="action-history-heading">
      <button type="button" className="text-action" aria-expanded={expanded} aria-controls="action-history-list" onClick={() => setExpanded(!expanded)}>History ({history.length})</button>
      {latest && <button type="button" className="text-action" onClick={onUndo} aria-label={`Undo last action (${latest.changes.length})`}>Undo last action</button>}
    </div>
    <span className="sr-only" role="status">{history.at(-1)?.label}{history.at(-1)?.status === "undone" ? " — undone" : ""}</span>
    {expanded && <ol id="action-history-list">{history.toReversed().map((group) => <li key={group.id}>
      <span>{group.label}</span>
      {group.status !== "applied" && <small>{group.status === "undone" ? "Undone" : "Changed by a later action"}</small>}
    </li>)}</ol>}
  </aside>;
}
