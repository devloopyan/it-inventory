"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

export type ChecklistSelectOption = {
  value: string;
  label: string;
  triggerStyle?: CSSProperties;
  markerVariant?: "checkbox" | "dot" | "none";
  markerColor?: string;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
};

type ChecklistSelectProps = {
  value: string;
  options: ReadonlyArray<ChecklistSelectOption>;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  minMenuWidth?: number;
  compact?: boolean;
};

function ChecklistChevronIcon({ open }: { open: boolean }) {
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

function ChecklistCheckIcon() {
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

export default function ChecklistSelect({
  value,
  options,
  onChange,
  placeholder,
  ariaLabel,
  disabled = false,
  minMenuWidth = 180,
  compact = false,
}: ChecklistSelectProps) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ top: 0, left: 0, width: minMenuWidth });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const selectedOption = options.find((option) => option.value === value);
  const triggerLabel = selectedOption?.label ?? placeholder;
  const triggerStyle = selectedOption?.triggerStyle;

  useEffect(() => {
    if (!open || disabled) return undefined;

    function updateMenuPosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const nextWidth = Math.max(Math.round(rect.width), minMenuWidth);
      const estimatedHeight = Math.min(options.length * 48 + 20, 260);
      const roomBelow = window.innerHeight - rect.bottom;
      const openUpward = roomBelow < estimatedHeight + 12 && rect.top > roomBelow;
      const maxTop = Math.max(12, window.innerHeight - estimatedHeight - 12);
      const nextTop = openUpward ? Math.max(12, rect.top - estimatedHeight - 8) : Math.min(maxTop, rect.bottom + 8);
      const nextLeft = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - nextWidth - 12));

      setMenuPosition({
        top: nextTop,
        left: nextLeft,
        width: nextWidth,
      });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [disabled, minMenuWidth, open, options.length]);

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
  }, [disabled]);

  return (
    <div
      ref={containerRef}
      className={`checklist-select${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}${
        triggerStyle ? " is-toned" : ""
      }${compact ? " is-compact" : ""}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`checklist-select-trigger${selectedOption ? " has-selection" : ""}${triggerStyle ? " is-toned" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        style={triggerStyle}
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
      >
        <span className="checklist-select-trigger-label">{triggerLabel}</span>
        <span className="checklist-select-trigger-icon" aria-hidden="true">
          <ChecklistChevronIcon open={open} />
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="checklist-select-menu"
              role="listbox"
              aria-label={ariaLabel}
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
              }}
            >
              {options.map((option) => {
                const isSelected = option.value === value;

                return (
                  <button
                    key={`${menuId}-${option.value || "empty"}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`checklist-select-option${isSelected ? " is-selected" : ""}`}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                  >
                    {option.markerVariant === "dot" ? (
                      <span className="checklist-select-dot-wrap" aria-hidden="true">
                        <span
                          className="checklist-select-dot"
                          style={{ backgroundColor: option.markerColor ?? "var(--muted)" }}
                        />
                      </span>
                    ) : option.markerVariant === "checkbox" ? (
                      <span className="checklist-select-check" aria-hidden="true">
                        {isSelected ? <ChecklistCheckIcon /> : null}
                      </span>
                    ) : null}
                    <span className="checklist-select-option-label">{option.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
