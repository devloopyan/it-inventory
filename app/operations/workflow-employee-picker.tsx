"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { Workflow } from "@/lib/workflows";

export type SelectedEmployee = {
  id: Id<"users">;
  displayName: string;
  username: string;
};

type Props = {
  workflow: Workflow;
  onSelect: (employee: SelectedEmployee) => void;
  onClose: () => void;
};

export default function WorkflowEmployeePicker({ workflow, onSelect, onClose }: Props) {
  const users = useQuery(api.users.list, {});
  const [search, setSearch] = useState("");

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const needle = search.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((user) => {
      return (
        user.displayName.toLowerCase().includes(needle) ||
        user.username.toLowerCase().includes(needle) ||
        (user.email?.toLowerCase().includes(needle) ?? false) ||
        (user.department?.toLowerCase().includes(needle) ?? false)
      );
    });
  }, [users, search]);

  return (
    <div
      className="workflow-picker-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Pick an employee for ${workflow.label}`}
    >
      <button
        type="button"
        className="workflow-picker-backdrop"
        aria-label="Close employee picker"
        onClick={onClose}
      />
      <div className="workflow-picker-shell">
        <div className="workflow-picker-card">
          <div className="workflow-picker-head">
            <div className="workflow-picker-head-copy">
              <span className="workflow-picker-eyebrow">{workflow.label}</span>
              <h2 className="workflow-picker-title">Pick an employee</h2>
              <p className="workflow-picker-subtitle">
                {workflow.description}
              </p>
            </div>
            <button
              type="button"
              className="workflow-picker-close"
              aria-label="Close"
              onClick={onClose}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <input
            type="text"
            className="workflow-picker-search"
            placeholder="Search by name, username, email, or department"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />

          <div className="workflow-picker-list">
            {users === undefined ? (
              <div className="workflow-picker-empty">Loading employees...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="workflow-picker-empty">
                {search.trim() ? "No employees match that search." : "No employees found."}
              </div>
            ) : (
              filteredUsers.map((user) => (
                <button
                  key={user._id}
                  type="button"
                  className="workflow-picker-row"
                  onClick={() =>
                    onSelect({
                      id: user._id,
                      displayName: user.displayName,
                      username: user.username,
                    })
                  }
                >
                  <span className="workflow-picker-row-main">
                    <span className="workflow-picker-row-name">{user.displayName}</span>
                    <span className="workflow-picker-row-meta">
                      @{user.username}
                      {user.department ? ` · ${user.department}` : ""}
                      {user.active ? "" : " · inactive"}
                    </span>
                  </span>
                  <span className="workflow-picker-row-role">{user.role}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
