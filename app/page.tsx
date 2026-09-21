"use client";

import { useCallback, useRef, useState } from "react";
import NavBar from "@/components/NavBar";
import StartOverDialog from "@/components/StartOverDialog";
import type { SaveProgressRegistration } from "@/components/SaveProgress";
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
  const homeButtonRef = useRef<HTMLButtonElement>(null);
  const saveProgressRef = useRef<(() => void) | null>(null);
  const [canSaveProgress, setCanSaveProgress] = useState(false);
  const registerSaveProgress = useCallback<SaveProgressRegistration>((save) => {
    saveProgressRef.current = save;
    setCanSaveProgress(Boolean(save));
  }, []);
  const returnHome = () => {
    saveProgressRef.current = null;
    setCanSaveProgress(false);
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
  const saveAndReturnHome = () => {
    saveProgressRef.current?.();
    returnHome();
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <NavBar onHome={handleLogoClick} homeButtonRef={homeButtonRef} />
      {activeWorkflow.kind === "home" && (
        <STIXIntake
          onCompare={(comparison) => setActiveWorkflow({ kind: "compare", comparison })}
          onValidate={(input) => setActiveWorkflow({ kind: "validate", input })}
        />
      )}
      {activeWorkflow.kind === "validate" && (
        <ValidateAndFixWorkflow input={activeWorkflow.input} onExit={returnHome} onSaveProgressChange={registerSaveProgress} />
      )}
      {activeWorkflow.kind === "compare" && (
        <CompareWorkflow comparison={activeWorkflow.comparison} onStartOver={returnHome} onSaveProgressChange={registerSaveProgress} />
      )}
      <StartOverDialog open={startOverOpen} onOpenChange={setStartOverOpen} onStartOver={returnHome}
        onSaveAndStartOver={canSaveProgress ? saveAndReturnHome : undefined} returnFocusRef={homeButtonRef} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
