"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type ChecklistItem = {
  item: string;
  label: string;
  checked: boolean;
  remarks: string;
};

type FormState = {
  section: string;
  division: string;
  formDate: string;
  accountsAccess: ChecklistItem[];
  itEquipment: ChecklistItem[];
  remarks: string;
  recommendation: string;
  checkedByName: string;
  checkedByRole: string;
  preApprovedByName: string;
  preApprovedByRole: string;
  approvedByName: string;
  approvedByRole: string;
};

function formStateFromDoc(form: Doc<"clearanceForms">): FormState {
  return {
    section: form.section ?? "",
    division: form.division ?? "",
    formDate: form.formDate,
    accountsAccess: form.accountsAccess,
    itEquipment: form.itEquipment,
    remarks: form.remarks,
    recommendation: form.recommendation,
    checkedByName: form.checkedByName ?? "Lordwin Crisologo",
    checkedByRole: form.checkedByRole ?? "IT Operations Team Lead",
    preApprovedByName: form.preApprovedByName ?? "Lordwin Crisologo",
    preApprovedByRole: form.preApprovedByRole ?? "IT Operations Team Lead",
    approvedByName: form.approvedByName ?? "ENGR. CHRISTOPHER PATRICK ALMADEN",
    approvedByRole: form.approvedByRole ?? "COO, Concurrent Manager, Operations and System Management",
  };
}

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ClearanceFormClient({ formId }: { formId: string }) {
  const form = useQuery(api.clearanceForms.get, {
    formId: formId as Id<"clearanceForms">,
  });
  const updateForm = useMutation(api.clearanceForms.update);

  const [state, setState] = useState<FormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (form && state === null) {
      setState(formStateFromDoc(form));
    }
  }, [form, state]);

  if (form === undefined) {
    return (
      <div className="dashboard-page operations-page">
        <section className="panel dashboard-panel operations-simple-shell">
          <div className="operations-simple-loading">Loading form...</div>
        </section>
      </div>
    );
  }

  if (form === null) {
    return (
      <div className="dashboard-page operations-page">
        <section className="panel dashboard-panel operations-simple-shell">
          <div className="operations-simple-alert">
            Form not found. <Link href="/operations/clearance-forms">Back to list</Link>
          </div>
        </section>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="dashboard-page operations-page">
        <section className="panel dashboard-panel operations-simple-shell">
          <div className="operations-simple-loading">Preparing form...</div>
        </section>
      </div>
    );
  }

  function updateChecklistItem(
    listKey: "accountsAccess" | "itEquipment",
    index: number,
    patch: Partial<ChecklistItem>,
  ) {
    setState((current) => {
      if (!current) return current;
      const list = current[listKey].map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      );
      return { ...current, [listKey]: list };
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      await updateForm({
        formId: formId as Id<"clearanceForms">,
        section: state.section || undefined,
        division: state.division || undefined,
        formDate: state.formDate,
        accountsAccess: state.accountsAccess,
        itEquipment: state.itEquipment,
        remarks: state.remarks,
        recommendation: state.recommendation,
        checkedByName: state.checkedByName,
        checkedByRole: state.checkedByRole,
        preApprovedByName: state.preApprovedByName,
        preApprovedByRole: state.preApprovedByRole,
        approvedByName: state.approvedByName,
        approvedByRole: state.approvedByRole,
      });
      setSavedAt(Date.now());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save the form.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function handlePrint() {
    if (typeof window !== "undefined") window.print();
  }

  return (
    <div className="dashboard-page operations-page clearance-form-page">
      <section className="panel dashboard-panel operations-simple-shell clearance-form-shell">
        <div className="clearance-form-toolbar no-print">
          <Link href="/operations/clearance-forms" className="clearance-form-back-link">
            Back to list
          </Link>
          <div className="clearance-form-toolbar-meta">
            Filled by <strong>{form.filledBy}</strong> - last saved{" "}
            {savedAt
              ? formatDateTime(savedAt)
              : formatDateTime(form.updatedAt)}
          </div>
          <div className="clearance-form-toolbar-actions">
            <button
              type="button"
              className="clearance-form-btn"
              onClick={handlePrint}
            >
              Print
            </button>
            <button
              type="submit"
              form="clearance-form-form"
              className="clearance-form-btn primary"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="operations-simple-alert no-print">{errorMessage}</div>
        ) : null}

        <form
          id="clearance-form-form"
          className="clearance-form-document"
          onSubmit={handleSave}
        >
          <div className="clearance-form-doc-header">
            <div className="clearance-form-doc-title">IT DEPARTMENT CLEARANCE FORM</div>
            <div className="clearance-form-doc-code">{form._id.slice(-8).toUpperCase()}</div>
          </div>

          <section className="clearance-form-doc-section">
            <div className="clearance-form-doc-section-label">I.</div>
            <div className="clearance-form-doc-section-grid">
              <label>
                <span>NAME</span>
                <div className="clearance-form-static-field">{form.employeeName}</div>
              </label>
              <label>
                <span>DATE</span>
                <input
                  type="date"
                  value={state.formDate}
                  onChange={(event) =>
                    setState((current) =>
                      current ? { ...current, formDate: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                <span>SECTION</span>
                <input
                  type="text"
                  value={state.section}
                  onChange={(event) =>
                    setState((current) =>
                      current ? { ...current, section: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label>
                <span>DIVISION</span>
                <input
                  type="text"
                  value={state.division}
                  onChange={(event) =>
                    setState((current) =>
                      current ? { ...current, division: event.target.value } : current,
                    )
                  }
                />
              </label>
            </div>
          </section>

          <section className="clearance-form-doc-section">
            <div className="clearance-form-doc-section-label">II. CHECKLIST</div>

            <div className="clearance-form-doc-checklist-group">
              <div className="clearance-form-doc-checklist-heading">ACCOUNTS &amp; ACCESS</div>
              <table className="clearance-form-doc-checklist">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>✓</th>
                    <th>Item</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {state.accountsAccess.map((item, index) => (
                    <tr key={item.item}>
                      <td>
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(event) =>
                            updateChecklistItem("accountsAccess", index, {
                              checked: event.target.checked,
                            })
                          }
                        />
                      </td>
                      <td>{item.label}</td>
                      <td>
                        <input
                          type="text"
                          value={item.remarks}
                          onChange={(event) =>
                            updateChecklistItem("accountsAccess", index, {
                              remarks: event.target.value,
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="clearance-form-doc-checklist-group">
              <div className="clearance-form-doc-checklist-heading">IT EQUIPMENT</div>
              <table className="clearance-form-doc-checklist">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>✓</th>
                    <th>Item</th>
                    <th>Remarks (auto-filled from Hardware Inventory)</th>
                  </tr>
                </thead>
                <tbody>
                  {state.itEquipment.map((item, index) => (
                    <tr key={item.item}>
                      <td>
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={(event) =>
                            updateChecklistItem("itEquipment", index, {
                              checked: event.target.checked,
                            })
                          }
                        />
                      </td>
                      <td>{item.label}</td>
                      <td>
                        <input
                          type="text"
                          value={item.remarks}
                          onChange={(event) =>
                            updateChecklistItem("itEquipment", index, {
                              remarks: event.target.value,
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="clearance-form-doc-section">
            <div className="clearance-form-doc-section-label">III. REMARKS</div>
            <textarea
              className="clearance-form-doc-remarks"
              rows={3}
              value={state.remarks}
              onChange={(event) =>
                setState((current) =>
                  current ? { ...current, remarks: event.target.value } : current,
                )
              }
            />
          </section>

          <section className="clearance-form-doc-section">
            <div className="clearance-form-doc-section-label">IV. RECOMMENDATION</div>
            <div className="clearance-form-doc-recommendation">
              <label>
                <input
                  type="radio"
                  name="recommendation"
                  value="cleared"
                  checked={state.recommendation === "cleared"}
                  onChange={() =>
                    setState((current) =>
                      current ? { ...current, recommendation: "cleared" } : current,
                    )
                  }
                />
                <span>CLEARED</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="recommendation"
                  value="not_cleared"
                  checked={state.recommendation === "not_cleared"}
                  onChange={() =>
                    setState((current) =>
                      current ? { ...current, recommendation: "not_cleared" } : current,
                    )
                  }
                />
                <span>NOT CLEARED</span>
              </label>
            </div>
          </section>

          <section className="clearance-form-doc-signatures">
            <div className="clearance-form-doc-signature-block">
              <div className="clearance-form-doc-signature-line" />
              <div className="clearance-form-doc-signature-label">Checked by</div>
              <input
                type="text"
                className="clearance-form-doc-signature-input clearance-form-doc-signature-name-input"
                value={state.checkedByName}
                onChange={(event) =>
                  setState((current) =>
                    current ? { ...current, checkedByName: event.target.value } : current,
                  )
                }
                placeholder="Name"
              />
              <input
                type="text"
                className="clearance-form-doc-signature-input clearance-form-doc-signature-role-input"
                value={state.checkedByRole}
                onChange={(event) =>
                  setState((current) =>
                    current ? { ...current, checkedByRole: event.target.value } : current,
                  )
                }
                placeholder="Role"
              />
            </div>
            <div className="clearance-form-doc-signature-block">
              <div className="clearance-form-doc-signature-line" />
              <div className="clearance-form-doc-signature-label">Pre-approved by</div>
              <input
                type="text"
                className="clearance-form-doc-signature-input clearance-form-doc-signature-name-input"
                value={state.preApprovedByName}
                onChange={(event) =>
                  setState((current) =>
                    current ? { ...current, preApprovedByName: event.target.value } : current,
                  )
                }
                placeholder="Name"
              />
              <input
                type="text"
                className="clearance-form-doc-signature-input clearance-form-doc-signature-role-input"
                value={state.preApprovedByRole}
                onChange={(event) =>
                  setState((current) =>
                    current ? { ...current, preApprovedByRole: event.target.value } : current,
                  )
                }
                placeholder="Role"
              />
            </div>
            <div className="clearance-form-doc-signature-block clearance-form-doc-signature-wide">
              <div className="clearance-form-doc-signature-line" />
              <div className="clearance-form-doc-signature-label">Approved by</div>
              <input
                type="text"
                className="clearance-form-doc-signature-input clearance-form-doc-signature-name-input"
                value={state.approvedByName}
                onChange={(event) =>
                  setState((current) =>
                    current ? { ...current, approvedByName: event.target.value } : current,
                  )
                }
                placeholder="Name"
              />
              <input
                type="text"
                className="clearance-form-doc-signature-input clearance-form-doc-signature-role-input"
                value={state.approvedByRole}
                onChange={(event) =>
                  setState((current) =>
                    current ? { ...current, approvedByRole: event.target.value } : current,
                  )
                }
                placeholder="Role"
              />
            </div>
          </section>
        </form>
      </section>
    </div>
  );
}
