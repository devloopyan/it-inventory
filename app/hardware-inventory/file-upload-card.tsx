"use client";

import type { ReactNode, RefObject } from "react";

type FileUploadCardProps = {
  label: ReactNode;
  inputRef: RefObject<HTMLInputElement | null>;
  accept?: string;
  onFileChange: (file: File | null) => void;
  file?: File | null;
  hasAttachment: boolean;
  displayName: string;
  helperText: string;
  badge: string;
  ariaLabel: string;
  title?: string;
  onRemove?: () => void;
  compact?: boolean;
};

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded =
    unitIndex === 0 ? Math.round(value).toString() : value >= 10 ? value.toFixed(1).replace(/\.0$/, "") : value.toFixed(1).replace(/\.0$/, "");

  return `${rounded} ${units[unitIndex]}`;
}

function resolveBadgeLabel(fileName: string, fallbackBadge: string) {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.trim().toUpperCase() : "";
  if (extension && extension.length <= 4) return extension;

  const fallback = fallbackBadge.trim().toUpperCase();
  if (!fallback) return "FILE";
  return fallback.length <= 4 ? fallback : fallback.slice(0, 4);
}

export default function FileUploadCard({
  label,
  inputRef,
  accept,
  onFileChange,
  file,
  hasAttachment,
  displayName,
  helperText,
  badge,
  ariaLabel,
  title,
  onRemove,
  compact = false,
}: FileUploadCardProps) {
  const resolvedName = file?.name ?? displayName;
  const resolvedMeta = file ? formatFileSize(file.size) : helperText;
  const resolvedBadge = resolveBadgeLabel(resolvedName, badge);

  function openPicker() {
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  }

  function handleRemove() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    onRemove?.();
  }

  return (
    <div className={`file-card-field${compact ? " is-compact" : ""}`}>
      <div className="file-card-label">{label}</div>
      <input
        ref={inputRef}
        className="file-card-native"
        type="file"
        accept={accept}
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        aria-label={ariaLabel}
        title={title}
      />
      <div className={`file-card ${hasAttachment ? "attached" : ""}`}>
        <button type="button" className="file-card-main" onClick={openPicker} aria-label={ariaLabel} title={title ?? resolvedName}>
          <div className="file-card-icon" aria-hidden="true">
            <span className="file-card-badge">{resolvedBadge}</span>
          </div>
          <div className="file-card-body">
            <div className="file-card-name">{resolvedName}</div>
            <div className="file-card-meta">{resolvedMeta}</div>
          </div>
        </button>
        {hasAttachment && onRemove ? (
          <button
            type="button"
            className="file-card-icon-btn"
            aria-label="Remove file"
            onClick={handleRemove}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 7H19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path
                d="M9 7V5C9 4.44772 9.44772 4 10 4H14C14.5523 4 15 4.44772 15 5V7"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
              <path d="M8 10V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M12 10V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M16 10V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path
                d="M7 7L8 19C8.04691 19.5523 8.50832 20 9.06257 20H14.9374C15.4917 20 15.9531 19.5523 16 19L17 7"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : (
          <button type="button" className="file-card-icon-btn is-picker" aria-label={ariaLabel} onClick={openPicker}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 16V6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              <path d="M8.5 9.5L12 6L15.5 9.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 17.5V18C5 19.1046 5.89543 20 7 20H17C18.1046 20 19 19.1046 19 18V17.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
