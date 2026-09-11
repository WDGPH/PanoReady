"use client";

import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode, type TableHTMLAttributes } from "react";

type CellProps = { children?: ReactNode; "data-sort-value"?: string | number; "data-sortable"?: boolean; "data-row-id"?: string };
const elements = (children: ReactNode) => Children.toArray(children).filter(isValidElement<CellProps>);

// Only read native markup. Custom cells supply an explicit data-sort-value.
function cellText(node: ReactNode): string {
  return Children.toArray(node).map(child => {
    if (typeof child === "string" || typeof child === "number") return String(child);
    if (!isValidElement<CellProps>(child)) return "";
    if (child.props["data-sort-value"] !== undefined) return String(child.props["data-sort-value"]);
    return typeof child.type === "string" ? cellText(child.props.children) : "";
  }).join(" ").trim();
}

export function compareTableValues(a: string, b: string) {
  const number = (value: string) => value.trim() !== "" && /^-?[\d,]+(?:\.\d+)?$/.test(value) ? Number(value.replaceAll(",", "")) : null;
  const left = number(a), right = number(b);
  return left !== null && right !== null ? left - right : a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Presentation-only paging: callers retain the complete data and edit state. */
export default function PagedTable({ children, pageActions, headerControls, ...props }: TableHTMLAttributes<HTMLTableElement> & { pageActions?: (ids: string[]) => ReactNode; headerControls?: Record<number, ReactNode> }) {
  const sections = elements(children);
  const body = sections.find(section => section.type === "tbody");
  const rows = elements(body?.props.children);
  const identity = JSON.stringify(rows.map(row => row.key));
  const [position, setPosition] = useState({ identity, page: 0 });
  const [sort, setSort] = useState<{ column: number; descending: boolean } | null>(null);
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const page = position.identity === identity ? Math.min(position.page, pages - 1) : 0;
  const sorted = sort ? [...rows].sort((a, b) => {
    const left = elements(a.props.children)[sort.column];
    const right = elements(b.props.children)[sort.column];
    return compareTableValues(cellText(left), cellText(right)) * (sort.descending ? -1 : 1);
  }) : rows;
  const changePage = (next: number) => setPosition({ identity, page: next });
  return <>
    {pageActions?.(sorted.slice(page * 25, (page + 1) * 25).map(row => row.props["data-row-id"]).filter((id): id is string => id !== undefined))}
    <table {...props}>
      {sections.map(section => {
        if (section.type === "tbody") return cloneElement(section, {}, sorted.slice(page * 25, (page + 1) * 25));
        if (section.type !== "thead") return section;
        return cloneElement(section, {}, elements(section.props.children).map(row => cloneElement(row, {}, elements(row.props.children).map((cell, column) => {
          if (cell.props["data-sortable"] === false) return cell;
          const active = sort?.column === column;
          return cloneElement(cell as ReactElement<TableHTMLAttributes<HTMLTableCellElement>>, { "aria-sort": active ? sort.descending ? "descending" : "ascending" : "none" },
            <><button type="button" className="table-sort" onClick={() => {
              setSort({ column, descending: active ? !sort.descending : false });
              changePage(0);
            }}>{cell.props.children}<span aria-hidden="true">{active ? sort.descending ? " ↓" : " ↑" : " ↕"}</span></button>{headerControls?.[column]}</>);
        }))));
      })}
    </table>
    {rows.length > 25 && <nav className="table-paging" aria-label="Table pages">
      <span aria-live="polite">{page * 25 + 1}–{Math.min((page + 1) * 25, rows.length)} of {rows.length}</span>
      <button type="button" className="btn btn-secondary" disabled={page === 0} onClick={() => changePage(page - 1)}>Previous</button>
      <span>Page {page + 1} of {pages}</span>
      <button type="button" className="btn btn-secondary" disabled={page === pages - 1} onClick={() => changePage(page + 1)}>Next</button>
    </nav>}
  </>;
}
