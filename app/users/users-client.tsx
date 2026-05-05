"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type UserRole = "admin" | "it_staff" | "approver" | "requester";

type UserAccount = {
  _id: Id<"users">;
  _creationTime: number;
  displayName: string;
  username: string;
  email?: string;
  role: string;
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
  department: string;
  section: string;
};

const roleOptions: Array<{ value: UserRole; label: string; description: string }> = [
  { value: "admin", label: "Admin", description: "Can manage system setup later." },
  { value: "it_staff", label: "IT Staff", description: "Handles requests and inventory work." },
  { value: "approver", label: "Approver", description: "Reviews requests that need approval." },
  { value: "requester", label: "Requester", description: "Submits and tracks their own requests." },
];

const defaultFormState: UserFormState = {
  displayName: "",
  username: "",
  email: "",
  temporaryPassword: "",
  role: "requester",
  department: "",
  section: "",
};

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
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
  const createUser = useMutation(api.users.create);
  const updateRole = useMutation(api.users.updateRole);
  const setActive = useMutation(api.users.setActive);
  const setPassword = useMutation(api.users.setPassword);

  const [form, setForm] = useState<UserFormState>(defaultFormState);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string>("");
  const [passwordTargetId, setPasswordTargetId] = useState<Id<"users"> | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");

  const summary = useMemo(() => {
    const rows = users ?? [];
    return {
      total: rows.length,
      active: rows.filter((user) => user.active).length,
      approvers: rows.filter((user) => user.role === "approver" && user.active).length,
      requesters: rows.filter((user) => user.role === "requester" && user.active).length,
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
        [name]: value,
      };
    });
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
        department: form.department || undefined,
        section: form.section || undefined,
        createdBy: "IT Operations",
      });
      setForm(defaultFormState);
      setSuccessMessage("User account record created.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openPasswordPanel(user: UserAccount) {
    setPasswordTargetId(user._id);
    setTemporaryPassword("");
    setErrorMessage("");
    setSuccessMessage("");
  }

  function closePasswordPanel() {
    setPasswordTargetId(null);
    setTemporaryPassword("");
  }

  async function handleSetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordTargetId) return;

    try {
      setBusyUserId(passwordTargetId);
      setErrorMessage("");
      setSuccessMessage("");
      await setPassword({
        userId: passwordTargetId,
        temporaryPassword,
      });
      closePasswordPanel();
      setSuccessMessage("Temporary password saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save password.");
    } finally {
      setBusyUserId("");
    }
  }

  async function handleRoleChange(userId: Id<"users">, role: UserRole) {
    try {
      setBusyUserId(userId);
      setErrorMessage("");
      setSuccessMessage("");
      await updateRole({ userId, role });
      setSuccessMessage("User role updated.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update role.");
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
      setErrorMessage(error instanceof Error ? error.message : "Unable to update user status.");
    } finally {
      setBusyUserId("");
    }
  }

  const passwordTarget = users?.find((user) => user._id === passwordTargetId);

  return (
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
          <span>Approvers</span>
          <strong>{summary.approvers}</strong>
        </div>
        <div className="panel users-summary-card">
          <span>Requesters</span>
          <strong>{summary.requesters}</strong>
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
                <input
                  className="input-base"
                  name="department"
                  value={form.department}
                  onChange={handleFieldChange}
                  placeholder="Department"
                />
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

            {errorMessage ? <div className="reservation-error">{errorMessage}</div> : null}
            {successMessage ? <div className="users-success">{successMessage}</div> : null}

            <div className="users-form-actions">
              <button className="btn-primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create User"}
              </button>
            </div>
          </form>

          {passwordTarget ? (
            <form className="panel users-password-panel" onSubmit={handleSetPassword}>
              <div>
                <strong>{passwordTarget.passwordConfigured ? "Reset Password" : "Set Password"}</strong>
                <span>{passwordTarget.displayName}</span>
              </div>
              <label className="users-field">
                <span>Temporary Password</span>
                <input
                  className="input-base"
                  type="password"
                  value={temporaryPassword}
                  onChange={(event) => setTemporaryPassword(event.target.value)}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  required
                />
              </label>
              <div className="users-form-actions">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={closePasswordPanel}
                  disabled={busyUserId === passwordTarget._id}
                >
                  Cancel
                </button>
                <button className="btn-primary" type="submit" disabled={busyUserId === passwordTarget._id}>
                  {busyUserId === passwordTarget._id ? "Saving..." : "Save Password"}
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <section className="panel users-table-panel">
          <div className="users-table-head">
            <div>
              <h2 className="type-section-title">User Accounts</h2>
              <p className="type-section-copy">Manage roles and active status for future request workflows.</p>
            </div>
          </div>

          <div className="saas-table-wrap users-table-wrap">
            <table className="saas-table users-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Password</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users === undefined ? (
                  <tr>
                    <td colSpan={7}>Loading users...</td>
                  </tr>
                ) : users.length ? (
                  users.map((user) => (
                    <tr key={user._id}>
                      <td>
                        <div className="users-name-cell">
                          <strong>{user.displayName}</strong>
                          <span>@{user.username}</span>
                          {user.email ? <span>{user.email}</span> : null}
                        </div>
                      </td>
                      <td>
                        <select
                          className="input-base users-role-select"
                          value={user.role}
                          onChange={(event) => void handleRoleChange(user._id, event.target.value as UserRole)}
                          disabled={busyUserId === user._id}
                          aria-label={`Role for ${user.displayName}`}
                        >
                          {roleOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="users-name-cell">
                          <span>{user.department ?? "-"}</span>
                          <span>{user.section ?? ""}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`users-status-pill${user.active ? " is-active" : " is-inactive"}`}>
                          {user.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`users-password-pill${
                            user.passwordConfigured ? " is-set" : " is-missing"
                          }`}
                        >
                          {user.passwordConfigured ? "Set" : "Not set"}
                        </span>
                      </td>
                      <td className="users-date-cell">{formatDate(user.createdAt)}</td>
                      <td>
                        <div className="users-row-actions">
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() => openPasswordPanel(user)}
                            disabled={busyUserId === user._id}
                          >
                            {user.passwordConfigured ? "Reset Password" : "Set Password"}
                          </button>
                          <button
                            className={user.active ? "btn-danger" : "btn-success"}
                            type="button"
                            onClick={() => void handleActiveChange(user)}
                            disabled={busyUserId === user._id}
                          >
                            {user.active ? "Deactivate" : "Reactivate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7}>No user accounts yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

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
  );
}
