"use client";

import { downloadText } from "@/lib/utils";

function downloadProgress(fileName: string, xml: string) {
  const name = `${fileName.replace(/\.(xml|xlsm|xls|stix)$/i, "").replace(/_in_progress$/i, "")}_in_progress.xml`;
  downloadText(xml, name, "application/xml");
}

export default function SaveProgress({ fileName, xml, disabled }: { fileName: string; xml: string; disabled: boolean }) {
  return <button type="button" className="btn save-progress" disabled={disabled}
    title="Download your current file with applied corrections. Unapplied edits and review history aren’t saved."
    onClick={() => downloadProgress(fileName, xml)}>Save progress</button>;
}
