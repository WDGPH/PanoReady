"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useRef, type RefObject } from "react";
import { X } from "lucide-react";

export default function StartOverDialog({
  open,
  onOpenChange,
  onStartOver,
  returnFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartOver: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const keepWorkingRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="start-over-dialog-overlay" />
        <Dialog.Content className="start-over-dialog"
          onOpenAutoFocus={(event) => { event.preventDefault(); keepWorkingRef.current?.focus(); }}
          onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}>
          <Dialog.Close asChild>
            <button type="button" className="prompt-dialog-close" aria-label="Close start over prompt"><X size={17} /></button>
          </Dialog.Close>
          <Dialog.Title>Start over?</Dialog.Title>
          <Dialog.Description>
            This will abandon the current file and any unsaved changes, then return to the landing page.
          </Dialog.Description>
          <div className="start-over-dialog-actions">
            <Dialog.Close asChild>
              <button ref={keepWorkingRef} type="button" className="btn btn-secondary">Keep working</button>
            </Dialog.Close>
            <button type="button" className="btn btn-primary" onClick={onStartOver}>Start over</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
