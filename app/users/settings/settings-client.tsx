"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const ROLES = [
  {
    label: "Admin",
    color: "#4f46e5",
    bg: "#eef2ff",
    border: "#c7d2fe",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    description: "Full system access. Can manage users, view all requests, configure settings, and perform any action across the platform.",
    permissions: ["Manage users & roles", "Access all modules", "Configure settings", "View all requests"],
  },
  {
    label: "Service Staff",
    color: "#0891b2",
    bg: "#ecfeff",
    border: "#a5f3fc",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    description: "Handles and processes incoming service requests assigned to their team or service group.",
    permissions: ["View assigned requests", "Update request status", "Add comments & notes", "Close resolved tickets"],
  },
  {
    label: "IT Staff (legacy)",
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#ddd6fe",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
        <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    description: "Legacy IT staff role kept for backward compatibility. Existing users on this role retain their access while accounts are migrated.",
    permissions: ["Same access as Service Staff", "Kept for migration only", "No new assignments"],
  },
  {
    label: "Approver",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    description: "Reviews and approves or rejects submitted requests such as meeting room bookings and travel orders.",
    permissions: ["Review pending requests", "Approve or reject", "Add approval notes", "View request history"],
  },
  {
    label: "Requester",
    color: "#059669",
    bg: "#f0fdf4",
    border: "#bbf7d0",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
        <path d="M14 2v6h6M12 18v-6M9 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
    description: "End users who submit requests and track their own tickets. Cannot process or approve requests from others.",
    permissions: ["Submit new requests", "Track own tickets", "View request status", "Add comments to own requests"],
  },
];

const PILL_COLORS = [
  { bg: "#fce7f3", color: "#9d174d", border: "#fbcfe8" },
  { bg: "#dbeafe", color: "#1e40af", border: "#bfdbfe" },
  { bg: "#d1fae5", color: "#065f46", border: "#a7f3d0" },
  { bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
  { bg: "#ede9fe", color: "#5b21b6", border: "#ddd6fe" },
  { bg: "#ffedd5", color: "#9a3412", border: "#fed7aa" },
  { bg: "#e0f2fe", color: "#075985", border: "#bae6fd" },
  { bg: "#f0fdf4", color: "#14532d", border: "#bbf7d0" },
];

export default function UserSettingsClient() {
  const departments = useQuery(api.departments.list, {});
  const detailedDepartments = useQuery(api.departments.listDetailed, {});
  const users = useQuery(api.users.list, {});
  const addDepartment = useMutation(api.departments.add);
  const removeDepartment = useMutation(api.departments.remove);
  const setDepartmentApprovers = useMutation(api.departments.setApprovers);

  const [newDeptName, setNewDeptName] = useState("");
  const [deptError, setDeptError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [approverError, setApproverError] = useState("");

  const activeUsers = (users ?? []).filter((u) => u.active);

  // Update one role (Team Leader or Manager) for a department, keeping the other as-is.
  async function handleSetApprover(
    dept: { name: string; teamLeaderUsername?: string; managerUsername?: string },
    field: "teamLeaderUsername" | "managerUsername",
    username: string,
  ) {
    setApproverError("");
    try {
      await setDepartmentApprovers({
        name: dept.name,
        teamLeaderUsername: field === "teamLeaderUsername" ? username : dept.teamLeaderUsername ?? "",
        managerUsername: field === "managerUsername" ? username : dept.managerUsername ?? "",
      });
    } catch (err) {
      setApproverError(err instanceof Error ? err.message : "Failed to save approver.");
    }
  }

  async function handleAdd() {
    const name = newDeptName.trim();
    if (!name) return;
    setDeptError("");
    setSuccessMsg("");
    try {
      await addDepartment({ name });
      setNewDeptName("");
      setSuccessMsg(`"${name}" added.`);
      setTimeout(() => setSuccessMsg(""), 2500);
    } catch (err) {
      setDeptError(err instanceof Error ? err.message : "Failed to add.");
    }
  }

  async function handleRemove(name: string) {
    setDeptError("");
    setSuccessMsg("");
    try {
      await removeDepartment({ name });
    } catch (err) {
      setDeptError(err instanceof Error ? err.message : "Failed to remove.");
    }
  }

  return (
    <div className="usettings-page">
      <div className="usettings-header">
        <Link href="/users" className="usettings-back">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to Users
        </Link>
        <div>
          <h1 className="type-page-title">User Settings</h1>
          <p className="type-page-subtitle">Manage teams and service groups used across user accounts.</p>
        </div>
      </div>

      <div className="usettings-card">
        <div className="usettings-card-head">
          <div>
            <h2 className="type-section-title">Teams</h2>
            <p className="type-section-copy">
              The teams a user can belong to. The same list also defines the request queues staff
              can handle (the &ldquo;Handles requests for&rdquo; options on a user).
            </p>
          </div>
        </div>

        <div className="usettings-add-row">
          <input
            className="input-base"
            placeholder="New team name (e.g. Finance)"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAdd(); } }}
          />
          <button
            type="button"
            className="btn-primary"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => void handleAdd()}
            disabled={!newDeptName.trim()}
          >
            Add Team
          </button>
        </div>

        {deptError ? <p className="usettings-error">{deptError}</p> : null}
        {successMsg ? <p className="usettings-success">{successMsg}</p> : null}

        <div className="usettings-divider" />

        {departments === undefined ? (
          <p className="type-helper">Loading…</p>
        ) : departments.length === 0 ? (
          <p className="type-helper">No teams yet. Add one above.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {departments.map((dept, i) => {
              const c = PILL_COLORS[i % PILL_COLORS.length];
              return (
                <span
                  key={dept}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "7px 14px",
                    borderRadius: 999,
                    fontSize: 13,
                    fontWeight: 600,
                    background: c.bg,
                    color: c.color,
                    border: `1.5px solid ${c.border}`,
                  }}
                >
                  {dept}
                  <button
                    type="button"
                    onClick={() => void handleRemove(dept)}
                    aria-label={`Remove ${dept}`}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 16,
                      lineHeight: 1,
                      padding: 0,
                      color: "inherit",
                      opacity: 0.6,
                      display: "flex",
                      alignItems: "center",
                    }}
                  >×</button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Department leadership: Team Leader + Manager per department.
          Shared across approval processes (Travel Orders today, more later). */}
      <div className="usettings-card">
        <div className="usettings-card-head">
          <div>
            <h2 className="type-section-title">Team Leadership</h2>
            <p className="type-section-copy">
              Set the Team Leader and Manager for each team. These are used to route
              approvals across the system — for example, Travel Orders go Team Leader →
              Manager → HR Fleet Manager, and a requester who is already the Team Leader or
              Manager skips their own step.
            </p>
          </div>
        </div>

        {approverError ? <p className="usettings-error">{approverError}</p> : null}

        {detailedDepartments === undefined || users === undefined ? (
          <p className="type-helper">Loading…</p>
        ) : detailedDepartments.length === 0 ? (
          <p className="type-helper">No teams yet. Add one above first.</p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {detailedDepartments.map((dept) => (
              <div
                key={dept.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(120px, 1fr) 2fr 2fr",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1.5px solid #e5e7eb",
                  background: "#fff",
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>{dept.name}</span>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Team Leader</span>
                  <select
                    className="input-base"
                    value={dept.teamLeaderUsername ?? ""}
                    onChange={(e) => void handleSetApprover(dept, "teamLeaderUsername", e.target.value)}
                  >
                    <option value="">— None —</option>
                    {activeUsers.map((u) => (
                      <option key={u.username} value={u.username}>
                        {u.displayName}{u.department ? ` (${u.department})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280" }}>Manager</span>
                  <select
                    className="input-base"
                    value={dept.managerUsername ?? ""}
                    onChange={(e) => void handleSetApprover(dept, "managerUsername", e.target.value)}
                  >
                    <option value="">— None —</option>
                    {activeUsers.map((u) => (
                      <option key={u.username} value={u.username}>
                        {u.displayName}{u.department ? ` (${u.department})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Roles reference */}
      <div className="usettings-card">
        <div className="usettings-card-head">
          <div>
            <h2 className="type-section-title">User Roles</h2>
            <p className="type-section-copy">Reference guide for what each role can do within the system.</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {ROLES.map((role) => (
            <div
              key={role.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 16,
                borderRadius: 12,
                border: `1.5px solid ${role.border}`,
                background: "#fff",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: role.bg,
                  color: role.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {role.icon}
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: role.color }}>{role.label}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>{role.description}</p>
              <ul style={{ listStyle: "none", margin: "4px 0 0", padding: 0, display: "grid", gap: 5 }}>
                {role.permissions.map((p) => (
                  <li key={p} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151" }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ color: role.color, flexShrink: 0 }}>
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
