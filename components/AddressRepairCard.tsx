"use client";

import { PenLine, ShieldCheck, TriangleAlert } from "lucide-react";
import { ADDRESS_REPAIR_FIELDS } from "@/lib/addressRepair";
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
  const changed = ADDRESS_REPAIR_FIELDS.some(field => (draft[field] ?? "") !== (record.fields[field] ?? ""));
  const tone = proposal.confidence === "safe"
    ? { border: "var(--color-success-border)", bg: "var(--color-success-bg)", text: "var(--color-success-text)", Icon: ShieldCheck }
    : proposal.confidence === "manual"
      ? { border: "var(--color-info-border)", bg: "var(--color-info-bg)", text: "var(--color-info-text)", Icon: PenLine }
      : { border: "var(--color-warning-border)", bg: "var(--color-warning-bg)", text: "var(--color-warning-text)", Icon: TriangleAlert };

  return (
    <article style={{
      border: `1px solid ${tone.border}`,
      borderRadius: 7,
      background: "var(--color-surface-1)",
      overflow: "hidden",
    }}>
      <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--color-border)", background: tone.bg }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 7 }}>
              <tone.Icon size={16} style={{ color: tone.text }} />
              <strong style={{ fontSize: 14 }}>{proposal.title}</strong>
            </div>
            <p style={{ margin: 0, maxWidth: 720, color: "var(--color-text-secondary)", fontSize: 12, lineHeight: 1.55 }}>{proposal.explanation}</p>
          </div>

        </div>
      </div>

      <div style={{ padding: "16px 18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10, marginBottom: 16 }}>
          <div style={{ borderLeft: "2px solid var(--color-error-border)", padding: "6px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>CURRENT ADDRESS</div>
            <div style={{ fontSize: 12, lineHeight: 1.45 }}>{addressLine(record.fields)}</div>
          </div>
          <div style={{ borderLeft: `2px solid ${changed ? "var(--color-success-border)" : "var(--color-border)"}`, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--color-text-muted)", letterSpacing: "0.06em", marginBottom: 4 }}>EDITED PREVIEW</div>
            <div style={{ fontSize: 12, lineHeight: 1.45 }}>{addressLine(draft)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 }}>
          {ADDRESS_REPAIR_FIELDS.map((field) => {
            const current = record.fields[field] ?? "";
            const value = draft[field] ?? "";
            const changed = value !== current;
            const options = optionsFor(field, rules);
            const maxLength = rules.fieldLengths[field];
            const controlStyle: React.CSSProperties = {
              width: "100%",
              fontSize: 12,
              padding: "6px 8px",
              borderRadius: 3,
              border: `1px solid ${changed ? "var(--color-success-border)" : "var(--color-border)"}`,
              color: "var(--color-text-primary)",
              background: changed ? "var(--color-success-bg)" : "var(--color-surface-0)",
            };
            return (
              <label key={field} style={{ minWidth: 0 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 4, color: "var(--color-text-muted)", fontSize: 9, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {LABELS[field]}
                  {maxLength && <span style={{ color: value.length > maxLength ? "var(--color-error-text)" : "inherit" }}>{value.length}/{maxLength}</span>}
                </span>
                {options ? (
                  <select value={value} onChange={(event) => onDraftChange(field, event.target.value)} style={controlStyle}>
                    <option value="">—</option>
                    {value && !options.includes(value) && <option value={value}>{value} (current)</option>}
                    {options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : (
                  <input value={value} onChange={(event) => onDraftChange(field, event.target.value)} style={controlStyle} />
                )}
              </label>
            );
          })}
        </div>
      </div>
    </article>
  );
}
