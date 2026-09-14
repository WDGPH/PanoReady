"use client";

import { downloadText } from "@/lib/utils";

export default function SaveProgress({ fileName, xml, disabled }: { fileName: string; xml: string; disabled: boolean }) {
  const name = `${fileName.replace(/\.(xml|xlsm|xls|stix)$/i, "").replace(/_in_progress$/i, "")}_in_progress.xml`;
  return <button type="button" className="btn btn-secondary" disabled={disabled}
    title="Download unencrypted STIX XML with applied changes. Upload it normally to continue; drafts, settings and Undo history are not included."
    onClick={() => downloadText(xml, name, "application/xml")}>Save in-progress file</button>;
}
