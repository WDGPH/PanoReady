"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { downloadText } from "@/lib/utils";

function downloadProgress(fileName: string, xml: string) {
  const name = `${fileName.replace(/\.(xml|xlsm|xls|stix)$/i, "").replace(/_in_progress$/i, "")}_in_progress.xml`;
  downloadText(xml, name, "application/xml");
}

export default function SaveProgress({ fileName, xml, disabled, unappliedFixCount = 0 }: {
  fileName: string;
  xml: string;
  disabled: boolean;
  unappliedFixCount?: number;
}) {
  const [warningOpen, setWarningOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const save = () => downloadProgress(fileName, xml);

  return <>
    <button ref={triggerRef} type="button" className="btn save-progress" disabled={disabled}
      title="Download your current file with applied corrections. Unapplied fixes and review history aren’t saved."
      onClick={() => unappliedFixCount ? setWarningOpen(true) : save()}>Save progress</button>
    <Dialog.Root open={warningOpen} onOpenChange={setWarningOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="start-over-dialog-overlay" />
        <Dialog.Content className="start-over-dialog save-progress-dialog" onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}>
          <Dialog.Close asChild>
            <button type="button" className="prompt-dialog-close" aria-label="Close save progress prompt"><X size={17} /></button>
          </Dialog.Close>
          <Dialog.Title>Apply fixes before saving</Dialog.Title>
          <Dialog.Description>
            You have {unappliedFixCount} unapplied {unappliedFixCount === 1 ? "fix" : "fixes"}. Selected automatic fixes and staged manual edits are included only after you apply them.
          </Dialog.Description>
          <div className="start-over-dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="btn btn-primary">Go back and apply fixes</button>
            </Dialog.Close>
            <button type="button" className="btn btn-secondary" onClick={() => { save(); setWarningOpen(false); }}>Save applied progress only</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
