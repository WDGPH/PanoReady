"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, X } from "lucide-react";
import type { ReviewAction } from "@/lib/types";
import styles from "./ActionHistory.module.css";

export default function ActionHistory({ history, disabled, onUndo }: {
  history: ReviewAction[];
  disabled: boolean;
  onUndo: () => void;
}) {
  const latest = history.findLast((action) => action.status === "applied");
  if (!history.length) return null;
  return <Dialog.Root>
    <Dialog.Trigger asChild>
      <button type="button" className={styles.trigger}>
        <ChevronLeft size={14} aria-hidden="true" /> History ({history.length})
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.history} aria-describedby={undefined}>
        <div className={styles.heading}>
          <Dialog.Title className={styles.title}>History ({history.length})</Dialog.Title>
          <Dialog.Close asChild>
            <button type="button" className={styles.close} aria-label="Close history"><X size={18} aria-hidden="true" /></button>
          </Dialog.Close>
        </div>
        <button type="button" className={styles.action} disabled={disabled || !latest} onClick={onUndo}>Undo last action</button>
        <ol>{[...history].reverse().map((action) => <li key={action.id}>
          <span>{action.label} ({action.changes.length})</span>
          {action.status === "undone" && <small>Undone</small>}
        </li>)}</ol>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
