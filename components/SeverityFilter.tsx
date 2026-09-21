"use client";

import { useId, useRef, useState } from "react";
import { Filter } from "lucide-react";

type Severity = "all" | "error" | "warning" | "info";
const options: [Severity, string][] = [["all", "All severities"], ["error", "Errors only"], ["warning", "Warnings only"], ["info", "Info only"]];

export default function SeverityFilter({ value, onChange }: { value: Severity; onChange: (value: Severity) => void }) {
  const id = useId();
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const label = options.find(([key]) => key === value)![1];
  return <>
    <button ref={trigger} type="button" className="severity-filter-trigger" data-active={value !== "all"} aria-label={`Filter severity: ${label}`} title={`Filter severity: ${label}`} aria-expanded={open} aria-controls={id} popoverTarget={id} onClick={() => {
      const rect = trigger.current!.getBoundingClientRect();
      popup.current!.style.top = `${rect.bottom + 6}px`;
      popup.current!.style.left = `${rect.left}px`;
    }}><Filter size={14} aria-hidden="true" /></button>
    <div ref={popup} id={id} popover="auto" className="severity-filter-popup" onToggle={event => setOpen(event.newState === "open")}>
      <fieldset><legend>Severity</legend>
        {options.map(([key, text]) => <label key={key}><input type="radio" name={id} checked={value === key} onChange={() => {
          onChange(key);
          popup.current?.hidePopover();
          trigger.current?.focus();
        }} />{text}</label>)}
      </fieldset>
    </div>
  </>;
}
