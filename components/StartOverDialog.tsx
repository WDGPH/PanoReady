"use client";

import * as Dialog from "@radix-ui/react-dialog";

export default function StartOverDialog({
  open,
  onOpenChange,
  onStartOver,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartOver: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="start-over-dialog-overlay" />
        <Dialog.Content className="start-over-dialog">
          <Dialog.Title>Start over?</Dialog.Title>
          <Dialog.Description>
            This will abandon the current file and any unsaved changes, then return to the landing page.
          </Dialog.Description>
          <div className="start-over-dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="btn btn-secondary">Keep working</button>
            </Dialog.Close>
            <button type="button" className="btn btn-primary" onClick={onStartOver}>Start over</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
