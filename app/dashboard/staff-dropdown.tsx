"use client";

import { useEffect, useRef, useState } from "react";

type DashboardStaffDropdownProps = {
  value: string[];
  options: ReadonlyArray<string>;
  onChange: (next: string[]) => void;
};

function DashboardFilterChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      style={{
        transform: open ? "rotate(180deg)" : undefined,
        transition: "transform var(--interaction-duration) var(--interaction-ease)",
      }}
    >
      <path
        d="M2.75 4.5L6 7.75L9.25 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashboardFilterCheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 6.1L4.9 8.5L9.5 3.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function DashboardStaffDropdown({
  value,
  options,
  onChange,
}: DashboardStaffDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const summary = value.length
    ? value.length === 1
      ? value[0]
      : `${value.length} selected`
    : "Select IT staff";

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className={`monitoring-filter-dropdown${open ? " is-open" : ""}${value.length ? " is-active" : ""}`}
      style={{ width: "100%", minWidth: 0 }}
    >
      <button
        type="button"
        className="monitoring-filter-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Assigned IT staff"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="monitoring-filter-trigger-main">
          <span className="monitoring-filter-trigger-text">{summary}</span>
        </span>
        <span className="monitoring-filter-trigger-icon" aria-hidden="true">
          <DashboardFilterChevronIcon open={open} />
        </span>
      </button>
      {open ? (
        <div className="monitoring-filter-menu" role="menu" aria-label="Assigned IT staff options">
          {options.map((option) => {
            const selected = value.includes(option);

            return (
              <button
                key={option}
                type="button"
                role="menuitemcheckbox"
                aria-checked={selected}
                className={`monitoring-filter-option${selected ? " is-selected" : ""}`}
                onClick={() => {
                  onChange(selected ? value.filter((item) => item !== option) : [...value, option]);
                }}
              >
                <span className="monitoring-filter-check" aria-hidden="true">
                  {selected ? <DashboardFilterCheckIcon /> : null}
                </span>
                <span className="monitoring-filter-option-text">{option}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
