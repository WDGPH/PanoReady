import { validateXml } from "./validator";
import type { RulesProfile, ValidationResult } from "./types";

type Request = { xml: string; rules: RulesProfile };
type Response =
  | { type: "progress"; completed: number; total: number }
  | { type: "complete"; result: ValidationResult }
  | { type: "error"; message: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: Response) => void;
};

workerScope.onmessage = (event: MessageEvent<Request>) => {
  try {
    const result = validateXml(event.data.xml, event.data.rules, (completed, total) => {
      if (completed === 0 || completed === total || completed % Math.max(1, Math.ceil(total / 100)) === 0) {
        const response: Response = { type: "progress", completed, total };
        workerScope.postMessage(response);
      }
    });
    const response: Response = { type: "complete", result };
    workerScope.postMessage(response);
  } catch (error) {
    const response: Response = { type: "error", message: error instanceof Error ? error.message : "Unable to assess this file." };
    workerScope.postMessage(response);
  }
};
