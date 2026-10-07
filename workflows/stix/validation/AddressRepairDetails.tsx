import { TriangleAlert } from "lucide-react";
import type { AddressAutofixPlan } from "@/lib/types";
import { addressFieldLabel, addressRepairStepTitle } from "./addressRepairCopy";
import styles from "./AddressRepairDetails.module.css";

/** Show the steps compactly; the parent row already contains the final comparison. */
export default function AddressRepairDetails({ plan, id, recordLabel }: {
  plan: AddressAutofixPlan;
  id: string;
  recordLabel: string;
}) {
  return <section id={id} className={styles.panel} aria-label={`Repair steps for ${recordLabel}`}>
    {plan.stoppedReason && <p className={styles.stopped}>{plan.stoppedReason} No changes from this sequence will be applied.</p>}
    <ol className={styles.steps}>
      {plan.steps.map((step, index) => <li key={index}>
        <strong className={styles.title}>{addressRepairStepTitle(step)}. </strong>
        <span className={styles.changes}>{step.changes.map((change, changeIndex) => <span key={change.field}>
          {changeIndex > 0 && "; "}
          {change.proposedValue ? <>{changeIndex ? "set" : "Set"} {addressFieldLabel(change.field)} to <strong>{change.proposedValue}</strong></>
            : <>{changeIndex ? "clear" : "Clear"} {addressFieldLabel(change.field)}</>}
        </span>)}.</span>
      </li>)}
    </ol>
    {plan.remaining.length > 0 && <aside className={styles.remaining} aria-label="Remaining address issues">
      <h3><TriangleAlert size={14} aria-hidden="true" /> Still needs review</h3>
      <ul>{plan.remaining.map((finding, index) => <li key={index}>{finding.message}</li>)}</ul>
    </aside>}
  </section>;
}
