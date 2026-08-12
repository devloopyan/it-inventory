"use client";

import { useEffect, useId, useRef, useState } from "react";
import { revealAccountPassword } from "./credential-actions";

const REVEAL_SECONDS = 30;

function formatStamp(value?: number) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

export default function PasswordField({
  mode,
  recordId,
  storageConfigured,
  canReveal,
  hasStoredPassword,
  passwordUpdatedAt,
  passwordUpdatedBy,
  draft,
  onDraftChange,
  onError,
}: {
  mode: "create" | "edit";
  recordId: string | null;
  storageConfigured: boolean;
  canReveal: boolean;
  hasStoredPassword: boolean;
  passwordUpdatedAt?: number;
  passwordUpdatedBy?: string;
  draft: string | null;
  onDraftChange: (value: string | null) => void;
  onError: (message: string | null) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelId = useId();
  const inputId = `${labelId}-input`;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleReveal() {
    if (!recordId) return;
    setIsRevealing(true);
    onError(null);

    try {
      const result = await revealAccountPassword(recordId);
      setRevealed(result.password);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setRevealed(null), REVEAL_SECONDS * 1000);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not reveal this password.");
    } finally {
      setIsRevealing(false);
    }
  }

  if (!storageConfigured) {
    return (
      <div className="digital-form-field digital-form-field-full">
        <label htmlFor={inputId}>Password</label>
        <input id={inputId} className="input-base" value="" disabled readOnly />
        <small>Credential storage not configured.</small>
      </div>
    );
  }

  const isEditingStored = mode === "edit" && draft === null;

  if (isEditingStored) {
    return (
      <div className="digital-form-field digital-form-field-full" role="group" aria-labelledby={labelId}>
        <span id={labelId}>Password</span>
        <div className="digital-password-row">
          <code className="digital-password-value">
            {revealed ?? (hasStoredPassword ? "•".repeat(10) : "Not set")}
          </code>
          {hasStoredPassword && canReveal ? (
            <button className="btn-secondary" type="button" onClick={() => void handleReveal()} disabled={isRevealing}>
              {isRevealing ? "Revealing..." : revealed ? "Revealed" : "Reveal"}
            </button>
          ) : null}
          {canReveal ? (
            <button className="btn-secondary" type="button" onClick={() => onDraftChange("")}>
              {hasStoredPassword ? "Change" : "Set password"}
            </button>
          ) : null}
        </div>
        <small>
          {hasStoredPassword && passwordUpdatedAt
            ? `Set ${formatStamp(passwordUpdatedAt)}${passwordUpdatedBy ? ` by ${passwordUpdatedBy}` : ""}. `
            : ""}
          {hasStoredPassword && !canReveal ? "Hidden — IT admin only. " : ""}
          {revealed ? `Hides again in ${REVEAL_SECONDS} seconds. ` : ""}
          Every reveal is logged.
        </small>
      </div>
    );
  }

  // Reached either in create mode (no record yet, so there is nothing to mask)
  // or in edit mode after the gated "Change"/"Set password" button above set a
  // draft. canReveal is a UI-only hint — the server action is the real
  // boundary — but a non-admin should still never be shown a live password
  // input, including on record creation, so guard it here too.
  if (!canReveal) {
    return (
      <div className="digital-form-field digital-form-field-full">
        <label htmlFor={inputId}>Password</label>
        <input id={inputId} className="input-base" value="" disabled readOnly placeholder="IT admin only" />
        <small>Only IT admins can set or change account passwords.</small>
      </div>
    );
  }

  return (
    <div className="digital-form-field digital-form-field-full">
      <label htmlFor={inputId}>Password</label>
      <div className="digital-password-row">
        <input
          id={inputId}
          className="input-base"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={draft ?? ""}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder="Enter the account password"
        />
        <button className="btn-secondary" type="button" onClick={() => setVisible((current) => !current)}>
          {visible ? "Hide" : "Show"}
        </button>
        {mode === "edit" ? (
          <button className="btn-secondary" type="button" onClick={() => onDraftChange(null)}>
            Cancel
          </button>
        ) : null}
      </div>
      <small>
        Stored encrypted. Leave blank to save no password.
        {mode === "edit" && hasStoredPassword ? " Saving an empty value clears the stored password." : ""}
      </small>
    </div>
  );
}
