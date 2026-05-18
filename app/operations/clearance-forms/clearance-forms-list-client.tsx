"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/app/current-user-context";

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ClearanceFormsListClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const forms = useQuery(api.clearanceForms.list, {});
  const users = useQuery(api.users.list, {});
  const createForm = useMutation(api.clearanceForms.create);
  const removeForm = useMutation(api.clearanceForms.remove);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<Id<"users"> | "">("");
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingFormId, setDeletingFormId] = useState<Id<"clearanceForms"> | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedEmployeeId) {
      setErrorMessage("Pick an employee first.");
      return;
    }
    setIsCreating(true);
    setErrorMessage(null);
    try {
      const newId = await createForm({
        employeeId: selectedEmployeeId as Id<"users">,
        filledBy: currentUser?.displayName ?? "Unknown",
        filledByUsername: currentUser?.username ?? "unknown",
      });
      router.push(`/operations/clearance-forms/${newId}`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not create the form.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(formId: Id<"clearanceForms">) {
    if (!confirm("Delete this clearance form? This cannot be undone.")) return;
    setDeletingFormId(formId);
    try {
      await removeForm({ formId });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete the form.",
      );
    } finally {
      setDeletingFormId(null);
    }
  }

  return (
    <div className="dashboard-page operations-page">
      <section className="panel dashboard-panel operations-simple-shell">
        <div className="operations-simple-header">
          <div className="operations-simple-header-copy">
            <h1 className="operations-simple-title">IT Clearance Forms</h1>
            <p className="operations-simple-subtitle">
              Create and manage IT clearance forms for the offboarding process.
            </p>
          </div>
        </div>

        {errorMessage ? <div className="operations-simple-alert">{errorMessage}</div> : null}

        <form className="clearance-forms-create-row" onSubmit={handleCreate}>
          <label className="clearance-forms-create-label">
            <span>New form for:</span>
            <select
              className="clearance-forms-create-select"
              value={selectedEmployeeId}
              onChange={(event) =>
                setSelectedEmployeeId(event.target.value as Id<"users"> | "")
              }
              disabled={users === undefined || isCreating}
            >
              <option value="">Pick an employee...</option>
              {(users ?? []).map((user) => (
                <option key={user._id} value={user._id}>
                  {user.displayName} (@{user.username})
                  {user.active ? "" : " - inactive"}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="clearance-forms-create-btn"
            disabled={!selectedEmployeeId || isCreating}
          >
            {isCreating ? "Creating..." : "Create"}
          </button>
        </form>

        {forms === undefined ? (
          <div className="operations-simple-loading">Loading forms...</div>
        ) : forms.length === 0 ? (
          <div className="operations-simple-loading">No clearance forms yet.</div>
        ) : (
          <div className="workflow-log-table-wrap">
            <table className="workflow-log-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Section</th>
                  <th>Division</th>
                  <th>Recommendation</th>
                  <th>Filled by</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {forms.map((form) => (
                  <tr key={form._id}>
                    <td>{form.employeeName}</td>
                    <td>{form.section ?? "-"}</td>
                    <td>{form.division ?? "-"}</td>
                    <td>
                      {form.recommendation === "cleared" ? (
                        <span className="workflow-log-status status-completed">Cleared</span>
                      ) : form.recommendation === "not_cleared" ? (
                        <span className="workflow-log-status status-cancelled">Not cleared</span>
                      ) : (
                        <span className="clearance-form-status-draft">Draft</span>
                      )}
                    </td>
                    <td>{form.filledBy}</td>
                    <td>{formatDateTime(form.updatedAt)}</td>
                    <td>
                      <div className="clearance-form-actions">
                        <Link
                          href={`/operations/clearance-forms/${form._id}`}
                          className="clearance-form-action-link"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          className="clearance-form-action-link danger"
                          disabled={deletingFormId === form._id}
                          onClick={() => handleDelete(form._id)}
                        >
                          {deletingFormId === form._id ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
