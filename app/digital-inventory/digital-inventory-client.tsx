"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ACCESS_ACCOUNT_STATUSES,
  DIGITAL_INVENTORY_CURRENCIES,
  OFFICE_SOFTWARE_STATUSES,
  SUBSCRIPTION_BILLING_CYCLES,
  SUBSCRIPTION_STATUSES,
} from "@/lib/digitalInventory";

type TabKey = "software" | "accounts" | "subscriptions";
type OfficeSoftwareRecord = Doc<"officeSoftwareInventory">;
type AccessAccountRecord = Doc<"accessAccountsInventory">;
type SubscriptionRecord = Doc<"subscriptionsInventory">;

type OfficeSoftwareFormState = {
  softwareName: string;
  vendor: string;
  version: string;
  licenseType: string;
  seatCount: string;
  assignedTo: string;
  department: string;
  purchaseDate: string;
  renewalDate: string;
  status: string;
  notes: string;
};

type AccessAccountFormState = {
  systemName: string;
  accountName: string;
  accountType: string;
  ownerName: string;
  department: string;
  accessLevel: string;
  mfaEnabled: boolean;
  lastReviewedDate: string;
  status: string;
  vaultReference: string;
  notes: string;
};

type SubscriptionFormState = {
  serviceName: string;
  vendor: string;
  planName: string;
  billingCycle: string;
  cost: string;
  currency: string;
  seatCount: string;
  ownerName: string;
  department: string;
  startDate: string;
  renewalDate: string;
  status: string;
  notes: string;
};

const tabs: Array<{ key: TabKey; label: string; description: string }> = [
  {
    key: "software",
    label: "Office Software",
    description: "Installed apps, licenses, versions, and seat ownership.",
  },
  {
    key: "accounts",
    label: "Access & Accounts",
    description: "System accounts, owners, access levels, and review dates.",
  },
  {
    key: "subscriptions",
    label: "Subscriptions",
    description: "Recurring tools, billing cycles, costs, and renewals.",
  },
];

const defaultSoftwareForm: OfficeSoftwareFormState = {
  softwareName: "",
  vendor: "",
  version: "",
  licenseType: "",
  seatCount: "",
  assignedTo: "",
  department: "",
  purchaseDate: "",
  renewalDate: "",
  status: OFFICE_SOFTWARE_STATUSES[0],
  notes: "",
};

const defaultAccountForm: AccessAccountFormState = {
  systemName: "",
  accountName: "",
  accountType: "",
  ownerName: "",
  department: "",
  accessLevel: "",
  mfaEnabled: true,
  lastReviewedDate: "",
  status: ACCESS_ACCOUNT_STATUSES[0],
  vaultReference: "",
  notes: "",
};

const defaultSubscriptionForm: SubscriptionFormState = {
  serviceName: "",
  vendor: "",
  planName: "",
  billingCycle: SUBSCRIPTION_BILLING_CYCLES[0],
  cost: "",
  currency: DIGITAL_INVENTORY_CURRENCIES[0],
  seatCount: "",
  ownerName: "",
  department: "",
  startDate: "",
  renewalDate: "",
  status: SUBSCRIPTION_STATUSES[0],
  notes: "",
};

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function formatNumber(value?: number) {
  return typeof value === "number" ? String(value) : "-";
}

function formatMoney(value?: number, currency = "PHP") {
  if (typeof value !== "number") return "-";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const next = Number(trimmed);
  if (!Number.isFinite(next) || next < 0) {
    throw new Error("Number fields must be zero or higher.");
  }
  return next;
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function getRenewalTime(value?: string) {
  if (!value) return undefined;
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isNaN(time) ? undefined : time;
}

function isUpcomingDate(value?: string) {
  const renewalTime = getRenewalTime(value);
  if (!renewalTime) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next45Days = today.getTime() + 45 * 24 * 60 * 60 * 1000;
  return renewalTime >= today.getTime() && renewalTime <= next45Days;
}

function normalizeMonthlyCost(subscription: SubscriptionRecord) {
  if (typeof subscription.cost !== "number") return 0;
  switch (subscription.billingCycle) {
    case "Yearly":
      return subscription.cost / 12;
    case "Quarterly":
      return subscription.cost / 3;
    case "One-time":
      return 0;
    case "Monthly":
    default:
      return subscription.cost;
  }
}

function getStatusClass(status: string) {
  const normalized = status.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `digital-status digital-status-${normalized}`;
}

function getActiveTabLabel(activeTab: TabKey) {
  return tabs.find((tab) => tab.key === activeTab)?.label ?? "Record";
}

function softwareToForm(record: OfficeSoftwareRecord): OfficeSoftwareFormState {
  return {
    softwareName: record.softwareName,
    vendor: record.vendor ?? "",
    version: record.version ?? "",
    licenseType: record.licenseType ?? "",
    seatCount: record.seatCount === undefined ? "" : String(record.seatCount),
    assignedTo: record.assignedTo ?? "",
    department: record.department ?? "",
    purchaseDate: record.purchaseDate ?? "",
    renewalDate: record.renewalDate ?? "",
    status: record.status,
    notes: record.notes ?? "",
  };
}

function accountToForm(record: AccessAccountRecord): AccessAccountFormState {
  return {
    systemName: record.systemName,
    accountName: record.accountName,
    accountType: record.accountType ?? "",
    ownerName: record.ownerName ?? "",
    department: record.department ?? "",
    accessLevel: record.accessLevel ?? "",
    mfaEnabled: record.mfaEnabled,
    lastReviewedDate: record.lastReviewedDate ?? "",
    status: record.status,
    vaultReference: record.vaultReference ?? "",
    notes: record.notes ?? "",
  };
}

function subscriptionToForm(record: SubscriptionRecord): SubscriptionFormState {
  return {
    serviceName: record.serviceName,
    vendor: record.vendor ?? "",
    planName: record.planName ?? "",
    billingCycle: record.billingCycle,
    cost: record.cost === undefined ? "" : String(record.cost),
    currency: record.currency,
    seatCount: record.seatCount === undefined ? "" : String(record.seatCount),
    ownerName: record.ownerName ?? "",
    department: record.department ?? "",
    startDate: record.startDate ?? "",
    renewalDate: record.renewalDate ?? "",
    status: record.status,
    notes: record.notes ?? "",
  };
}

function EmptyState({ label, colSpan = 8 }: { label: string; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="digital-empty-state">
          No {label.toLowerCase()} records yet. Use the add button to create the first one.
        </div>
      </td>
    </tr>
  );
}

export default function DigitalInventoryClient() {
  const [activeTab, setActiveTab] = useState<TabKey>("software");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [softwareForm, setSoftwareForm] = useState(defaultSoftwareForm);
  const [accountForm, setAccountForm] = useState(defaultAccountForm);
  const [subscriptionForm, setSubscriptionForm] = useState(defaultSubscriptionForm);

  const allOfficeSoftware = useQuery(api.digitalInventory.listOfficeSoftware, {}) ?? [];
  const allAccessAccounts = useQuery(api.digitalInventory.listAccessAccounts, {}) ?? [];
  const allSubscriptions = useQuery(api.digitalInventory.listSubscriptions, {}) ?? [];
  const officeSoftware = useQuery(api.digitalInventory.listOfficeSoftware, { search }) ?? [];
  const accessAccounts = useQuery(api.digitalInventory.listAccessAccounts, { search }) ?? [];
  const subscriptions = useQuery(api.digitalInventory.listSubscriptions, { search }) ?? [];

  const createOfficeSoftware = useMutation(api.digitalInventory.createOfficeSoftware);
  const updateOfficeSoftware = useMutation(api.digitalInventory.updateOfficeSoftware);
  const removeOfficeSoftware = useMutation(api.digitalInventory.removeOfficeSoftware);
  const createAccessAccount = useMutation(api.digitalInventory.createAccessAccount);
  const updateAccessAccount = useMutation(api.digitalInventory.updateAccessAccount);
  const removeAccessAccount = useMutation(api.digitalInventory.removeAccessAccount);
  const createSubscription = useMutation(api.digitalInventory.createSubscription);
  const updateSubscription = useMutation(api.digitalInventory.updateSubscription);
  const removeSubscription = useMutation(api.digitalInventory.removeSubscription);

  const upcomingRenewalCount =
    allOfficeSoftware.filter((record) => isUpcomingDate(record.renewalDate)).length +
    allSubscriptions.filter((record) => isUpcomingDate(record.renewalDate)).length;
  const monthlyPhpCost = allSubscriptions
    .filter((record) => record.currency === "PHP")
    .reduce((total, record) => total + normalizeMonthlyCost(record), 0);
  const activeTabRows =
    activeTab === "software"
      ? officeSoftware.length
      : activeTab === "accounts"
        ? accessAccounts.length
        : subscriptions.length;
  const isEditing = Boolean(editingId);

  function resetForm(tab: TabKey = activeTab) {
    setEditingId(null);
    setErrorMessage(null);
    if (tab === "software") setSoftwareForm(defaultSoftwareForm);
    if (tab === "accounts") setAccountForm(defaultAccountForm);
    if (tab === "subscriptions") setSubscriptionForm(defaultSubscriptionForm);
  }

  function openCreateForm() {
    resetForm();
    setFormOpen(true);
  }

  function closeForm() {
    resetForm();
    setFormOpen(false);
  }

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    setFormOpen(false);
    resetForm(tab);
  }

  function handleSoftwareChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setSoftwareForm((current) => ({ ...current, [name]: value }));
  }

  function handleAccountChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setAccountForm((current) => ({ ...current, [name]: value }));
  }

  function handleAccountMfaChange(event: ChangeEvent<HTMLInputElement>) {
    setAccountForm((current) => ({ ...current, mfaEnabled: event.target.checked }));
  }

  function handleSubscriptionChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const { name, value } = event.target;
    setSubscriptionForm((current) => ({ ...current, [name]: value }));
  }

  function editSoftware(record: OfficeSoftwareRecord) {
    setActiveTab("software");
    setSoftwareForm(softwareToForm(record));
    setEditingId(record._id);
    setErrorMessage(null);
    setFormOpen(true);
  }

  function editAccount(record: AccessAccountRecord) {
    setActiveTab("accounts");
    setAccountForm(accountToForm(record));
    setEditingId(record._id);
    setErrorMessage(null);
    setFormOpen(true);
  }

  function editSubscription(record: SubscriptionRecord) {
    setActiveTab("subscriptions");
    setSubscriptionForm(subscriptionToForm(record));
    setEditingId(record._id);
    setErrorMessage(null);
    setFormOpen(true);
  }

  async function submitSoftware() {
    const payload = {
      softwareName: softwareForm.softwareName,
      vendor: optionalText(softwareForm.vendor),
      version: optionalText(softwareForm.version),
      licenseType: optionalText(softwareForm.licenseType),
      seatCount: parseOptionalNumber(softwareForm.seatCount),
      assignedTo: optionalText(softwareForm.assignedTo),
      department: optionalText(softwareForm.department),
      purchaseDate: optionalText(softwareForm.purchaseDate),
      renewalDate: optionalText(softwareForm.renewalDate),
      status: softwareForm.status,
      notes: optionalText(softwareForm.notes),
    };

    if (editingId) {
      await updateOfficeSoftware({
        recordId: editingId as Id<"officeSoftwareInventory">,
        ...payload,
      });
      return;
    }

    await createOfficeSoftware(payload);
  }

  async function submitAccount() {
    const payload = {
      systemName: accountForm.systemName,
      accountName: accountForm.accountName,
      accountType: optionalText(accountForm.accountType),
      ownerName: optionalText(accountForm.ownerName),
      department: optionalText(accountForm.department),
      accessLevel: optionalText(accountForm.accessLevel),
      mfaEnabled: accountForm.mfaEnabled,
      lastReviewedDate: optionalText(accountForm.lastReviewedDate),
      status: accountForm.status,
      vaultReference: optionalText(accountForm.vaultReference),
      notes: optionalText(accountForm.notes),
    };

    if (editingId) {
      await updateAccessAccount({
        recordId: editingId as Id<"accessAccountsInventory">,
        ...payload,
      });
      return;
    }

    await createAccessAccount(payload);
  }

  async function submitSubscription() {
    const payload = {
      serviceName: subscriptionForm.serviceName,
      vendor: optionalText(subscriptionForm.vendor),
      planName: optionalText(subscriptionForm.planName),
      billingCycle: subscriptionForm.billingCycle,
      cost: parseOptionalNumber(subscriptionForm.cost),
      currency: subscriptionForm.currency,
      seatCount: parseOptionalNumber(subscriptionForm.seatCount),
      ownerName: optionalText(subscriptionForm.ownerName),
      department: optionalText(subscriptionForm.department),
      startDate: optionalText(subscriptionForm.startDate),
      renewalDate: optionalText(subscriptionForm.renewalDate),
      status: subscriptionForm.status,
      notes: optionalText(subscriptionForm.notes),
    };

    if (editingId) {
      await updateSubscription({
        recordId: editingId as Id<"subscriptionsInventory">,
        ...payload,
      });
      return;
    }

    await createSubscription(payload);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (activeTab === "software") await submitSoftware();
      if (activeTab === "accounts") await submitAccount();
      if (activeTab === "subscriptions") await submitSubscription();
      closeForm();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save this record.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveSoftware(record: OfficeSoftwareRecord) {
    if (!window.confirm(`Delete ${record.softwareName}?`)) return;
    await removeOfficeSoftware({ recordId: record._id });
  }

  async function handleRemoveAccount(record: AccessAccountRecord) {
    if (!window.confirm(`Delete ${record.accountName}?`)) return;
    await removeAccessAccount({ recordId: record._id });
  }

  async function handleRemoveSubscription(record: SubscriptionRecord) {
    if (!window.confirm(`Delete ${record.serviceName}?`)) return;
    await removeSubscription({ recordId: record._id });
  }

  function renderSoftwareForm() {
    return (
      <>
        <label className="digital-form-field">
          <span>Software Name</span>
          <input className="input-base" name="softwareName" value={softwareForm.softwareName} onChange={handleSoftwareChange} required />
        </label>
        <label className="digital-form-field">
          <span>Vendor</span>
          <input className="input-base" name="vendor" value={softwareForm.vendor} onChange={handleSoftwareChange} />
        </label>
        <label className="digital-form-field">
          <span>Version</span>
          <input className="input-base" name="version" value={softwareForm.version} onChange={handleSoftwareChange} />
        </label>
        <label className="digital-form-field">
          <span>License Type</span>
          <input className="input-base" name="licenseType" value={softwareForm.licenseType} onChange={handleSoftwareChange} placeholder="Per user, volume, free" />
        </label>
        <label className="digital-form-field">
          <span>Seats</span>
          <input className="input-base" name="seatCount" type="number" min="0" value={softwareForm.seatCount} onChange={handleSoftwareChange} />
        </label>
        <label className="digital-form-field">
          <span>Assigned To</span>
          <input className="input-base" name="assignedTo" value={softwareForm.assignedTo} onChange={handleSoftwareChange} />
        </label>
        <label className="digital-form-field">
          <span>Department</span>
          <input className="input-base" name="department" value={softwareForm.department} onChange={handleSoftwareChange} />
        </label>
        <label className="digital-form-field">
          <span>Purchase Date</span>
          <input className="input-base" name="purchaseDate" type="date" value={softwareForm.purchaseDate} onChange={handleSoftwareChange} />
        </label>
        <label className="digital-form-field">
          <span>Renewal Date</span>
          <input className="input-base" name="renewalDate" type="date" value={softwareForm.renewalDate} onChange={handleSoftwareChange} />
        </label>
        <label className="digital-form-field">
          <span>Status</span>
          <select className="input-base" name="status" value={softwareForm.status} onChange={handleSoftwareChange}>
            {OFFICE_SOFTWARE_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="digital-form-field digital-form-field-full">
          <span>Notes</span>
          <textarea className="input-base digital-textarea" name="notes" value={softwareForm.notes} onChange={handleSoftwareChange} />
        </label>
      </>
    );
  }

  function renderAccountForm() {
    return (
      <>
        <label className="digital-form-field">
          <span>System Name</span>
          <input className="input-base" name="systemName" value={accountForm.systemName} onChange={handleAccountChange} required />
        </label>
        <label className="digital-form-field">
          <span>Account Name</span>
          <input className="input-base" name="accountName" value={accountForm.accountName} onChange={handleAccountChange} required />
        </label>
        <label className="digital-form-field">
          <span>Account Type</span>
          <input className="input-base" name="accountType" value={accountForm.accountType} onChange={handleAccountChange} placeholder="Admin, user, shared" />
        </label>
        <label className="digital-form-field">
          <span>Owner</span>
          <input className="input-base" name="ownerName" value={accountForm.ownerName} onChange={handleAccountChange} />
        </label>
        <label className="digital-form-field">
          <span>Department</span>
          <input className="input-base" name="department" value={accountForm.department} onChange={handleAccountChange} />
        </label>
        <label className="digital-form-field">
          <span>Access Level</span>
          <input className="input-base" name="accessLevel" value={accountForm.accessLevel} onChange={handleAccountChange} placeholder="Admin, editor, viewer" />
        </label>
        <label className="digital-form-field">
          <span>Last Reviewed</span>
          <input className="input-base" name="lastReviewedDate" type="date" value={accountForm.lastReviewedDate} onChange={handleAccountChange} />
        </label>
        <label className="digital-form-field">
          <span>Status</span>
          <select className="input-base" name="status" value={accountForm.status} onChange={handleAccountChange}>
            {ACCESS_ACCOUNT_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="digital-checkbox-field">
          <input type="checkbox" checked={accountForm.mfaEnabled} onChange={handleAccountMfaChange} />
          <span>MFA enabled</span>
        </label>
        <label className="digital-form-field digital-form-field-full">
          <span>Password Vault Reference</span>
          <input className="input-base" name="vaultReference" value={accountForm.vaultReference} onChange={handleAccountChange} placeholder="Example: Vault / IT / Microsoft Admin" />
          <small>Do not store passwords here. Store only where the credential can be found.</small>
        </label>
        <label className="digital-form-field digital-form-field-full">
          <span>Notes</span>
          <textarea className="input-base digital-textarea" name="notes" value={accountForm.notes} onChange={handleAccountChange} />
        </label>
      </>
    );
  }

  function renderSubscriptionForm() {
    return (
      <>
        <label className="digital-form-field">
          <span>Service Name</span>
          <input className="input-base" name="serviceName" value={subscriptionForm.serviceName} onChange={handleSubscriptionChange} required />
        </label>
        <label className="digital-form-field">
          <span>Vendor</span>
          <input className="input-base" name="vendor" value={subscriptionForm.vendor} onChange={handleSubscriptionChange} />
        </label>
        <label className="digital-form-field">
          <span>Plan</span>
          <input className="input-base" name="planName" value={subscriptionForm.planName} onChange={handleSubscriptionChange} />
        </label>
        <label className="digital-form-field">
          <span>Billing Cycle</span>
          <select className="input-base" name="billingCycle" value={subscriptionForm.billingCycle} onChange={handleSubscriptionChange}>
            {SUBSCRIPTION_BILLING_CYCLES.map((cycle) => (
              <option key={cycle} value={cycle}>{cycle}</option>
            ))}
          </select>
        </label>
        <label className="digital-form-field">
          <span>Cost</span>
          <input className="input-base" name="cost" type="number" min="0" step="0.01" value={subscriptionForm.cost} onChange={handleSubscriptionChange} />
        </label>
        <label className="digital-form-field">
          <span>Currency</span>
          <select className="input-base" name="currency" value={subscriptionForm.currency} onChange={handleSubscriptionChange}>
            {DIGITAL_INVENTORY_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </label>
        <label className="digital-form-field">
          <span>Seats</span>
          <input className="input-base" name="seatCount" type="number" min="0" value={subscriptionForm.seatCount} onChange={handleSubscriptionChange} />
        </label>
        <label className="digital-form-field">
          <span>Owner</span>
          <input className="input-base" name="ownerName" value={subscriptionForm.ownerName} onChange={handleSubscriptionChange} />
        </label>
        <label className="digital-form-field">
          <span>Department</span>
          <input className="input-base" name="department" value={subscriptionForm.department} onChange={handleSubscriptionChange} />
        </label>
        <label className="digital-form-field">
          <span>Start Date</span>
          <input className="input-base" name="startDate" type="date" value={subscriptionForm.startDate} onChange={handleSubscriptionChange} />
        </label>
        <label className="digital-form-field">
          <span>Renewal Date</span>
          <input className="input-base" name="renewalDate" type="date" value={subscriptionForm.renewalDate} onChange={handleSubscriptionChange} />
        </label>
        <label className="digital-form-field">
          <span>Status</span>
          <select className="input-base" name="status" value={subscriptionForm.status} onChange={handleSubscriptionChange}>
            {SUBSCRIPTION_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </label>
        <label className="digital-form-field digital-form-field-full">
          <span>Notes</span>
          <textarea className="input-base digital-textarea" name="notes" value={subscriptionForm.notes} onChange={handleSubscriptionChange} />
        </label>
      </>
    );
  }

  function renderFormFields() {
    if (activeTab === "software") return renderSoftwareForm();
    if (activeTab === "accounts") return renderAccountForm();
    return renderSubscriptionForm();
  }

  function renderSoftwareTable() {
    return (
      <table className="saas-table digital-table">
        <thead>
          <tr>
            <th>Software</th>
            <th>Vendor</th>
            <th>License</th>
            <th>Seats</th>
            <th>Assigned To</th>
            <th>Renewal</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {officeSoftware.map((record) => (
            <tr key={record._id}>
              <td>
                <strong>{record.softwareName}</strong>
                <span>{record.version || "No version set"}</span>
              </td>
              <td>{record.vendor || "-"}</td>
              <td>{record.licenseType || "-"}</td>
              <td>{formatNumber(record.seatCount)}</td>
              <td>{record.assignedTo || record.department || "-"}</td>
              <td>{formatDate(record.renewalDate)}</td>
              <td><span className={getStatusClass(record.status)}>{record.status}</span></td>
              <td>
                <div className="digital-row-actions">
                  <button className="btn-secondary" type="button" onClick={() => editSoftware(record)}>Edit</button>
                  <button className="btn-danger" type="button" onClick={() => void handleRemoveSoftware(record)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {!officeSoftware.length ? <EmptyState label="Office Software" /> : null}
        </tbody>
      </table>
    );
  }

  function renderAccountsTable() {
    return (
      <table className="saas-table digital-table">
        <thead>
          <tr>
            <th>System</th>
            <th>Account</th>
            <th>Owner</th>
            <th>Department</th>
            <th>Access</th>
            <th>MFA</th>
            <th>Reviewed</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {accessAccounts.map((record) => (
            <tr key={record._id}>
              <td>
                <strong>{record.systemName}</strong>
                <span>{record.status}</span>
              </td>
              <td>{record.accountName}</td>
              <td>{record.ownerName || "-"}</td>
              <td>{record.department || "-"}</td>
              <td>{record.accessLevel || record.accountType || "-"}</td>
              <td>{record.mfaEnabled ? "Yes" : "No"}</td>
              <td>{formatDate(record.lastReviewedDate)}</td>
              <td>
                <div className="digital-row-actions">
                  <button className="btn-secondary" type="button" onClick={() => editAccount(record)}>Edit</button>
                  <button className="btn-danger" type="button" onClick={() => void handleRemoveAccount(record)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {!accessAccounts.length ? <EmptyState label="Access & Accounts" /> : null}
        </tbody>
      </table>
    );
  }

  function renderSubscriptionsTable() {
    return (
      <table className="saas-table digital-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Vendor</th>
            <th>Plan</th>
            <th>Cost</th>
            <th>Billing</th>
            <th>Department</th>
            <th>Renewal</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((record) => (
            <tr key={record._id}>
              <td>
                <strong>{record.serviceName}</strong>
                <span>{record.ownerName || record.department || "No owner set"}</span>
              </td>
              <td>{record.vendor || "-"}</td>
              <td>{record.planName || "-"}</td>
              <td>{formatMoney(record.cost, record.currency)}</td>
              <td>{record.billingCycle}</td>
              <td>{record.department || "-"}</td>
              <td>{formatDate(record.renewalDate)}</td>
              <td><span className={getStatusClass(record.status)}>{record.status}</span></td>
              <td>
                <div className="digital-row-actions">
                  <button className="btn-secondary" type="button" onClick={() => editSubscription(record)}>Edit</button>
                  <button className="btn-danger" type="button" onClick={() => void handleRemoveSubscription(record)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {!subscriptions.length ? <EmptyState label="Subscriptions" colSpan={9} /> : null}
        </tbody>
      </table>
    );
  }

  function renderActiveTable() {
    if (activeTab === "software") return renderSoftwareTable();
    if (activeTab === "accounts") return renderAccountsTable();
    return renderSubscriptionsTable();
  }

  return (
    <div className="dashboard-page digital-inventory-page">
      <section className="digital-hero panel dashboard-panel">
        <div>
          <p className="digital-eyebrow">Digital Inventory</p>
          <h1>Software, access, and subscriptions in one clean tracker.</h1>
          <p>
            Keep digital records separate from physical hardware so renewals, accounts, and licenses stay easy to audit.
          </p>
        </div>
        <button className="btn-primary" type="button" onClick={openCreateForm}>
          Add {getActiveTabLabel(activeTab)}
        </button>
      </section>

      <section className="digital-metrics">
        <div className="digital-metric-card">
          <span>Total Software</span>
          <strong>{allOfficeSoftware.length}</strong>
        </div>
        <div className="digital-metric-card">
          <span>Active Accounts</span>
          <strong>{allAccessAccounts.filter((record) => record.status === "Active").length}</strong>
        </div>
        <div className="digital-metric-card">
          <span>Upcoming Renewals</span>
          <strong>{upcomingRenewalCount}</strong>
        </div>
        <div className="digital-metric-card">
          <span>Monthly PHP Cost</span>
          <strong>{formatMoney(monthlyPhpCost, "PHP")}</strong>
        </div>
      </section>

      <section className="digital-workspace panel dashboard-panel">
        <div className="digital-toolbar">
          <div className="digital-tabs" role="tablist" aria-label="Digital inventory sections">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`digital-tab${activeTab === tab.key ? " is-active" : ""}`}
                onClick={() => handleTabChange(tab.key)}
              >
                <span>{tab.label}</span>
                <small>{tab.description}</small>
              </button>
            ))}
          </div>
          <div className="digital-toolbar-actions">
            <input
              className="input-base"
              type="search"
              placeholder={`Search ${getActiveTabLabel(activeTab).toLowerCase()}...`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="btn-primary" type="button" onClick={openCreateForm}>
              Add Record
            </button>
          </div>
        </div>

        <div className="digital-table-head">
          <div>
            <h1>{getActiveTabLabel(activeTab)}</h1>
            <p>{activeTabRows} record{activeTabRows === 1 ? "" : "s"} shown</p>
          </div>
        </div>

        <div className="saas-table-wrap digital-table-wrap">
          {renderActiveTable()}
        </div>
      </section>

      {formOpen ? (
        <div className="digital-modal" role="dialog" aria-modal="true" aria-label={`${isEditing ? "Edit" : "Add"} ${getActiveTabLabel(activeTab)}`}>
          <button className="digital-modal-backdrop" type="button" aria-label="Close form" onClick={closeForm} />
          <div className="digital-modal-shell">
            <form className="digital-form digital-modal-card" onSubmit={handleSubmit}>
              <div className="digital-form-head">
                <div>
                  <h2>{isEditing ? "Edit" : "Add"} {getActiveTabLabel(activeTab)}</h2>
                  <p>
                    {activeTab === "accounts"
                      ? "Track access details only. Do not save passwords or secret keys here."
                      : "Fill in the useful fields now. Optional fields can be completed later."}
                  </p>
                </div>
                <button className="digital-modal-close" type="button" onClick={closeForm} aria-label="Close form">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M4 4L12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {errorMessage ? <div className="digital-alert">{errorMessage}</div> : null}
              <div className="digital-form-grid">{renderFormFields()}</div>
              <div className="digital-form-actions">
                <button className="btn-secondary" type="button" onClick={closeForm} disabled={isSubmitting}>
                  Cancel
                </button>
                <button className="btn-primary" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
