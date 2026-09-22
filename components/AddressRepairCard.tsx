"use client";

import { CheckCircle2, PenLine, Trash2, TriangleAlert } from "lucide-react";
import { ADDRESS_REPAIR_FIELDS } from "@/lib/addressRepair";
import { fieldValueMeetsRules } from "@/lib/validator";
import type { AddressRepairProposal, RulesProfile, StudentRecord } from "@/lib/types";

type AddressDraft = Record<string, string>;

const LABELS: Record<(typeof ADDRESS_REPAIR_FIELDS)[number], string> = {
  Unit: "Unit",
  StreetNumber: "Street number",
  StreetNumberSuffix: "Suffix",
  StreetName: "Street name",
  StreetType: "Street type",
  StreetDirection: "Direction",
  RuralRoute: "Rural route",
  PoBoxNumber: "PO box",
  City: "City",
  Province: "Province",
  PostalCode: "Postal code",
};

function addressLine(values: Record<string, string>): string {
  const street = [
    values.Unit && `Unit ${values.Unit}`,
    [values.StreetNumber, values.StreetNumberSuffix].filter(Boolean).join(""),
    values.StreetName,
    values.StreetType,
    values.StreetDirection,
  ].filter(Boolean).join(" ");
  const delivery = [values.RuralRoute, values.PoBoxNumber && `PO Box ${values.PoBoxNumber}`].filter(Boolean).join(" · ");
  const locality = [values.City, values.Province, values.PostalCode].filter(Boolean).join(", ");
  return [street, delivery, locality].filter(Boolean).join(" · ") || "Empty address";
}

function optionsFor(field: string, rules: RulesProfile): string[] | null {
  if (field === "StreetType") return rules.allowedStreetTypeValues;
  if (field === "StreetDirection") return rules.allowedStreetDirectionValues;
  if (field === "Province") return rules.allowedProvinceValues;
  return null;
}

export default function AddressRepairCard({
  proposal,
  record,
  rules,
  draft,
  onDraftChange,
}: {
  proposal: AddressRepairProposal;
  record: StudentRecord;
  rules: RulesProfile;
  draft: AddressDraft;
  onDraftChange: (field: string, value: string) => void;
}) {
  const changedFields = ADDRESS_REPAIR_FIELDS.filter(field => (draft[field] ?? "") !== (record.fields[field] ?? ""));
  const changed = changedFields.length > 0;
  const editedPreviewState = !changed ? "unchanged" : changedFields.every(field => fieldValueMeetsRules(field, draft[field] ?? "", rules)) ? "valid" : "invalid";
  return (
    <article className="address-repair-card">
      <div className="address-repair-callout">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 7 }}>
              <PenLine size={16} className="address-repair-icon" aria-hidden="true" />
              <strong style={{ fontSize: 14 }}>{proposal.title}</strong>
            </div>
            <p className="address-repair-description" style={{ margin: 0, maxWidth: 720, fontSize: 12, lineHeight: 1.55 }}>{proposal.explanation}</p>
          </div>

        </div>
      </div>

      <div style={{ padding: "16px 18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10, marginBottom: 16 }}>
          <div style={{ borderLeft: "2px solid var(--color-error-border)", padding: "6px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>CURRENT ADDRESS</div>
            <div style={{ fontSize: 12, lineHeight: 1.45 }}>{addressLine(record.fields)}</div>
          </div>
          <div className={`address-edited-preview address-edited-preview--${editedPreviewState}`}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>EDITED PREVIEW</div>
            <div style={{ fontSize: 12, lineHeight: 1.45 }}>{addressLine(draft)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 }}>
          {ADDRESS_REPAIR_FIELDS.map((field) => {
            const current = record.fields[field] ?? "";
            const value = draft[field] ?? "";
            const changed = value !== current;
            const meetsRules = fieldValueMeetsRules(field, value, rules);
            const status = !changed ? null : !meetsRules
              ? { label: "Check value", className: "invalid", Icon: TriangleAlert }
              : value === ""
                ? { label: "Removed", className: "removed", Icon: Trash2 }
                : { label: "Meets field rules", className: "valid", Icon: CheckCircle2 };
            const options = optionsFor(field, rules);
            const maxLength = rules.fieldLengths[field];
            const controlStyle: React.CSSProperties = {
              width: "100%",
              fontSize: 12,
              padding: "6px 8px",
              borderRadius: 3,
              color: "var(--color-text-primary)",
            };
            const controlClassName = `address-field-control${status ? ` address-field-control--${status.className}` : ""}`;
            return (
              <label key={field} style={{ minWidth: 0 }}>
                <span className="address-field-label">
                  <span>{LABELS[field]}</span>
                  {maxLength && <span style={{ color: value.length > maxLength ? "var(--color-error-text)" : "inherit" }}>{value.length}/{maxLength}</span>}
                </span>
                {options ? (
                  <select className={controlClassName} value={value} onChange={(event) => onDraftChange(field, event.target.value)} style={controlStyle}>
                    <option value="">—</option>
                    {value && !options.includes(value) && <option value={value}>{value} (current)</option>}
                    {options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input className={controlClassName} value={value} onChange={(event) => onDraftChange(field, event.target.value)} style={controlStyle} />
                )}
                {status && <span className={`address-field-status address-field-status--${status.className}`} role="status"><status.Icon size={12} aria-hidden="true" />{status.label}</span>}
              </label>
            );
          })}
        </div>
      </div>
    </article>
  );
}
