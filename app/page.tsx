"use client";

import { useState } from "react";
import NavBar from "@/components/NavBar";
import StartOverDialog from "@/components/StartOverDialog";
import type { STIXComparison } from "@/lib/types";
import CompareWorkflow from "@/workflows/stix/CompareWorkflow";
import STIXIntake from "@/workflows/stix/STIXIntake";
import type { ValidateWorkflowInput } from "@/workflows/stix/STIXIntake";
import ValidateAndFixWorkflow from "@/workflows/stix/ValidateAndFixWorkflow";

type ActiveWorkflow =
  | { kind: "home" }
  | { kind: "validate"; input: ValidateWorkflowInput }
  | { kind: "compare"; comparison: STIXComparison };

export default function PanoReady() {
  const [activeWorkflow, setActiveWorkflow] = useState<ActiveWorkflow>({ kind: "home" });
  const [startOverOpen, setStartOverOpen] = useState(false);
  const returnHome = () => {
    setStartOverOpen(false);
    setActiveWorkflow({ kind: "home" });
    window.scrollTo({ top: 0 });
  };
  const handleLogoClick = () => {
    if (activeWorkflow.kind === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setStartOverOpen(true);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <NavBar onHome={handleLogoClick} />
      {activeWorkflow.kind === "home" && (
        <STIXIntake
          onCompare={(comparison) => setActiveWorkflow({ kind: "compare", comparison })}
          onValidate={(input) => setActiveWorkflow({ kind: "validate", input })}
        />
      )}
      {activeWorkflow.kind === "validate" && (
        <ValidateAndFixWorkflow input={activeWorkflow.input} onExit={returnHome} />
      )}
      {activeWorkflow.kind === "compare" && (
        <CompareWorkflow comparison={activeWorkflow.comparison} onStartOver={returnHome} />
      )}
      <StartOverDialog open={startOverOpen} onOpenChange={setStartOverOpen} onStartOver={returnHome} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
