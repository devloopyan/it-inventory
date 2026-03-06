"use client";

import type { ReactNode, RefObject } from "react";

type FileUploadCardProps = {
  label: ReactNode;
  inputRef: RefObject<HTMLInputElement | null>;
  accept?: string;
  onFileChange: (file: File | null) => void;
  hasAttachment: boolean;
  displayName: string;
  helperText: string;
  badge: string;
  ariaLabel: string;
  title?: string;
  onRemove?: () => void;
};

export default function FileUploadCard({
  label,
  inputRef,
  accept,
  onFileChange,
  hasAttachment,
  displayName,
  helperText,
  badge,
  ariaLabel,
  title,
  onRemove,
}: FileUploadCardProps) {
  return (
    <div className="file-card-field">
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
        <div className="file-card-icon" aria-hidden="true">
          <span className={`file-card-badge ${hasAttachment ? "is-attached" : ""}`}>
            {hasAttachment ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12.5L9.5 17L19 7.5"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              badge
            )}
          </span>
        </div>
        <div className="file-card-body">
          <div className="file-card-name">{displayName}</div>
          <div className="file-card-meta">{helperText}</div>
        </div>
        <div className="file-card-actions">
          <button
            type="button"
            className="file-card-btn"
            onClick={() => inputRef.current?.click()}
          >
            {hasAttachment ? "Change" : "Choose"}
          </button>
          {hasAttachment && onRemove ? (
            <button
              type="button"
              className="file-card-icon-btn"
              aria-label="Remove file"
              onClick={onRemove}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 7H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path
                  d="M9 7V5C9 4.44772 9.44772 4 10 4H14C14.5523 4 15 4.44772 15 5V7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path d="M8 10V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M12 10V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M16 10V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path
                  d="M7 7L8 19C8.04691 19.5523 8.50832 20 9.06257 20H14.9374C15.4917 20 15.9531 19.5523 16 19L17 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
