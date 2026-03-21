"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { startTransition, useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import ChecklistSelect, { type ChecklistSelectOption } from "../hardware-inventory/checklist-select";
import FileUploadCard from "../hardware-inventory/file-upload-card";
import {
  MONITORING_BORROW_CONDITION_OPTIONS,
  INTERNET_OUTAGE_STATUSES,
  MONITORING_AREAS,
  MONITORING_BORROWING_REQUEST_CATEGORY,
  MONITORING_CATEGORIES,
  getMeetingRequestStatusOptions,
  MONITORING_IMPACT_OPTIONS,
  MONITORING_ISPS,
  MONITORING_MEETING_MODES,
  MONITORING_MEETING_REQUEST_CATEGORY,
  MONITORING_REQUEST_SOURCE,
  MONITORING_TICKET_CATEGORIES,
  MONITORING_URGENCY_OPTIONS,
  MONITORING_WORK_TYPES,
  normalizeMeetingRequestStatusValue,
  resolveConnectionRole,
} from "@/lib/monitoring";

type MonitoringClientProps = {
  actorName: string;
};

type MonitoringTab = "issues" | "meetings" | "borrowing" | "internet";

type IssueFormState = {
  workType: (typeof MONITORING_WORK_TYPES)[number];
  category: string;
  requesterName: string;
  requesterSection: string;
  requesterDepartment: string;
  title: string;
  requestDetails: string;
  requestSnapshot: string;
  impact: string;
  urgency: string;
  assetId: string;
  requiresPurchase: boolean;
  requiresReplacement: boolean;
  requiresSensitiveAccess: boolean;
  majorIncident: boolean;
};

type InternetFormState = {
  isp: string;
  area: string;
  status: (typeof INTERNET_OUTAGE_STATUSES)[number];
  details: string;
  timeDetected: string;
  timeRestored: string;
  operationsBlocked: boolean;
  causeActionTaken: string;
};

type BorrowingFormState = {
  requesterName: string;
  requesterSection: string;
  requesterDepartment: string;
  requestDetails: string;
  requestSnapshot: string;
  expectedReturnAt: string;
  borrowingItems: Array<{
    assetId: string;
    assetTag: string;
    assetLabel: string;
    releaseCondition: (typeof MONITORING_BORROW_CONDITION_OPTIONS)[number];
  }>;
};

type MeetingFormState = {
  requesterName: string;
  requesterSection: string;
  requesterDepartment: string;
  meetingTitle: string;
  requestSnapshot: string;
  meetingMode: (typeof MONITORING_MEETING_MODES)[number];
  meetingStart: string;
  meetingEnd: string;
  meetingLocation: string;
  meetingAttendeeCount: string;
  meetingAssets: Array<{
    assetId: string;
    assetTag: string;
    assetLabel: string;
  }>;
  supportNotes: string;
};

const textareaStyle = {
  minHeight: 96,
  paddingTop: 10,
  paddingBottom: 10,
  resize: "vertical" as const,
};

const defaultIssueForm: IssueFormState = {
  workType: "Incident",
  category: MONITORING_TICKET_CATEGORIES[0] ?? MONITORING_CATEGORIES[0],
  requesterName: "",
  requesterSection: "",
  requesterDepartment: "",
  title: "",
  requestDetails: "",
  requestSnapshot: "",
  impact: MONITORING_IMPACT_OPTIONS[0],
  urgency: MONITORING_URGENCY_OPTIONS[1],
  assetId: "",
  requiresPurchase: false,
  requiresReplacement: false,
  requiresSensitiveAccess: false,
  majorIncident: false,
};

const defaultInternetForm: InternetFormState = {
  isp: "RISE PH",
  area: MONITORING_AREAS[0],
  status: "Investigating",
  details: "",
  timeDetected: "",
  timeRestored: "",
  operationsBlocked: true,
  causeActionTaken: "",
};

const defaultBorrowingForm: BorrowingFormState = {
  requesterName: "",
  requesterSection: "",
  requesterDepartment: "",
  requestDetails: "",
  requestSnapshot: "",
  expectedReturnAt: "",
  borrowingItems: [],
};

const defaultMeetingForm: MeetingFormState = {
  requesterName: "",
  requesterSection: "",
  requesterDepartment: "",
  meetingTitle: "",
  requestSnapshot: "",
  meetingMode: MONITORING_MEETING_MODES[0],
  meetingStart: "",
  meetingEnd: "",
  meetingLocation: "",
  meetingAttendeeCount: "",
  meetingAssets: [],
  supportNotes: "",
};

const MEETING_REQUEST_SOURCE = "Staff Meeting Request";
const MONITORING_MEETING_LOCATION_OPTIONS = [
  "Main conference room",
  "AVR",
  "Zoom",
  "Teams",
  "Others",
] as const;

function formatBorrowingAssetLabel(asset: {
  assetTag?: string;
  assetNameDescription?: string;
  assetType?: string;
  serialNumber?: string;
}) {
  const baseLabel = asset.assetNameDescription ?? asset.assetType ?? "Asset";
  const serialLabel = asset.serialNumber ? ` | ${asset.serialNumber}` : "";
  return `${asset.assetTag ?? "No Tag"} | ${baseLabel}${serialLabel}`;
}

function formatDateTime(value?: number) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPercent(value?: number) {
  if (value === undefined) return "-";
  return `${value.toFixed(2)}%`;
}

function formatMinutes(value?: number) {
  if (value === undefined) return "-";
  return `${value} min`;
}

function formatDateTimeInput(value: string, options?: Intl.DateTimeFormatOptions) {
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return "-";
  return next.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
}

function formatMeetingSchedule(start: string, end: string) {
  const startLabel = formatDateTimeInput(start);
  if (!end) return startLabel;
  return `${startLabel} to ${formatDateTimeInput(end)}`;
}

function getMeetingRequestListTitle(title: string, meetingStartAt?: number) {
  const withoutPrefix = title.replace(/^Meeting Support\s*-\s*/i, "").trim();
  const startLabel = meetingStartAt ? formatDateTime(meetingStartAt) : "";
  if (startLabel && withoutPrefix.endsWith(` - ${startLabel}`)) {
    return withoutPrefix.slice(0, -(` - ${startLabel}`.length)).trim();
  }
  return withoutPrefix;
}

function getDisplayStatusLabel(status: string, category?: string) {
  if (category === MONITORING_MEETING_REQUEST_CATEGORY) {
    return normalizeMeetingRequestStatusValue(status) ?? status;
  }
  return status;
}

function toTimestamp(value: string) {
  if (!value) return undefined;
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return undefined;
  return next.getTime();
}

function getChipStyle(status: string) {
  switch (status) {
    case "P1":
    case "For Revision":
    case "Critical":
      return { background: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" };
    case "P2":
    case "Reserved":
    case "Assets Reserved":
    case "Pending Approval":
    case "Pending":
    case "Investigating":
    case "Identified":
      return { background: "#fef3c7", color: "#92400e", borderColor: "#fcd34d" };
    case "Resolved":
    case "Fulfilled":
    case "Meeting Held":
    case "Done":
    case "Approved":
    case "Monitoring":
      return { background: "#dcfce7", color: "#166534", borderColor: "#86efac" };
    case "Ready":
    case "Setup Complete":
      return { background: "#ede9fe", color: "#6d28d9", borderColor: "#c4b5fd" };
    case "In Progress":
    case "Triage":
    case "New":
      return { background: "#dbeafe", color: "#1d4ed8", borderColor: "#93c5fd" };
    case "Closed":
      return { background: "#e5e7eb", color: "#374151", borderColor: "#d1d5db" };
    default:
      return { background: "#eef2ff", color: "#4338ca", borderColor: "#c7d2fe" };
  }
}

function buildMeetingStatusSelectOptions(statusOptions: ReadonlyArray<string>): ReadonlyArray<ChecklistSelectOption> {
  return statusOptions.map((statusOption) => {
    const style = getChipStyle(statusOption);
    return {
      value: statusOption,
      label: statusOption,
      markerVariant: "dot",
      markerColor: style.color,
      triggerStyle: {
        backgroundColor: style.background,
        color: style.color,
        borderColor: style.borderColor,
        fontWeight: 600,
      },
    };
  });
}

function Chip({ label }: { label: string }) {
  const style = getChipStyle(label);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        border: `1px solid ${style.borderColor}`,
        background: style.background,
        color: style.color,
        fontSize: "var(--type-label)",
        fontWeight: 700,
      }}
    >
      {label}
    </span>
  );
}

function CheckboxRow(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "var(--type-body-sm)", fontWeight: 600 }}>
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
      <span>{props.label}</span>
    </label>
  );
}

function FieldGroup(props: {
  label: string;
  required?: boolean;
  helperText?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 6, alignContent: "start" }}>
      <span style={{ fontSize: "var(--type-label)", fontWeight: 700, color: "var(--muted)" }}>
        {props.label}
        {props.required ? <span style={{ color: "#b91c1c" }}> *</span> : null}
      </span>
      {props.children}
      {props.helperText ? <span style={{ fontSize: "var(--type-label)", color: "var(--muted)" }}>{props.helperText}</span> : null}
    </label>
  );
}

type ToolbarFilterOption = {
  key: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
};

function FilterChevronIcon(props: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={{
        transform: props.open ? "rotate(180deg)" : undefined,
        transition: "transform var(--interaction-duration) var(--interaction-ease)",
      }}
    >
      <path
        d="M3.25 5.5L7 9.25L10.75 5.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FilterCheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M2.5 6.1L4.9 8.5L9.5 3.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MonitoringTabIcon(props: { tab: MonitoringTab }) {
  switch (props.tab) {
    case "issues":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="2.25" y="2.25" width="9.5" height="9.5" rx="2.25" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4.5 5H9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M4.5 7H9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M4.5 9H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "meetings":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M4.25 2.75V4.25M9.75 2.75V4.25M3.5 5.5H10.5M4 3.5H10C10.8284 3.5 11.5 4.17157 11.5 5V10C11.5 10.8284 10.8284 11.5 10 11.5H4C3.17157 11.5 2.5 10.8284 2.5 10V5C2.5 4.17157 3.17157 3.5 4 3.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "borrowing":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M4.5 4.5H9.5C10.0523 4.5 10.5 4.94772 10.5 5.5V9.5C10.5 10.0523 10.0523 10.5 9.5 10.5H4.5C3.94772 10.5 3.5 10.0523 3.5 9.5V5.5C3.5 4.94772 3.94772 4.5 4.5 4.5Z"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path d="M5 4.5V4C5 2.89543 5.89543 2 7 2C8.10457 2 9 2.89543 9 4V4.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "internet":
      return (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M2.15 5.05C4.8 2.72 9.2 2.72 11.85 5.05"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4.1 7.1C5.72 5.66 8.28 5.66 9.9 7.1"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M5.95 9.1C6.52 8.61 7.48 8.61 8.05 9.1"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="7" cy="11.2" r="0.8" fill="currentColor" />
        </svg>
      );
  }
}

const MONITORING_TABS: ReadonlyArray<{ key: MonitoringTab; label: string }> = [
  { key: "issues", label: "Tickets" },
  { key: "meetings", label: "Meeting Requests" },
  { key: "borrowing", label: "Borrowing Requests" },
  { key: "internet", label: "Internet Monitoring" },
];

function isMonitoringTab(value: string | null): value is MonitoringTab {
  return value === "issues" || value === "meetings" || value === "borrowing" || value === "internet";
}

function ToolbarFilterDropdown(props: {
  label: string;
  summary: string;
  ariaLabel: string;
  options: ReadonlyArray<ToolbarFilterOption>;
  minWidth?: number;
  active?: boolean;
  keepOpenOnSelect?: boolean;
  showCheckboxes?: boolean;
  showLabelInTrigger?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className={`monitoring-filter-dropdown${open ? " is-open" : ""}${props.active ? " is-active" : ""}${props.compact ? " is-compact" : ""}`}
      style={{ minWidth: props.minWidth ?? 180 }}
    >
      <button
        type="button"
        className="monitoring-filter-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={props.ariaLabel}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="monitoring-filter-trigger-main">
          {props.showLabelInTrigger ? (
            <>
              <span className="monitoring-filter-trigger-label">{props.label}</span>
              {props.summary !== "Select" ? (
                <span className="monitoring-filter-trigger-count">{props.summary}</span>
              ) : null}
            </>
          ) : (
            <span className="monitoring-filter-trigger-text">{props.summary}</span>
          )}
        </span>
        <span className="monitoring-filter-trigger-icon">
          <FilterChevronIcon open={open} />
        </span>
      </button>
      {open ? (
        <div className="monitoring-filter-menu" role="menu" aria-label={props.ariaLabel}>
          {props.options.map((option) => (
            <button
              key={option.key}
              type="button"
              role={props.showCheckboxes ? "menuitemcheckbox" : "menuitemradio"}
              aria-checked={option.selected}
              className={`monitoring-filter-option${option.selected ? " is-selected" : ""}`}
              onClick={() => {
                option.onSelect();
                if (!props.keepOpenOnSelect) {
                  setOpen(false);
                }
              }}
            >
              {props.showCheckboxes ? (
                <span className="monitoring-filter-check" aria-hidden="true">
                  {option.selected ? <FilterCheckIcon /> : null}
                </span>
              ) : null}
              <span className="monitoring-filter-option-text">{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BorrowingAssetLookup(props: {
  query: string;
  onQueryChange: (value: string) => void;
  options: ReadonlyArray<{
    _id: Id<"hardwareInventory">;
    assetTag?: string;
    assetNameDescription?: string;
    assetType?: string;
    serialNumber?: string;
    status?: string;
  }>;
  onAddAsset: (asset: {
    _id: Id<"hardwareInventory">;
    assetTag?: string;
    assetNameDescription?: string;
    assetType?: string;
    serialNumber?: string;
    status?: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        className="input-base"
        placeholder="Type asset tag, name, or serial number"
        value={props.query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          props.onQueryChange(event.target.value);
          setOpen(true);
        }}
      />
      {open ? (
        <div
          className="monitoring-filter-menu"
          style={{
            position: "absolute",
            insetInline: 0,
            top: "calc(100% + 8px)",
            zIndex: 20,
            maxHeight: 280,
            overflowY: "auto",
          }}
          role="listbox"
          aria-label="Available assets"
        >
          {props.options.length ? (
            props.options.map((asset) => (
              <button
                key={String(asset._id)}
                type="button"
                className="monitoring-filter-option"
                style={{ alignItems: "flex-start" }}
                onClick={() => {
                  props.onAddAsset(asset);
                  setOpen(false);
                }}
              >
                <span className="monitoring-filter-option-text" style={{ display: "grid", gap: 4, textAlign: "left" }}>
                  <strong style={{ fontSize: 13 }}>{asset.assetTag ?? "No Tag"}</strong>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {asset.assetNameDescription ?? asset.assetType ?? "Asset"}
                    {asset.serialNumber ? ` | ${asset.serialNumber}` : ""}
                  </span>
                </span>
                <span style={{ marginLeft: "auto" }}>
                  <Chip label={asset.status ?? "Unknown"} />
                </span>
              </button>
            ))
          ) : (
            <div style={{ padding: 14, fontSize: 13, color: "var(--muted)" }}>No matching assets found.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FormErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      style={{
        border: "1px solid #fecaca",
        background: "#fff1f2",
        color: "#9f1239",
        borderRadius: 12,
        padding: "10px 12px",
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {message}
    </div>
  );
}

function MonitoringFormModal(props: {
  open: boolean;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  if (!props.open) return null;

  return (
    <div className="reservation-form-overlay" style={{ position: "fixed", inset: 0, zIndex: 120 }}>
      <button type="button" className="reservation-form-backdrop" aria-label="Close form" onClick={props.onClose} />
      <div
        className="reservation-form-shell"
        role="dialog"
        aria-modal="true"
        style={{ width: `min(${props.width ?? 860}px, 100%)`, zIndex: 1 }}
      >
        <div style={{ width: "100%", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}>{props.children}</div>
      </div>
    </div>
  );
}

export default function MonitoringClient({ actorName }: MonitoringClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const overview = useQuery(api.monitoring.getOverview, {});
  const assets = useQuery(api.hardwareInventory.listAll, {});
  const syncAutoClose = useMutation(api.monitoring.syncAutoClose);
  const createTicket = useMutation(api.monitoring.createTicket);
  const updateTicket = useMutation(api.monitoring.updateTicket);
  const generateUploadUrl = useMutation(api.monitoring.generateUploadUrl);
  const [activeTab, setActiveTab] = useState<MonitoringTab>(() => {
    const requestedTab = searchParams?.get("tab") ?? null;
    return isMonitoringTab(requestedTab) ? requestedTab : "issues";
  });
  const [issueSearch, setIssueSearch] = useState("");
  const [internetSearch, setInternetSearch] = useState("");
  const [showIssueCreate, setShowIssueCreate] = useState(false);
  const [showBorrowingCreate, setShowBorrowingCreate] = useState(false);
  const [showMeetingCreate, setShowMeetingCreate] = useState(false);
  const [showInternetCreate, setShowInternetCreate] = useState(false);
  const [requestStatusFilters, setRequestStatusFilters] = useState<ReadonlyArray<string>>([]);
  const [internetStatusFilters, setInternetStatusFilters] = useState<ReadonlyArray<string>>([]);
  const [meetingStatusFilters, setMeetingStatusFilters] = useState<ReadonlyArray<string>>([]);
  const [filterNeedsApproval, setFilterNeedsApproval] = useState(false);
  const [filterMissingReport, setFilterMissingReport] = useState(false);
  const [filterForRevision, setFilterForRevision] = useState(false);
  const [issueForm, setIssueForm] = useState<IssueFormState>(defaultIssueForm);
  const [borrowingForm, setBorrowingForm] = useState<BorrowingFormState>(defaultBorrowingForm);
  const [meetingForm, setMeetingForm] = useState<MeetingFormState>(defaultMeetingForm);
  const [internetForm, setInternetForm] = useState<InternetFormState>(defaultInternetForm);
  const [issueAttachmentFile, setIssueAttachmentFile] = useState<File | null>(null);
  const [borrowingAttachmentFile, setBorrowingAttachmentFile] = useState<File | null>(null);
  const [borrowingAssetSearch, setBorrowingAssetSearch] = useState("");
  const [meetingAssetSearch, setMeetingAssetSearch] = useState("");
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [borrowingSubmitting, setBorrowingSubmitting] = useState(false);
  const [meetingSubmitting, setMeetingSubmitting] = useState(false);
  const [internetSubmitting, setInternetSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [requestTableError, setRequestTableError] = useState("");
  const [meetingStatusSavingId, setMeetingStatusSavingId] = useState("");
  const [meetingStatusDrafts, setMeetingStatusDrafts] = useState<Record<string, string>>({});
  const issueAttachmentRef = useRef<HTMLInputElement | null>(null);
  const borrowingAttachmentRef = useRef<HTMLInputElement | null>(null);
  const deferredIssueSearch = useDeferredValue(issueSearch);
  const deferredBorrowingAssetSearch = useDeferredValue(borrowingAssetSearch);
  const deferredMeetingAssetSearch = useDeferredValue(meetingAssetSearch);
  const deferredInternetSearch = useDeferredValue(internetSearch);

  useEffect(() => {
    const requestedTab = searchParams?.get("tab") ?? null;
    if (isMonitoringTab(requestedTab) && requestedTab !== activeTab) {
      setActiveTab(requestedTab);
    }
  }, [activeTab, searchParams]);

  const issueRows = useQuery(api.monitoring.list, {
    view: "issues",
    search: deferredIssueSearch || undefined,
    showClosed: true,
    needsApproval: activeTab === "issues" && filterNeedsApproval ? true : undefined,
    missingIncidentReport: activeTab === "issues" && filterMissingReport ? true : undefined,
    forRevision: activeTab === "issues" && filterForRevision ? true : undefined,
  });
  const internetRows = useQuery(api.monitoring.list, {
    view: "internet",
    search: deferredInternetSearch || undefined,
    showClosed: true,
  });
  const generalIssueRows = [...(issueRows ?? [])]
    .filter(
      (row) =>
        row.category !== MONITORING_MEETING_REQUEST_CATEGORY &&
        row.category !== MONITORING_BORROWING_REQUEST_CATEGORY,
    )
    .filter((row) => {
      if (requestStatusFilters.length === 0) return true;
      const requestState = getDisplayStatusLabel(row.status, row.category) === "Closed" ? "Closed" : "Open";
      return requestStatusFilters.includes(requestState);
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const meetingStatusFilterValues = [...getMeetingRequestStatusOptions(), "Closed"];
  const meetingRequestRows = [...(issueRows ?? [])]
    .filter((row) => row.category === MONITORING_MEETING_REQUEST_CATEGORY)
    .filter((row) =>
      meetingStatusFilters.length === 0
        ? true
        : meetingStatusFilters.includes(getDisplayStatusLabel(row.status, row.category)),
    )
    .sort((left, right) => {
      const leftStart = left.meetingStartAt ?? Number.MAX_SAFE_INTEGER;
      const rightStart = right.meetingStartAt ?? Number.MAX_SAFE_INTEGER;
      if (leftStart !== rightStart) {
        return leftStart - rightStart;
      }
      return right.updatedAt - left.updatedAt;
    });
  const borrowingRequestRows = [...(issueRows ?? [])]
    .filter((row) => row.category === MONITORING_BORROWING_REQUEST_CATEGORY)
    .filter((row) => {
      if (requestStatusFilters.length === 0) return true;
      const requestState = getDisplayStatusLabel(row.status, row.category) === "Closed" ? "Closed" : "Open";
      return requestStatusFilters.includes(requestState);
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const filteredInternetRows = [...(internetRows ?? [])].filter((row) => {
    if (internetStatusFilters.length === 0) return true;
    const internetState = row.status === "Resolved" ? "Resolved" : "Active";
    return internetStatusFilters.includes(internetState);
  });

  const requestRows =
    activeTab === "meetings"
      ? meetingRequestRows
      : activeTab === "borrowing"
        ? borrowingRequestRows
        : generalIssueRows;
  const requestSearchPlaceholder =
    activeTab === "meetings"
      ? "Search requester, request #, meeting, location"
      : activeTab === "borrowing"
        ? "Search requester, request #, asset, borrower"
        : "Search requester, ticket #, concern";
  const requestEmptyState =
    activeTab === "meetings"
      ? "No meeting requests match the current filters."
      : activeTab === "borrowing"
        ? "No borrowing requests match the current filters."
        : "No tickets match the current filters.";
  const requestMetaColumnLabel =
    activeTab === "meetings" ? "Meeting Mode" : activeTab === "borrowing" ? "Linked Assets" : "Approval";
  const showRequestTypeColumn = activeTab !== "meetings";
  const showPriorityColumn = activeTab !== "meetings";
  const requestColumnCount = 7 + (showRequestTypeColumn ? 1 : 0) + (showPriorityColumn ? 1 : 0);
  const requestFilterCount = [filterNeedsApproval, filterMissingReport, filterForRevision].filter(Boolean).length;
  const requestFilterSummary = requestFilterCount === 0 ? "Select" : String(requestFilterCount);
  const requestFilterOptions: ReadonlyArray<ToolbarFilterOption> = [
    {
      key: "needs-approval",
      label: "Needs Approval",
      selected: filterNeedsApproval,
      onSelect: () => setFilterNeedsApproval((value) => !value),
    },
    {
      key: "missing-report",
      label: "Missing Incident Report",
      selected: filterMissingReport,
      onSelect: () => setFilterMissingReport((value) => !value),
    },
    {
      key: "for-revision",
      label: "For Revision",
      selected: filterForRevision,
      onSelect: () => setFilterForRevision((value) => !value),
    },
  ];
  const requestStatusOptions: ReadonlyArray<ToolbarFilterOption> = [
    {
      key: "open",
      label: "Open",
      selected: requestStatusFilters.includes("Open"),
      onSelect: () =>
        setRequestStatusFilters((current) =>
          current.includes("Open") ? current.filter((value) => value !== "Open") : [...current, "Open"],
        ),
    },
    {
      key: "closed",
      label: "Closed",
      selected: requestStatusFilters.includes("Closed"),
      onSelect: () =>
        setRequestStatusFilters((current) =>
          current.includes("Closed") ? current.filter((value) => value !== "Closed") : [...current, "Closed"],
        ),
    },
  ];
  const requestStatusFilterSummary = requestStatusFilters.length === 0 ? "Select" : String(requestStatusFilters.length);
  const meetingStatusFilterSummary = meetingStatusFilters.length === 0 ? "Select" : String(meetingStatusFilters.length);
  const meetingStatusFilterOptions: ReadonlyArray<ToolbarFilterOption> = meetingStatusFilterValues.map((statusOption) => ({
    key: statusOption.toLowerCase().replace(/\s+/g, "-"),
    label: statusOption,
    selected: meetingStatusFilters.includes(statusOption),
    onSelect: () =>
      setMeetingStatusFilters((current) =>
        current.includes(statusOption)
          ? current.filter((value) => value !== statusOption)
          : [...current, statusOption],
      ),
  }));

  useEffect(() => {
    setMeetingStatusDrafts((current) => {
      const next: Record<string, string> = {};
      let changed = false;

      for (const [rowId, draftStatus] of Object.entries(current)) {
        const matchingRow = meetingRequestRows.find((row) => String(row._id) === rowId);
        if (!matchingRow) {
          changed = true;
          continue;
        }

        const actualStatus = getDisplayStatusLabel(matchingRow.status, matchingRow.category);
        if (actualStatus !== draftStatus) {
          next[rowId] = draftStatus;
        } else {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [meetingRequestRows]);

  useEffect(() => {
    if (activeTab !== "meetings" && requestTableError) {
      setRequestTableError("");
    }
  }, [activeTab, requestTableError]);
  const internetStatusOptions: ReadonlyArray<ToolbarFilterOption> = [
    {
      key: "active",
      label: "Active",
      selected: internetStatusFilters.includes("Active"),
      onSelect: () =>
        setInternetStatusFilters((current) =>
          current.includes("Active") ? current.filter((value) => value !== "Active") : [...current, "Active"],
        ),
    },
    {
      key: "resolved",
      label: "Resolved",
      selected: internetStatusFilters.includes("Resolved"),
      onSelect: () =>
        setInternetStatusFilters((current) =>
          current.includes("Resolved") ? current.filter((value) => value !== "Resolved") : [...current, "Resolved"],
        ),
    },
  ];
  const internetStatusFilterSummary = internetStatusFilters.length === 0 ? "Select" : String(internetStatusFilters.length);
  const selectedMeetingLocations = meetingForm.meetingLocation
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const meetingLocationSummary =
    selectedMeetingLocations.length === 0
      ? "Select"
      : selectedMeetingLocations.length === 1
        ? selectedMeetingLocations[0]
        : `${selectedMeetingLocations.length} Selected`;
  const meetingLocationOptions: ReadonlyArray<ToolbarFilterOption> = MONITORING_MEETING_LOCATION_OPTIONS.map(
    (location) => ({
      key: location,
      label: location,
      selected: selectedMeetingLocations.includes(location),
      onSelect: () =>
        setMeetingForm((prev) => {
          const currentSelections = prev.meetingLocation
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean);
          const nextSelections = currentSelections.includes(location)
            ? currentSelections.filter((value) => value !== location)
            : [...currentSelections, location];

          return {
            ...prev,
            meetingLocation: nextSelections.join(", "),
          };
        }),
    }),
  );
  const selectedBorrowingAssetIds = new Set(borrowingForm.borrowingItems.map((item) => item.assetId));
  const borrowingAssetSearchTerm = deferredBorrowingAssetSearch.trim().toLowerCase();
  const borrowingAssetOptions = (assets ?? [])
    .filter((asset) => !selectedBorrowingAssetIds.has(String(asset._id)))
    .filter((asset) => {
      if (!borrowingAssetSearchTerm) return true;
      return [
        asset.assetTag,
        asset.assetNameDescription,
        asset.assetType,
        asset.serialNumber,
        asset.status,
      ].some((value) => String(value ?? "").toLowerCase().includes(borrowingAssetSearchTerm));
    })
    .sort((left, right) => {
      if ((left.status === "Available") !== (right.status === "Available")) {
        return left.status === "Available" ? -1 : 1;
      }
      return String(left.assetTag ?? "").localeCompare(String(right.assetTag ?? ""));
    })
    .slice(0, 8);
  const selectedMeetingAssetIds = new Set(meetingForm.meetingAssets.map((item) => item.assetId));
  const meetingAssetSearchTerm = deferredMeetingAssetSearch.trim().toLowerCase();
  const meetingAssetOptions = (assets ?? [])
    .filter((asset) => !selectedMeetingAssetIds.has(String(asset._id)))
    .filter((asset) => (asset.locationPersonAssigned ?? asset.location ?? "") === "MAIN STORAGE")
    .filter((asset) => ["Available", "Working"].includes(String(asset.status ?? "")))
    .filter((asset) => asset.reservationStatus !== "Reserved")
    .filter((asset) => {
      if (!meetingAssetSearchTerm) return true;
      return [
        asset.assetTag,
        asset.assetNameDescription,
        asset.assetType,
        asset.serialNumber,
        asset.status,
      ].some((value) => String(value ?? "").toLowerCase().includes(meetingAssetSearchTerm));
    })
    .sort((left, right) => {
      if ((left.status === "Available") !== (right.status === "Available")) {
        return left.status === "Available" ? -1 : 1;
      }
      return String(left.assetTag ?? "").localeCompare(String(right.assetTag ?? ""));
    })
    .slice(0, 8);

  useEffect(() => {
    void syncAutoClose();
  }, [syncAutoClose]);

  async function uploadFileToStorage(file: File | null, failureMessage: string) {
    if (!file) return undefined;
    const uploadUrl = await generateUploadUrl();
    const uploadResult = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
    if (!uploadResult.ok) {
      throw new Error(failureMessage);
    }
    const uploadData = (await uploadResult.json()) as { storageId?: Id<"_storage"> };
    if (!uploadData.storageId) {
      throw new Error(failureMessage);
    }
    return uploadData.storageId;
  }

  async function handleMeetingStatusChange(ticketId: Id<"monitoringTickets">, nextStatus: string) {
    const rowId = String(ticketId);
    setRequestTableError("");
    setMeetingStatusDrafts((current) => ({ ...current, [rowId]: nextStatus }));
    setMeetingStatusSavingId(rowId);

    try {
      await updateTicket({
        ticketId,
        status: nextStatus,
        actorName,
      });
    } catch (error) {
      setMeetingStatusDrafts((current) => {
        const next = { ...current };
        delete next[rowId];
        return next;
      });
      setRequestTableError(error instanceof Error ? error.message : "Meeting status update failed.");
    } finally {
      setMeetingStatusSavingId("");
    }
  }

  async function handleIssueCreate() {
    setFormError("");
    setIssueSubmitting(true);

    try {
      const attachmentStorageId = await uploadFileToStorage(issueAttachmentFile, "Attachment upload failed.");
      const ticketId = await createTicket({
        workType: issueForm.workType,
        workflowType: issueForm.workType === "Service Request" ? "serviceRequest" : "incident",
        category: issueForm.category,
        title: issueForm.title,
        requestDetails: issueForm.requestDetails,
        requestSnapshot: issueForm.requestSnapshot,
        requestSource: MONITORING_REQUEST_SOURCE,
        requesterName: issueForm.requesterName,
        requesterSection: issueForm.requesterSection || undefined,
        requesterDepartment: issueForm.requesterDepartment || undefined,
        assetId: issueForm.assetId ? (issueForm.assetId as Id<"hardwareInventory">) : undefined,
        impact: issueForm.impact,
        urgency: issueForm.urgency,
        requiresPurchase: issueForm.requiresPurchase,
        requiresReplacement: issueForm.requiresReplacement,
        requiresSensitiveAccess: issueForm.requiresSensitiveAccess,
        majorIncident: issueForm.majorIncident,
        attachments: attachmentStorageId
          ? [
              {
                kind: "General",
                label: "Initial attachment",
                fileName: issueAttachmentFile?.name ?? "Attachment",
                contentType: issueAttachmentFile?.type || undefined,
                storageId: attachmentStorageId,
                uploadedBy: actorName,
              },
            ]
          : undefined,
        createdBy: actorName,
      });

      setIssueForm(defaultIssueForm);
      setIssueAttachmentFile(null);
      setShowIssueCreate(false);
      startTransition(() => router.push(`/monitoring/${ticketId}`));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Ticket creation failed.");
    } finally {
      setIssueSubmitting(false);
    }
  }

  async function handleBorrowingCreate() {
    setFormError("");
    setBorrowingSubmitting(true);

    try {
      if (!borrowingForm.requesterName.trim()) {
        throw new Error("Requester name is required.");
      }
      if (!borrowingForm.requestDetails.trim()) {
        throw new Error("Borrowing purpose / notes are required.");
      }
      if (!borrowingForm.requestSnapshot.trim()) {
        throw new Error("Original borrower's form snapshot is required.");
      }
      if (!borrowingForm.expectedReturnAt) {
        throw new Error("Expected return date and time is required.");
      }
      if (!borrowingForm.borrowingItems.length) {
        throw new Error("Add at least one linked asset.");
      }

      const expectedReturnAt = toTimestamp(borrowingForm.expectedReturnAt);
      if (!expectedReturnAt) {
        throw new Error("Expected return date and time is invalid.");
      }

      const attachmentStorageId = await uploadFileToStorage(
        borrowingAttachmentFile,
        "Attachment upload failed.",
      );
      const requestDetails = [
        borrowingForm.requestDetails.trim(),
        `Expected return: ${formatDateTimeInput(borrowingForm.expectedReturnAt)}.`,
        "Borrowed assets:",
        ...borrowingForm.borrowingItems.map(
          (item) => `- ${item.assetTag} | ${item.assetLabel} | Release condition: ${item.releaseCondition}`,
        ),
      ].join("\n");

      const ticketId = await createTicket({
        workType: "Service Request",
        workflowType: "serviceRequest",
        category: MONITORING_BORROWING_REQUEST_CATEGORY,
        requestDetails,
        requestSnapshot: borrowingForm.requestSnapshot,
        requestSource: MONITORING_REQUEST_SOURCE,
        requesterName: borrowingForm.requesterName,
        requesterSection: borrowingForm.requesterSection || undefined,
        requesterDepartment: borrowingForm.requesterDepartment || undefined,
        expectedReturnAt,
        borrowingItems: borrowingForm.borrowingItems.map((item) => ({
          assetId: item.assetId as Id<"hardwareInventory">,
          releaseCondition: item.releaseCondition,
        })),
        attachments: attachmentStorageId
          ? [
              {
                kind: "General",
                label: "Borrowing request attachment",
                fileName: borrowingAttachmentFile?.name ?? "Attachment",
                contentType: borrowingAttachmentFile?.type || undefined,
                storageId: attachmentStorageId,
                uploadedBy: actorName,
              },
            ]
          : undefined,
        createdBy: actorName,
      });

      setBorrowingForm(defaultBorrowingForm);
      setBorrowingAttachmentFile(null);
      setBorrowingAssetSearch("");
      setShowBorrowingCreate(false);
      startTransition(() => router.push(`/monitoring/${ticketId}`));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Borrowing request creation failed.");
    } finally {
      setBorrowingSubmitting(false);
    }
  }

  async function handleMeetingCreate() {
    setFormError("");
    setMeetingSubmitting(true);

    try {
      const meetingStartAt = toTimestamp(meetingForm.meetingStart);
      const meetingEndAt = toTimestamp(meetingForm.meetingEnd);

      if (!meetingForm.requestSnapshot.trim()) {
        throw new Error("Teams meeting snapshot is required.");
      }
      if (!meetingForm.meetingTitle.trim()) {
        throw new Error("Meeting title is required.");
      }
      if (!meetingStartAt) {
        throw new Error("Meeting start is required.");
      }
      if (meetingEndAt && meetingEndAt <= meetingStartAt) {
        throw new Error("Meeting end must be after the meeting start.");
      }

      const scheduleLabel = formatMeetingSchedule(meetingForm.meetingStart, meetingForm.meetingEnd);
      const title = `Meeting Support - ${meetingForm.meetingTitle} - ${formatDateTimeInput(meetingForm.meetingStart, {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}`;
      const requestDetails = [
        `Meeting support requested for "${meetingForm.meetingTitle}".`,
        `Schedule: ${scheduleLabel}.`,
        `${meetingForm.meetingMode} meeting at ${meetingForm.meetingLocation}.`,
        `Expected attendees: ${meetingForm.meetingAttendeeCount}.`,
        meetingForm.meetingAssets.length
          ? `Reserved assets: ${meetingForm.meetingAssets.map((item) => `${item.assetTag} | ${item.assetLabel}`).join(", ")}.`
          : undefined,
        meetingForm.supportNotes ? `Additional notes: ${meetingForm.supportNotes}.` : undefined,
      ]
        .filter(Boolean)
        .join("\n");

      const ticketId = await createTicket({
        workType: "Service Request",
        workflowType: "serviceRequest",
        category: MONITORING_MEETING_REQUEST_CATEGORY,
        title,
        requestDetails,
        requestSnapshot: meetingForm.requestSnapshot.trim(),
        requestSource: MEETING_REQUEST_SOURCE,
        requesterName: meetingForm.requesterName,
        requesterSection: meetingForm.requesterSection || undefined,
        requesterDepartment: meetingForm.requesterDepartment || undefined,
        meetingMode: meetingForm.meetingMode,
        meetingLocation: meetingForm.meetingLocation,
        meetingStartAt,
        meetingEndAt,
        meetingAttendeeCount: meetingForm.meetingAttendeeCount,
        meetingAssetIds: meetingForm.meetingAssets.map((item) => item.assetId as Id<"hardwareInventory">),
        createdBy: actorName,
      });

      setMeetingForm(defaultMeetingForm);
      setMeetingAssetSearch("");
      setShowMeetingCreate(false);
      startTransition(() => router.push(`/monitoring/${ticketId}`));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Meeting request creation failed.");
    } finally {
      setMeetingSubmitting(false);
    }
  }

  async function handleInternetCreate() {
    setFormError("");
    setInternetSubmitting(true);

    try {
      const timeDetected = toTimestamp(internetForm.timeDetected);
      const timeRestored = toTimestamp(internetForm.timeRestored);
      const trimmedDetails = internetForm.details.trim();
      const snapshot = [
        `ISP: ${internetForm.isp}`,
        `AREA: ${internetForm.area}`,
        `STATUS: ${internetForm.status}`,
        `OPERATIONS BLOCKED: ${internetForm.operationsBlocked ? "YES" : "NO"}`,
      ].join("\n");

      const ticketId = await createTicket({
        workType: "Incident",
        workflowType: "internetOutage",
        category: "Network & Connectivity",
        requestDetails: trimmedDetails || `${internetForm.isp} outage affecting ${internetForm.area}.`,
        requestSnapshot: snapshot,
        requesterName: actorName,
        createdBy: actorName,
        isp: internetForm.isp,
        outageArea: internetForm.area,
        status: internetForm.status,
        timeDetected,
        timeRestored,
        operationsBlocked: internetForm.operationsBlocked,
        causeActionTaken: internetForm.causeActionTaken || undefined,
      });

      setInternetForm(defaultInternetForm);
      setShowInternetCreate(false);
      startTransition(() => router.push(`/monitoring/${ticketId}`));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Internet incident creation failed.");
    } finally {
      setInternetSubmitting(false);
    }
  }

  function openIssueTicketModal(preset?: Partial<IssueFormState>) {
    setFormError("");
    if (preset) {
      setIssueForm((prev) => ({ ...prev, ...preset }));
    }
    setShowIssueCreate(true);
  }

  function openBorrowingCreateModal() {
    setFormError("");
    setBorrowingForm(defaultBorrowingForm);
    setBorrowingAttachmentFile(null);
    setBorrowingAssetSearch("");
    setShowBorrowingCreate(true);
  }

  return (
    <div className="monitoring-page" style={{ display: "grid", gap: 18 }}>
      <section className="panel" style={{ padding: 18, display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 className="type-page-title">Monitoring</h1>
            <div className="type-page-subtitle">
              Internal IT monitoring for tickets, meeting requests, borrowing requests, approvals, major incidents, and
              office internet uptime.
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div className="metric-item">
            <div className="metric-head">Open Tickets</div>
            <div className="metric-value">
              <strong>{overview?.openTickets ?? "-"}</strong>
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-head">Pending Approvals</div>
            <div className="metric-value">
              <strong>{overview?.pendingApprovals ?? "-"}</strong>
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-head">Active Internet Outages</div>
            <div className="metric-value">
              <strong>{overview?.activeInternetOutages ?? "-"}</strong>
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-head">Monthly Uptime</div>
            <div className="metric-value">
              <strong>{formatPercent(overview?.monthlyUptime)}</strong>
            </div>
          </div>
        </div>

      </section>

      <section className="panel" style={{ padding: 16, display: "grid", gap: 14 }}>
        <div className="monitoring-tab-strip" role="tablist" aria-label="Monitoring sections">
          {MONITORING_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`monitoring-tab-btn${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="monitoring-tab-icon" aria-hidden="true">
                <MonitoringTabIcon tab={tab.key} />
              </span>
              <span className="monitoring-tab-label">{tab.label}</span>
            </button>
          ))}
        </div>

        <MonitoringFormModal open={showIssueCreate && activeTab === "issues"} onClose={() => setShowIssueCreate(false)} width={920}>
          <section className="saas-card" style={{ padding: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <div className="type-section-title">New Issue / Request</div>
              <div className="type-helper">* Required fields</div>
            </div>
            <FormErrorBanner message={formError} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <FieldGroup label="Work Type" required>
                <select
                  className="input-base"
                  value={issueForm.workType}
                  onChange={(event) =>
                    setIssueForm((prev) => ({ ...prev, workType: event.target.value as IssueFormState["workType"] }))
                  }
                >
                  {MONITORING_WORK_TYPES.map((workType) => (
                    <option key={workType} value={workType}>
                      {workType}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Category" required>
                <select
                  className="input-base"
                  value={issueForm.category}
                  onChange={(event) => setIssueForm((prev) => ({ ...prev, category: event.target.value }))}
                >
                  {MONITORING_TICKET_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Requester Name" required>
                <input
                  className="input-base"
                  placeholder="Requester Name"
                  value={issueForm.requesterName}
                  onChange={(event) => setIssueForm((prev) => ({ ...prev, requesterName: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Section">
                <input
                  className="input-base"
                  placeholder="Section"
                  value={issueForm.requesterSection}
                  onChange={(event) => setIssueForm((prev) => ({ ...prev, requesterSection: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Department">
                <input
                  className="input-base"
                  placeholder="Department"
                  value={issueForm.requesterDepartment}
                  onChange={(event) => setIssueForm((prev) => ({ ...prev, requesterDepartment: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Concern Summary" required>
                <input
                  className="input-base"
                  placeholder="Concern Summary"
                  value={issueForm.title}
                  onChange={(event) => setIssueForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Impact" required>
                <select
                  className="input-base"
                  value={issueForm.impact}
                  onChange={(event) => setIssueForm((prev) => ({ ...prev, impact: event.target.value }))}
                >
                  {MONITORING_IMPACT_OPTIONS.map((impact) => (
                    <option key={impact} value={impact}>
                      {impact}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Urgency" required>
                <select
                  className="input-base"
                  value={issueForm.urgency}
                  onChange={(event) => setIssueForm((prev) => ({ ...prev, urgency: event.target.value }))}
                >
                  {MONITORING_URGENCY_OPTIONS.map((urgency) => (
                    <option key={urgency} value={urgency}>
                      {urgency}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Linked Asset">
                <select
                  className="input-base"
                  value={issueForm.assetId}
                  onChange={(event) => setIssueForm((prev) => ({ ...prev, assetId: event.target.value }))}
                >
                  <option value="">No linked asset</option>
                  {(assets ?? []).map((asset) => (
                    <option key={asset._id} value={String(asset._id)}>
                      {asset.assetTag} | {asset.assetNameDescription ?? asset.assetType ?? "Asset"}
                    </option>
                  ))}
                </select>
              </FieldGroup>
            </div>
            <FieldGroup label="Issue / Request Details" required>
              <textarea
                className="input-base"
                style={textareaStyle}
                placeholder="Issue / Request Details"
                value={issueForm.requestDetails}
                onChange={(event) => setIssueForm((prev) => ({ ...prev, requestDetails: event.target.value }))}
              />
            </FieldGroup>
            <FieldGroup label="Original Teams Form Snapshot" required>
              <textarea
                className="input-base"
                style={textareaStyle}
                placeholder="Original Teams Form Snapshot"
                value={issueForm.requestSnapshot}
                onChange={(event) => setIssueForm((prev) => ({ ...prev, requestSnapshot: event.target.value }))}
              />
            </FieldGroup>
            <div style={{ display: "grid", gap: 8 }}>
              <CheckboxRow
                label="Requires Purchase Approval"
                checked={issueForm.requiresPurchase}
                onChange={(checked) => setIssueForm((prev) => ({ ...prev, requiresPurchase: checked }))}
              />
              <CheckboxRow
                label="Requires Replacement Approval"
                checked={issueForm.requiresReplacement}
                onChange={(checked) => setIssueForm((prev) => ({ ...prev, requiresReplacement: checked }))}
              />
              <CheckboxRow
                label="Requires Sensitive Access Approval"
                checked={issueForm.requiresSensitiveAccess}
                onChange={(checked) => setIssueForm((prev) => ({ ...prev, requiresSensitiveAccess: checked }))}
              />
              <CheckboxRow
                label="Major Incident"
                checked={issueForm.majorIncident}
                onChange={(checked) => setIssueForm((prev) => ({ ...prev, majorIncident: checked }))}
              />
            </div>
            <div style={{ maxWidth: 420 }}>
              <FileUploadCard
                label="Attachment"
                inputRef={issueAttachmentRef}
                accept="*/*"
                onFileChange={setIssueAttachmentFile}
                file={issueAttachmentFile}
                hasAttachment={Boolean(issueAttachmentFile)}
                displayName={issueAttachmentFile?.name ?? "Optional supporting file"}
                helperText="Screenshots, emails, or reference documents."
                badge="1"
                ariaLabel="Issue attachment"
                onRemove={() => setIssueAttachmentFile(null)}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setShowIssueCreate(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={issueSubmitting} onClick={() => void handleIssueCreate()}>
                {issueSubmitting ? "Creating..." : "Create Ticket"}
              </button>
            </div>
          </section>
        </MonitoringFormModal>

        <MonitoringFormModal
          open={activeTab === "borrowing" && showBorrowingCreate}
          onClose={() => setShowBorrowingCreate(false)}
          width={980}
        >
          <section className="saas-card" style={{ padding: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <div className="type-section-title">New Borrowing Request</div>
              <div className="type-helper">* Required fields</div>
            </div>
            <FormErrorBanner message={formError} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <FieldGroup label="Requester Name" required>
                <input
                  className="input-base"
                  placeholder="Requester Name"
                  value={borrowingForm.requesterName}
                  onChange={(event) => setBorrowingForm((prev) => ({ ...prev, requesterName: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Section">
                <input
                  className="input-base"
                  placeholder="Section"
                  value={borrowingForm.requesterSection}
                  onChange={(event) => setBorrowingForm((prev) => ({ ...prev, requesterSection: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Department">
                <input
                  className="input-base"
                  placeholder="Department"
                  value={borrowingForm.requesterDepartment}
                  onChange={(event) => setBorrowingForm((prev) => ({ ...prev, requesterDepartment: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Expected Return Date and Time" required>
                <input
                  className="input-base"
                  type="datetime-local"
                  value={borrowingForm.expectedReturnAt}
                  onChange={(event) => setBorrowingForm((prev) => ({ ...prev, expectedReturnAt: event.target.value }))}
                />
              </FieldGroup>
            </div>
            <FieldGroup
              label="Linked Assets"
              required
              helperText="Search and add one or more registered assets. IT will record the returned condition later on the ticket."
            >
              <div style={{ display: "grid", gap: 10 }}>
                <BorrowingAssetLookup
                  query={borrowingAssetSearch}
                  onQueryChange={setBorrowingAssetSearch}
                  options={borrowingAssetOptions}
                  onAddAsset={(asset) => {
                    setBorrowingForm((prev) => ({
                      ...prev,
                      borrowingItems: [
                        ...prev.borrowingItems,
                        {
                          assetId: String(asset._id),
                          assetTag: asset.assetTag ?? "No Tag",
                          assetLabel: asset.assetNameDescription ?? asset.assetType ?? "Asset",
                          releaseCondition: MONITORING_BORROW_CONDITION_OPTIONS[0],
                        },
                      ],
                    }));
                    setBorrowingAssetSearch("");
                  }}
                />
                {borrowingForm.borrowingItems.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {borrowingForm.borrowingItems.map((item, index) => (
                      <div
                        key={`${item.assetId}-${index}`}
                        className="saas-card"
                        style={{
                          padding: 12,
                          display: "grid",
                          gap: 10,
                          gridTemplateColumns: "minmax(0, 1.6fr) minmax(220px, 0.9fr) auto",
                          alignItems: "end",
                        }}
                        >
                        <div style={{ display: "grid", gap: 4 }}>
                          <strong style={{ fontSize: "var(--type-body)" }}>{item.assetTag}</strong>
                          <span style={{ fontSize: "var(--type-label)", color: "var(--muted)" }}>{item.assetLabel}</span>
                        </div>
                        <FieldGroup label="Release Condition" required>
                          <select
                            className="input-base"
                            value={item.releaseCondition}
                            onChange={(event) =>
                              setBorrowingForm((prev) => ({
                                ...prev,
                                borrowingItems: prev.borrowingItems.map((entry, entryIndex) =>
                                  entryIndex === index
                                    ? {
                                        ...entry,
                                        releaseCondition: event.target.value as (typeof MONITORING_BORROW_CONDITION_OPTIONS)[number],
                                      }
                                    : entry,
                                ),
                              }))
                            }
                          >
                            {MONITORING_BORROW_CONDITION_OPTIONS.map((condition) => (
                              <option key={condition} value={condition}>
                                {condition}
                              </option>
                            ))}
                          </select>
                        </FieldGroup>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            setBorrowingForm((prev) => ({
                              ...prev,
                              borrowingItems: prev.borrowingItems.filter((_, entryIndex) => entryIndex !== index),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="saas-card"
                    style={{
                      padding: 12,
                      borderStyle: "dashed",
                      color: "var(--muted)",
                      fontSize: "var(--type-body-sm)",
                    }}
                  >
                    No linked assets added yet.
                  </div>
                )}
              </div>
            </FieldGroup>
            <FieldGroup label="Borrowing Purpose / Notes" required>
              <textarea
                className="input-base"
                style={textareaStyle}
                placeholder="Purpose of the borrowing request, usage notes, or handling reminders."
                value={borrowingForm.requestDetails}
                onChange={(event) => setBorrowingForm((prev) => ({ ...prev, requestDetails: event.target.value }))}
              />
            </FieldGroup>
            <FieldGroup label="Original Borrower's Form Snapshot" required>
              <textarea
                className="input-base"
                style={textareaStyle}
                placeholder="Paste the Microsoft Form / borrower's form details here."
                value={borrowingForm.requestSnapshot}
                onChange={(event) => setBorrowingForm((prev) => ({ ...prev, requestSnapshot: event.target.value }))}
              />
            </FieldGroup>
            <div style={{ maxWidth: 420 }}>
              <FileUploadCard
                label="Attachment"
                inputRef={borrowingAttachmentRef}
                accept="*/*"
                onFileChange={setBorrowingAttachmentFile}
                file={borrowingAttachmentFile}
                hasAttachment={Boolean(borrowingAttachmentFile)}
                displayName={borrowingAttachmentFile?.name ?? "Optional supporting file"}
                helperText="Borrower's form export, screenshots, or reference documents."
                badge="1"
                ariaLabel="Borrowing attachment"
                onRemove={() => setBorrowingAttachmentFile(null)}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setShowBorrowingCreate(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={borrowingSubmitting}
                onClick={() => void handleBorrowingCreate()}
              >
                {borrowingSubmitting ? "Creating..." : "Create Borrowing Request"}
              </button>
            </div>
          </section>
        </MonitoringFormModal>

        <MonitoringFormModal open={activeTab === "meetings" && showMeetingCreate} onClose={() => setShowMeetingCreate(false)} width={920}>
          <section className="saas-card" style={{ padding: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <div className="type-section-title">New Meeting Request</div>
              <div className="type-helper">Paste the Teams reservation snapshot, add the meeting details, and reserve any storage assets needed.</div>
            </div>
            <FormErrorBanner message={formError} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <FieldGroup label="Requester Name" required>
                <input
                  className="input-base"
                  placeholder="Requester Name"
                  value={meetingForm.requesterName}
                  onChange={(event) => setMeetingForm((prev) => ({ ...prev, requesterName: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Section">
                <input
                  className="input-base"
                  placeholder="Section"
                  value={meetingForm.requesterSection}
                  onChange={(event) => setMeetingForm((prev) => ({ ...prev, requesterSection: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Department">
                <input
                  className="input-base"
                  placeholder="Department"
                  value={meetingForm.requesterDepartment}
                  onChange={(event) => setMeetingForm((prev) => ({ ...prev, requesterDepartment: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Meeting Title / Purpose" required>
                <input
                  className="input-base"
                  placeholder="Meeting Title / Purpose"
                  value={meetingForm.meetingTitle}
                  onChange={(event) => setMeetingForm((prev) => ({ ...prev, meetingTitle: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Meeting Mode" required>
                <select
                  className="input-base"
                  value={meetingForm.meetingMode}
                  onChange={(event) =>
                    setMeetingForm((prev) => ({
                      ...prev,
                      meetingMode: event.target.value as MeetingFormState["meetingMode"],
                    }))
                  }
                >
                  {MONITORING_MEETING_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Meeting Start" required>
                <input
                  className="input-base"
                  type="datetime-local"
                  value={meetingForm.meetingStart}
                  onChange={(event) => setMeetingForm((prev) => ({ ...prev, meetingStart: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Meeting End" helperText="Optional, but useful for equipment pull-out and return planning.">
                <input
                  className="input-base"
                  type="datetime-local"
                  value={meetingForm.meetingEnd}
                  onChange={(event) => setMeetingForm((prev) => ({ ...prev, meetingEnd: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Location / Platform" required helperText="You can select more than one option.">
                <ToolbarFilterDropdown
                  label="Location / Platform"
                  summary={meetingLocationSummary}
                  ariaLabel="Meeting location and platform"
                  options={meetingLocationOptions}
                  minWidth={220}
                  active={selectedMeetingLocations.length > 0}
                  keepOpenOnSelect
                  showCheckboxes
                />
              </FieldGroup>
              <FieldGroup label="Expected Attendees" required>
                <input
                  className="input-base"
                  placeholder="10, 25-30, department heads, etc."
                  value={meetingForm.meetingAttendeeCount}
                  onChange={(event) => setMeetingForm((prev) => ({ ...prev, meetingAttendeeCount: event.target.value }))}
                />
              </FieldGroup>
            </div>
            <FieldGroup
              label="Reserved Assets"
              helperText="Select one or more available MAIN STORAGE assets to reserve for this meeting request."
            >
              <div style={{ display: "grid", gap: 10 }}>
                <BorrowingAssetLookup
                  query={meetingAssetSearch}
                  onQueryChange={setMeetingAssetSearch}
                  options={meetingAssetOptions}
                  onAddAsset={(asset) => {
                    setMeetingForm((prev) => ({
                      ...prev,
                      meetingAssets: [
                        ...prev.meetingAssets,
                        {
                          assetId: String(asset._id),
                          assetTag: asset.assetTag ?? "No Tag",
                          assetLabel: formatBorrowingAssetLabel(asset),
                        },
                      ],
                    }));
                    setMeetingAssetSearch("");
                  }}
                />
                {meetingForm.meetingAssets.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {meetingForm.meetingAssets.map((item, index) => (
                      <div
                        key={`${item.assetId}-${index}`}
                        className="saas-card"
                        style={{
                          padding: 12,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ display: "grid", gap: 4 }}>
                          <strong style={{ fontSize: "var(--type-body)" }}>{item.assetTag}</strong>
                          <span style={{ fontSize: "var(--type-label)", color: "var(--muted)" }}>{item.assetLabel}</span>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            setMeetingForm((prev) => ({
                              ...prev,
                              meetingAssets: prev.meetingAssets.filter((_, entryIndex) => entryIndex !== index),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="saas-card"
                    style={{
                      padding: 12,
                      borderStyle: "dashed",
                      color: "var(--muted)",
                      fontSize: "var(--type-body-sm)",
                    }}
                  >
                    No reserved assets added yet.
                  </div>
                )}
              </div>
            </FieldGroup>
            <FieldGroup label="Additional Notes">
              <textarea
                className="input-base"
                style={textareaStyle}
                placeholder="Meeting agenda, setup timing, presenter needs, or any special handling."
                value={meetingForm.supportNotes}
                onChange={(event) => setMeetingForm((prev) => ({ ...prev, supportNotes: event.target.value }))}
              />
            </FieldGroup>
            <FieldGroup
              label="Teams Meeting Snapshot"
              required
              helperText="Copy and paste the Teams reservation or request snapshot exactly as received."
            >
              <textarea
                className="input-base"
                style={textareaStyle}
                placeholder="Paste the Teams meeting reservation snapshot here."
                value={meetingForm.requestSnapshot}
                onChange={(event) => setMeetingForm((prev) => ({ ...prev, requestSnapshot: event.target.value }))}
              />
            </FieldGroup>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setShowMeetingCreate(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={meetingSubmitting} onClick={() => void handleMeetingCreate()}>
                {meetingSubmitting ? "Creating Request..." : "Create Meeting Request"}
              </button>
            </div>
          </section>
        </MonitoringFormModal>

        <MonitoringFormModal open={activeTab === "internet" && showInternetCreate} onClose={() => setShowInternetCreate(false)} width={860}>
          <section className="saas-card" style={{ padding: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 4 }}>
              <div className="type-section-title">New Internet Outage</div>
              <div className="type-helper">* Required fields</div>
            </div>
            <FormErrorBanner message={formError} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              <FieldGroup label="ISP" required>
                <select
                  className="input-base"
                  value={internetForm.isp}
                  onChange={(event) => setInternetForm((prev) => ({ ...prev, isp: event.target.value }))}
                >
                  {MONITORING_ISPS.map((isp) => (
                    <option key={isp} value={isp}>
                      {isp}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Connection Role">
                <input
                  className="input-base input-readonly-tone"
                  value={resolveConnectionRole(internetForm.isp) ?? "-"}
                  readOnly
                />
              </FieldGroup>
              <FieldGroup label="Affected Area" required>
                <select
                  className="input-base"
                  value={internetForm.area}
                  onChange={(event) => setInternetForm((prev) => ({ ...prev, area: event.target.value }))}
                >
                  {MONITORING_AREAS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Outage Status" required>
                <select
                  className="input-base"
                  value={internetForm.status}
                  onChange={(event) =>
                    setInternetForm((prev) => ({
                      ...prev,
                      status: event.target.value as InternetFormState["status"],
                    }))
                  }
                >
                  {INTERNET_OUTAGE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Time Detected" required>
                <input
                  className="input-base"
                  type="datetime-local"
                  value={internetForm.timeDetected}
                  onChange={(event) => setInternetForm((prev) => ({ ...prev, timeDetected: event.target.value }))}
                />
              </FieldGroup>
              <FieldGroup label="Time Restored" helperText="Required only when the outage is marked Resolved.">
                <input
                  className="input-base"
                  type="datetime-local"
                  value={internetForm.timeRestored}
                  onChange={(event) => setInternetForm((prev) => ({ ...prev, timeRestored: event.target.value }))}
                />
              </FieldGroup>
            </div>
            <CheckboxRow
              label="Operations blocked in the affected area"
              checked={internetForm.operationsBlocked}
              onChange={(checked) => setInternetForm((prev) => ({ ...prev, operationsBlocked: checked }))}
            />
            <FieldGroup label="Outage Details">
              <textarea
                className="input-base"
                style={textareaStyle}
                placeholder="Outage details"
                value={internetForm.details}
                onChange={(event) => setInternetForm((prev) => ({ ...prev, details: event.target.value }))}
              />
            </FieldGroup>
            <FieldGroup label="Cause / Action Taken" helperText="Required only when the outage is marked Resolved.">
              <textarea
                className="input-base"
                style={textareaStyle}
                placeholder="Cause / Action Taken"
                value={internetForm.causeActionTaken}
                onChange={(event) => setInternetForm((prev) => ({ ...prev, causeActionTaken: event.target.value }))}
              />
            </FieldGroup>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" className="btn-secondary" onClick={() => setShowInternetCreate(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={internetSubmitting}
                onClick={() => void handleInternetCreate()}
              >
                {internetSubmitting ? "Logging..." : "Log Outage"}
              </button>
            </div>
          </section>
        </MonitoringFormModal>

        {activeTab === "internet" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", flex: "1 1 460px", alignItems: "flex-end" }}>
                <div className="search-field monitoring-toolbar-search" style={{ maxWidth: 244, width: "100%" }}>
                  <span className="search-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                      <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </span>
                  <input
                    className="input-base"
                    placeholder="Search ticket #, ISP, area"
                    value={internetSearch}
                    onChange={(event) => setInternetSearch(event.target.value)}
                  />
                </div>
                <ToolbarFilterDropdown
                  label="Status"
                  summary={internetStatusFilterSummary}
                  ariaLabel="Internet status filter"
                  options={internetStatusOptions}
                  active={internetStatusFilters.length > 0}
                  minWidth={104}
                  keepOpenOnSelect
                  showCheckboxes
                  showLabelInTrigger
                  compact
                />
              </div>
              <button
                type="button"
                className="btn-primary"
                style={{ minHeight: 40, paddingInline: 16, marginLeft: "auto" }}
                onClick={() => {
                  setFormError("");
                  setShowInternetCreate(true);
                }}
              >
                Log Internet Outage
              </button>
            </div>

            <div className="saas-table-wrap">
              <table className="saas-table" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th>Ticket</th>
                    <th>ISP</th>
                    <th>Role</th>
                    <th>Area</th>
                    <th>Status</th>
                    <th>Downtime</th>
                    <th>Impacted Uptime</th>
                    <th>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInternetRows.map((row) => (
                    <tr
                      key={row._id}
                      className="table-row-hover"
                      style={{ cursor: "pointer" }}
                      onClick={() => router.push(`/monitoring/${row._id}`)}
                    >
                      <td>
                        <div style={{ display: "grid", gap: 4 }}>
                          <strong>{row.ticketNumber}</strong>
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>{row.title}</span>
                        </div>
                      </td>
                      <td>{row.isp ?? "-"}</td>
                      <td>{row.connectionRole ?? "-"}</td>
                      <td>{row.outageArea ?? "-"}</td>
                      <td>
                        <Chip label={getDisplayStatusLabel(row.status, row.category)} />
                      </td>
                      <td>{formatMinutes(row.totalDowntimeMinutes)}</td>
                      <td>{row.impactedUptime ? <Chip label="Yes" /> : "No"}</td>
                      <td>{formatDateTime(row.updatedAt)}</td>
                    </tr>
                  ))}
                  {!filteredInternetRows.length ? (
                    <tr>
                      <td colSpan={8}>No internet incidents match the current filters.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", flex: "1 1 560px", alignItems: "flex-end" }}>
                <div className="search-field monitoring-toolbar-search" style={{ maxWidth: 252, width: "100%" }}>
                  <span className="search-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                      <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </span>
                  <input
                    className="input-base"
                    placeholder={requestSearchPlaceholder}
                    value={issueSearch}
                    onChange={(event) => setIssueSearch(event.target.value)}
                  />
                </div>
                {activeTab === "issues" ? (
                  <>
                    <ToolbarFilterDropdown
                      label="Filters"
                      summary={requestFilterSummary}
                      ariaLabel="Request filters"
                      options={requestFilterOptions}
                      minWidth={106}
                      active={requestFilterCount > 0}
                      keepOpenOnSelect
                      showCheckboxes
                      showLabelInTrigger
                      compact
                    />
                  </>
                ) : null}
                <ToolbarFilterDropdown
                  label="Status"
                  summary={activeTab === "meetings" ? meetingStatusFilterSummary : requestStatusFilterSummary}
                  ariaLabel={activeTab === "meetings" ? "Meeting status filter" : "Request status filter"}
                  options={activeTab === "meetings" ? meetingStatusFilterOptions : requestStatusOptions}
                  active={activeTab === "meetings" ? meetingStatusFilters.length > 0 : requestStatusFilters.length > 0}
                  minWidth={104}
                  keepOpenOnSelect
                  showCheckboxes
                  showLabelInTrigger
                  compact
                />
              </div>
              {activeTab === "meetings" ? (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ minHeight: 40, paddingInline: 16, marginLeft: "auto" }}
                  onClick={() => {
                    setFormError("");
                    setShowMeetingCreate(true);
                  }}
                >
                  Create Meeting Request
                </button>
              ) : null}
              {activeTab === "issues" ? (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ minHeight: 40, paddingInline: 16, marginLeft: "auto" }}
                  onClick={() => openIssueTicketModal()}
                >
                  Create Ticket
                </button>
              ) : null}
              {activeTab === "borrowing" ? (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ minHeight: 40, paddingInline: 16, marginLeft: "auto" }}
                  onClick={() => openBorrowingCreateModal()}
                >
                  Create Ticket
                </button>
              ) : null}
            </div>

            <div className="saas-table-wrap">
              {requestTableError ? <FormErrorBanner message={requestTableError} /> : null}
              <table className="saas-table" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th>{activeTab === "issues" ? "Ticket" : "Request"}</th>
                    {showRequestTypeColumn ? <th>Type</th> : null}
                    <th>{activeTab === "meetings" ? "Section" : "Category"}</th>
                    <th>Requester</th>
                    <th>Schedule</th>
                    {showPriorityColumn ? <th>Priority</th> : null}
                    <th>Status</th>
                    <th>{requestMetaColumnLabel}</th>
                    <th>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {requestRows.map((row) => {
                    const rowId = String(row._id);
                    const displayStatus = getDisplayStatusLabel(row.status, row.category);
                    const requestListTitle =
                      activeTab === "meetings" ? getMeetingRequestListTitle(row.title, row.meetingStartAt) : row.title;
                    const editableMeetingStatusOptions = Array.from(
                      new Set([
                        ...getMeetingRequestStatusOptions(),
                        ...(displayStatus ? [displayStatus] : []),
                        ...(displayStatus === "Closed" ? ["Closed"] : []),
                      ]),
                    );
                    const meetingStatusOptions = buildMeetingStatusSelectOptions(editableMeetingStatusOptions);

                    return (
                      <tr
                        key={row._id}
                        className="table-row-hover"
                        style={{ cursor: "pointer" }}
                        onClick={() => router.push(`/monitoring/${row._id}`)}
                      >
                        <td>
                          <div style={{ display: "grid", gap: 4 }}>
                            <strong>{row.ticketNumber}</strong>
                            <span style={{ color: "var(--muted)", fontSize: 12 }}>{requestListTitle}</span>
                            {row.meetingLocation ? (
                              <span style={{ color: "var(--muted)", fontSize: 12 }}>{row.meetingLocation}</span>
                            ) : null}
                            {activeTab !== "meetings" && row.meetingAssetItems?.length ? (
                              <span style={{ color: "var(--muted)", fontSize: 12 }}>
                                {row.meetingAssetItems.map((item) => item.assetTag).slice(0, 2).join(", ")}
                                {row.meetingAssetItems.length > 2 ? ` +${row.meetingAssetItems.length - 2} more` : ""}
                              </span>
                            ) : null}
                            {row.borrowingItems?.length ? (
                              <span style={{ color: "var(--muted)", fontSize: 12 }}>
                                {row.borrowingItems.map((item) => item.assetTag).slice(0, 2).join(", ")}
                                {row.borrowingItems.length > 2 ? ` +${row.borrowingItems.length - 2} more` : ""}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        {showRequestTypeColumn ? (
                          <td>{activeTab === "borrowing" ? "Borrowing Request" : row.workType}</td>
                        ) : null}
                        <td>{activeTab === "meetings" ? row.requesterSection || "-" : row.category}</td>
                        <td>{row.requesterName}</td>
                        <td>
                          {row.meetingStartAt ? (
                            <div style={{ display: "grid", gap: 4 }}>
                              <span>{formatDateTime(row.meetingStartAt)}</span>
                              {row.meetingEndAt ? (
                                <span style={{ color: "var(--muted)", fontSize: 12 }}>{formatDateTime(row.meetingEndAt)}</span>
                              ) : null}
                            </div>
                          ) : row.expectedReturnAt ? (
                            <div style={{ display: "grid", gap: 4 }}>
                              <span>{formatDateTime(row.expectedReturnAt)}</span>
                              <span style={{ color: "var(--muted)", fontSize: 12 }}>Expected return</span>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        {showPriorityColumn ? (
                          <td>
                            {row.priority ? <Chip label={row.priority} /> : "-"}
                          </td>
                        ) : null}
                        <td onClick={(event) => event.stopPropagation()}>
                          {activeTab === "meetings" ? (
                            <div className="table-status-select-wrap">
                              <ChecklistSelect
                                value={meetingStatusDrafts[rowId] ?? displayStatus}
                                options={meetingStatusOptions}
                                onChange={(value) => void handleMeetingStatusChange(row._id, value)}
                                placeholder="Select status"
                                ariaLabel={`Status for ${row.ticketNumber}`}
                                disabled={meetingStatusSavingId === rowId}
                                minMenuWidth={128}
                              />
                            </div>
                          ) : (
                            <Chip label={displayStatus} />
                          )}
                        </td>
                        <td>
                          {activeTab === "meetings"
                            ? row.meetingMode || "-"
                            : activeTab === "borrowing"
                              ? row.borrowingItems?.length
                                ? `${row.borrowingItems.length} linked`
                                : "-"
                              : row.approvalRequired
                                ? <Chip label={row.approvalStage} />
                                : "-"}
                        </td>
                        <td>{formatDateTime(row.updatedAt)}</td>
                      </tr>
                    );
                  })}
                  {!requestRows.length ? (
                    <tr>
                      <td colSpan={requestColumnCount}>{requestEmptyState}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            Default request source: <strong style={{ color: "var(--foreground)" }}>{MONITORING_REQUEST_SOURCE}</strong>
          </span>
          <Link href="/reports" className="btn-secondary">
            Open Reports
          </Link>
        </div>
      </section>
    </div>
  );
}
