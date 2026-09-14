"use client";

import { useState } from "react";
import { downloadText } from "@/lib/utils";

export default function SaveProgress({ fileName, prepare }: {
  fileName: string;
  prepare: () => string;
}) {
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    setError(null);
    try {
      const xml = prepare();
      downloadText(xml, `${fileName.replace(/\.(xml|xlsm|stix)$/i, "").replace(/_in_progress$/i, "")}_in_progress.xml`, "application/xml");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save progress.");
    }
  };
  return <div className="save-progress">
    <button type="button" className="btn btn-secondary" onClick={save} title="Download an unencrypted STIX file with applied changes. Upload it normally to continue; drafts, settings and Undo history are not included.">Save in-progress file</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
