"use client";

import { Fragment, useMemo, useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Ban, CircleCheck, UserMinus, Trash2, ChevronRight, Users, Pencil } from "lucide-react";

function parseError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const match = error.message.match(/Uncaught Error:\s*(.+?)(?:\n|$)/s);
  return match?.[1]?.trim() ?? error.message;
}
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { USER_ROLES, type UserRole } from "@/lib/roles";

type UserAccount = {
  _id: Id<"users">;
  _creationTime: number;
  displayName: string;
  username: string;
  email?: string;
  role: string;
  serviceGroups: string[];
  approvalScopes: string[];
  department?: string;
  section?: string;
  active: boolean;
  passwordConfigured: boolean;
  passwordUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
};

type UserFormState = {
  displayName: string;
  username: string;
  email: string;
  temporaryPassword: string;
  role: UserRole;
  serviceGroups: string[];
  department: string;
};

const roleOptions: Array<{ value: UserRole; label: string; description: string }> = [
  { value: "owner", label: "Owner", description: "Super-admin. Full system access; typically the org owner." },
  { value: "admin", label: "Admin", description: "Full system access across users, assets, and workflows." },
  { value: "reviewer", label: "Reviewer", description: "Approves travel orders for their team (2nd step)." },
  { value: "team_lead", label: "Team Lead", description: "Approves travel orders for their team (1st step). HR team's Team Lead = Fleet Admin." },
  { value: "member", label: "Member", description: "Submits and tracks their own requests." },
];

const defaultFormState: UserFormState = {
  displayName: "",
  username: "",
  email: "",
  temporaryPassword: "",
  role: "member",
  serviceGroups: [],
  department: "",
};

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

function toggleListValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function normalizeRoleForSelect(role: string): UserRole {
  return isUserRole(role) ? role : "member";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarStyle(): { background: string; color: string } {
  return { background: "#e5e7eb", color: "#374151" };
}

// Username is derived from the email's local part (the bit before "@"),
// sanitized to the allowed username format. Email is the single identity field.
function buildUsernameFromEmail(email: string) {
  const local = (email.trim().toLowerCase().split("@")[0] ?? "");
  return local
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^[.]+|[.]+$/g, "")
    .slice(0, 40);
}

export default function UsersClient() {
  const users = useQuery(api.users.list, {});
  const departments = useQuery(api.departments.list, {});
  const createUser = useMutation(api.users.create);
  const updateRole = useMutation(api.users.updateRole);
  const setActive = useMutation(api.users.setActive);
  const setPassword = useMutation(api.users.setPassword);
  const setTeam = useMutation(api.users.setTeam);
  const removeUser = useMutation(api.users.remove);
  const addDepartment = useMutation(api.departments.add);
  const renameDepartment = useMutation(api.departments.rename);
  const removeDepartment = useMutation(api.departments.remove);

  const [form, setForm] = useState<UserFormState>(defaultFormState);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [teamError, setTeamError] = useState("");
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users ?? [];
    return (users ?? []).filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.department ?? "").toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  // Group the user list by team (department) for the "by team" view.
  const usersByTeam = useMemo(() => {
    const groups = new Map<string, UserAccount[]>();
    // Seed every known team so empty teams still render (APO shows 0-member teams).
    for (const dept of departments ?? []) groups.set(dept, []);
    for (const user of filteredUsers) {
      const team = user.department?.trim() || "Unassigned";
      const bucket = groups.get(team);
      if (bucket) bucket.push(user);
      else groups.set(team, [user]);
    }
    let entries = Array.from(groups.entries());
    // While searching, hide empty teams so only matching results show.
    if (userSearch.trim()) entries = entries.filter(([, members]) => members.length > 0);
    return entries.sort((a, b) => {
      if (a[0] === "Unassigned") return -1;
      if (b[0] === "Unassigned") return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [filteredUsers, departments, userSearch]);

  function toggleTeam(team: string) {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(team)) next.delete(team);
      else next.add(team);
      return next;
    });
  }

function handleFieldChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setForm((current) => {
      if (name === "email") {
        return { ...current, email: value, username: buildUsernameFromEmail(value) };
      }
      return {
        ...current,
        [name]: name === "role" ? normalizeRoleForSelect(value) : value,
      };
    });
  }

  function toggleFormServiceGroup(serviceGroup: string) {
    setForm((current) => ({
      ...current,
      serviceGroups: toggleListValue(current.serviceGroups, serviceGroup),
    }));
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setIsSubmitting(true);
      setErrorMessage("");
      setSuccessMessage("");
      await createUser({
        displayName: form.displayName,
        username: form.username,
        email: form.email || undefined,
        temporaryPassword: form.temporaryPassword,
        role: form.role,
        serviceGroups: form.serviceGroups,
        department: form.department || undefined,
        createdBy: "IT Operations",
      });
      setForm(defaultFormState);
      setShowAddUserModal(false);
      setSuccessMessage("User account created.");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      setErrorMessage(parseError(error, "Unable to create user."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newTeamName.trim();
    if (!name) return;
    setTeamError("");
    try {
      await addDepartment({ name });
      setNewTeamName("");
      setShowAddTeamModal(false);
      setSuccessMessage(`Team "${name}" added.`);
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      setTeamError(parseError(error, "Unable to add team."));
    }
  }

  async function handleSetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUserId) return;
    try {
      setBusyUserId(selectedUserId);
      setErrorMessage("");
      setSuccessMessage("");
      await setPassword({ userId: selectedUserId, temporaryPassword });
      setTemporaryPassword("");
      setSuccessMessage("Temporary password saved.");
    } catch (error) {
      setErrorMessage(parseError(error, "Unable to save password."));
    } finally {
      setBusyUserId("");
    }
  }

  async function handleRoleChange(user: UserAccount, role: UserRole) {
    try {
      setBusyUserId(user._id);
      setErrorMessage("");
      setSuccessMessage("");
      await updateRole({ userId: user._id, role, serviceGroups: user.serviceGroups });
      setSuccessMessage("User role updated.");
    } catch (error) {
      setErrorMessage(parseError(error, "Unable to update role."));
    } finally {
      setBusyUserId("");
    }
  }

  async function handleAccessToggle(user: UserAccount, value: string) {
    try {
      setBusyUserId(user._id);
      setErrorMessage("");
      setSuccessMessage("");
      await updateRole({
        userId: user._id,
        role: normalizeRoleForSelect(user.role),
        serviceGroups: toggleListValue(user.serviceGroups, value),
      });
      setSuccessMessage("Workflow access updated.");
    } catch (error) {
      setErrorMessage(parseError(error, "Unable to update workflow access."));
    } finally {
      setBusyUserId("");
    }
  }

  async function handleActiveChange(user: UserAccount) {
    try {
      setBusyUserId(user._id);
      setErrorMessage("");
      setSuccessMessage("");
      await setActive({ userId: user._id, active: !user.active });
      setSuccessMessage(user.active ? "User deactivated." : "User reactivated.");
    } catch (error) {
      setErrorMessage(parseError(error, "Unable to update user status."));
    } finally {
      setBusyUserId("");
    }
  }

  async function handleTeamChange(user: UserAccount, department: string) {
    try {
      setBusyUserId(user._id);
      setErrorMessage("");
      setSuccessMessage("");
      await setTeam({ userId: user._id, department });
      setSuccessMessage("Team updated.");
    } catch (error) {
      setErrorMessage(parseError(error, "Unable to update team."));
    } finally {
      setBusyUserId("");
    }
  }

  async function handleRemoveFromTeam(user: UserAccount) {
    if (!user.department) return;
    try {
      setBusyUserId(user._id);
      setErrorMessage("");
      setSuccessMessage("");
      await setTeam({ userId: user._id, department: "" });
      setSuccessMessage(`${user.displayName} removed from ${user.department}.`);
    } catch (error) {
      setErrorMessage(parseError(error, "Unable to remove user from team."));
    } finally {
      setBusyUserId("");
    }
  }

  async function handleRenameTeam(team: string) {
    const next = window.prompt(`Rename team "${team}" to:`, team);
    if (next == null) return;
    const name = next.trim();
    if (!name || name === team) return;
    try {
      setErrorMessage("");
      setSuccessMessage("");
      await renameDepartment({ from: team, to: name });
      setExpandedTeams((prev) => {
        if (!prev.has(team)) return prev;
        const nextSet = new Set(prev);
        nextSet.delete(team);
        nextSet.add(name);
        return nextSet;
      });
      setSuccessMessage(`Team renamed to ${name}.`);
    } catch (error) {
      setErrorMessage(parseError(error, "Unable to rename team."));
    }
  }

  async function handleDeleteTeam(team: string, memberCount: number) {
    const message = memberCount > 0
      ? `Delete team "${team}"? Its ${memberCount} member${memberCount === 1 ? "" : "s"} will become Unassigned.`
      : `Delete team "${team}"?`;
    if (!window.confirm(message)) return;
    try {
      setErrorMessage("");
      setSuccessMessage("");
      await removeDepartment({ name: team });
      setSuccessMessage(`Team "${team}" deleted.`);
    } catch (error) {
      setErrorMessage(parseError(error, "Unable to delete team."));
    }
  }

  async function handleDeleteUser(user: UserAccount) {
    if (!window.confirm(`Delete ${user.displayName}? This permanently removes the account and cannot be undone.`)) {
      return;
    }
    try {
      setBusyUserId(user._id);
      setErrorMessage("");
      setSuccessMessage("");
      await removeUser({ userId: user._id });
      if (selectedUserId === user._id) setSelectedUserId(null);
      setSuccessMessage(`${user.displayName} deleted.`);
    } catch (error) {
      setErrorMessage(parseError(error, "Unable to delete user."));
    } finally {
      setBusyUserId("");
    }
  }

  const selectedUser = users?.find((user) => user._id === selectedUserId);
  const totalMembers = (users ?? []).length;
  const adminCount = (users ?? []).filter((u) => normalizeRoleForSelect(u.role) === "admin").length;

  return (
    <>
    <div className="users-page">
      <div className="users-page-header">
        <div>
          <h1 className="type-page-title">Users</h1>
          <p className="type-page-subtitle">
            Create account records and assign roles for request workflows.
          </p>
        </div>
      </div>

      {/* Organization summary card (APO-style) */}
      <section
        style={{
          background: "var(--surface-card, #fff)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: "16px 20px",
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
          boxShadow: "0 1px 2px rgba(16,24,40,.04)",
        }}
      >
        <span
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "rgb(var(--brand-900-rgb))",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div style={{ display: "grid", gap: 3 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--foreground)" }}>Organization Members</span>
          <span style={{ fontSize: 13, color: "var(--muted)", display: "flex", gap: 16 }}>
            <span>{totalMembers} members</span>
            <span>{adminCount} administrator{adminCount === 1 ? "" : "s"}</span>
          </span>
        </div>
      </section>

      {/* ── Add User modal ── */}
      {showAddUserModal ? (
        <div
          className="users-modal-backdrop"
          onClick={() => { setShowAddUserModal(false); setErrorMessage(""); }}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}
        >
        <div
          className="users-form"
          onClick={(event) => event.stopPropagation()}
          style={{ background: "var(--surface-card, #fff)", borderRadius: 14, padding: 20, width: "100%", maxWidth: 460, boxShadow: "0 12px 40px rgba(16,24,40,.22)" }}
        >
          <div>
            <h2 className="type-section-title" style={{ marginBottom: 4 }}>Add User</h2>
            <p className="type-section-copy">This creates the profile and role only. Password login will be added in a later phase.</p>
          </div>

          <form onSubmit={handleCreateUser} style={{ display: "grid", gap: 14 }}>
            <label className="users-field">
              <span>Full Name</span>
              <input
                className="input-base"
                name="displayName"
                value={form.displayName}
                onChange={handleFieldChange}
                placeholder="Enter full name"
                required
              />
            </label>

            <label className="users-field">
              <span>Email</span>
              <input
                className="input-base"
                name="email"
                type="email"
                value={form.email}
                onChange={handleFieldChange}
                placeholder="name@company.com"
                required
              />
              {form.username ? (
                <small style={{ fontSize: 11, color: "var(--muted)" }}>Username: @{form.username}</small>
              ) : null}
            </label>

            <label className="users-field">
              <span>Temporary Password</span>
              <input
                className="input-base"
                name="temporaryPassword"
                type="password"
                value={form.temporaryPassword}
                onChange={handleFieldChange}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                required
              />
            </label>

            <div className="users-form-grid">
              <label className="users-field">
                <span>Role</span>
                <select className="input-base" name="role" value={form.role} onChange={handleFieldChange}>
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="users-field">
                <span>Team</span>
                <select className="input-base" name="department" value={form.department} onChange={handleFieldChange}>
                  <option value="">— Select team —</option>
                  {(departments ?? []).map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="users-scope-panel">
              <div>
                <strong>Handles requests for</strong>
                <span>Request queues this user can process. Leave empty for requesters who only submit.</span>
              </div>
              <div className="users-scope-options">
                {(departments ?? []).map((sg) => (
                  <label key={sg} className="users-scope-option">
                    <input
                      type="checkbox"
                      checked={form.serviceGroups.includes(sg)}
                      onChange={() => toggleFormServiceGroup(sg)}
                    />
                    <span>{sg}</span>
                  </label>
                ))}
              </div>
            </div>

            {errorMessage ? <div className="reservation-error">{errorMessage}</div> : null}
            {successMessage ? <div className="users-success">{successMessage}</div> : null}

            <button className="btn-primary" type="submit" disabled={isSubmitting} style={{ width: "100%" }}>
              {isSubmitting ? "Creating..." : "Create User"}
            </button>
          </form>
        </div>
        </div>
      ) : null}

      {successMessage ? <div className="users-success" style={{ marginBottom: 12 }}>{successMessage}</div> : null}
      {errorMessage ? <div className="reservation-error" style={{ marginBottom: 12 }}>{errorMessage}</div> : null}

      {/* ── User Accounts roster ── */}
      <div className="users-table-panel">
          <div className="users-table-head">
            <div>
              <h2 className="type-section-title">User Accounts</h2>
              <p className="type-section-copy">Manage roles and active status for request workflows.</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <div className="search-field" style={{ width: 200, flexShrink: 0 }}>
                <span className="search-icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                    <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  className="input-base"
                  placeholder="Search members"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn-primary"
                style={{ whiteSpace: "nowrap" }}
                onClick={() => { setErrorMessage(""); setShowAddUserModal(true); }}
              >
                + Add User
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ whiteSpace: "nowrap" }}
                onClick={() => { setTeamError(""); setNewTeamName(""); setShowAddTeamModal(true); }}
              >
                + Add Team
              </button>
            </div>
          </div>

          <div className="ulist-wrap">
            {users === undefined ? (
              <p className="type-helper" style={{ padding: "16px 20px" }}>Loading users…</p>
            ) : (
              <table className="ulist-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Team</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="ulist-empty">
                        {userSearch ? "No users match your search." : "No user accounts yet."}
                      </td>
                    </tr>
                  ) : usersByTeam.map(([team, members]) => {
                    const isExpanded = expandedTeams.has(team) || Boolean(userSearch.trim());
                    const isUnassigned = team === "Unassigned";
                    return (
                    <Fragment key={team}>
                      <tr className="team-group-row" onClick={() => toggleTeam(team)}>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div className="team-group-bar">
                            <span className={`team-chevron${isExpanded ? " is-open" : ""}`}>
                              <ChevronRight size={16} strokeWidth={2} />
                            </span>
                            <Users size={15} strokeWidth={1.75} className="team-group-icon" />
                            <span className="team-group-name">{team}</span>
                            {!isUnassigned ? (
                              <span className="team-group-actions" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="roster-icon-btn team-mini"
                                  title="Rename team"
                                  aria-label={`Rename ${team}`}
                                  onClick={() => void handleRenameTeam(team)}
                                >
                                  <Pencil size={14} strokeWidth={1.75} />
                                </button>
                                <button
                                  type="button"
                                  className="roster-icon-btn is-danger team-mini"
                                  title="Delete team"
                                  aria-label={`Delete ${team}`}
                                  onClick={() => void handleDeleteTeam(team, members.length)}
                                >
                                  <Trash2 size={14} strokeWidth={1.75} />
                                </button>
                              </span>
                            ) : null}
                            <span className="team-group-count">
                              {members.length} member{members.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && members.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="team-empty-row">No members in this team yet.</td>
                        </tr>
                      ) : null}
                      {isExpanded && members.map((user) => {
                        const initials = getInitials(user.displayName);
                        const avatarStyle = getAvatarStyle();
                        return (
                          <tr
                            key={user._id}
                            className="ulist-row"
                            onClick={() => { setSelectedUserId(user._id); setTemporaryPassword(""); setErrorMessage(""); setSuccessMessage(""); }}
                          >
                            <td>
                              <div className="ulist-name-cell">
                                <div className="ulist-avatar" style={avatarStyle}>{initials}</div>
                                <div>
                                  <div className="ulist-display-name">{user.displayName}</div>
                                  <div className="ulist-username">{user.email ?? `@${user.username}`}</div>
                                </div>
                              </div>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <select
                                className="roster-select"
                                value={normalizeRoleForSelect(user.role)}
                                disabled={busyUserId === user._id}
                                onChange={(e) => void handleRoleChange(user, normalizeRoleForSelect(e.target.value))}
                                aria-label={`Role for ${user.displayName}`}
                              >
                                {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <select
                                className="roster-select"
                                value={user.department ?? ""}
                                disabled={busyUserId === user._id}
                                onChange={(e) => void handleTeamChange(user, e.target.value)}
                                aria-label={`Team for ${user.displayName}`}
                              >
                                <option value="">Unassigned</option>
                                {(departments ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
                              </select>
                            </td>
                            <td>
                              <span className={`member-badge${user.active ? " is-active" : " is-inactive"}`}>
                                {user.active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="roster-actions">
                                <button
                                  type="button"
                                  className="roster-icon-btn"
                                  title={user.active ? "Deactivate user" : "Activate user"}
                                  aria-label={user.active ? `Deactivate ${user.displayName}` : `Activate ${user.displayName}`}
                                  disabled={busyUserId === user._id}
                                  onClick={() => void handleActiveChange(user)}
                                >
                                  {user.active ? <Ban size={16} strokeWidth={1.75} /> : <CircleCheck size={16} strokeWidth={1.75} />}
                                </button>
                                <button
                                  type="button"
                                  className="roster-icon-btn"
                                  title={user.department ? "Remove from team" : "No team assigned"}
                                  aria-label={`Remove ${user.displayName} from team`}
                                  disabled={busyUserId === user._id || !user.department}
                                  onClick={() => void handleRemoveFromTeam(user)}
                                >
                                  <UserMinus size={16} strokeWidth={1.75} />
                                </button>
                                <button
                                  type="button"
                                  className="roster-icon-btn is-danger"
                                  title="Delete user"
                                  aria-label={`Delete ${user.displayName}`}
                                  disabled={busyUserId === user._id}
                                  onClick={() => void handleDeleteUser(user)}
                                >
                                  <Trash2 size={16} strokeWidth={1.75} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

    </div>

    {/* ── Add Team modal ── */}
    {showAddTeamModal ? (
      <div
        className="users-modal-backdrop"
        onClick={() => setShowAddTeamModal(false)}
        style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }}
      >
        <form
          onSubmit={handleCreateTeam}
          onClick={(event) => event.stopPropagation()}
          style={{ background: "var(--surface-card, #fff)", borderRadius: 14, padding: 20, width: "100%", maxWidth: 400, boxShadow: "0 12px 40px rgba(16,24,40,.22)", display: "grid", gap: 14 }}
        >
          <div>
            <h2 className="type-section-title" style={{ marginBottom: 4 }}>Add Team</h2>
            <p className="type-section-copy">Teams group members and route approvals. Also editable in Settings.</p>
          </div>
          <label className="users-field">
            <span>Team name</span>
            <input
              className="input-base"
              value={newTeamName}
              onChange={(event) => setNewTeamName(event.target.value)}
              placeholder="e.g. Finance"
              autoFocus
              required
            />
          </label>
          {teamError ? <div className="reservation-error">{teamError}</div> : null}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn-secondary" onClick={() => setShowAddTeamModal(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!newTeamName.trim()}>Create Team</button>
          </div>
        </form>
      </div>
    ) : null}

    {/* Edit User Panel — portalled to body so backdrop-filter works outside overflow:clip ancestors */}
    {mounted && selectedUser ? createPortal(
      <div
        className="member-panel-backdrop"
        onClick={() => { setSelectedUserId(null); setTemporaryPassword(""); }}
      >
        <aside className="member-panel" onClick={(e) => e.stopPropagation()}>
          <div className="member-panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="member-panel-avatar" style={getAvatarStyle()}>
                {getInitials(selectedUser.displayName)}
              </div>
              <div>
                <div className="member-panel-name">{selectedUser.displayName}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>@{selectedUser.username}</div>
              </div>
            </div>
            <button
              type="button"
              className="member-panel-close"
              onClick={() => { setSelectedUserId(null); setTemporaryPassword(""); }}
              aria-label="Close panel"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="member-panel-body">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span className={`member-badge${selectedUser.active ? " is-active" : " is-inactive"}`}>
                {selectedUser.active ? "Active" : "Inactive"}
              </span>
              {selectedUser.email ? (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{selectedUser.email}</span>
              ) : null}
            </div>

            <div className="member-panel-section">
              <div className="member-panel-section-title">Role</div>
              <select
                className="input-base"
                value={normalizeRoleForSelect(selectedUser.role)}
                onChange={(e) => void handleRoleChange(selectedUser, normalizeRoleForSelect(e.target.value))}
                disabled={busyUserId === selectedUser._id}
              >
                {roleOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: "5px 0 0", lineHeight: 1.5 }}>
                {roleOptions.find((r) => r.value === normalizeRoleForSelect(selectedUser.role))?.description}
              </p>
            </div>

            {(departments ?? []).length > 0 ? (
              <div className="member-panel-section">
                <div className="member-panel-section-title">Handles requests for</div>
                {selectedUser.serviceGroups.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {selectedUser.serviceGroups.map((sg) => (
                      <span
                        key={sg}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 10px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent-ink)", fontSize: 12, fontWeight: 500 }}
                      >
                        {sg}
                        <button
                          type="button"
                          aria-label={`Remove ${sg}`}
                          disabled={busyUserId === selectedUser._id}
                          onClick={() => void handleAccessToggle(selectedUser, sg)}
                          style={{ display: "inline-flex", border: 0, background: "none", cursor: "pointer", color: "var(--accent-ink)", fontSize: 15, lineHeight: 1, padding: 0 }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <select
                  className="input-base"
                  value=""
                  disabled={busyUserId === selectedUser._id}
                  onChange={(e) => { if (e.target.value) void handleAccessToggle(selectedUser, e.target.value); }}
                  aria-label="Add a team this user handles requests for"
                >
                  <option value="">Add a team…</option>
                  {(departments ?? [])
                    .filter((sg) => !selectedUser.serviceGroups.includes(sg))
                    .map((sg) => (
                      <option key={sg} value={sg}>{sg}</option>
                    ))}
                </select>
              </div>
            ) : null}

            <div className="member-panel-section">
              <div className="member-panel-section-title">
                {selectedUser.passwordConfigured ? "Reset Password" : "Set Password"}
              </div>
              <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 8px", lineHeight: 1.5 }}>
                {selectedUser.passwordConfigured
                  ? `Password set${selectedUser.passwordUpdatedAt ? ` · last updated ${new Date(selectedUser.passwordUpdatedAt).toLocaleDateString()}` : ""}. For security it is encrypted and cannot be shown — set a new one below to change it.`
                  : "No password set yet. Create one below."}
              </p>
              <form onSubmit={handleSetPassword} style={{ display: "grid", gap: 8 }}>
                <input
                  className="input-base"
                  type="password"
                  value={temporaryPassword}
                  onChange={(e) => setTemporaryPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  required
                />
                <button
                  className="btn-primary"
                  type="submit"
                  disabled={busyUserId === selectedUser._id}
                  style={{ fontSize: 13 }}
                >
                  {busyUserId === selectedUser._id ? "Saving…" : "Save Password"}
                </button>
              </form>
            </div>

            <div className="member-panel-section">
              <div className="member-panel-section-title">Account Status</div>
              <button
                className={selectedUser.active ? "btn-danger" : "btn-success"}
                type="button"
                style={{ fontSize: 13, width: "100%" }}
                onClick={() => void handleActiveChange(selectedUser)}
                disabled={busyUserId === selectedUser._id}
              >
                {selectedUser.active ? "Deactivate User" : "Reactivate User"}
              </button>
            </div>

            {successMessage ? <div className="users-success" style={{ marginTop: 4 }}>{successMessage}</div> : null}
            {errorMessage ? <div className="reservation-error" style={{ marginTop: 4 }}>{errorMessage}</div> : null}
          </div>
        </aside>
      </div>,
      document.body
    ) : null}
    </>
  );
}
