"use client";

import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

export type ChecklistSelectOption = {
  value: string;
  label: string;
  description?: string;
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
  value?: string;
  values?: string[];
  options: ReadonlyArray<ChecklistSelectOption>;
  onChange?: (value: string) => void;
  onValuesChange?: (values: string[]) => void;
  placeholder: string;
  ariaLabel: string;
  disabled?: boolean;
  minMenuWidth?: number;
  compact?: boolean;
  multiple?: boolean;
  multipleSummaryLabel?: string;
  multipleSummaryStyle?: "text" | "badge";
  triggerStyle?: CSSProperties;
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
  values,
  options,
  onChange,
  onValuesChange,
  placeholder,
  ariaLabel,
  disabled = false,
  minMenuWidth = 180,
  compact = false,
  multiple = false,
  multipleSummaryLabel = "Selected",
  multipleSummaryStyle = "text",
  triggerStyle,
}: ChecklistSelectProps) {
  const [openState, setOpenState] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ top: 0, left: 0, width: minMenuWidth });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const open = openState && !disabled;

  const selectedValues = multiple ? values ?? [] : value ? [value] : [];
  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));
  const selectedOption = !multiple ? options.find((option) => option.value === value) : undefined;
  const hasSelection = selectedOptions.length > 0;
  const triggerLabel = multiple
    ? selectedOptions.length === 0
      ? placeholder
      : multipleSummaryLabel
    : selectedOption?.label ?? placeholder;
  const computedTriggerStyle = {
    ...(!multiple ? selectedOption?.triggerStyle : undefined),
    ...triggerStyle,
  };

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
      setOpenState(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenState(false);
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

  return (
    <div
      ref={containerRef}
      className={`checklist-select${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}${
        computedTriggerStyle ? " is-toned" : ""
      }${compact ? " is-compact" : ""}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`checklist-select-trigger${hasSelection ? " has-selection" : ""}${computedTriggerStyle ? " is-toned" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        title={multiple ? selectedOptions.map((option) => option.label).join(", ") : selectedOption?.description}
        disabled={disabled}
        style={computedTriggerStyle}
        onClick={() => {
          if (!disabled) {
            setOpenState((current) => !current);
          }
        }}
      >
        <span className="checklist-select-trigger-content">
          <span className="checklist-select-trigger-label">{triggerLabel}</span>
          {multiple && hasSelection && multipleSummaryStyle === "badge" ? (
            <span className="checklist-select-trigger-count" aria-hidden="true">
              {selectedOptions.length}
            </span>
          ) : null}
        </span>
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
              aria-multiselectable={multiple || undefined}
              style={{
                top: menuPosition.top,
                left: menuPosition.left,
                width: menuPosition.width,
              }}
            >
              {options.map((option) => {
                const isSelected = selectedValues.includes(option.value);
                const markerVariant = option.markerVariant ?? (multiple ? "checkbox" : "none");

                return (
                  <button
                    key={`${menuId}-${option.value || "empty"}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`checklist-select-option${isSelected ? " is-selected" : ""}`}
                    onClick={() => {
                      if (multiple) {
                        const nextValues = isSelected
                          ? selectedValues.filter((selectedValue) => selectedValue !== option.value)
                          : options
                              .map((item) => item.value)
                              .filter((itemValue) => selectedValues.includes(itemValue) || itemValue === option.value);
                        onValuesChange?.(nextValues);
                        return;
                      }
                      onChange?.(option.value);
                      setOpenState(false);
                      triggerRef.current?.focus();
                    }}
                    title={option.description}
                  >
                    {markerVariant === "dot" ? (
                      <span className="checklist-select-dot-wrap" aria-hidden="true">
                        <span
                          className="checklist-select-dot"
                          style={{ backgroundColor: option.markerColor ?? "var(--muted)" }}
                        />
                      </span>
                    ) : markerVariant === "checkbox" ? (
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
