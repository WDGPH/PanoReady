"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { REQUIRED_FIELD_GROUPS, fieldHierarchy } from "@/lib/fields";
import type { StudentRecord } from "@/lib/types";

export default function StudentEntry({ record }: { record: StudentRecord }) {
  const position = record.id.match(/^school(\d+):student(\d+)$/);
  const label = position ? `Student ${Number(position[1]) + 1}.${Number(position[2]) + 1}` : "Student record";
  const location = position ? `School ${Number(position[1]) + 1}, student ${Number(position[2]) + 1}` : record.xmlPath;
  return <Dialog.Root>
    <Dialog.Trigger asChild>
      <button type="button" className="student-entry-trigger" title={`View complete student entry · ${location}`} aria-label={`View ${label.toLowerCase()}`}>
        <span>{label}</span>
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="address-dialog-overlay" />
      <Dialog.Content className="address-dialog student-entry-dialog">
        <header className="student-entry-header">
          <div><Dialog.Title>Complete student entry</Dialog.Title><Dialog.Description>{label} · {location}</Dialog.Description></div>
          <Dialog.Close asChild><button type="button" className="btn btn-ghost">Close</button></Dialog.Close>
        </header>
        {REQUIRED_FIELD_GROUPS.map((group) => <section key={group.label}>
          <h3>{group.label}</h3>
          <dl>{group.fields.map((field) => <div key={field}>
            <dt title={fieldHierarchy(field)}>{field.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt>
            <dd>{record.fields[field] || <span className="empty-value">Not provided</span>}</dd>
          </div>)}</dl>
        </section>)}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
