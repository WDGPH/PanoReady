"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { REQUIRED_FIELD_GROUPS } from "@/lib/fields";
import type { StudentRecord } from "@/lib/types";

export function studentReference(record: StudentRecord): string {
  const position = record.id.match(/^school(\d+):student(\d+)$/);
  return position ? `Student ${Number(position[1]) + 1}.${Number(position[2]) + 1}` : "Student record";
}

export default function StudentEntry({ record }: { record: StudentRecord }) {
  const label = studentReference(record);
  return <Dialog.Root>
    <Dialog.Trigger asChild>
      <button type="button" className="review-context-action" aria-label={`View ${label.toLowerCase()}`}>{label}</button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="review-dialog-overlay" />
      <Dialog.Content className="review-dialog student-entry-dialog">
        <header className="review-dialog-header">
          <div><Dialog.Title>Student details</Dialog.Title><Dialog.Description>{label} · {record.xmlPath}</Dialog.Description></div>
          <Dialog.Close asChild><button type="button" className="btn btn-ghost">Close</button></Dialog.Close>
        </header>
        {REQUIRED_FIELD_GROUPS.map((group) => <section key={group.label}>
          <h3>{group.label}</h3>
          <dl>{group.fields.map((field) => <div key={field}>
            <dt>{field.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt>
            <dd>{record.fields[field] || <span className="empty-value">Not provided</span>}</dd>
          </div>)}</dl>
        </section>)}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
