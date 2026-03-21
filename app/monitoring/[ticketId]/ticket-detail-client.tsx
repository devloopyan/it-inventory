"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import FileUploadCard from "@/app/hardware-inventory/file-upload-card";
import {
  MONITORING_APPROVAL_REFERENCES,
  MONITORING_BORROWING_REQUEST_CATEGORY,
  MONITORING_BORROW_CONDITION_OPTIONS,
  MONITORING_CLOSE_REASONS,
  MONITORING_PENDING_REASONS,
  MONITORING_IMPACT_OPTIONS,
  MONITORING_MEETING_MODES,
  MONITORING_MEETING_REQUEST_CATEGORY,
  MONITORING_URGENCY_OPTIONS,
  getMeetingRequestStatusOptions,
  getMonitoringStatusOptions,
  isMonitoringApprovalReference,
  isMonitoringWorkflowType,
  normalizeMeetingRequestStatusValue,
  type MonitoringApprovalReference,
} from "@/lib/monitoring";

type TicketDetailClientProps = {
  ticketId: Id<"monitoringTickets">;
  actorName: string;
};

type EditableMeetingAsset = {
  assetId: string;
  assetTag: string;
  assetLabel: string;
};

const MEETING_PROGRESS_STEPS = ["New", "Reserved", "Ready", "Done"] as const;

const textareaStyle = {
  minHeight: 88,
  paddingTop: 10,
  paddingBottom: 10,
  resize: "vertical" as const,
};

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

function formatShortDate(value?: number) {
  if (!value) return "Uploaded recently";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatFileSize(bytes?: number) {
  if (!Number.isFinite(bytes) || !bytes || bytes <= 0) return "File";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded =
    unitIndex === 0 ? Math.round(value).toString() : value >= 10 ? value.toFixed(1).replace(/\.0$/, "") : value.toFixed(1).replace(/\.0$/, "");

  return `${rounded} ${units[unitIndex]}`;
}

function toDateTimeLocalValue(value?: number) {
  if (!value) return "";
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return "";
  const offsetMs = next.getTimezoneOffset() * 60 * 1000;
  return new Date(next.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toTimestamp(value: string) {
  if (!value) return undefined;
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return undefined;
  return next.getTime();
}

function formatDateTimeInput(value: string, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "";
  const next = new Date(value);
  if (Number.isNaN(next.getTime())) return "";
  return next.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
}

function formatMeetingScheduleValue(start: string, end: string) {
  const startLabel = formatDateTimeInput(start);
  if (!end) return startLabel;
  return `${startLabel} to ${formatDateTimeInput(end)}`;
}

function getEditableMeetingTitle(title: string, meetingStartAt?: number) {
  const withoutPrefix = title.replace(/^Meeting Support\s*-\s*/i, "").trim();
  const startLabel = meetingStartAt ? formatDateTime(meetingStartAt) : "";
  if (startLabel && withoutPrefix.endsWith(` - ${startLabel}`)) {
    return withoutPrefix.slice(0, -(` - ${startLabel}`.length)).trim();
  }
  return withoutPrefix;
}

function extractMeetingSupportNotes(requestDetails?: string) {
  if (!requestDetails) return "";
  const noteLine = requestDetails
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^Additional notes:/i.test(line));
  return noteLine ? noteLine.replace(/^Additional notes:\s*/i, "").trim().replace(/\.$/, "") : "";
}

function buildMeetingRequestTitle(meetingTitle: string, meetingStart: string) {
  return `Meeting Support - ${meetingTitle} - ${formatDateTimeInput(meetingStart, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function buildMeetingRequestDetails(params: {
  meetingTitle: string;
  meetingStart: string;
  meetingEnd: string;
  meetingMode: string;
  meetingLocation: string;
  meetingAttendeeCount: string;
  supportNotes: string;
  meetingAssets: EditableMeetingAsset[];
}) {
  return [
    `Meeting support requested for "${params.meetingTitle}".`,
    `Schedule: ${formatMeetingScheduleValue(params.meetingStart, params.meetingEnd)}.`,
    `${params.meetingMode} meeting at ${params.meetingLocation}.`,
    `Expected attendees: ${params.meetingAttendeeCount}.`,
    params.meetingAssets.length
      ? `Reserved assets: ${params.meetingAssets.map((item) => `${item.assetTag} | ${item.assetLabel}`).join(", ")}.`
      : undefined,
    params.supportNotes ? `Additional notes: ${params.supportNotes}.` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatMeetingAssetLabel(asset: {
  assetNameDescription?: string;
  assetType?: string;
  serialNumber?: string;
}) {
  const base = asset.assetNameDescription ?? asset.assetType ?? "Asset";
  return asset.serialNumber ? `${base} | ${asset.serialNumber}` : base;
}

function normalizeMeetingRequestStatus(status: string) {
  return normalizeMeetingRequestStatusValue(status) ?? "New";
}

function getMeetingProgress(status: string) {
  const normalized = normalizeMeetingRequestStatus(status);
  const stepIndex = MEETING_PROGRESS_STEPS.indexOf(normalized as (typeof MEETING_PROGRESS_STEPS)[number]);
  const currentIndex = stepIndex >= 0 ? stepIndex : MEETING_PROGRESS_STEPS.length - 1;
  return {
    currentLabel: normalized,
    currentIndex,
    percent: Math.round(((currentIndex + 1) / MEETING_PROGRESS_STEPS.length) * 100),
  };
}

function getChipStyle(status: string) {
  switch (status) {
    case "P1":
    case "For Revision":
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

function getMeetingStatusSelectStyle(status: string) {
  const style = getChipStyle(status);
  return {
    borderColor: style.borderColor,
    backgroundColor: style.background,
    color: style.color,
    fontWeight: 700,
  } as const;
}

function resolveFileBadgeLabel(fileName: string, contentType?: string) {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.trim().toUpperCase() : "";
  if (extension && extension.length <= 4) return extension;

  if (contentType?.startsWith("image/")) return "IMG";
  if (contentType?.startsWith("video/")) return "VID";
  if (contentType?.startsWith("audio/")) return "AUD";
  if (contentType === "application/pdf") return "PDF";
  return "FILE";
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

function FieldBlock(props: { label: string; children: ReactNode }) {
  return (
    <div className="monitoring-detail-field-block">
      <div className="monitoring-detail-field-label">{props.label}</div>
      {props.children}
    </div>
  );
}

function DetailCard(props: { label: string; value?: ReactNode }) {
  return (
    <div className="monitoring-detail-card">
      <div className="monitoring-detail-card-label">{props.label}</div>
      <div className="monitoring-detail-card-value">{props.value ?? "-"}</div>
    </div>
  );
}

function MeetingSummaryRow(props: { label: string; value?: ReactNode; icon: ReactNode }) {
  return (
    <div className="monitoring-detail-summary-row">
      <span className="monitoring-detail-summary-icon" aria-hidden="true">
        {props.icon}
      </span>
      <div className="monitoring-detail-summary-row-copy">
        <span className="monitoring-detail-summary-row-label">{props.label}</span>
        <span className="monitoring-detail-summary-row-value">{props.value ?? "-"}</span>
      </div>
    </div>
  );
}

function MeetingAssetLookup(props: {
  query: string;
  disabled?: boolean;
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
    if (!open || props.disabled) return undefined;

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
  }, [open, props.disabled]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        className="input-base"
        placeholder="Type asset tag, name, or serial number"
        value={props.query}
        disabled={props.disabled}
        onFocus={() => {
          if (!props.disabled) {
            setOpen(true);
          }
        }}
        onChange={(event) => {
          props.onQueryChange(event.target.value);
          if (!props.disabled) {
            setOpen(true);
          }
        }}
      />
      {open && !props.disabled ? (
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
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{formatMeetingAssetLabel(asset)}</span>
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

function MeetingRequestSummaryCard(props: {
  heading?: string;
  embedded?: boolean;
  requesterName?: string;
  requesterSection?: string;
  requesterDepartment?: string;
  createdAt?: number;
  meetingMode?: string;
  meetingStartAt?: number;
  meetingEndAt?: number;
  meetingLocation?: string;
  meetingAttendeeCount?: string;
  reservedAssetsCount?: number;
  assetItems?: Array<{
    assetId: string;
    assetTag: string;
    assetLabel: string;
  }>;
}) {
  const schedule =
    props.meetingStartAt && props.meetingEndAt
      ? `${formatDateTime(props.meetingStartAt)} to ${formatDateTime(props.meetingEndAt)}`
      : props.meetingStartAt
        ? formatDateTime(props.meetingStartAt)
        : "-";

  return (
    <div
      className={`monitoring-detail-summary-card monitoring-detail-summary-card-meeting${props.embedded ? " monitoring-detail-summary-card-embedded" : ""}`}
    >
      {props.heading ? <div className="type-section-title monitoring-detail-summary-heading">{props.heading}</div> : null}
      <div className="monitoring-detail-summary-top">
        <div className="monitoring-detail-summary-badge" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M6.25 3.75V5.25M13.75 3.75V5.25M4.583 7.333H15.417M5.417 5.25H14.583C15.503 5.25 16.25 5.996 16.25 6.917V14.583C16.25 15.504 15.503 16.25 14.583 16.25H5.417C4.496 16.25 3.75 15.504 3.75 14.583V6.917C3.75 5.996 4.496 5.25 5.417 5.25Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="monitoring-detail-summary-copy">
          <span className="monitoring-detail-summary-eyebrow">Requester</span>
          <strong className="monitoring-detail-summary-title">{props.requesterName || "-"}</strong>
          <span className="monitoring-detail-summary-subtitle">{formatDateTime(props.createdAt)}</span>
        </div>
        <div className="monitoring-detail-summary-highlight">
          <span className="monitoring-detail-summary-highlight-label">Department</span>
          <strong className="monitoring-detail-summary-highlight-value">{props.requesterDepartment || "-"}</strong>
        </div>
      </div>

      <div className="monitoring-detail-summary-list">
        <MeetingSummaryRow
          label="Section"
          value={props.requesterSection}
          icon={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2.667L13 5.333L8 8L3 5.333L8 2.667ZM3 8L8 10.667L13 8M3 10.667L8 13.333L13 10.667"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
        />
      </div>

      <div className="monitoring-detail-summary-subsection">
        <div className="monitoring-detail-summary-top monitoring-detail-summary-top-compact">
          <div className="monitoring-detail-summary-copy">
            <span className="monitoring-detail-summary-eyebrow">Meeting Mode</span>
            <strong className="monitoring-detail-summary-title">{props.meetingMode || "-"}</strong>
            <span className="monitoring-detail-summary-subtitle">{schedule}</span>
          </div>
          <div className="monitoring-detail-summary-highlight">
            <span className="monitoring-detail-summary-highlight-label">Attendees</span>
            <strong className="monitoring-detail-summary-highlight-value">{props.meetingAttendeeCount || "-"}</strong>
          </div>
        </div>

        <div className="monitoring-detail-summary-list">
          <MeetingSummaryRow
            label="Location / Platform"
            value={props.meetingLocation}
            icon={
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 13C10.333 10.333 11.5 8.333 11.5 7C11.5 5.067 9.933 3.5 8 3.5C6.067 3.5 4.5 5.067 4.5 7C4.5 8.333 5.667 10.333 8 13Z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="8" cy="7" r="1.25" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            }
          />
          {props.reservedAssetsCount ? (
            <MeetingSummaryRow
              label="Reserved Assets"
              value={`${props.reservedAssetsCount} reserved`}
              icon={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 5.333L8 2.667L13 5.333M3 5.333V10.667L8 13.333M3 5.333L8 8M13 5.333V10.667L8 13.333M13 5.333L8 8M8 8V13.333"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            />
          ) : null}
        </div>
      </div>
      {props.assetItems?.length ? (
        <div className="monitoring-detail-summary-assets">
          <div className="monitoring-detail-summary-assets-label">Reserved Asset List</div>
          <div className="monitoring-detail-summary-assets-list">
            {props.assetItems.map((item, index) => (
              <div key={`${item.assetId}-${index}`} className="monitoring-detail-summary-asset-row">
                <div className="monitoring-detail-inline-copy">
                  <strong>{item.assetTag}</strong>
                  <span className="monitoring-detail-list-meta">{item.assetLabel}</span>
                </div>
                <Link href={`/hardware-inventory/${item.assetId}`} className="btn-secondary monitoring-detail-inline-action">
                  Open Asset
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TicketDetailClient({ ticketId, actorName }: TicketDetailClientProps) {
  const router = useRouter();
  const detail = useQuery(api.monitoring.getById, { ticketId });
  const assets = useQuery(api.hardwareInventory.listAll, {});
  const updateTicket = useMutation(api.monitoring.updateTicket);
  const deleteTicket = useMutation(api.monitoring.deleteTicket);
  const removeTicketAttachment = useMutation(api.monitoring.removeTicketAttachment);
  const submitForApproval = useMutation(api.monitoring.submitForApproval);
  const recordApprovalDecision = useMutation(api.monitoring.recordApprovalDecision);
  const generateUploadUrl = useMutation(api.monitoring.generateUploadUrl);
  const [status, setStatus] = useState("");
  const [impact, setImpact] = useState("");
  const [urgency, setUrgency] = useState("");
  const [pendingReason, setPendingReason] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [fulfillmentNote, setFulfillmentNote] = useState("");
  const [causeActionTaken, setCauseActionTaken] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [assetId, setAssetId] = useState("");
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const [borrowingItems, setBorrowingItems] = useState<
    Array<{
      assetId: string;
      assetTag: string;
      assetLabel: string;
      releaseCondition: string;
      returnCondition: string;
      returnedAt: string;
    }>
  >([]);
  const [majorIncident, setMajorIncident] = useState(false);
  const [approvalReference, setApprovalReference] = useState<MonitoringApprovalReference>(
    MONITORING_APPROVAL_REFERENCES[0],
  );
  const [approvalNote, setApprovalNote] = useState("");
  const [incidentReportFile, setIncidentReportFile] = useState<File | null>(null);
  const [meetingRecordingFile, setMeetingRecordingFile] = useState<File | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [meetingRequesterName, setMeetingRequesterName] = useState("");
  const [meetingRequesterSection, setMeetingRequesterSection] = useState("");
  const [meetingRequesterDepartment, setMeetingRequesterDepartment] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingMode, setMeetingMode] = useState<(typeof MONITORING_MEETING_MODES)[number]>(MONITORING_MEETING_MODES[0]);
  const [meetingStart, setMeetingStart] = useState("");
  const [meetingEnd, setMeetingEnd] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [meetingAttendeeCount, setMeetingAttendeeCount] = useState("");
  const [meetingSupportNotes, setMeetingSupportNotes] = useState("");
  const [meetingAssets, setMeetingAssets] = useState<EditableMeetingAsset[]>([]);
  const [meetingAssetSearch, setMeetingAssetSearch] = useState("");
  const [isMeetingEditing, setIsMeetingEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const incidentReportRef = useRef<HTMLInputElement | null>(null);
  const meetingRecordingRef = useRef<HTMLInputElement | null>(null);
  const attachmentRef = useRef<HTMLInputElement | null>(null);
  const meetingDetailsSectionRef = useRef<HTMLElement | null>(null);
  const meetingTitleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!detail?.ticket) return;
    setStatus(detail.ticket.status);
    setImpact(detail.ticket.impact ?? "");
    setUrgency(detail.ticket.urgency ?? "");
    setPendingReason(detail.ticket.pendingReason ?? "");
    setCloseReason(detail.ticket.closeReason ?? "");
    setResolutionNote(detail.ticket.resolutionNote ?? "");
    setFulfillmentNote(detail.ticket.fulfillmentNote ?? "");
    setCauseActionTaken(detail.ticket.causeActionTaken ?? "");
    setRevisionReason(detail.ticket.revisionReason ?? "");
    setAssetId(detail.ticket.assetId ? String(detail.ticket.assetId) : "");
    setExpectedReturnAt(toDateTimeLocalValue(detail.ticket.expectedReturnAt));
    setBorrowingItems(
      (detail.ticket.borrowingItems ?? []).map((item) => ({
        assetId: String(item.assetId),
        assetTag: item.assetTag,
        assetLabel: item.assetLabel,
        releaseCondition: item.releaseCondition,
        returnCondition: item.returnCondition ?? "",
        returnedAt: toDateTimeLocalValue(item.returnedAt),
      })),
    );
    setMajorIncident(detail.ticket.majorIncident);
    const nextMeetingMode = (MONITORING_MEETING_MODES as readonly string[]).includes(detail.ticket.meetingMode ?? "")
      ? (detail.ticket.meetingMode as (typeof MONITORING_MEETING_MODES)[number])
      : MONITORING_MEETING_MODES[0];
    setMeetingRequesterName(detail.ticket.requesterName ?? "");
    setMeetingRequesterSection(detail.ticket.requesterSection ?? "");
    setMeetingRequesterDepartment(detail.ticket.requesterDepartment ?? "");
    setMeetingTitle(getEditableMeetingTitle(detail.ticket.title, detail.ticket.meetingStartAt));
    setMeetingMode(nextMeetingMode);
    setMeetingStart(toDateTimeLocalValue(detail.ticket.meetingStartAt));
    setMeetingEnd(toDateTimeLocalValue(detail.ticket.meetingEndAt));
    setMeetingLocation(detail.ticket.meetingLocation ?? "");
    setMeetingAttendeeCount(detail.ticket.meetingAttendeeCount ?? "");
    setMeetingSupportNotes(extractMeetingSupportNotes(detail.ticket.requestDetails));
    setMeetingAssets(
      (detail.ticket.meetingAssetItems ?? []).map((item) => ({
        assetId: String(item.assetId),
        assetTag: item.assetTag,
        assetLabel: item.assetLabel,
      })),
    );
    setMeetingAssetSearch("");
    setIsMeetingEditing(false);
  }, [detail]);

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

  async function handleSave() {
    if (!detail?.ticket) return;
    const isMeetingRequest =
      detail.ticket.category === MONITORING_MEETING_REQUEST_CATEGORY ||
      Boolean(detail.ticket.meetingStartAt || detail.ticket.meetingLocation);
    const isBorrowingRequest =
      detail.ticket.category === MONITORING_BORROWING_REQUEST_CATEGORY || Boolean(detail.ticket.borrowingItems?.length);
    setSaving(true);
    setFeedback("");

    try {
      const incidentReportStorageId = incidentReportFile
        ? await uploadFileToStorage(incidentReportFile, "Incident report upload failed.")
        : undefined;
      const meetingRecordingStorageId = meetingRecordingFile
        ? await uploadFileToStorage(meetingRecordingFile, "Meeting recording upload failed.")
        : undefined;
      const attachmentStorageId = attachmentFile
        ? await uploadFileToStorage(attachmentFile, "Attachment upload failed.")
        : undefined;

      if (
        isMeetingRequest &&
        status === "Done" &&
        !meetingRecordingStorageId &&
        !detail.ticket.attachments.some((attachment) => attachment.kind === "Meeting Recording")
      ) {
        throw new Error("Attach the meeting recording before marking the meeting done.");
      }

      const nextStatus = isMeetingRequest ? normalizeMeetingRequestStatus(status) : status;
      const nextMeetingStartAt = isMeetingRequest ? toTimestamp(meetingStart) : undefined;
      const nextMeetingEndAt = isMeetingRequest ? toTimestamp(meetingEnd) : undefined;
      const trimmedMeetingTitle = meetingTitle.trim();
      const trimmedMeetingRequesterName = meetingRequesterName.trim();
      const trimmedMeetingLocation = meetingLocation.trim();
      const trimmedMeetingAttendeeCount = meetingAttendeeCount.trim();
      const trimmedMeetingSupportNotes = meetingSupportNotes.trim();

      if (isMeetingRequest) {
        if (!trimmedMeetingRequesterName) {
          throw new Error("Requester name is required.");
        }
        if (!trimmedMeetingTitle) {
          throw new Error("Meeting title is required.");
        }
        if (!nextMeetingStartAt) {
          throw new Error("Meeting start is required.");
        }
        if (nextMeetingEndAt && nextMeetingEndAt <= nextMeetingStartAt) {
          throw new Error("Meeting end must be after the meeting start.");
        }
        if (!trimmedMeetingLocation) {
          throw new Error("Location / platform is required.");
        }
        if (!trimmedMeetingAttendeeCount) {
          throw new Error("Expected attendees is required.");
        }
      }

      const nextMeetingTitle = isMeetingRequest ? buildMeetingRequestTitle(trimmedMeetingTitle, meetingStart) : undefined;
      const nextMeetingDetails = isMeetingRequest
        ? buildMeetingRequestDetails({
            meetingTitle: trimmedMeetingTitle,
            meetingStart,
            meetingEnd,
            meetingMode,
            meetingLocation: trimmedMeetingLocation,
            meetingAttendeeCount: trimmedMeetingAttendeeCount,
            supportNotes: trimmedMeetingSupportNotes,
            meetingAssets,
          })
        : undefined;

      await updateTicket({
        ticketId,
        actorName,
        ...(isMeetingRequest
          ? {
              title: nextMeetingTitle,
              requestDetails: nextMeetingDetails,
              requesterName: trimmedMeetingRequesterName,
              requesterSection: meetingRequesterSection.trim() || undefined,
              requesterDepartment: meetingRequesterDepartment.trim() || undefined,
              meetingMode,
              meetingLocation: trimmedMeetingLocation,
              meetingStartAt: nextMeetingStartAt,
              meetingEndAt: nextMeetingEndAt,
              meetingAttendeeCount: trimmedMeetingAttendeeCount,
              meetingAssetIds: meetingAssets.map((item) => item.assetId as Id<"hardwareInventory">),
            }
          : {}),
        status: nextStatus,
        ...(!isMeetingRequest && !isBorrowingRequest ? { impact, urgency } : {}),
        pendingReason: pendingReason || undefined,
        closeReason: closeReason || undefined,
        resolutionNote: resolutionNote || undefined,
        fulfillmentNote: fulfillmentNote || undefined,
        causeActionTaken: causeActionTaken || undefined,
        revisionReason: revisionReason || undefined,
        majorIncident: isMeetingRequest ? false : majorIncident,
        ...(isBorrowingRequest
          ? {
              expectedReturnAt: expectedReturnAt ? toTimestamp(expectedReturnAt) : undefined,
              borrowingItems: borrowingItems.length
                ? borrowingItems.map((item) => ({
                    assetId: item.assetId as Id<"hardwareInventory">,
                    releaseCondition: item.releaseCondition,
                    returnCondition: item.returnCondition || undefined,
                    returnedAt: toTimestamp(item.returnedAt),
                  }))
                : undefined,
            }
          : {
              assetId: assetId ? (assetId as Id<"hardwareInventory">) : undefined,
              clearAssetLink: !assetId,
            }),
        incidentReportStorageId,
        attachments: [
          ...(meetingRecordingStorageId
            ? [
                {
                  kind: "Meeting Recording",
                  label: "Meeting recording",
                  fileName: meetingRecordingFile?.name ?? "Meeting recording",
                  contentType: meetingRecordingFile?.type || undefined,
                  storageId: meetingRecordingStorageId,
                  uploadedBy: actorName,
                },
              ]
            : []),
          ...(attachmentStorageId
            ? [
                {
                  kind: "General",
                  label: "Supporting attachment",
                  fileName: attachmentFile?.name ?? "Attachment",
                  contentType: attachmentFile?.type || undefined,
                  storageId: attachmentStorageId,
                  uploadedBy: actorName,
                },
              ]
            : []),
        ],
      });

      setIncidentReportFile(null);
      setMeetingRecordingFile(null);
      setAttachmentFile(null);
      setMeetingAssetSearch("");
      setIsMeetingEditing(false);
      setFeedback(isMeetingRequest ? "Meeting request updated." : isBorrowingRequest ? "Borrowing request updated." : "Ticket updated.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!detail?.ticket) return;
    const ticket = detail.ticket;
    const isMeetingRequest =
      ticket.category === MONITORING_MEETING_REQUEST_CATEGORY || Boolean(ticket.meetingStartAt || ticket.meetingLocation);

    if (!isMeetingRequest) {
      setFeedback("Only meeting requests can be deleted from this view.");
      return;
    }

    const confirmed = window.confirm(`Delete meeting request ${ticket.ticketNumber}? This action cannot be undone.`);
    if (!confirmed) return;

    setSaving(true);
    setFeedback("");

    try {
      await deleteTicket({ ticketId, actorName });
      router.push("/monitoring?tab=meetings");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Delete failed.");
      setSaving(false);
    }
  }

  function handleBackToMeetingRequests() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/monitoring?tab=meetings");
  }

  function handleEditDetails() {
    setIsMeetingEditing(true);
    meetingDetailsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => {
      meetingTitleInputRef.current?.focus();
    });
  }

  function handleCancelMeetingEdit() {
    if (!detail?.ticket) return;
    const ticket = detail.ticket;
    const nextMeetingMode = (MONITORING_MEETING_MODES as readonly string[]).includes(ticket.meetingMode ?? "")
      ? (ticket.meetingMode as (typeof MONITORING_MEETING_MODES)[number])
      : MONITORING_MEETING_MODES[0];
    setStatus(ticket.status);
    setCloseReason(ticket.closeReason ?? "");
    setFulfillmentNote(ticket.fulfillmentNote ?? "");
    setMeetingRequesterName(ticket.requesterName ?? "");
    setMeetingRequesterSection(ticket.requesterSection ?? "");
    setMeetingRequesterDepartment(ticket.requesterDepartment ?? "");
    setMeetingTitle(getEditableMeetingTitle(ticket.title, ticket.meetingStartAt));
    setMeetingMode(nextMeetingMode);
    setMeetingStart(toDateTimeLocalValue(ticket.meetingStartAt));
    setMeetingEnd(toDateTimeLocalValue(ticket.meetingEndAt));
    setMeetingLocation(ticket.meetingLocation ?? "");
    setMeetingAttendeeCount(ticket.meetingAttendeeCount ?? "");
    setMeetingSupportNotes(extractMeetingSupportNotes(ticket.requestDetails));
    setMeetingAssets(
      (ticket.meetingAssetItems ?? []).map((item) => ({
        assetId: String(item.assetId),
        assetTag: item.assetTag,
        assetLabel: item.assetLabel,
      })),
    );
    setMeetingAssetSearch("");
    setIsMeetingEditing(false);
  }

  async function handleRemoveAttachment(storageId: Id<"_storage">) {
    if (!detail?.ticket) return;

    const confirmed = window.confirm("Remove this attachment?");
    if (!confirmed) return;

    setSaving(true);
    setFeedback("");

    try {
      await removeTicketAttachment({ ticketId, storageId, actorName });
      setFeedback("Attachment removed.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Attachment removal failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitForApproval() {
    setSaving(true);
    setFeedback("");
    try {
      await submitForApproval({ ticketId, actorName });
      setFeedback("Request submitted for approval.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Approval submission failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprovalDecision(decision: "Approved" | "For Revision") {
    if (!detail?.ticket) return;
    const approver =
      detail.ticket.approvalStage === "Pending IT Team Leader" ? "IT Team Leader" : "OSMD Manager";

    setSaving(true);
    setFeedback("");
    try {
      await recordApprovalDecision({
        ticketId,
        approver,
        decision,
        reference: approvalReference,
        note: approvalNote || revisionReason || "Recorded by IT.",
        actorName,
      });
      setApprovalNote("");
      setFeedback(`${approver} decision recorded.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Approval recording failed.");
    } finally {
      setSaving(false);
    }
  }

  if (detail === undefined) {
    return (
      <div className="monitoring-page monitoring-detail-page">
        <div className="panel monitoring-detail-state">Loading ticket...</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="monitoring-page monitoring-detail-page">
        <div className="panel monitoring-detail-state">Ticket not found.</div>
      </div>
    );
  }

  const { ticket, asset, approvalHistory, attachments, incidentReportUrl } = detail;
  const workflowType = isMonitoringWorkflowType(ticket.workflowType) ? ticket.workflowType : "incident";
  const isMeetingRequest =
    ticket.category === MONITORING_MEETING_REQUEST_CATEGORY || Boolean(ticket.meetingStartAt || ticket.meetingLocation);
  const isBorrowingRequest =
    ticket.category === MONITORING_BORROWING_REQUEST_CATEGORY || Boolean(ticket.borrowingItems?.length);
  const isInternetLog = ticket.workflowType === "internetOutage";
  const ticketTypeLabel = isMeetingRequest ? "Meeting Request" : isBorrowingRequest ? "Borrowing Request" : ticket.workType;
  const detailSectionTitle = isMeetingRequest
    ? "Meeting Request"
    : isBorrowingRequest
      ? "Borrowing Request"
      : isInternetLog
        ? "Internet Log"
        : "Work Ticket";
  const displayTitle = isMeetingRequest ? getEditableMeetingTitle(ticket.title, ticket.meetingStartAt) : ticket.title;
  const meetingRecordingAttachment = attachments.find((attachment) => attachment.kind === "Meeting Recording");
  const supportingAttachments = attachments.filter((attachment) => attachment.kind !== "Meeting Recording");
  const selectedStatus = isMeetingRequest ? normalizeMeetingRequestStatus(status) : status;
  const meetingProgress = isMeetingRequest ? getMeetingProgress(selectedStatus) : null;
  const statusOptions = isMeetingRequest
    ? [...getMeetingRequestStatusOptions(), ...(selectedStatus === "Closed" ? ["Closed" as const] : [])]
    : getMonitoringStatusOptions(workflowType);
  const detailMetaItems = isMeetingRequest
    ? [`Updated ${formatDateTime(ticket.updatedAt)}`]
    : [ticketTypeLabel, ticket.category, `Updated ${formatDateTime(ticket.updatedAt)}`];
  const snapshotTitle = isInternetLog ? "Log Summary" : "Request Snapshot";
  const selectedMeetingAssetIds = new Set(meetingAssets.map((item) => item.assetId));
  const meetingAssetSearchTerm = meetingAssetSearch.trim().toLowerCase();
  const meetingAssetOptions = (assets ?? [])
    .filter((assetRow) => !selectedMeetingAssetIds.has(String(assetRow._id)))
    .filter((assetRow) => (assetRow.locationPersonAssigned ?? assetRow.location ?? "") === "MAIN STORAGE")
    .filter((assetRow) => ["Available", "Working"].includes(String(assetRow.status ?? "")))
    .filter((assetRow) => assetRow.reservationStatus !== "Reserved")
    .filter((assetRow) => {
      if (!meetingAssetSearchTerm) return true;
      return [
        assetRow.assetTag,
        assetRow.assetNameDescription,
        assetRow.assetType,
        assetRow.serialNumber,
        assetRow.status,
      ].some((value) => String(value ?? "").toLowerCase().includes(meetingAssetSearchTerm));
    })
    .sort((left, right) => {
      if ((left.status === "Available") !== (right.status === "Available")) {
        return left.status === "Available" ? -1 : 1;
      }
      return String(left.assetTag ?? "").localeCompare(String(right.assetTag ?? ""));
    })
    .slice(0, 8);
  const canSubmitApproval =
    !isMeetingRequest &&
    workflowType === "serviceRequest" &&
    ticket.approvalRequired &&
    (ticket.approvalStage === "Not Submitted" || ticket.approvalStage === "For Revision");
  const canRecordApproval =
    !isMeetingRequest &&
    (ticket.approvalStage === "Pending IT Team Leader" || ticket.approvalStage === "Pending OSMD Manager");

  return (
    <div className="monitoring-page monitoring-detail-page">
      <section className="panel monitoring-detail-shell">
        <header className="monitoring-detail-header">
          <div className="monitoring-detail-header-main">
            {isMeetingRequest ? (
              <div className="monitoring-detail-header-icon-actions">
                <button
                  type="button"
                  className="asset-action-btn"
                  onClick={handleBackToMeetingRequests}
                  aria-label="Back to Meeting Requests"
                  title="Back to Meeting Requests"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M15 6L9 12L15 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  className="asset-action-btn asset-action-btn-primary"
                  onClick={handleEditDetails}
                  type="button"
                  aria-label="Edit Meeting Details"
                  title="Edit Meeting Details"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 20H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path
                      d="M16.5 3.5C17.3284 2.67157 18.6716 2.67157 19.5 3.5C20.3284 4.32843 20.3284 5.67157 19.5 6.5L7 19L3 20L4 16L16.5 3.5Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  className="asset-action-btn asset-action-btn-danger"
                  onClick={() => void handleDelete()}
                  type="button"
                  aria-label={saving ? "Deleting Request" : "Delete Request"}
                  title={saving ? "Deleting Request" : "Delete Request"}
                  disabled={saving}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 7H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M10 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M14 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path
                      d="M6 7L7 19C7.05 19.6 7.55 20 8.15 20H15.85C16.45 20 16.95 19.6 17 19L18 7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M9 7V4.8C9 4.36 9.36 4 9.8 4H14.2C14.64 4 15 4.36 15 4.8V7" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
              </div>
            ) : (
              <Link href="/monitoring" className="btn-secondary monitoring-detail-back">
                Back to Monitoring
              </Link>
            )}
            <div className="monitoring-detail-title-stack">
              <div className="monitoring-detail-title-row">
                <h1 className="type-page-title">{displayTitle}</h1>
                <Chip label={ticket.ticketNumber} />
                <Chip label={selectedStatus || ticket.status} />
                {ticket.priority ? <Chip label={ticket.priority} /> : null}
              </div>
              <div className="monitoring-detail-meta">
                {detailMetaItems.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="monitoring-detail-header-actions">
            {!isMeetingRequest && ticket.incidentReportRequired && !ticket.incidentReportAttached ? (
              <Chip label="Incident Report Pending" />
            ) : null}
            {!isMeetingRequest && !isBorrowingRequest && ticket.assetId && asset ? (
              <Link href={`/hardware-inventory/${asset._id}`} className="btn-secondary">
                Open Linked Asset
              </Link>
            ) : null}
          </div>
        </header>

        {feedback ? <div className="monitoring-detail-feedback">{feedback}</div> : null}

        <div className="monitoring-detail-body">
          <main className="monitoring-detail-main">
            <section ref={isMeetingRequest ? meetingDetailsSectionRef : undefined} className="monitoring-detail-section">
              <div className="type-section-title">{detailSectionTitle}</div>
              <div className="monitoring-detail-field-grid">
                <FieldBlock label="Status">
                  <select
                    disabled={isMeetingRequest ? !isMeetingEditing : false}
                    className={`input-base${isMeetingRequest ? " status-select" : ""}`}
                    value={selectedStatus}
                    style={isMeetingRequest ? getMeetingStatusSelectStyle(selectedStatus) : undefined}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </FieldBlock>
                {isMeetingRequest ? (
                  <>
                    <FieldBlock label="Requester Name">
                      <input
                        className="input-base"
                        value={meetingRequesterName}
                        disabled={!isMeetingEditing}
                        onChange={(event) => setMeetingRequesterName(event.target.value)}
                      />
                    </FieldBlock>
                    <FieldBlock label="Section">
                      <input
                        className="input-base"
                        value={meetingRequesterSection}
                        disabled={!isMeetingEditing}
                        onChange={(event) => setMeetingRequesterSection(event.target.value)}
                      />
                    </FieldBlock>
                    <FieldBlock label="Department">
                      <input
                        className="input-base"
                        value={meetingRequesterDepartment}
                        disabled={!isMeetingEditing}
                        onChange={(event) => setMeetingRequesterDepartment(event.target.value)}
                      />
                    </FieldBlock>
                    <FieldBlock label="Meeting Title / Purpose">
                      <input
                        className="input-base"
                        ref={meetingTitleInputRef}
                        value={meetingTitle}
                        disabled={!isMeetingEditing}
                        onChange={(event) => setMeetingTitle(event.target.value)}
                      />
                    </FieldBlock>
                    <FieldBlock label="Meeting Mode">
                      <select
                        className="input-base"
                        value={meetingMode}
                        disabled={!isMeetingEditing}
                        onChange={(event) => setMeetingMode(event.target.value as (typeof MONITORING_MEETING_MODES)[number])}
                      >
                        {MONITORING_MEETING_MODES.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode}
                          </option>
                        ))}
                      </select>
                    </FieldBlock>
                    <FieldBlock label="Meeting Start">
                      <input
                        className="input-base"
                        type="datetime-local"
                        value={meetingStart}
                        disabled={!isMeetingEditing}
                        onChange={(event) => setMeetingStart(event.target.value)}
                      />
                    </FieldBlock>
                    <FieldBlock label="Meeting End">
                      <input
                        className="input-base"
                        type="datetime-local"
                        value={meetingEnd}
                        disabled={!isMeetingEditing}
                        onChange={(event) => setMeetingEnd(event.target.value)}
                      />
                    </FieldBlock>
                    <FieldBlock label="Location / Platform">
                      <input
                        className="input-base"
                        value={meetingLocation}
                        disabled={!isMeetingEditing}
                        onChange={(event) => setMeetingLocation(event.target.value)}
                      />
                    </FieldBlock>
                    <FieldBlock label="Expected Attendees">
                      <input
                        className="input-base"
                        value={meetingAttendeeCount}
                        disabled={!isMeetingEditing}
                        onChange={(event) => setMeetingAttendeeCount(event.target.value)}
                      />
                    </FieldBlock>
                  </>
                ) : null}
                {!isMeetingRequest && !isBorrowingRequest ? (
                  <>
                    <FieldBlock label="Impact">
                      <select className="input-base" value={impact} onChange={(event) => setImpact(event.target.value)}>
                        {MONITORING_IMPACT_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </FieldBlock>
                    <FieldBlock label="Urgency">
                      <select className="input-base" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
                        {MONITORING_URGENCY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </FieldBlock>
                  </>
                ) : null}
                {!isMeetingRequest && !isBorrowingRequest ? (
                  <FieldBlock label="Linked Asset">
                    <select className="input-base" value={assetId} onChange={(event) => setAssetId(event.target.value)}>
                      <option value="">No linked asset</option>
                      {(assets ?? []).map((row) => (
                        <option key={row._id} value={String(row._id)}>
                          {row.assetTag} | {row.assetNameDescription ?? row.assetType ?? "Asset"}
                        </option>
                      ))}
                    </select>
                  </FieldBlock>
                ) : null}
                {isBorrowingRequest ? (
                  <FieldBlock label="Expected Return">
                    <input
                      className="input-base"
                      type="datetime-local"
                      value={expectedReturnAt}
                      onChange={(event) => setExpectedReturnAt(event.target.value)}
                    />
                  </FieldBlock>
                ) : null}
                {status === "Pending" ? (
                  <FieldBlock label="Pending Reason">
                    <select className="input-base" value={pendingReason} onChange={(event) => setPendingReason(event.target.value)}>
                      <option value="">Select pending reason</option>
                      {MONITORING_PENDING_REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                  </FieldBlock>
                ) : null}
                {status === "Closed" ? (
                  <FieldBlock label="Close Reason">
                    <select className="input-base" value={closeReason} onChange={(event) => setCloseReason(event.target.value)}>
                      <option value="">Select close reason</option>
                      {MONITORING_CLOSE_REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                  </FieldBlock>
                  ) : null}
              </div>

              {isMeetingRequest ? (
                <FieldBlock label="Reserved Assets">
                  <div className="monitoring-detail-stack">
                    <MeetingAssetLookup
                      query={meetingAssetSearch}
                      disabled={!isMeetingEditing}
                      onQueryChange={setMeetingAssetSearch}
                      options={meetingAssetOptions}
                      onAddAsset={(assetRow) => {
                        setMeetingAssets((prev) => [
                          ...prev,
                          {
                            assetId: String(assetRow._id),
                            assetTag: assetRow.assetTag ?? "No Tag",
                            assetLabel: formatMeetingAssetLabel(assetRow),
                          },
                        ]);
                        setMeetingAssetSearch("");
                      }}
                    />
                    {meetingAssets.length ? (
                      <div className="monitoring-detail-list">
                        {meetingAssets.map((item, index) => (
                          <div key={`${item.assetId}-${index}`} className="monitoring-detail-list-card monitoring-detail-asset-panel">
                            <div className="monitoring-detail-row">
                              <div className="monitoring-detail-inline-copy">
                                <strong>{item.assetTag}</strong>
                                <span className="monitoring-detail-list-meta">{item.assetLabel}</span>
                              </div>
                              {isMeetingEditing ? (
                                <button
                                  type="button"
                                  className="btn-secondary monitoring-detail-inline-action"
                                  onClick={() =>
                                    setMeetingAssets((prev) => prev.filter((_, entryIndex) => entryIndex !== index))
                                  }
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="monitoring-detail-empty">No reserved assets added yet.</div>
                    )}
                  </div>
                </FieldBlock>
              ) : null}

              <div className="monitoring-detail-note-stack">
                {!isMeetingRequest ? (
                  <FieldBlock label="Resolution / Action Taken">
                    <textarea
                      className="input-base"
                      style={textareaStyle}
                      placeholder="Resolution / Action Taken"
                      value={resolutionNote}
                      onChange={(event) => setResolutionNote(event.target.value)}
                    />
                  </FieldBlock>
                ) : null}
                {isMeetingRequest ? (
                  <FieldBlock label="Additional Notes">
                    <textarea
                      className="input-base"
                      style={textareaStyle}
                      placeholder="Meeting agenda, setup timing, presenter needs, or any special handling."
                      value={meetingSupportNotes}
                      disabled={!isMeetingEditing}
                      onChange={(event) => setMeetingSupportNotes(event.target.value)}
                    />
                  </FieldBlock>
                ) : null}
                <FieldBlock label={isMeetingRequest ? "Fulfillment / Setup Note" : "Fulfillment Note"}>
                  <textarea
                    className="input-base"
                    style={textareaStyle}
                    placeholder={isMeetingRequest ? "Fulfillment / Setup Note" : "Fulfillment Note"}
                    value={fulfillmentNote}
                    disabled={isMeetingRequest ? !isMeetingEditing : false}
                    onChange={(event) => setFulfillmentNote(event.target.value)}
                  />
                </FieldBlock>
                {!isMeetingRequest ? (
                  <FieldBlock label="Cause / Action Taken">
                    <textarea
                      className="input-base"
                      style={textareaStyle}
                      placeholder="Cause / Action Taken"
                      value={causeActionTaken}
                      onChange={(event) => setCauseActionTaken(event.target.value)}
                    />
                  </FieldBlock>
                ) : null}
                {!isMeetingRequest && ticket.approvalStage === "For Revision" ? (
                  <FieldBlock label="Revision Reason">
                    <textarea
                      className="input-base"
                      style={textareaStyle}
                      placeholder="Revision Reason"
                      value={revisionReason}
                      onChange={(event) => setRevisionReason(event.target.value)}
                    />
                  </FieldBlock>
                ) : null}
              </div>

              {!isMeetingRequest ? (
                <label className="monitoring-detail-toggle">
                  <input type="checkbox" checked={majorIncident} onChange={(event) => setMajorIncident(event.target.checked)} />
                  <span>Major incident</span>
                </label>
              ) : null}

              <div className="monitoring-detail-actions">
                {isMeetingRequest && isMeetingEditing ? (
                  <button type="button" className="btn-secondary" disabled={saving} onClick={handleCancelMeetingEdit}>
                    Cancel
                  </button>
                ) : null}
                {canSubmitApproval ? (
                  <button type="button" className="btn-secondary" disabled={saving} onClick={() => void handleSubmitForApproval()}>
                    Submit for Approval
                  </button>
                ) : null}
                <button type="button" className="btn-primary" disabled={saving} onClick={() => void handleSave()}>
                  {saving ? "Saving..." : isMeetingRequest || isBorrowingRequest ? "Save Request" : "Save Ticket"}
                </button>
              </div>
            </section>

            <section className="monitoring-detail-section">
              <div className="type-subsection-title">{snapshotTitle}</div>
              <p className="monitoring-detail-copy">{ticket.requestSnapshot}</p>
            </section>
          </main>

          <aside className="monitoring-detail-side">
            {!isMeetingRequest ? (
              <section className="monitoring-detail-section monitoring-detail-section-compact">
                <div className="type-section-title">Record Summary</div>
                <div className="monitoring-detail-stack">
                  <DetailCard label="Requester" value={ticket.requesterName} />
                  <DetailCard label="Section" value={ticket.requesterSection} />
                  <DetailCard label="Department" value={ticket.requesterDepartment} />
                  <DetailCard label="Request Source" value={ticket.requestSource} />
                  <DetailCard label="Approval Stage" value={<Chip label={ticket.approvalStage} />} />
                  <DetailCard label="Created" value={formatDateTime(ticket.createdAt)} />
                </div>
              </section>
            ) : null}

          {!isMeetingRequest ? (
            <section className="monitoring-detail-section monitoring-detail-section-compact">
              <div className="type-section-title">Approvals</div>
              {canRecordApproval ? (
                <div className="monitoring-detail-stack">
                  <FieldBlock label="Reference">
                    <select
                      className="input-base"
                      value={approvalReference}
                      onChange={(event) => {
                        const nextReference = event.target.value;
                        if (isMonitoringApprovalReference(nextReference)) {
                          setApprovalReference(nextReference);
                        }
                      }}
                    >
                      {MONITORING_APPROVAL_REFERENCES.map((reference) => (
                        <option key={reference} value={reference}>
                          {reference}
                        </option>
                      ))}
                    </select>
                  </FieldBlock>
                  <FieldBlock label="Approval Note">
                    <textarea
                      className="input-base"
                      style={textareaStyle}
                      placeholder="Add note or revision reason"
                      value={approvalNote}
                      onChange={(event) => setApprovalNote(event.target.value)}
                    />
                  </FieldBlock>
                  <div className="monitoring-detail-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={saving}
                      onClick={() => void handleApprovalDecision("Approved")}
                    >
                      Record Approval
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      disabled={saving}
                      onClick={() => void handleApprovalDecision("For Revision")}
                    >
                      Return for Revision
                    </button>
                  </div>
                </div>
              ) : (
                <div className="monitoring-detail-empty">No approval action is waiting to be recorded.</div>
              )}

              <div className="monitoring-detail-list">
                {approvalHistory.map((entry) => (
                  <div key={entry._id} className="monitoring-detail-list-card">
                    <div className="monitoring-detail-row">
                      <strong>{entry.approver}</strong>
                      <Chip label={entry.decision} />
                    </div>
                    <div className="monitoring-detail-list-meta">{formatDateTime(entry.createdAt)}</div>
                    <div className="monitoring-detail-card-value">{entry.note || "-"}</div>
                    <div className="monitoring-detail-list-meta">{entry.reference || "-"}</div>
                  </div>
                ))}
                {!approvalHistory.length ? <div className="monitoring-detail-empty">No approval history yet.</div> : null}
              </div>
            </section>
          ) : null}

          {isMeetingRequest && meetingProgress ? (
            <section className="monitoring-detail-section monitoring-detail-section-compact">
              <div className="type-section-title">Progress</div>
              <div className="monitoring-detail-progress-stepper" aria-label="Meeting request progress">
                {MEETING_PROGRESS_STEPS.map((step, index) => (
                  <div
                    key={step}
                    className={`monitoring-detail-progress-item${
                      index < meetingProgress.currentIndex ? " is-complete" : ""
                    }${index === meetingProgress.currentIndex ? " is-current" : ""}`}
                  >
                    {index > 0 ? (
                      <span
                        className={`monitoring-detail-progress-connector${
                          index <= meetingProgress.currentIndex ? " is-complete" : ""
                        }`}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="monitoring-detail-progress-marker" aria-hidden="true">
                      {index < meetingProgress.currentIndex ? (
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path
                            d="M2 5.25L4.125 7.25L8 3"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : index === meetingProgress.currentIndex ? (
                        <span className="monitoring-detail-progress-marker-dot" />
                      ) : null}
                    </span>
                    <span className="monitoring-detail-progress-label">{step}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="monitoring-detail-section monitoring-detail-section-compact">
            <div className="type-section-title">Attachments</div>
            {!isMeetingRequest && ticket.incidentReportRequired ? (
              <div className="monitoring-detail-upload-block">
                <div className="monitoring-detail-row">
                  <span className="monitoring-detail-row-label">Incident Report</span>
                  {incidentReportUrl ? <Chip label="Uploaded" /> : <Chip label="Pending" />}
                </div>
                {incidentReportUrl ? (
                  <a href={incidentReportUrl} target="_blank" rel="noreferrer" className="btn-secondary">
                    Open Incident Report
                  </a>
                ) : null}
                <FileUploadCard
                  label="Upload Incident Report"
                  inputRef={incidentReportRef}
                  accept=".pdf,.doc,.docx"
                  onFileChange={setIncidentReportFile}
                  file={incidentReportFile}
                  hasAttachment={Boolean(incidentReportFile)}
                  displayName={incidentReportFile?.name ?? "Attach the incident report file"}
                  helperText="Required for major incidents."
                  badge="IR"
                  ariaLabel="Incident report file"
                  onRemove={() => setIncidentReportFile(null)}
                />
              </div>
            ) : null}

            {isMeetingRequest ? (
              <div className="monitoring-detail-upload-block">
                <div className="monitoring-detail-row">
                  <span className="monitoring-detail-row-label">Meeting Recording</span>
                  {meetingRecordingAttachment ? <Chip label="Uploaded" /> : <Chip label="Pending" />}
                </div>
                <FileUploadCard
                  label="Upload Meeting Recording"
                  inputRef={meetingRecordingRef}
                  accept=".mp3,.mp4,.m4a,.mov,.wav,.webm"
                  onFileChange={setMeetingRecordingFile}
                  file={meetingRecordingFile}
                  hasAttachment={Boolean(meetingRecordingFile)}
                  displayName={meetingRecordingFile?.name ?? "Attach the meeting recording file"}
                  helperText="Required before marking the meeting request done."
                  badge="REC"
                  ariaLabel="Meeting recording file"
                  onRemove={() => setMeetingRecordingFile(null)}
                />
              </div>
            ) : null}

            <div className="monitoring-detail-upload-block">
              <FileUploadCard
                label="Add Supporting Attachment"
                inputRef={attachmentRef}
                accept="*/*"
                onFileChange={setAttachmentFile}
                file={attachmentFile}
                hasAttachment={Boolean(attachmentFile)}
                displayName={attachmentFile?.name ?? "Optional screenshot or supporting file"}
                helperText={`Use ${isMeetingRequest || isBorrowingRequest ? "Save Request" : "Save Ticket"} after selecting a file.`}
                badge="1"
                  ariaLabel="Supporting attachment"
                  onRemove={() => setAttachmentFile(null)}
                />
                {!isMeetingRequest && supportingAttachments.length ? (
                  <div className="monitoring-detail-file-list">
                    {supportingAttachments.map((attachment) => (
                      <div key={`${attachment.storageId}-${attachment.uploadedAt}`} className="monitoring-detail-file-card">
                        <a
                          href={attachment.url ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="monitoring-detail-file-main"
                        >
                          <div className="monitoring-detail-file-icon" aria-hidden="true">
                            <span className="monitoring-detail-file-badge">
                              {resolveFileBadgeLabel(attachment.fileName, attachment.contentType)}
                            </span>
                          </div>
                          <div className="monitoring-detail-file-copy">
                            <div className="monitoring-detail-file-name">{attachment.fileName}</div>
                            <div className="monitoring-detail-file-meta">
                              <span>{formatFileSize(attachment.size)}</span>
                              <span>{formatShortDate(attachment.uploadedAt)}</span>
                            </div>
                          </div>
                        </a>
                        <button
                          type="button"
                          className="monitoring-detail-file-remove"
                          aria-label={`Remove ${attachment.fileName}`}
                          title={`Remove ${attachment.fileName}`}
                          disabled={saving}
                          onClick={() => void handleRemoveAttachment(attachment.storageId)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M5 7H19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                            <path
                              d="M9 7V5C9 4.44772 9.44772 4 10 4H14C14.5523 4 15 4.44772 15 5V7"
                              stroke="currentColor"
                              strokeWidth="1.9"
                              strokeLinecap="round"
                            />
                            <path d="M8 10V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                            <path d="M12 10V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                            <path d="M16 10V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                            <path
                              d="M7 7L8 19C8.04691 19.5523 8.50832 20 9.06257 20H14.9374C15.4917 20 15.9531 19.5523 16 19L17 7"
                              stroke="currentColor"
                              strokeWidth="1.9"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
            </div>

            {isMeetingRequest ? (
              meetingRecordingAttachment?.url || supportingAttachments.length ? (
                <div className="monitoring-detail-uploaded-files">
                  {meetingRecordingAttachment?.url ? (
                    <div className="monitoring-detail-uploaded-file-group">
                      <div className="monitoring-detail-uploaded-file-label">Meeting Recording</div>
                      <div className="monitoring-detail-file-list monitoring-detail-file-list-flat">
                        <div className="monitoring-detail-file-card">
                          <a
                            href={meetingRecordingAttachment.url}
                            target="_blank"
                            rel="noreferrer"
                            className="monitoring-detail-file-main"
                          >
                            <div className="monitoring-detail-file-icon" aria-hidden="true">
                              <span className="monitoring-detail-file-badge">
                                {resolveFileBadgeLabel(
                                  meetingRecordingAttachment.fileName,
                                  meetingRecordingAttachment.contentType,
                                )}
                              </span>
                            </div>
                            <div className="monitoring-detail-file-copy">
                              <div className="monitoring-detail-file-name">{meetingRecordingAttachment.fileName}</div>
                              <div className="monitoring-detail-file-meta">
                                <span>{formatFileSize(meetingRecordingAttachment.size)}</span>
                                <span>{formatShortDate(meetingRecordingAttachment.uploadedAt)}</span>
                              </div>
                            </div>
                          </a>
                          <button
                            type="button"
                            className="monitoring-detail-file-remove"
                            aria-label="Remove meeting recording"
                            title="Remove meeting recording"
                            disabled={saving}
                            onClick={() => void handleRemoveAttachment(meetingRecordingAttachment.storageId)}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M5 7H19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                              <path
                                d="M9 7V5C9 4.44772 9.44772 4 10 4H14C14.5523 4 15 4.44772 15 5V7"
                                stroke="currentColor"
                                strokeWidth="1.9"
                                strokeLinecap="round"
                              />
                              <path d="M8 10V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                              <path d="M12 10V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                              <path d="M16 10V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                              <path
                                d="M7 7L8 19C8.04691 19.5523 8.50832 20 9.06257 20H14.9374C15.4917 20 15.9531 19.5523 16 19L17 7"
                                stroke="currentColor"
                                strokeWidth="1.9"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {supportingAttachments.length ? (
                    <div className="monitoring-detail-uploaded-file-group">
                      <div className="monitoring-detail-uploaded-file-label">Supporting Files</div>
                      <div className="monitoring-detail-file-list monitoring-detail-file-list-flat">
                        {supportingAttachments.map((attachment) => (
                          <div key={`${attachment.storageId}-${attachment.uploadedAt}`} className="monitoring-detail-file-card">
                            <a
                              href={attachment.url ?? "#"}
                              target="_blank"
                              rel="noreferrer"
                              className="monitoring-detail-file-main"
                            >
                              <div className="monitoring-detail-file-icon" aria-hidden="true">
                                <span className="monitoring-detail-file-badge">
                                  {resolveFileBadgeLabel(attachment.fileName, attachment.contentType)}
                                </span>
                              </div>
                              <div className="monitoring-detail-file-copy">
                                <div className="monitoring-detail-file-name">{attachment.fileName}</div>
                                <div className="monitoring-detail-file-meta">
                                  <span>{formatFileSize(attachment.size)}</span>
                                  <span>{formatShortDate(attachment.uploadedAt)}</span>
                                </div>
                              </div>
                            </a>
                            <button
                              type="button"
                              className="monitoring-detail-file-remove"
                              aria-label={`Remove ${attachment.fileName}`}
                              title={`Remove ${attachment.fileName}`}
                              disabled={saving}
                              onClick={() => void handleRemoveAttachment(attachment.storageId)}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M5 7H19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                                <path
                                  d="M9 7V5C9 4.44772 9.44772 4 10 4H14C14.5523 4 15 4.44772 15 5V7"
                                  stroke="currentColor"
                                  strokeWidth="1.9"
                                  strokeLinecap="round"
                                />
                                <path d="M8 10V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                                <path d="M12 10V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                                <path d="M16 10V17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
                                <path
                                  d="M7 7L8 19C8.04691 19.5523 8.50832 20 9.06257 20H14.9374C15.4917 20 15.9531 19.5523 16 19L17 7"
                                  stroke="currentColor"
                                  strokeWidth="1.9"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="monitoring-detail-empty">No uploaded files yet.</div>
              )
            ) : !supportingAttachments.length ? (
              <div className="monitoring-detail-empty">No supporting attachments yet.</div>
            ) : null}
          </section>
          {isBorrowingRequest ? (
            <section className="monitoring-detail-section monitoring-detail-section-compact">
              <div className="type-section-title">Borrowing Request</div>
              <div className="monitoring-detail-stack">
                <DetailCard label="Expected Return" value={formatDateTime(toTimestamp(expectedReturnAt) ?? ticket.expectedReturnAt)} />
                <DetailCard label="Linked Assets" value={borrowingItems.length ? String(borrowingItems.length) : "No linked assets saved yet"} />
              </div>
              <div className="monitoring-detail-list">
                {borrowingItems.map((item, index) => (
                  <div key={`${item.assetId}-${index}`} className="monitoring-detail-list-card monitoring-detail-asset-panel">
                    <div className="monitoring-detail-row">
                      <div className="monitoring-detail-inline-copy">
                        <strong>{item.assetTag}</strong>
                        <span className="monitoring-detail-list-meta">{item.assetLabel}</span>
                      </div>
                      <Link href={`/hardware-inventory/${item.assetId}`} className="btn-secondary monitoring-detail-inline-action">
                        Open Asset
                      </Link>
                    </div>
                    <div className="monitoring-detail-asset-grid">
                      <DetailCard label="Release Condition" value={item.releaseCondition} />
                      <FieldBlock label="Returned Condition">
                        <select
                          className="input-base"
                          value={item.returnCondition}
                          onChange={(event) =>
                            setBorrowingItems((prev) =>
                              prev.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, returnCondition: event.target.value } : entry,
                              ),
                            )
                          }
                        >
                          <option value="">Not yet recorded</option>
                          {MONITORING_BORROW_CONDITION_OPTIONS.map((condition) => (
                            <option key={condition} value={condition}>
                              {condition}
                            </option>
                          ))}
                        </select>
                      </FieldBlock>
                      <FieldBlock label="Returned At">
                        <input
                          className="input-base"
                          type="datetime-local"
                          value={item.returnedAt}
                          onChange={(event) =>
                            setBorrowingItems((prev) =>
                              prev.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, returnedAt: event.target.value } : entry,
                              ),
                            )
                          }
                        />
                      </FieldBlock>
                    </div>
                  </div>
                ))}
                {!borrowingItems.length ? <div className="monitoring-detail-empty">No borrowing asset records saved yet.</div> : null}
              </div>
            </section>
          ) : null}

          {isInternetLog ? (
            <section className="monitoring-detail-section monitoring-detail-section-compact">
              <div className="type-section-title">Internet Monitoring</div>
              <div className="monitoring-detail-stack">
                <DetailCard label="ISP" value={ticket.isp} />
                <DetailCard label="Connection Role" value={ticket.connectionRole} />
                <DetailCard label="Area" value={ticket.outageArea} />
                <DetailCard label="Time Detected" value={formatDateTime(ticket.timeDetected)} />
                <DetailCard label="Time Restored" value={formatDateTime(ticket.timeRestored)} />
                <DetailCard label="Total Downtime" value={ticket.totalDowntimeMinutes ? `${ticket.totalDowntimeMinutes} minutes` : "-"} />
                <DetailCard label="Impacted Uptime" value={ticket.impactedUptime ? "Yes" : "No"} />
              </div>
            </section>
          ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}
