"use client";

import { type ReactNode, useEffect, useId } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check, ChevronRight, ChevronsDown, ChevronsUp, RotateCcw } from "lucide-react";
import { guardianSectionForField, REQUIRED_FIELD_GROUPS } from "@/lib/fields";
import type { RulesProfile, StudentRecord, ValidationIssue } from "@/lib/types";

const dialogFieldGroups = [
  ...REQUIRED_FIELD_GROUPS.filter(group => group.label === "School"),
  ...REQUIRED_FIELD_GROUPS.filter(group => group.label !== "School"),
];

export function studentReference(record: StudentRecord): string {
  const position = record.id.match(/^school(\d+):student(\d+)$/);
  return position ? `Student ${Number(position[1]) + 1}.${Number(position[2]) + 1}` : "Student record";
}

type StudentEditor = {
  rules: RulesProfile;
  draft: Record<string, string>;
  issue: ValidationIssue;
  issues: ValidationIssue[];
  readOnlyFields: string[];
  onDraftChange: (field: string, value: string) => void;
  onReset: () => void;
  onGuardianRemoval: (guardian: "Guardian" | "Guardian2", remove: boolean) => void;
  addressEditor?: ReactNode;
  triggerLabel?: string;
};

type ReviewNavigation = {
  position: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  onReturnFocus: () => void;
};

export default function StudentEntry({ record, editor, navigation }: { record: StudentRecord; editor?: StudentEditor; navigation?: ReviewNavigation }) {
  const id = useId();
  const isNavigating = Boolean(navigation);
  useEffect(() => {
    if (!isNavigating) return;
    const target = document.getElementById(`${id}-review-section`);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest" });
  }, [record.id, id, isNavigating]);
  const draft = editor?.draft ?? {};
  const changedCount = Object.keys(draft).filter(field => {
    const guardian = guardianSectionForField(field);
    return !(guardian && draft[guardian] === "") && draft[field] !== (record.fields[field] ?? "");
  }).length;
  const removedCount = ["Guardian", "Guardian2"].filter(field => draft[field] === "").length;
  const hasChanges = changedCount > 0 || removedCount > 0;
  const stagedLabel = [
    changedCount ? `${changedCount} field change${changedCount === 1 ? "" : "s"}` : "",
    removedCount ? `${removedCount} guardian removal${removedCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ") + " staged";
  const optionsFor = (field: string): string[] | undefined => {
    if (!editor) return;
    const { rules } = editor;
    if (field.endsWith("Relationship")) return rules.allowedRelationshipValues;
    if (field.endsWith("PhoneType")) return rules.allowedPhoneTypeValues;
    return ({ Grade: rules.allowedGradeValues, Gender: rules.allowedGenderValues,
      Language: rules.allowedLanguageValues, CountryOfOrigin: rules.allowedCountryValues,
      Province: rules.allowedProvinceValues, StreetType: rules.allowedStreetTypeValues,
      StreetDirection: rules.allowedStreetDirectionValues } as Record<string, string[]>)[field];
  };
  const label = studentReference(record);
  const visibleFieldGroups = editor?.addressEditor
    ? dialogFieldGroups.filter(group => group.label === "Address")
    : dialogFieldGroups;
  const targetChanged = editor?.issue.field && draft[editor.issue.field] !== undefined
    && draft[editor.issue.field] !== (record.fields[editor.issue.field] ?? "");
  return <Dialog.Root open={navigation ? true : undefined} onOpenChange={open => { if (!open) navigation?.onClose(); }}>
    {!navigation && <Dialog.Trigger asChild>
      <button type="button" className="review-context-action" aria-label={editor ? `Review ${editor.issue.repairProposal ? "address" : "student"} for ${label}` : `View ${label.toLowerCase()}`}>
        {editor ? (editor.triggerLabel ?? (targetChanged || changedCount || removedCount ? "Edit staged changes" : "Review and edit")) : label}
      </button>
    </Dialog.Trigger>}
    <Dialog.Portal>
      <Dialog.Overlay className="review-dialog-overlay" />
      <Dialog.Content className="review-dialog student-entry-dialog" aria-describedby={undefined}
        onCloseAutoFocus={navigation ? event => { event.preventDefault(); navigation.onReturnFocus(); } : undefined}
        onKeyDown={event => {
          if (!navigation || event.defaultPrevented || event.nativeEvent.isComposing || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
          if (event.key !== "PageDown" && event.key !== "PageUp") return;
          event.preventDefault();
          if (event.repeat) return;
          if (event.key === "PageDown" && navigation.position < navigation.total) navigation.onNext();
          if (event.key === "PageUp" && navigation.position > 1) navigation.onPrevious();
        }} onOpenAutoFocus={event => {
        if (!editor) return;
        const target = document.getElementById(`${id}-${editor.issue.field}`) ?? document.getElementById(`${id}-review-section`);
        if (target) {
          event.preventDefault();
          target.focus({ preventScroll: true });
          target.scrollIntoView({ block: "nearest" });
        }
      }}>
        <header className="review-dialog-header student-dialog-header">
          <Dialog.Title>{label}</Dialog.Title>
          {navigation && <span role="status">Address {navigation.position} of {navigation.total}</span>}
        </header>
        <div key={record.id}>{visibleFieldGroups.map((group) => {
          const guardian = group.label === "Guardian 1" ? "Guardian" : group.label === "Guardian 2" ? "Guardian2" : undefined;
          const removed = guardian !== undefined && draft[guardian] === "";
          const groupIssues = editor?.issues.filter(issue => group.fields.some(field => field === issue.field)
            || guardian !== undefined && issue.field === guardian || group.label === "Student" && !issue.field) ?? [];
          const needsReview = groupIssues.some(issue => !editor?.readOnlyFields.includes(issue.field!));
          const expanded = editor?.addressEditor ? group.label === "Address" : editor ? group.fields.some(field => field === editor.issue.field) || !editor.issue.field && group.label === "Student" : group.label === "Student";
          const canRemove = editor && guardian && (group.fields.some(field => record.fields[field] || draft[field]) || groupIssues.some(issue => issue.field === guardian));
          return <details key={group.label} className="student-section" open={expanded}>
            <summary id={expanded ? `${id}-review-section` : undefined}>
              <ChevronRight size={16} className="student-section-chevron" aria-hidden="true" />
              <h3>{group.label}</h3>
              {removed ? <span className="student-review-badge">Removal staged</span> : needsReview && <span className="student-review-badge">Needs review</span>}
            </summary>
            {canRemove && <div className="student-section-actions">
              <button type="button" className="btn btn-ghost" onClick={() => editor.onGuardianRemoval(guardian, !removed)}>{removed ? "Undo removal" : `Remove ${group.label.toLowerCase()}`}</button>
              {removed && <span>Removed when you apply fixes.</span>}
            </div>}
            {groupIssues.filter(issue => !issue.field || issue.field === guardian).map(issue => <p key={issue.id} className="student-field-findings">{issue.message}</p>)}
            {group.label === "Address" && editor?.addressEditor ? <div className="student-address-editor">{editor.addressEditor}</div> :
            <dl>{group.fields.map((field) => {
              const fieldLabel = field.replace(/([a-z])([A-Z])/g, "$1 $2");
              const value = draft[field] ?? record.fields[field] ?? "";
              const options = optionsFor(field);
              const changed = value !== (record.fields[field] ?? "");
              const editable = editor && !removed && group.label !== "School" && !editor.readOnlyFields.includes(field);
              const findings = groupIssues.filter(issue => issue.field === field);
              const fieldId = `${id}-${field}`;
              const controlProps = {
                id: fieldId,
                className: `input${changed ? " student-field-changed" : findings.length ? " student-field-review" : ""}`,
                "aria-label": fieldLabel,
                "aria-describedby": findings.length ? `${fieldId}-issues` : undefined,
                value,
              };
              return <div key={field}>
                <dt>{fieldLabel}{changed && <span className="student-staged-label">Change staged</span>}</dt>
                <dd>{!editable ? (value || <span className="empty-value">Not provided</span>) :
                  options ? <select {...controlProps} onChange={event => editor.onDraftChange(field, event.target.value)}>
                    <option value="">—</option>
                    {value && !options.includes(value) && <option value={value}>{value} (current)</option>}
                    {options.map(option => <option key={option} value={option}>{option}</option>)}
                  </select> : <input {...controlProps} onChange={event => editor.onDraftChange(field, event.target.value)} />}
                  {findings.length > 0 && <div id={`${fieldId}-issues`} className="student-field-findings">
                    {findings.map(issue => <p key={issue.id}>{issue.message}</p>)}
                  </div>}
                  {editable && (field.includes("Phone") && !field.endsWith("Type")) && <div className="student-field-actions">
                    {field.includes("Phone") && !field.endsWith("Type") && <button type="button" className="btn btn-ghost" disabled={!value} onClick={() => editor.onDraftChange(field, "")}>Clear value</button>}
                  </div>}
                </dd>
              </div>;
            })}</dl>}
          </details>;
        })}
        </div>
        <footer className="address-review-navigation">
          <div className="address-review-buttons">
            {editor && <button type="button" className="btn btn-secondary" disabled={!hasChanges} onClick={() => {
              editor.onReset();
              document.getElementById(`${id}-review-section`)?.focus({ preventScroll: true });
            }} title="Reset this student's edits to the current record"><RotateCcw size={14} aria-hidden="true" /> Reset changes</button>}
            <Dialog.Close asChild><button type="button" className="btn btn-secondary" aria-label={hasChanges ? `${stagedLabel} — back to fixes` : "Back to fixes"} aria-keyshortcuts="Escape" title="Back to fixes (Escape)">
              {hasChanges && <Check size={16} aria-hidden="true" />}{hasChanges ? stagedLabel : "Back to fixes"}<kbd aria-hidden="true">Esc</kbd>
            </button></Dialog.Close>
            {navigation && <>
              <button type="button" className="btn btn-secondary" aria-label="Previous" title="Previous address (Alt + Page Up)" aria-keyshortcuts="Alt+PageUp" disabled={navigation.position === 1} onClick={navigation.onPrevious}><ArrowLeft size={16} aria-hidden="true" /> Previous <span className="review-shortcut" aria-hidden="true"><kbd>Alt</kbd><kbd><ChevronsUp size={12} />PgUp</kbd></span></button>
              <button type="button" className="btn btn-secondary" aria-label="Next address" title="Next address (Alt + Page Down)" aria-keyshortcuts="Alt+PageDown" disabled={navigation.position === navigation.total} onClick={navigation.onNext}>Next address <ArrowRight size={16} aria-hidden="true" /><span className="review-shortcut" aria-hidden="true"><kbd>Alt</kbd><kbd><ChevronsDown size={12} />PgDn</kbd></span></button>
            </>}
          </div>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
