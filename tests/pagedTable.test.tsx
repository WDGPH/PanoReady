import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PagedTable, { compareTableValues } from "../components/PagedTable";

describe("paged tables", () => {
  it("sorts numbers numerically and names naturally", () => {
    expect(compareTableValues("100", "25")).toBeGreaterThan(0);
    expect(compareTableValues("1,000", "900")).toBeGreaterThan(0);
    expect(compareTableValues("School 2", "School 10")).toBeLessThan(0);
    expect(compareTableValues("same", "SAME")).toBe(0);
  });
  it("limits the body to 25 rows while retaining the complete total", () => {
    const html = renderToStaticMarkup(<PagedTable><thead><tr><th>Name</th></tr></thead>
      <tbody>{Array.from({ length: 60 }, (_, i) => <tr key={i}><td>School {i + 1}</td></tr>)}</tbody>
      <tfoot><tr><th>Total: 60</th></tr></tfoot></PagedTable>);
    expect(html).toContain("School 25");
    expect(html).not.toContain("School 26");
    expect(html).toContain("Total: 60");
    expect(html).toContain("Page 1 of 3");
    expect(html).toContain('aria-sort="none"');
  });
  it("does not add paging controls to short tables", () => {
    const html = renderToStaticMarkup(<PagedTable><tbody><tr><td>Only row</td></tr></tbody></PagedTable>);
    expect(html).not.toContain('aria-label="Table pages"');
  });
  it("keeps filtering available in an empty table without nesting it in the sort button", () => {
    const html = renderToStaticMarkup(<PagedTable headerControls={{ 0: <select aria-label="Filter severity" defaultValue="all"><option value="all">All severities</option></select> }}>
      <thead><tr><th>Severity</th></tr></thead><tbody />
    </PagedTable>);
    expect(html).toMatch(/<th[^>]*aria-sort="none"[^>]*><button[^>]*>Severity/);
    expect(html).toContain('</button><select aria-label="Filter severity"');
    expect(html).toContain('<tbody></tbody>');
  });

});
