"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

type FileUploadCardProps = {
  label: ReactNode;
  inputRef: RefObject<HTMLInputElement | null>;
  accept?: string;
  onFileChange: (file: File | null) => void;
  onFilesChange?: (files: File[]) => void;
  file?: File | null;
  multiple?: boolean;
  hasAttachment: boolean;
  displayName: string;
  helperText: string;
  badge: string;
  ariaLabel: string;
  title?: string;
  onRemove?: () => void;
  compact?: boolean;
  sourcePicker?: boolean;
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
  onFilesChange,
  file,
  multiple = false,
  hasAttachment,
  displayName,
  helperText,
  badge,
  ariaLabel,
  title,
  onRemove,
  compact = false,
  sourcePicker = false,
}: FileUploadCardProps) {
  const resolvedName = file?.name ?? displayName;
  const resolvedMeta = file ? formatFileSize(file.size) : helperText;
  const resolvedBadge = resolveBadgeLabel(resolvedName, badge);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [showSourceMenu, setShowSourceMenu] = useState(false);

  useEffect(() => {
    if (!showSourceMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowSourceMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showSourceMenu]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (onFilesChange) {
      onFilesChange(files);
      return;
    }
    onFileChange(files[0] ?? null);
  }

  function openPicker() {
    if (sourcePicker && !hasAttachment) {
      setShowSourceMenu((prev) => !prev);
      return;
    }
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  }

  function openCamera() {
    setShowSourceMenu(false);
    if (!cameraInputRef.current) return;
    cameraInputRef.current.value = "";
    cameraInputRef.current.click();
  }

  function openFiles() {
    setShowSourceMenu(false);
    if (!inputRef.current) return;
    inputRef.current.value = "";
    inputRef.current.click();
  }

  function handleRemove() {
    if (inputRef.current) inputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
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
        multiple={multiple}
        onChange={handleFileChange}
        aria-label={ariaLabel}
        title={title}
      />
      {sourcePicker && (
        <input
          ref={cameraInputRef}
          className="file-card-native"
          type="file"
          accept={accept}
          capture="environment"
          onChange={handleFileChange}
          aria-label={`${ariaLabel} camera`}
        />
      )}
      <div className={`file-card ${hasAttachment ? "attached" : ""}`} style={{ position: "relative" }}>
        <button type="button" className="file-card-main" onClick={openPicker} aria-label={ariaLabel} title={title ?? resolvedName}>
          <div className="file-card-icon" aria-hidden="true">
            <span className="file-card-badge">{resolvedBadge}</span>
          </div>
          <div className="file-card-body">
            <div className="file-card-name">{resolvedName}</div>
            {resolvedMeta ? <div className="file-card-meta">{resolvedMeta}</div> : null}
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
        {showSourceMenu && (
          <div ref={menuRef} className="file-card-source-menu" role="menu">
            <button type="button" className="file-card-source-option" role="menuitem" onClick={openCamera}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M2 9C2 7.89543 2.89543 7 4 7H5.5L7.5 4H16.5L18.5 7H20C21.1046 7 22 7.89543 22 9V19C22 20.1046 21.1046 21 20 21H4C2.89543 21 2 20.1046 2 19V9Z"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                />
                <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              Take Photo
            </button>
            <button type="button" className="file-card-source-option" role="menuitem" onClick={openFiles}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 7C3 5.89543 3.89543 5 5 5H10L12 7H19C20.1046 7 21 7.89543 21 9V18C21 19.1046 20.1046 20 19 20H5C3.89543 20 3 19.1046 3 18V7Z"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
              Choose from Files
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
