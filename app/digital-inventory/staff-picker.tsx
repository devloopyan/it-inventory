"use client";

import { useState } from "react";

// Past this many people the chip list is collapsed behind a count, so adding
// someone does not keep resizing the section around it.
const COLLAPSED_CHIPS = 2;

export type StaffOption = {
  username: string;
  displayName: string;
};

export function OwnerSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (username: string) => void;
  options: StaffOption[];
}) {
  return (
    <select
      className="input-base"
      name="ownerUsername"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">No owner set</option>
      {options.map((option) => (
        <option key={option.username} value={option.username}>
          {option.displayName}
        </option>
      ))}
    </select>
  );
}

export function SharedAccessPicker({
  value,
  onChange,
  options,
}: {
  value: string[];
  onChange: (usernames: string[]) => void;
  options: StaffOption[];
}) {
  const [expanded, setExpanded] = useState(false);
  const available = options.filter((option) => !value.includes(option.username));
  const hiddenCount = Math.max(0, value.length - COLLAPSED_CHIPS);
  const shown = expanded ? value : value.slice(0, COLLAPSED_CHIPS);

  function labelFor(username: string) {
    return options.find((option) => option.username === username)?.displayName ?? username;
  }

  return (
    <div className="digital-chip-picker">
      <select
        className="input-base"
        value=""
        onChange={(event) => {
          const username = event.target.value;
          if (username) onChange([...value, username]);
        }}
      >
        <option value="">Add a person...</option>
        {available.map((option) => (
          <option key={option.username} value={option.username}>
            {option.displayName}
          </option>
        ))}
      </select>
      {value.length ? (
        <>
          <ul className={`digital-chip-list${expanded ? " expanded" : ""}`}>
            {shown.map((username) => (
              <li className="digital-chip" key={username}>
                <span>{labelFor(username)}</span>
                <button
                  className="digital-chip-remove"
                  type="button"
                  aria-label={`Remove ${labelFor(username)}`}
                  onClick={() => onChange(value.filter((entry) => entry !== username))}
                >
                  &times;
                </button>
              </li>
            ))}
          </ul>
          {hiddenCount ? (
            <button
              className="digital-chip-more"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? "Show fewer" : `See ${hiddenCount} more`}
            </button>
          ) : null}
        </>
      ) : (
        <small className="digital-chip-empty">No one else has access.</small>
      )}
    </div>
  );
}
