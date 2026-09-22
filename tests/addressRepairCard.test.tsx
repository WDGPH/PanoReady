import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AddressRepairCard from "../components/AddressRepairCard";
import { defaultRules } from "../lib/rulesets";
import type { AddressRepairProposal, StudentRecord } from "../lib/types";

const record: StudentRecord = {
  id: "school0:student0",
  xmlPath: "",
  fields: { StreetName: "RR1", RuralRoute: "" },
};
const proposal: AddressRepairProposal = {
  kind: "address",
  id: "synthetic-rural-route",
  confidence: "safe",
  title: "Review synthetic address",
  explanation: "Confirm the address fields.",
  changes: [],
};

function render(draft: Record<string, string>) {
  return renderToStaticMarkup(<AddressRepairCard
    proposal={proposal}
    record={record}
    rules={defaultRules}
    draft={{ ...record.fields, ...draft }}
    onDraftChange={() => {}}
  />);
}

describe("manual address field styling", () => {
  it("uses warning styling for a changed value that does not meet field rules", () => {
    const html = render({ RuralRoute: "RR#7" });
    expect(html).toContain("address-field-control--invalid");
    expect(html).toContain("address-edited-preview--invalid");
    expect(html).toContain("Check value");
  });

  it("uses success styling only for a changed value that meets field rules", () => {
    const html = render({ RuralRoute: "RR 7" });
    expect(html).toContain("address-field-control--valid");
    expect(html).toContain("address-edited-preview--valid");
    expect(html).toContain("Meets field rules");
  });

  it("uses the neutral description style in the address review card", () => {
    const html = render({});
    expect(html).toContain('class="address-repair-callout"');
    expect(html).toContain('class="address-repair-description"');
    expect(html).toContain("lucide-pen-line");
    expect(html).not.toContain("lucide-shield-check");
  });
});
