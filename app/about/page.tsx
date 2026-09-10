"use client";

import { useEffect } from "react";

export default function AboutPage() {
  useEffect(() => {
    // Preserve deployment prefixes when following an old About link.
    window.location.replace(window.location.pathname.replace(/\/about\/?$/, "/") + "#intro");
  }, []);

  return <p style={{ padding: 24 }}>Opening PanoReady…</p>;
}
