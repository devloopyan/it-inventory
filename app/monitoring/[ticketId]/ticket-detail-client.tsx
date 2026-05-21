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
  MONITORING_TRAVEL_ORDER_CATEGORY,
  MONITORING_URGENCY_OPTIONS,
  getApprovalRouteForCategory,
  getMeetingRequestStatusOptions,
  getMonitoringStatusOptions,
  isPendingApprovalStage,
  isMonitoringApprovalReference,
  isMonitoringWorkflowType,
  normalizeMeetingRequestStatusValue,
  type MonitoringApprovalReference,
} from "@/lib/monitoring";
import { formatRequesterAssetLabel, formatRequesterRequestType } from "@/lib/requestDisplay";
import { isAdminRole } from "@/lib/roles";
import { useCurrentUser } from "@/app/current-user-context";

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

const MEETING_STEP_META: Record<string, { actor: string; desc: string }> = {
  New:      { actor: "Data Hub",  desc: "Awaiting OSMD approval" },
  Reserved: { actor: "IT Staff",  desc: "Assign assets & set up" },
  Ready:    { actor: "Ready",     desc: "Setup complete" },
  Done:     { actor: "Complete",  desc: "Recording required" },
};

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

function formatDateKey(value?: number) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, "0")}-${String(safeDate.getDate()).padStart(2, "0")}`;
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

function extractTaggedAttendees(requestDetails?: string): string[] {
  if (!requestDetails) return [];
  const taggedLine = requestDetails
    .split("\n")
    .find((line) => /^tagged attendees:/i.test(line.trim()));
  if (!taggedLine) return [];
  return taggedLine
    .replace(/^tagged attendees:\s*/i, "")
    .replace(/\.$/, "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

function extractLabeledDetail(requestDetails: string | undefined, label: string) {
  if (!requestDetails) return "";
  const pattern = new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*(.*)$`, "i");
  const line = requestDetails
    .split("\n")
    .map((value) => value.trim())
    .find((value) => pattern.test(value));

  return line?.replace(pattern, "$1").trim() ?? "";
}

function getTravelOrderDetails(requestDetails?: string) {
  return {
    destination: extractLabeledDetail(requestDetails, "Destination"),
    passengers: extractLabeledDetail(requestDetails, "Passengers"),
    purpose: extractLabeledDetail(requestDetails, "Purpose of travel"),
    projectName: extractLabeledDetail(requestDetails, "Project name"),
    expectedOutput: extractLabeledDetail(requestDetails, "Expected output"),
    departure: extractLabeledDetail(requestDetails, "Departure"),
    returnTrip: extractLabeledDetail(requestDetails, "Return"),
    notes:
      extractLabeledDetail(requestDetails, "Additional / transportation notes") ||
      extractLabeledDetail(requestDetails, "Transportation request / notes") ||
      extractLabeledDetail(requestDetails, "Transportation details") ||
      extractLabeledDetail(requestDetails, "Additional notes"),
    section: extractLabeledDetail(requestDetails, "Section"),
  };
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
  existingRequestDetails?: string;
}) {
  const taggedLine = params.existingRequestDetails
    ?.split("\n")
    .find((line) => /^tagged attendees:/i.test(line.trim()));

  return [
    `Meeting support requested for "${params.meetingTitle}".`,
    `Schedule: ${formatMeetingScheduleValue(params.meetingStart, params.meetingEnd)}.`,
    `${params.meetingMode} meeting at ${params.meetingLocation}.`,
    `Expected attendees: ${params.meetingAttendeeCount}.`,
    params.meetingAssets.length
      ? `Reserved assets: ${params.meetingAssets.map((item) => `${item.assetTag} | ${item.assetLabel}`).join(", ")}.`
      : undefined,
    taggedLine ?? undefined,
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
        placeholder="Search exact asset to link"
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
    fontWeight: 600,
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
        fontWeight: 600,
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

function DetailTextRow(props: { label: string; value?: ReactNode }) {
  return (
    <div className="monitoring-detail-text-row">
      <div className="monitoring-detail-text-row-label">{props.label}</div>
      <div className="monitoring-detail-text-row-value">{props.value ?? "-"}</div>
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

export default function TicketDetailClient({ ticketId, actorName }: TicketDetailClientProps) {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const detail = useQuery(api.monitoring.getById, { ticketId });
  const assets = useQuery(api.hardwareInventory.listAll, {});
  const updateTicket = useMutation(api.monitoring.updateTicket);
  const reserveAssets = useMutation(api.hardwareInventory.reserveAssets);
  const deleteTicket = useMutation(api.monitoring.deleteTicket);
  const removeTicketAttachment = useMutation(api.monitoring.removeTicketAttachment);
  const submitForApproval = useMutation(api.monitoring.submitForApproval);
  const recordApprovalDecision = useMutation(api.monitoring.recordApprovalDecision);
  const markTicketSeen = useMutation(api.monitoring.markTicketSeen);
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
  const [requestedItemsText, setRequestedItemsText] = useState("");
  const [requestedBorrowDate, setRequestedBorrowDate] = useState("");
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
  const [borrowingAssetSearch, setBorrowingAssetSearch] = useState("");
  const [isTicketEditing, setIsTicketEditing] = useState(false);
  const [isMeetingEditing, setIsMeetingEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const incidentReportRef = useRef<HTMLInputElement | null>(null);
  const meetingRecordingRef = useRef<HTMLInputElement | null>(null);
  const attachmentRef = useRef<HTMLInputElement | null>(null);
  const meetingDetailsSectionRef = useRef<HTMLElement | null>(null);
  const meetingTitleInputRef = useRef<HTMLInputElement | null>(null);
  const lastSeenTicketRef = useRef("");

  useEffect(() => {
    if (!detail?.ticket) return;
    const rowId = String(detail.ticket._id);
    if (lastSeenTicketRef.current === rowId) return;

    lastSeenTicketRef.current = rowId;
    void markTicketSeen({
      ticketId,
      actorName,
    }).catch((error) => {
      console.error("Failed to mark monitoring ticket seen", error);
      lastSeenTicketRef.current = "";
    });
  }, [actorName, detail?.ticket, markTicketSeen, ticketId]);

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
    setRequestedItemsText(detail.ticket.requestedItemsText ?? "");
    setRequestedBorrowDate(toDateTimeLocalValue(detail.ticket.requestedBorrowDate));
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
    setBorrowingAssetSearch("");
    setMeetingAssetSearch("");
    setIsTicketEditing(false);
    setIsMeetingEditing(false);
  }, [detail]);

  const selectedBorrowingAssetIds = new Set(borrowingItems.map((item) => item.assetId));
  const borrowingAssetSearchTerm = borrowingAssetSearch.trim().toLowerCase();
  const borrowingAssetOptions = (assets ?? [])
    .filter((asset) => !selectedBorrowingAssetIds.has(String(asset._id)))
    .filter((asset) => (asset.locationPersonAssigned ?? asset.location ?? "") === "MAIN STORAGE")
    .filter((asset) => ["Available", "Working"].includes(String(asset.status ?? "")))
    .filter((asset) => asset.reservationStatus !== "Reserved")
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
      const nextRequestedBorrowDate = isBorrowingRequest ? toTimestamp(requestedBorrowDate) : undefined;
      const nextExpectedReturnAt = isBorrowingRequest ? toTimestamp(expectedReturnAt) : undefined;
      const trimmedMeetingTitle = meetingTitle.trim();
      const trimmedMeetingRequesterName = meetingRequesterName.trim();
      const trimmedMeetingLocation = meetingLocation.trim();
      const trimmedMeetingAttendeeCount = meetingAttendeeCount.trim();
      const trimmedMeetingSupportNotes = meetingSupportNotes.trim();
      const trimmedRequestedItemsText = requestedItemsText.trim();

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

      if (isBorrowingRequest) {
        if (!trimmedRequestedItemsText && !borrowingItems.length) {
          throw new Error("Requested item or linked asset is required.");
        }
        if (!nextExpectedReturnAt) {
          throw new Error("Expected return date and time is required.");
        }
        if (requestedBorrowDate && !nextRequestedBorrowDate) {
          throw new Error("Planned borrow date is invalid.");
        }
        if (nextRequestedBorrowDate && nextExpectedReturnAt < nextRequestedBorrowDate) {
          throw new Error("Expected return date and time must be after the planned borrow date.");
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
            existingRequestDetails: detail.ticket.requestDetails,
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
              requestedItemsText: trimmedRequestedItemsText || undefined,
              requestedBorrowDate: nextRequestedBorrowDate,
              expectedReturnAt: nextExpectedReturnAt,
              borrowingItems: borrowingItems.map((item) => ({
                assetId: item.assetId as Id<"hardwareInventory">,
                releaseCondition: item.releaseCondition,
                returnCondition: item.returnCondition || undefined,
                returnedAt: toTimestamp(item.returnedAt),
              })),
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
      setIsTicketEditing(false);
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

  function handleEditDetails() {
    if (detail?.ticket) {
      const isMeetingRequest =
        detail.ticket.category === MONITORING_MEETING_REQUEST_CATEGORY ||
        Boolean(detail.ticket.meetingStartAt || detail.ticket.meetingLocation);
      if (isMeetingRequest) {
        setIsMeetingEditing(true);
      } else {
        setIsTicketEditing(true);
      }
    }
    requestAnimationFrame(() => {
      meetingDetailsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      meetingTitleInputRef.current?.focus();
    });
  }

  function handleCancelEdit() {
    if (!detail?.ticket) return;
    const ticket = detail.ticket;
    const nextMeetingMode = (MONITORING_MEETING_MODES as readonly string[]).includes(ticket.meetingMode ?? "")
      ? (ticket.meetingMode as (typeof MONITORING_MEETING_MODES)[number])
      : MONITORING_MEETING_MODES[0];
    setStatus(ticket.status);
    setImpact(ticket.impact ?? "");
    setUrgency(ticket.urgency ?? "");
    setPendingReason(ticket.pendingReason ?? "");
    setCloseReason(ticket.closeReason ?? "");
    setResolutionNote(ticket.resolutionNote ?? "");
    setFulfillmentNote(ticket.fulfillmentNote ?? "");
    setCauseActionTaken(ticket.causeActionTaken ?? "");
    setRevisionReason(ticket.revisionReason ?? "");
    setAssetId(ticket.assetId ? String(ticket.assetId) : "");
    setRequestedItemsText(ticket.requestedItemsText ?? "");
    setRequestedBorrowDate(toDateTimeLocalValue(ticket.requestedBorrowDate));
    setExpectedReturnAt(toDateTimeLocalValue(ticket.expectedReturnAt));
    setBorrowingItems(
      (ticket.borrowingItems ?? []).map((item) => ({
        assetId: String(item.assetId),
        assetTag: item.assetTag,
        assetLabel: item.assetLabel,
        releaseCondition: item.releaseCondition,
        returnCondition: item.returnCondition ?? "",
        returnedAt: toDateTimeLocalValue(item.returnedAt),
      })),
    );
    setMajorIncident(ticket.majorIncident);
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
    setIncidentReportFile(null);
    setMeetingRecordingFile(null);
    setAttachmentFile(null);
    setBorrowingAssetSearch("");
    setMeetingAssetSearch("");
    setIsTicketEditing(false);
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
    const approvalRoute = getApprovalRouteForCategory(detail.ticket.category);
    const approver =
      detail.ticket.approvalStage === approvalRoute.firstPendingStage
        ? approvalRoute.firstApprover
        : approvalRoute.secondApprover;

    setSaving(true);
    setFeedback("");
    try {
      await recordApprovalDecision({
        ticketId,
        approver,
        decision,
        reference: approvalReference,
        note: approvalNote || revisionReason || "Recorded.",
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

  async function handleReserveBorrowingAssets() {
    if (!detail?.ticket) return;

    const ticket = detail.ticket;
    const requesterName = ticket.requesterName.trim();
    const requesterDepartment = ticket.requesterDepartment?.trim() ?? "";
    const nextExpectedReturnAt = toTimestamp(expectedReturnAt) ?? ticket.expectedReturnAt;
    const nextRequestedBorrowDate = toTimestamp(requestedBorrowDate) ?? ticket.requestedBorrowDate;

    if (!borrowingItems.length) {
      setFeedback("Add at least one linked asset before reserving.");
      return;
    }
    if (!requesterName) {
      setFeedback("Requester name is required before reserving assets.");
      return;
    }
    if (!requesterDepartment) {
      setFeedback("Requester department is required before reserving assets.");
      return;
    }
    if (!nextExpectedReturnAt) {
      setFeedback("Expected return date and time is required before reserving assets.");
      return;
    }

    setSaving(true);
    setFeedback("");

    try {
      await reserveAssets({
        inventoryIds: borrowingItems.map((item) => item.assetId as Id<"hardwareInventory">),
        borrowerName: requesterName,
        department: requesterDepartment,
        requestedDate: formatDateKey(ticket.requestReceivedAt),
        expectedPickupDate: nextRequestedBorrowDate ? formatDateKey(nextRequestedBorrowDate) : undefined,
        purpose: ticket.title,
      });

      await updateTicket({
        ticketId,
        actorName,
        status: "In Progress",
        fulfillmentNote: fulfillmentNote || undefined,
        requestedItemsText: requestedItemsText.trim() || undefined,
        requestedBorrowDate: nextRequestedBorrowDate,
        expectedReturnAt: nextExpectedReturnAt,
        borrowingItems: borrowingItems.map((item) => ({
          assetId: item.assetId as Id<"hardwareInventory">,
          releaseCondition: item.releaseCondition,
          returnCondition: item.returnCondition || undefined,
          returnedAt: toTimestamp(item.returnedAt),
        })),
      });

      setStatus("In Progress");
      setFeedback("Assets reserved and request moved to In Progress.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Asset reservation failed.");
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
  const isTravelOrder = ticket.category === MONITORING_TRAVEL_ORDER_CATEGORY;
  const isInternetLog = ticket.workflowType === "internetOutage";
  const borrowingTypeLabel = formatRequesterRequestType(ticket);
  const borrowingAssetLabel = formatRequesterAssetLabel(ticket);
  const ticketTypeLabel = isMeetingRequest
    ? "Meeting Request"
    : isBorrowingRequest
      ? borrowingTypeLabel
      : isTravelOrder
        ? "Travel Order"
        : ticket.workType;
  const detailSectionTitle = isMeetingRequest
    ? "Meeting Request"
    : isBorrowingRequest
      ? borrowingTypeLabel
      : isInternetLog
        ? "Internet Log"
        : isTravelOrder
          ? "Travel Order"
          : "Work Ticket";
  const displayTitle = isMeetingRequest ? getEditableMeetingTitle(ticket.title, ticket.meetingStartAt) : ticket.title;
  const travelOrderDetails = isTravelOrder ? getTravelOrderDetails(ticket.requestDetails) : null;
  const canEditTravelOrder = isAdminRole(currentUser?.role);
  const meetingRecordingAttachment = attachments.find((attachment) => attachment.kind === "Meeting Recording");
  const supportingAttachments = attachments.filter((attachment) => attachment.kind !== "Meeting Recording");
  const selectedStatus = isMeetingRequest ? normalizeMeetingRequestStatus(status) : status;
  const meetingProgress = isMeetingRequest ? getMeetingProgress(selectedStatus) : null;
  const taggedAttendees = isMeetingRequest ? extractTaggedAttendees(ticket.requestDetails) : [];
  const meetingSupportNotesDisplay = isMeetingRequest ? extractMeetingSupportNotes(ticket.requestDetails) : "";
  const statusOptions = isMeetingRequest
    ? [...getMeetingRequestStatusOptions(), ...(selectedStatus === "Closed" ? ["Closed" as const] : [])]
    : getMonitoringStatusOptions(workflowType);
  const detailMetaItems = isMeetingRequest
    ? [`Updated ${formatDateTime(ticket.updatedAt)}`]
    : [
        ticketTypeLabel,
        isBorrowingRequest || ticket.category !== ticketTypeLabel
          ? isBorrowingRequest
            ? borrowingAssetLabel
            : ticket.category
          : null,
        `Updated ${formatDateTime(ticket.updatedAt)}`,
      ].filter((item): item is string => Boolean(item));
  const borrowingLinkedAssetRows = borrowingItems
    .map((item) => assets?.find((assetRow) => String(assetRow._id) === item.assetId))
    .filter((assetRow): assetRow is NonNullable<typeof assets>[number] => Boolean(assetRow));
  const borrowingAssetsAlreadyReserved =
    borrowingItems.length > 0 &&
    borrowingLinkedAssetRows.length === borrowingItems.length &&
    borrowingLinkedAssetRows.every((assetRow) => assetRow.reservationStatus === "Reserved");
  const canReserveBorrowingAssets =
    isBorrowingRequest &&
    borrowingItems.length > 0 &&
    !borrowingAssetsAlreadyReserved &&
    selectedStatus !== "Fulfilled" &&
    selectedStatus !== "Closed";
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
    !isTravelOrder &&
    workflowType === "serviceRequest" &&
    ticket.approvalRequired &&
    (ticket.approvalStage === "Not Submitted" || ticket.approvalStage === "For Revision");
  const canRecordApproval =
    !isMeetingRequest &&
    isPendingApprovalStage(ticket.approvalStage);
  const isDetailEditing = isMeetingRequest ? isMeetingEditing : isTicketEditing;
  const backHref = isMeetingRequest
    ? "/monitoring?tab=meetings"
    : isBorrowingRequest
      ? "/monitoring?tab=borrowing"
      : isTravelOrder
        ? "/monitoring?tab=hrAdmin"
        : isInternetLog
          ? "/monitoring?tab=internet"
          : "/monitoring";
  const backLabel = isMeetingRequest ? "Back to Meeting Requests" : "Back to Monitoring";

  let meetingRoutingBanner: ReactNode = null;
  if (isMeetingRequest && !isDetailEditing && selectedStatus !== "Closed" && selectedStatus !== "Done") {
    if (selectedStatus === "New") {
      meetingRoutingBanner = (
        <div style={{ margin: "0 0 12px", padding: "10px 16px", borderRadius: 8, background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span><strong>Awaiting Data Hub (OSMD) approval.</strong> Once approved, IT Staff will be notified to assign assets and set up.</span>
        </div>
      );
    } else if (selectedStatus === "Reserved") {
      meetingRoutingBanner = (
        <div style={{ margin: "0 0 12px", padding: "10px 16px", borderRadius: 8, background: "#fff7ed", border: "1px solid #fed7aa", color: "#92400e", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span><strong>Data Hub approved.</strong> IT Staff to link equipment and complete setup before the meeting.</span>
        </div>
      );
    } else if (selectedStatus === "Ready") {
      meetingRoutingBanner = (
        <div style={{ margin: "0 0 12px", padding: "10px 16px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: 13, display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
            <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span><strong>IT setup complete.</strong> All assets linked — ready for the meeting.</span>
        </div>
      );
    }
  }

  return (
    <div className="monitoring-page monitoring-detail-page">
      <section className="panel monitoring-detail-shell">
        <header className="monitoring-detail-header">
          <div className="monitoring-detail-header-main">
            <div className="monitoring-detail-title-stack">
              <div className="monitoring-detail-title-row">
                <h1 className="type-page-title">{displayTitle}</h1>
                <Chip label={ticket.ticketNumber} />
                <Chip label={selectedStatus || ticket.status} />
                {ticket.priority ? <Chip label={ticket.priority} /> : null}
              </div>
              <div className="monitoring-detail-meta">
                {detailMetaItems.map((item, index) => (
                  <span key={`${item}-${index}`}>{item}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="monitoring-detail-header-actions">
            {!isMeetingRequest && ticket.incidentReportRequired && !ticket.incidentReportAttached ? (
              <Chip label="Incident Report Pending" />
            ) : null}
            <Link href={backHref} className="asset-action-btn" aria-label={backLabel} title={backLabel}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M15 6L9 12L15 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            {!isDetailEditing && (!isTravelOrder || canEditTravelOrder) ? (
              <button
                className="asset-action-btn asset-action-btn-primary"
                onClick={handleEditDetails}
                type="button"
                aria-label={`Edit ${detailSectionTitle}`}
                title={`Edit ${detailSectionTitle}`}
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
            ) : null}
            {canSubmitApproval ? (
              <button
                type="button"
                className="asset-action-btn"
                disabled={saving}
                onClick={() => void handleSubmitForApproval()}
                aria-label="Submit for Approval"
                title="Submit for Approval"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 12L20 4L16 20L12 13L4 12Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M12 13L20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            ) : null}
            {isBorrowingRequest ? (
              <button
                type="button"
                className="asset-action-btn"
                disabled={saving || !canReserveBorrowingAssets}
                onClick={() => void handleReserveBorrowingAssets()}
                aria-label={
                  borrowingAssetsAlreadyReserved
                    ? "Assets Reserved"
                    : borrowingItems.length
                      ? "Reserve Assets"
                      : "Link Assets First"
                }
                title={
                  borrowingAssetsAlreadyReserved
                    ? "Assets Reserved"
                    : borrowingItems.length
                      ? "Reserve Assets"
                      : "Link Assets First"
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 10V8C6 4.7 8.7 2 12 2C15.3 2 18 4.7 18 8V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path
                    d="M5 10H19V20H5V10Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : null}
            {!isMeetingRequest && !isBorrowingRequest && ticket.assetId && asset ? (
              <Link
                href={`/hardware-inventory/${asset._id}`}
                className="asset-action-btn"
                aria-label="Open Linked Asset"
                title="Open Linked Asset"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M14 4H20V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 14L20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path
                    d="M20 14V19C20 19.55 19.55 20 19 20H5C4.45 20 4 19.55 4 19V5C4 4.45 4.45 4 5 4H10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            ) : null}
            {isMeetingRequest ? (
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
            ) : null}
          </div>
        </header>

        {feedback ? <div className="monitoring-detail-feedback">{feedback}</div> : null}
        {meetingRoutingBanner}

        <div className="monitoring-detail-body">
          <main className="monitoring-detail-main">
            {isDetailEditing ? (
              <section ref={meetingDetailsSectionRef} className="monitoring-detail-section">
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
                  {isMeetingRequest && selectedStatus === "New" ? (
                    <small style={{ fontSize: 12, color: "#1d4ed8", marginTop: 4, display: "block" }}>
                      Waiting for Data Hub (OSMD) to review and approve the request.
                    </small>
                  ) : null}
                  {isMeetingRequest && selectedStatus === "Reserved" ? (
                    <small style={{ fontSize: 12, color: "#92400e", marginTop: 4, display: "block" }}>
                      {meetingAssets.length === 0
                        ? "Data Hub approved — link equipment below before marking Ready."
                        : `Data Hub approved — ${meetingAssets.length} asset${meetingAssets.length === 1 ? "" : "s"} linked.`}
                    </small>
                  ) : null}
                  {isMeetingRequest && selectedStatus === "Ready" ? (
                    <small style={{ fontSize: 12, color: "#6d28d9", marginTop: 4, display: "block" }}>
                      IT setup complete — meeting is ready to proceed.
                    </small>
                  ) : null}
                  {isMeetingRequest && selectedStatus === "Done" && !meetingRecordingAttachment && !meetingRecordingFile ? (
                    <small style={{ fontSize: 12, color: "#b45309", marginTop: 4, display: "block" }}>
                      Attach the meeting recording before saving.
                    </small>
                  ) : null}
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
                {!isMeetingRequest && !isBorrowingRequest && !isTravelOrder ? (
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
                {!isMeetingRequest && !isBorrowingRequest && !isTravelOrder ? (
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
                  <FieldBlock label={`Requested ${borrowingAssetLabel}`}>
                    <textarea
                      className="input-base"
                      style={{ minHeight: 88, resize: "vertical" }}
                      value={requestedItemsText}
                      onChange={(event) => setRequestedItemsText(event.target.value)}
                    />
                  </FieldBlock>
                ) : null}
                {isBorrowingRequest ? (
                  <FieldBlock label="Planned Borrow Date">
                    <input
                      className="input-base"
                      type="datetime-local"
                      value={requestedBorrowDate}
                      onChange={(event) => setRequestedBorrowDate(event.target.value)}
                    />
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
                {!isMeetingRequest && !isTravelOrder ? (
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
                {!isMeetingRequest && !isTravelOrder ? (
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

              {!isMeetingRequest && !isTravelOrder ? (
                <label className="monitoring-detail-toggle">
                  <input type="checkbox" checked={majorIncident} onChange={(event) => setMajorIncident(event.target.checked)} />
                  <span>Major incident</span>
                </label>
              ) : null}

                <div className="monitoring-detail-actions">
                  <button type="button" className="btn-secondary" disabled={saving} onClick={handleCancelEdit}>
                    Cancel
                  </button>
                  <button type="button" className="btn-primary" disabled={saving} onClick={() => void handleSave()}>
                    {saving ? "Saving..." : isMeetingRequest || isBorrowingRequest ? "Save Request" : "Save Ticket"}
                  </button>
                </div>
              </section>
            ) : null}

            {isMeetingRequest && !isDetailEditing ? (
              <section className="monitoring-detail-section">
                <div className="type-subsection-title">Meeting Details</div>
                <div className="monitoring-detail-stack">
                  <DetailTextRow label="Requester" value={ticket.requesterName} />
                  {ticket.requesterSection ? <DetailTextRow label="Section" value={ticket.requesterSection} /> : null}
                  {ticket.requesterDepartment ? <DetailTextRow label="Department" value={ticket.requesterDepartment} /> : null}
                  <DetailTextRow
                    label="Schedule"
                    value={
                      ticket.meetingStartAt
                        ? `${formatDateTime(ticket.meetingStartAt)}${ticket.meetingEndAt ? ` to ${formatDateTime(ticket.meetingEndAt)}` : ""}`
                        : "-"
                    }
                  />
                  <DetailTextRow label="Mode" value={ticket.meetingMode ?? "-"} />
                  <DetailTextRow label="Location / Platform" value={ticket.meetingLocation ?? "-"} />
                  <DetailTextRow label="Expected Attendees" value={ticket.meetingAttendeeCount ?? "-"} />
                  {taggedAttendees.length ? (
                    <DetailTextRow label="Tagged Attendees" value={taggedAttendees.join(", ")} />
                  ) : null}
                  {meetingSupportNotesDisplay ? (
                    <DetailTextRow label="Support Notes" value={meetingSupportNotesDisplay} />
                  ) : null}
                </div>
              </section>
            ) : null}

            {travelOrderDetails ? (
              <section className="monitoring-detail-section">
                <div className="type-subsection-title">Travel Details</div>
                <div className="monitoring-detail-stack">
                  <DetailTextRow label="Destination" value={travelOrderDetails.destination} />
                  <DetailTextRow label="Passengers" value={travelOrderDetails.passengers} />
                  <DetailTextRow label="Purpose" value={travelOrderDetails.purpose} />
                  <DetailTextRow label="Project Name" value={travelOrderDetails.projectName} />
                  <DetailTextRow label="Expected Output" value={travelOrderDetails.expectedOutput} />
                  <DetailTextRow label="Departure" value={travelOrderDetails.departure} />
                  <DetailTextRow label="Return" value={travelOrderDetails.returnTrip} />
                  <DetailTextRow label="Additional / Transportation Notes" value={travelOrderDetails.notes || "None"} />
                </div>
              </section>
            ) : null}

            {!isMeetingRequest && !isTravelOrder ? (
              <section className="monitoring-detail-section">
                <div className="type-subsection-title">Request Details</div>
                <p className="monitoring-detail-copy">{ticket.requestDetails}</p>
              </section>
            ) : null}

          </main>

          <aside className="monitoring-detail-side">
            {!isMeetingRequest ? (
              <section className="monitoring-detail-section monitoring-detail-section-compact">
                <div className="type-section-title">Record Summary</div>
                <div className="monitoring-detail-stack">
                  <DetailTextRow label="Requester" value={ticket.requesterName} />
                  <DetailTextRow label="Section" value={ticket.requesterSection} />
                  <DetailTextRow label="Department" value={ticket.requesterDepartment} />
                  <DetailTextRow label="Request Source" value={ticket.requestSource} />
                  <DetailTextRow label="Approval Stage" value={<Chip label={ticket.approvalStage} />} />
                  <DetailTextRow label="Created" value={formatDateTime(ticket.createdAt)} />
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

          {isMeetingRequest && meetingProgress ? (() => {
            const STEP_COLORS = ["#3b82f6", "#f97316", "#7c3aed", "#16a34a"] as const;
            return (
              <section className="monitoring-detail-section monitoring-detail-section-compact">
                <div className="type-section-title">Progress</div>
                <div className="monitoring-detail-progress-stepper" aria-label="Meeting request progress">
                  {MEETING_PROGRESS_STEPS.map((step, index) => {
                    const isComplete = index < meetingProgress.currentIndex;
                    const isCurrent = index === meetingProgress.currentIndex;
                    const stepColor = STEP_COLORS[index];
                    return (
                      <div
                        key={step}
                        className={`monitoring-detail-progress-item${isComplete ? " is-complete" : ""}${isCurrent ? " is-current" : ""}`}
                      >
                        {index > 0 ? (
                          <span
                            className={`monitoring-detail-progress-connector${index <= meetingProgress.currentIndex ? " is-complete" : ""}`}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span
                          className="monitoring-detail-progress-marker"
                          style={isCurrent ? {
                            borderColor: stepColor,
                            background: "var(--surface)",
                            color: "#fff",
                          } : undefined}
                          aria-hidden="true"
                        >
                          {isComplete ? (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5.25L4.125 7.25L8 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : isCurrent ? (
                            <span className="monitoring-detail-progress-marker-dot" style={{ background: stepColor }} />
                          ) : null}
                        </span>
                        <span
                          className="monitoring-detail-progress-label"
                          style={isCurrent ? { color: stepColor, fontWeight: 700 } : undefined}
                        >
                          {step}
                        </span>
                        {MEETING_STEP_META[step] ? (
                          <span style={{
                            fontSize: 10,
                            color: isCurrent ? stepColor : "var(--muted)",
                            marginTop: 2,
                            textAlign: "center",
                            lineHeight: 1.3,
                          }}>
                            {MEETING_STEP_META[step].desc}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })() : null}

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
                    label="Upload File"
                    inputRef={incidentReportRef}
                    accept=".pdf,.doc,.docx"
                    onFileChange={setIncidentReportFile}
                    file={incidentReportFile}
                    hasAttachment={Boolean(incidentReportFile)}
                    displayName={incidentReportFile?.name ?? "No file selected"}
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
                {!isTravelOrder && !isMeetingRequest ? (
                  <FileUploadCard
                    label="Engineer's Report"
                    inputRef={attachmentRef}
                    accept="*/*"
                    onFileChange={setAttachmentFile}
                    file={attachmentFile}
                    hasAttachment={Boolean(attachmentFile)}
                    displayName={attachmentFile?.name ?? "No file selected"}
                    helperText="Save to upload."
                    badge="1"
                    ariaLabel="Supporting attachment"
                    onRemove={() => setAttachmentFile(null)}
                  />
                ) : null}
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
              <div className="type-section-title">{borrowingTypeLabel}</div>
              <div className="monitoring-detail-stack">
                <DetailTextRow
                  label={`Requested ${borrowingAssetLabel}`}
                  value={requestedItemsText || ticket.requestedItemsText || "No requested item saved yet"}
                />
                <DetailTextRow
                  label="Planned Borrow"
                  value={formatDateTime(toTimestamp(requestedBorrowDate) ?? ticket.requestedBorrowDate)}
                />
                <DetailTextRow label="Expected Return" value={formatDateTime(toTimestamp(expectedReturnAt) ?? ticket.expectedReturnAt)} />
                <DetailTextRow label={`Linked ${borrowingAssetLabel}`} value={borrowingItems.length ? String(borrowingItems.length) : "No linked assets saved yet"} />
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <div className="type-helper">
                  Search the exact inventory item here once IT decides which asset to reserve for the request.
                </div>
                <BorrowingAssetLookup
                  query={borrowingAssetSearch}
                  onQueryChange={setBorrowingAssetSearch}
                  options={borrowingAssetOptions}
                  onAddAsset={(asset) => {
                    setBorrowingItems((prev) => [
                      ...prev,
                      {
                        assetId: String(asset._id),
                        assetTag: asset.assetTag ?? "No Tag",
                        assetLabel: asset.assetNameDescription ?? asset.assetType ?? "Asset",
                        releaseCondition: MONITORING_BORROW_CONDITION_OPTIONS[0],
                        returnCondition: "",
                        returnedAt: "",
                      },
                    ]);
                    setBorrowingAssetSearch("");
                  }}
                />
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
                      <FieldBlock label="Release Condition">
                        <select
                          className="input-base"
                          value={item.releaseCondition}
                          onChange={(event) =>
                            setBorrowingItems((prev) =>
                              prev.map((entry, entryIndex) =>
                                entryIndex === index ? { ...entry, releaseCondition: event.target.value } : entry,
                              ),
                            )
                          }
                        >
                          {MONITORING_BORROW_CONDITION_OPTIONS.map((condition) => (
                            <option key={condition} value={condition}>
                              {condition}
                            </option>
                          ))}
                        </select>
                      </FieldBlock>
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
                      <div style={{ display: "flex", alignItems: "end" }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() =>
                            setBorrowingItems((prev) =>
                              prev.filter((_, entryIndex) => entryIndex !== index),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
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
                <DetailTextRow label="ISP" value={ticket.isp} />
                <DetailTextRow label="Connection Role" value={ticket.connectionRole} />
                <DetailTextRow label="Area" value={ticket.outageArea} />
                <DetailTextRow label="Time Detected" value={formatDateTime(ticket.timeDetected)} />
                <DetailTextRow label="Time Restored" value={formatDateTime(ticket.timeRestored)} />
                <DetailTextRow label="Total Downtime" value={ticket.totalDowntimeMinutes ? `${ticket.totalDowntimeMinutes} minutes` : "-"} />
                <DetailTextRow label="Impacted Uptime" value={ticket.impactedUptime ? "Yes" : "No"} />
              </div>
            </section>
          ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}

