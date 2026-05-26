"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

function parseError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  // Convex wraps server errors: strip the "[CONVEX M(...)] ... Uncaught Error: " prefix
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
  section: string;
};

const roleOptions: Array<{ value: UserRole; label: string; description: string }> = [
  { value: "admin", label: "Admin", description: "Full system access across users, assets, and workflows." },
  { value: "service_staff", label: "Service Staff", description: "Handles requests for assigned service groups." },
  { value: "it_staff", label: "IT Staff (legacy)", description: "Old IT staff role. Keep existing users working while we migrate." },
  { value: "approver", label: "Approver", description: "Reviews and approves meeting requests." },
  { value: "requester", label: "Requester", description: "Submits and tracks their own requests." },
];

const defaultFormState: UserFormState = {
  displayName: "",
  username: "",
  email: "",
  temporaryPassword: "",
  role: "requester",
  serviceGroups: [],
  department: "",
  section: "",
};

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

function toggleListValue<T extends string>(values: T[], value: T) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function normalizeRoleForSelect(role: string): UserRole {
  return isUserRole(role) ? role : "requester";
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarStyle(_name: string): { background: string; color: string } {
  return { background: "#e5e7eb", color: "#374151" };
}

function buildUsernameSuggestion(displayName: string) {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 40);
}

export default function UsersClient() {
  const users = useQuery(api.users.list, {});
  const departments = useQuery(api.departments.list, {});
  const addDepartment = useMutation(api.departments.add);
  const removeDepartment = useMutation(api.departments.remove);
  const createUser = useMutation(api.users.create);
  const updateRole = useMutation(api.users.updateRole);
  const setActive = useMutation(api.users.setActive);
  const setPassword = useMutation(api.users.setPassword);

  const [form, setForm] = useState<UserFormState>(defaultFormState);
  const [newDeptName, setNewDeptName] = useState("");
  const [deptError, setDeptError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [userSearch, setUserSearch] = useState("");

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

  const summary = useMemo(() => {
    const rows = users ?? [];
    return {
      total: rows.length,
      active: rows.filter((user) => user.active).length,
      serviceStaff: rows.filter((user) => (user.role === "service_staff" || user.role === "it_staff") && user.active).length,
      approvers: rows.filter((user) => user.role === "approver" && user.active).length,
    };
  }, [users]);

  function handleFieldChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setForm((current) => {
      if (name === "displayName" && !current.username.trim()) {
        return {
          ...current,
          displayName: value,
          username: buildUsernameSuggestion(value),
        };
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
        section: form.section || undefined,
        createdBy: "IT Operations",
      });
      setForm(defaultFormState);
      setSuccessMessage("User account record created.");
    } catch (error) {
      setErrorMessage(parseError(error, "Unable to create user."));
    } finally {
      setIsSubmitting(false);
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
      await updateRole({
        userId: user._id,
        role,
        serviceGroups: user.serviceGroups,
      });
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

  const selectedUser = users?.find((user) => user._id === selectedUserId);

  return (
    <>
    <div className="users-page">
      <div className="users-page-header">
        <div>
          <h1 className="type-page-title">Users</h1>
          <p className="type-page-subtitle">
            Create account records and assign roles before we connect real login and approval routing.
          </p>
        </div>
      </div>

      <div className="users-summary-grid" aria-label="User account summary">
        <div className="panel users-summary-card">
          <span>Total Users</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="panel users-summary-card">
          <span>Active</span>
          <strong>{summary.active}</strong>
        </div>
        <div className="panel users-summary-card">
          <span>Service Staff</span>
          <strong>{summary.serviceStaff}</strong>
        </div>
        <div className="panel users-summary-card">
          <span>Approvers</span>
          <strong>{summary.approvers}</strong>
        </div>
      </div>

      <div className="panel" style={{ padding: "20px 24px", display: "grid", gap: 16 }}>
        <div>
          <h2 className="type-section-title">Departments / Service Groups</h2>
          <p className="type-section-copy">These appear as options when assigning service groups to user accounts.</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {(departments ?? []).map((dept) => (
            <span key={dept} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: "var(--surface-raised)", border: "1px solid var(--border-subtle)", fontSize: 13 }}>
              {dept}
              <button
                type="button"
                aria-label={`Remove ${dept}`}
                onClick={async () => {
                  setDeptError("");
                  try { await removeDepartment({ name: dept }); }
                  catch (err) { setDeptError(err instanceof Error ? err.message : "Failed to remove."); }
                }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", lineHeight: 1, padding: 0, fontSize: 15 }}
              >×</button>
            </span>
          ))}
          {departments === undefined && <span className="type-helper">Loading…</span>}
          {departments?.length === 0 && <span className="type-helper">No departments yet. Add one below.</span>}
        </div>
        {deptError ? <p style={{ color: "var(--destructive)", fontSize: 13, margin: 0 }}>{deptError}</p> : null}
        <div style={{ display: "flex", gap: 8, maxWidth: 400 }}>
          <input
            className="input-base"
            placeholder="New department name (e.g. Finance)"
            value={newDeptName}
            onChange={(e) => setNewDeptName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          />
          <button
            type="button"
            className="btn-primary"
            style={{ whiteSpace: "nowrap" }}
            onClick={async () => {
              setDeptError("");
              try {
                await addDepartment({ name: newDeptName.trim() });
                setNewDeptName("");
              } catch (err) {
                setDeptError(err instanceof Error ? err.message : "Failed to add.");
              }
            }}
          >
            Add
          </button>
        </div>
      </div>

      <div className="users-layout">
        <div className="users-sidebar-column">
          <form className="panel users-form" onSubmit={handleCreateUser}>
            <div>
              <h2 className="type-section-title">Add User</h2>
              <p className="type-section-copy">
                This creates the profile and role only. Password login will be added in a later phase.
              </p>
            </div>

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
              <span>Username</span>
              <input
                className="input-base"
                name="username"
                value={form.username}
                onChange={handleFieldChange}
                placeholder="leanne.ondong"
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
              />
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
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="users-field">
                <span>Department</span>
                <select
                  className="input-base"
                  name="department"
                  value={form.department}
                  onChange={handleFieldChange}
                >
                  <option value="">— Select department —</option>
                  {(departments ?? []).map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="users-field">
              <span>Section</span>
              <input
                className="input-base"
                name="section"
                value={form.section}
                onChange={handleFieldChange}
                placeholder="Section"
              />
            </label>

            <div className="users-scope-panel">
              <div>
                <strong>Service Groups</strong>
                <span>Requests this user can help process.</span>
              </div>
              <div className="users-scope-options">
                {(departments ?? []).map((serviceGroup) => (
                  <label key={serviceGroup} className="users-scope-option">
                    <input
                      type="checkbox"
                      checked={form.serviceGroups.includes(serviceGroup)}
                      onChange={() => toggleFormServiceGroup(serviceGroup)}
                    />
                    <span>{serviceGroup}</span>
                  </label>
                ))}
              </div>
            </div>

            {errorMessage ? <div className="reservation-error">{errorMessage}</div> : null}
            {successMessage ? <div className="users-success">{successMessage}</div> : null}

            <div className="users-form-actions">
              <button className="btn-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create User"}
              </button>
            </div>
          </form>

        </div>

        <section className="users-members-section">
          <div className="users-members-head">
            <div>
              <h2 className="type-section-title">User Accounts</h2>
              <p className="type-section-copy">Manage roles and active status for request workflows.</p>
            </div>
            <div className="search-field" style={{ maxWidth: 240, width: "100%" }}>
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
          </div>

          {users === undefined ? (
            <p className="type-helper" style={{ padding: "24px 0" }}>Loading members…</p>
          ) : (
            <div className="member-grid">
              {filteredUsers.length === 0 ? (
                <p className="type-helper" style={{ gridColumn: "1/-1", padding: "24px 0" }}>
                  {userSearch ? "No members match your search." : "No user accounts yet."}
                </p>
              ) : filteredUsers.map((user) => {
                const avatarStyle = getAvatarStyle(user.displayName);
                const initials = getInitials(user.displayName);
                const roleLabel = roleOptions.find((r) => r.value === normalizeRoleForSelect(user.role))?.label ?? user.role;
                return (
                  <div
                    key={user._id}
                    className="member-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => { setSelectedUserId(user._id); setTemporaryPassword(""); setErrorMessage(""); setSuccessMessage(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setSelectedUserId(user._id); setTemporaryPassword(""); } }}
                  >
                    <div className="member-card-top">
                      <div className="member-avatar" style={avatarStyle}>{initials}</div>
                      <span className={`member-badge${user.active ? " is-active" : " is-inactive"}`}>
                        {user.active ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <div>
                      <div className="member-name">{user.displayName}</div>
                      <div className="member-role-label">{roleLabel}</div>
                    </div>

                    <div className="member-meta">
                      <div>
                        <span className="member-meta-label">Department</span>
                        <span className="member-meta-value">{user.department ?? "—"}</span>
                      </div>
                      <div>
                        <span className="member-meta-label">Joined</span>
                        <span className="member-meta-value">{formatDate(user.createdAt)}</span>
                      </div>
                    </div>

                    <div className="member-card-footer">
                      <span className="member-footer-email">{user.email ?? `@${user.username}`}</span>
                      <span className="member-arrow" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="users-role-notes">
            {roleOptions.map((option) => (
              <div key={option.value}>
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>

    {selectedUser ? (
      <>
        <div
          className="member-panel-backdrop"
          onClick={() => { setSelectedUserId(null); setTemporaryPassword(""); }}
        />
        <aside className="member-panel">
          <div className="member-panel-head">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="member-panel-avatar" style={getAvatarStyle(selectedUser.displayName)}>
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
                <div className="member-panel-section-title">Service Groups</div>
                <div style={{ display: "grid", gap: 9 }}>
                  {(departments ?? []).map((sg) => (
                    <label key={sg} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={selectedUser.serviceGroups.includes(sg)}
                        onChange={() => void handleAccessToggle(selectedUser, sg)}
                        disabled={busyUserId === selectedUser._id}
                      />
                      {sg}
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="member-panel-section">
              <div className="member-panel-section-title">
                {selectedUser.passwordConfigured ? "Reset Password" : "Set Password"}
              </div>
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
      </>
    ) : null}
    </>
  );
}
