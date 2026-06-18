"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
  MONITORING_TRAVEL_ORDER_CATEGORY,
  MONITORING_PRIORITY_OPTIONS,
  MONITORING_URGENCY_OPTIONS,
  MONITORING_WORK_TYPES,
  normalizeMeetingRequestStatusValue,
  resolveConnectionRole,
} from "@/lib/monitoring";
import { formatRequesterAssetLabel, formatRequesterRequestType } from "@/lib/requestDisplay";
import { getServiceGroupForCategory } from "@/lib/serviceGroups";
import { isAdminRole, normalizeServiceGroups } from "@/lib/roles";
import { useCurrentUser } from "../current-user-context";

type MonitoringClientProps = {
  actorName: string;
};

type MonitoringTab = "issues" | "hrAdmin" | "meetings" | "borrowing" | "internet";
type HrAdminArchiveView = "active" | "archive";

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

type FleetDriverAvailabilityRow = {
  _id: Id<"fleetDrivers">;
  name: string;
  position?: string;
  contactNumber?: string;
  status: string;
  notes?: string;
};

type FleetVehicleAvailabilityRow = {
  _id: Id<"fleetVehicles">;
  name: string;
  plateNumber: string;
  vehicleType: string;
  capacity?: number;
  status: string;
  notes?: string;
};

type FleetDriverFormState = {
  name: string;
  position: string;
  contactNumber: string;
  status: string;
  notes: string;
};

type FleetVehicleFormState = {
  name: string;
  plateNumber: string;
  vehicleType: string;
  capacity: string;
  status: string;
  notes: string;
};

type FleetAssignmentFormState = {
  driverId: string;
  vehicleId: string;
};

type FleetAssignmentTicket = {
  _id: Id<"monitoringTickets">;
  ticketNumber: string;
  title: string;
  fleetDriverId?: Id<"fleetDrivers">;
  fleetDriverName?: string;
  fleetVehicleId?: Id<"fleetVehicles">;
  fleetVehicleName?: string;
  fleetVehiclePlateNumber?: string;
};

const FLEET_DRIVER_STATUSES = ["Available", "Assigned", "Unavailable"] as const;
const FLEET_VEHICLE_STATUSES = ["Available", "Assigned", "Maintenance", "Unavailable"] as const;

const defaultFleetDriverForm: FleetDriverFormState = {
  name: "",
  position: "",
  contactNumber: "",
  status: "Available",
  notes: "",
};

const defaultFleetVehicleForm: FleetVehicleFormState = {
  name: "",
  plateNumber: "",
  vehicleType: "",
  capacity: "",
  status: "Available",
  notes: "",
};

const defaultFleetAssignmentForm: FleetAssignmentFormState = {
  driverId: "",
  vehicleId: "",
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

function formatMinutes(value?: number) {
  if (value === undefined) return "-";
  return `${value} min`;
}

// Compare an actual time against a scheduled time and describe how early/late it was.
// Used for both departure (vs scheduled departure) and arrival (vs scheduled return).
// Within 5 minutes either way counts as "on time".
const SCHEDULE_ON_TIME_TOLERANCE_MS = 5 * 60 * 1000;

function getScheduleComparison(actualMs: number, scheduledMs: number) {
  const diff = actualMs - scheduledMs;
  if (Math.abs(diff) <= SCHEDULE_ON_TIME_TOLERANCE_MS) {
    return { label: "On time", tone: "ok" as const };
  }
  const totalMinutes = Math.round(Math.abs(diff) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const amount = [hours ? `${hours}h` : "", minutes ? `${minutes}m` : ""].filter(Boolean).join(" ") || "0m";
  return diff < 0
    ? { label: `Early by ${amount}`, tone: "ok" as const }
    : { label: `Late by ${amount}`, tone: "late" as const };
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

function formatDateFilterValue(value?: number) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMeetingSchedule(start: string, end: string) {
  const startLabel = formatDateTimeInput(start);
  if (!end) return startLabel;
  return `${startLabel} to ${formatDateTimeInput(end)}`;
}

function getMeetingRequestListTitle(title: string) {
  const withoutPrefix = title.replace(/^Meeting Support\s*-\s*/i, "").trim();
  const lastDash = withoutPrefix.lastIndexOf(" - ");
  return lastDash !== -1 ? withoutPrefix.slice(0, lastDash).trim() : withoutPrefix;
}

function getTravelPurposeFromDetails(requestDetails?: string) {
  const purposeLine = requestDetails
    ?.split(/\r?\n/)
    .find((line) => /^Purpose of travel:/i.test(line.trim()));
  return purposeLine?.replace(/^Purpose of travel:\s*/i, "").trim() || "-";
}

function getTravelScheduleFromDetails(requestDetails?: string) {
  const lines = requestDetails?.split(/\r?\n/).map((line) => line.trim()) ?? [];
  const departure = lines.find((line) => /^Departure:/i.test(line))?.replace(/^Departure:\s*/i, "").trim();
  const returnAt = lines.find((line) => /^Return:/i.test(line))?.replace(/^Return:\s*/i, "").trim();
  return {
    departure: departure || "-",
    returnAt: returnAt || "-",
  };
}

function formatCompactTravelDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getDisplayStatusLabel(status: string, category?: string) {
  if (category === MONITORING_MEETING_REQUEST_CATEGORY) {
    return normalizeMeetingRequestStatusValue(status) ?? status;
  }
  return status;
}

function getTravelOrderDisplayStatus(row: {
  status: string;
  category?: string;
  fleetDriverName?: string;
  fleetVehicleName?: string;
}) {
  const status = getDisplayStatusLabel(row.status, row.category);
  if (
    row.category === MONITORING_TRAVEL_ORDER_CATEGORY &&
    status === "New" &&
    row.fleetDriverName &&
    row.fleetVehicleName
  ) {
    return "Assigned";
  }
  return status;
}

// --- Travel Order archive export (CSV) ---
// The columns the user can choose to include in the downloaded spreadsheet.
const TRAVEL_ORDER_EXPORT_COLUMNS = [
  { key: "ticketNumber", label: "Ticket #" },
  { key: "title", label: "Title" },
  { key: "requesterName", label: "Requester" },
  { key: "requesterDepartment", label: "Team" },
  { key: "purpose", label: "Purpose" },
  { key: "departure", label: "Departure" },
  { key: "returnAt", label: "Return" },
  { key: "driver", label: "Driver" },
  { key: "vehicle", label: "Vehicle" },
  { key: "plate", label: "Plate" },
  { key: "status", label: "Status" },
  { key: "closed", label: "Closed Date" },
] as const;

type TravelOrderExportColumnKey = (typeof TRAVEL_ORDER_EXPORT_COLUMNS)[number]["key"];
type ExportRangePreset = "week" | "month" | "year" | "custom";

// Read the departure date out of the request details and turn it into a timestamp.
// Returns null when there is no parseable departure (so the row can be reported as skipped).
function getTravelDepartureTimestamp(requestDetails?: string): number | null {
  const { departure } = getTravelScheduleFromDetails(requestDetails);
  if (!departure || departure === "-") return null;
  const ms = new Date(departure).getTime();
  return Number.isNaN(ms) ? null : ms;
}

// Work out the [start, end) window (end is exclusive) for the chosen period, relative to `now`.
// Returns null when a custom range is missing or invalid.
function getExportRange(
  preset: ExportRangePreset,
  now: Date,
  customFrom: string,
  customTo: string,
): { start: number; end: number } | null {
  if (preset === "custom") {
    if (!customFrom || !customTo) return null;
    const start = new Date(`${customFrom}T00:00:00`);
    const end = new Date(`${customTo}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    // Include the whole "to" day by moving the exclusive end to the next midnight.
    end.setDate(end.getDate() + 1);
    return { start: start.getTime(), end: end.getTime() };
  }
  if (preset === "week") {
    // Current week: from Sunday 00:00 to next Sunday 00:00.
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start: start.getTime(), end: end.getTime() };
  }
  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { start: start.getTime(), end: end.getTime() };
  }
  // year
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start: start.getTime(), end: end.getTime() };
}

// Build the string value for every exportable column of a single travel order row.
function getTravelOrderExportValues(row: {
  ticketNumber?: string;
  title?: string;
  requesterName?: string;
  requesterDepartment?: string;
  requestDetails?: string;
  fleetDriverName?: string;
  fleetVehicleName?: string;
  fleetVehiclePlateNumber?: string;
  status: string;
  category?: string;
  updatedAt?: number;
}): Record<TravelOrderExportColumnKey, string> {
  const schedule = getTravelScheduleFromDetails(row.requestDetails);
  const purpose = getTravelPurposeFromDetails(row.requestDetails);
  return {
    ticketNumber: row.ticketNumber ?? "",
    title: row.title ?? "",
    requesterName: row.requesterName ?? "",
    requesterDepartment: row.requesterDepartment ?? "",
    purpose: purpose === "-" ? "" : purpose,
    departure: schedule.departure === "-" ? "" : schedule.departure,
    returnAt: schedule.returnAt === "-" ? "" : schedule.returnAt,
    driver: row.fleetDriverName ?? "",
    vehicle: row.fleetVehicleName ?? "",
    plate: row.fleetVehiclePlateNumber ?? "",
    status: getTravelOrderDisplayStatus(row),
    closed: row.updatedAt ? formatDateTime(row.updatedAt) : "",
  };
}

// Wrap a value in quotes and escape any quotes inside, so commas/newlines/quotes stay safe in CSV.
function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// Join header + rows into a CSV string. The leading BOM tells Excel the file is UTF-8.
function buildCsv(headerLabels: string[], rows: string[][]): string {
  const BOM = String.fromCharCode(0xfeff);
  const lines = [headerLabels, ...rows].map((cells) => cells.map(escapeCsvCell).join(","));
  return BOM + lines.join("\r\n");
}

// Create the CSV file in the browser and trigger a download via a temporary link.
function downloadCsvFile(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// --- Travel Order PDF export (browser print) ---
// Escape text so it is safe to drop into the generated HTML document.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Pull a single "Label: value" line out of the stored request details text.
function getRequestDetailField(requestDetails: string | undefined, label: string): string {
  const re = new RegExp(`^${label}:\\s*`, "i");
  const line = (requestDetails ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => re.test(l));
  return line ? line.replace(re, "").trim() : "";
}

// Format a date-like string into a readable date/time, or return it unchanged if it isn't a date.
function formatTravelDateText(value: string): string {
  if (!value || value === "-") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatDateTime(date.getTime());
}

// Build the ENVI-COMM Travel Order Form as a printable HTML document, matching the official template.
// The user prints this (or saves it as PDF) from the browser print dialog.
function buildTravelOrderPdfHtml(row: {
  ticketNumber?: string;
  requesterName?: string;
  requesterDepartment?: string;
  requestDetails?: string;
  fleetDriverName?: string;
  fleetVehicleName?: string;
  fleetVehiclePlateNumber?: string;
  travelReturnAt?: number;
  cancellationReason?: string;
  cancellationReasonDetail?: string;
}): string {
  // Passengers are stored as "Name | Position; Name | Position".
  const passengerEntries = getRequestDetailField(row.requestDetails, "Passengers")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name = "", position = ""] = entry.split("|").map((part) => part.trim());
      return { name, position };
    });
  const passengerNames = passengerEntries.map((p) => p.name).filter(Boolean).join(", ");
  const passengerPositions = passengerEntries.map((p) => p.position).filter(Boolean).join(", ");

  const departure = formatTravelDateText(getRequestDetailField(row.requestDetails, "Departure"));
  const estimatedBack = row.travelReturnAt
    ? formatDateTime(row.travelReturnAt)
    : formatTravelDateText(getRequestDetailField(row.requestDetails, "Return"));
  const destination = getRequestDetailField(row.requestDetails, "Destination");
  const projectName = getRequestDetailField(row.requestDetails, "Project name");
  const purpose = getRequestDetailField(row.requestDetails, "Purpose of travel");
  const expectedOutput = getRequestDetailField(row.requestDetails, "Expected output");
  const driverCar =
    row.fleetDriverName || row.fleetVehicleName
      ? [
          row.fleetDriverName,
          row.fleetVehicleName
            ? `${row.fleetVehicleName}${row.fleetVehiclePlateNumber ? ` (${row.fleetVehiclePlateNumber})` : ""}`
            : "",
        ]
          .filter(Boolean)
          .join(" / ")
      : "";
  const cancellation = [row.cancellationReason, row.cancellationReasonDetail].filter(Boolean).join(" — ");
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const dataRow = (label: string, value: string) =>
    `<tr><td class="d-label">${escapeHtml(label)}</td><td class="d-value">${escapeHtml(value || "")}</td></tr>`;

  const signatureBlock = (caption: string, name: string, position: string) =>
    `<div class="sig">
      <div class="sig-row"><span class="sig-caption">${escapeHtml(caption)}</span><span class="sig-line"></span></div>
      <div class="sig-name">${escapeHtml(name)}</div>
      <div class="sig-pos">${escapeHtml(position)}</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Travel Order ${escapeHtml(row.ticketNumber ?? "")}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 32px; font-size: 12px; padding-bottom: 130px; }
  .lh-img { display: block; width: 100%; max-width: 620px; height: auto; margin: 0 auto; }
  .lh-bar { height: 6px; background: linear-gradient(90deg, #6cb33f, #2f7d32); border-radius: 2px; margin: 10px 0 6px; }
  .ticket { text-align: right; font-size: 12px; }
  .title { text-align: center; font-size: 20px; font-weight: 800; letter-spacing: 1px; margin: 14px 0 18px; }
  .top { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; margin-bottom: 16px; }
  .top .lbl { font-weight: 700; }
  .block { border-top: 2px solid #1f2937; border-bottom: 2px solid #1f2937; }
  .block table { width: 100%; border-collapse: collapse; }
  .block td { padding: 9px 4px; font-size: 12px; vertical-align: top; }
  .d-label { font-weight: 700; width: 260px; }
  .cancel { margin: 14px 0 28px; }
  .cancel .lbl { font-weight: 700; }
  .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 34px 48px; margin-top: 24px; }
  .sig-row { display: flex; align-items: flex-end; gap: 10px; }
  .sig-caption { white-space: nowrap; padding-bottom: 2px; }
  .sig-line { flex: 1; border-bottom: 1px solid #1f2937; height: 30px; }
  .sig-name { text-align: center; font-weight: 700; text-transform: uppercase; margin-top: 4px; }
  .sig-pos { text-align: center; font-size: 11px; }
  .footer-wrap { position: fixed; left: 0; right: 0; bottom: 16px; text-align: center; }
  .footer-img { display: inline-block; width: 80%; max-width: 560px; height: auto; }
  @media print { body { margin: 18px; } }
</style>
</head>
<body>
  <img class="lh-img" src="${origin}/to-header.png" alt="ENVI-COMM Corporation" />
  <div class="lh-bar"></div>
  <div class="ticket">${escapeHtml(row.ticketNumber ?? "")}</div>

  <div class="title">TRAVEL ORDER FORM</div>

  <div class="top">
    <div><span class="lbl">Passengers:</span> ${escapeHtml(passengerNames)}</div>
    <div><span class="lbl">Team:</span> ${escapeHtml(row.requesterDepartment ?? "")}</div>
    <div><span class="lbl">Position/s:</span> ${escapeHtml(passengerPositions)}</div>
    <div><span class="lbl">Team/s:</span> </div>
  </div>

  <div class="block">
    <table><tbody>
      ${dataRow("Departure Date/Time:", departure)}
      ${dataRow("Estimated Back to Office Date/Time:", estimatedBack)}
      ${dataRow("Destination/s:", destination)}
      ${dataRow("Driver/Car:", driverCar)}
      ${dataRow("Project Name:", projectName)}
      ${dataRow("Purpose of Travel:", purpose)}
      ${dataRow("Expected Output:", expectedOutput)}
    </tbody></table>
  </div>

  <div class="cancel"><span class="lbl">Reason for Cancellation:</span> ${escapeHtml(cancellation)}</div>

  <div class="sigs">
    ${signatureBlock("Prepared By:", row.requesterName ?? "", "")}
    ${signatureBlock("Reviewed By:", "", "")}
    ${signatureBlock("Pre-Approved By:", "", "")}
    ${signatureBlock("Approved By:", "Ivan Angelo Guillera", "Fleet & Admin Support")}
  </div>

  <div class="footer-wrap"><img class="footer-img" src="${origin}/to-footer.png" alt="Envi-comm: Environmental Compliance, Community and Commitment." /></div>

  <script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 250); });</script>
</body>
</html>`;
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
    case "Assigned":
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

function Chip({ label }: { label: string }) {
  const style = getChipStyle(label);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        background: style.background,
        color: style.color,
        fontSize: "12px",
        fontWeight: 600,
        lineHeight: 1.2,
      }}
    >
      {label}
    </span>
  );
}

function getFleetInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "DR";
}

function getFleetAvatarPalette(): { background: string; color: string } {
  return { background: "#e5e7eb", color: "#374151" };
}

function getFleetStatusBadgeStyle(status: string): CSSProperties {
  if (status === "Available") return { background: "#dcfce7", color: "#166534" };
  if (status === "Assigned") return { background: "#dbeafe", color: "#1d4ed8" };
  if (status === "Maintenance") return { background: "#fef3c7", color: "#92400e" };
  return { background: "#e5e7eb", color: "#374151" };
}

function getDriverStatusStyle(status: string): CSSProperties {
  if (status === "Available") {
    return { background: "#dcfce7", color: "#166534" };
  }
  if (status === "Assigned") {
    return { background: "#fef3c7", color: "#92400e" };
  }
  if (status === "Unavailable") {
    return { background: "#fee2e2", color: "#991b1b" };
  }
  return { background: "#e5e7eb", color: "#374151" };
}

function formatDriverHoverDetails(driver: FleetDriverAvailabilityRow) {
  return [
    driver.name,
    `Status: ${driver.status}`,
    `Position: ${driver.position ?? "Driver"}`,
    `Contact: ${driver.contactNumber ?? "-"}`,
    driver.notes ? `Notes: ${driver.notes}` : "",
  ].filter(Boolean).join("\n");
}

function FleetAvailabilitySection(props: {
  loading: boolean;
  drivers: FleetDriverAvailabilityRow[];
  vehicles: FleetVehicleAvailabilityRow[];
  canManage: boolean;
  onManage: () => void;
}) {
  const availableDriverCount = props.drivers.filter((driver) => driver.status === "Available").length;
  const [availFrom, setAvailFrom] = useState("");
  const [availTo, setAvailTo] = useState("");
  const fromMs = toTimestamp(availFrom);
  const toMs = toTimestamp(availTo);
  const rangeValid = fromMs !== undefined && toMs !== undefined && toMs > fromMs;
  const availability = useQuery(
    api.fleet.getFleetAvailability,
    rangeValid ? { from: fromMs, to: toMs } : "skip",
  );
  const pill = (ok: boolean) => ({
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 999,
    background: ok ? "rgba(34,197,94,0.15)" : "rgba(148,163,184,0.18)",
    color: ok ? "rgb(21,128,61)" : "#475569",
    border: ok ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(148,163,184,0.3)",
    whiteSpace: "nowrap" as const,
  });
  const [checkerOpen, setCheckerOpen] = useState(false);
  return (
    <section className="monitoring-fleet-panel" aria-label="Fleet availability">
      <div className="monitoring-fleet-head">
        <div>
          <h2 className="type-section-title">Fleet Availability</h2>
        </div>
        <div className="monitoring-fleet-head-actions">
          <div className="monitoring-fleet-counts" aria-label="Fleet availability counts">
            <span>{availableDriverCount}/{props.drivers.length} drivers available</span>
            <span>{props.vehicles.length} vehicles</span>
          </div>
          {props.canManage ? (
            <button type="button" className="btn-secondary" onClick={props.onManage}>
              Manage Fleet
            </button>
          ) : null}
        </div>
      </div>

      {/* Collapsible availability checker — hidden until needed to keep the card calm */}
      <button
        type="button"
        onClick={() => setCheckerOpen((open) => !open)}
        aria-expanded={checkerOpen}
        style={{
          border: 0,
          background: "none",
          padding: "2px 0",
          font: "inherit",
          fontSize: 13,
          fontWeight: 700,
          color: "rgb(var(--brand-900-rgb))",
          cursor: "pointer",
          textAlign: "left",
          width: "fit-content",
        }}
      >
        {checkerOpen ? "▾" : "▸"} Check availability for a date/time
      </button>
      {checkerOpen ? (
        <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border-subtle)", paddingTop: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              <span style={{ color: "var(--muted)" }}>From</span>
              <input className="input-base" type="datetime-local" value={availFrom} onChange={(e) => setAvailFrom(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
              <span style={{ color: "var(--muted)" }}>To</span>
              <input className="input-base" type="datetime-local" value={availTo} onChange={(e) => setAvailTo(e.target.value)} />
            </label>
            {availFrom || availTo ? (
              <button type="button" className="btn-secondary" onClick={() => { setAvailFrom(""); setAvailTo(""); }}>
                Clear
              </button>
            ) : null}
          </div>

          {availFrom && availTo && !rangeValid ? (
            <span style={{ fontSize: 12, color: "#991b1b" }}>The “To” time must be after the “From” time.</span>
          ) : null}

          {rangeValid ? (
            availability === undefined ? (
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Checking availability…</span>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    Drivers — {availability.drivers.filter((d) => d.available).length} of {availability.drivers.length} free
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {availability.drivers.map((d) => (
                      <span
                        key={String(d._id)}
                        style={pill(d.available)}
                        title={
                          d.conflict
                            ? `Booked: ${d.conflict.ticketNumber} — ${d.conflict.title}`
                            : d.outOfService
                              ? `Out of service (${d.status})`
                              : "Available for this window"
                        }
                      >
                        {d.name}
                        {!d.available && d.conflict ? ` · ${d.conflict.ticketNumber}` : ""}
                        {!d.available && d.outOfService ? ` · ${d.status}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    Vehicles — {availability.vehicles.filter((v) => v.available).length} of {availability.vehicles.length} free
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {availability.vehicles.map((v) => (
                      <span
                        key={String(v._id)}
                        style={pill(v.available)}
                        title={
                          v.conflict
                            ? `Booked: ${v.conflict.ticketNumber} — ${v.conflict.title}`
                            : v.outOfService
                              ? `Out of service (${v.status})`
                              : "Available for this window"
                        }
                      >
                        {v.name}{v.plateNumber ? ` (${v.plateNumber})` : ""}
                        {!v.available && v.conflict ? ` · ${v.conflict.ticketNumber}` : ""}
                        {!v.available && v.outOfService ? ` · ${v.status}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )
          ) : null}
        </div>
      ) : null}

      <div className="monitoring-fleet-grid">
        <div className="monitoring-fleet-column">
          <div className="monitoring-fleet-column-head">
            <strong>Drivers</strong>
          </div>
          <div
            className="monitoring-driver-profile-row"
            style={{ display: "flex", gap: 8, overflowX: "auto", overflowY: "hidden", padding: "2px 2px 10px" }}
          >
            {props.loading ? (
              <div className="monitoring-fleet-empty">Loading available drivers...</div>
            ) : props.drivers.length ? (
              props.drivers.map((driver) => (
                <article
                  key={String(driver._id)}
                  className="monitoring-driver-profile"
                  tabIndex={0}
                  aria-label={`${driver.name}, ${driver.status}`}
                  title={formatDriverHoverDetails(driver)}
                  style={{
                    position: "relative",
                    flex: "0 0 74px",
                    display: "grid",
                    justifyItems: "center",
                    alignContent: "start",
                    gap: 4,
                    minHeight: 96,
                    padding: 2,
                    borderRadius: 12,
                    outline: "none",
                  }}
                >
                  <span
                    className="monitoring-driver-status"
                    style={{
                      ...getDriverStatusStyle(driver.status),
                      maxWidth: 70,
                      padding: "2px 6px",
                      borderRadius: 999,
                      fontSize: 9,
                      fontWeight: 800,
                      lineHeight: 1.2,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {driver.status}
                  </span>
                  <div
                    className="monitoring-driver-avatar"
                    aria-hidden="true"
                    style={{
                      width: 44,
                      height: 44,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      background: "#e5e7eb",
                      color: "#374151",
                      fontSize: 14,
                      fontWeight: 900,
                      letterSpacing: 0,
                    }}
                  >
                    {getFleetInitials(driver.name)}
                  </div>
                  <strong
                    className="monitoring-driver-name"
                    style={{
                      width: "100%",
                      color: "var(--foreground)",
                      fontSize: 11,
                      lineHeight: 1.25,
                      textAlign: "center",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {driver.name}
                  </strong>
                </article>
              ))
            ) : (
              <div className="monitoring-fleet-empty">No drivers have been added yet.</div>
            )}
          </div>
        </div>

        <div className="monitoring-fleet-column">
          <div className="monitoring-fleet-column-head">
            <strong>Available Vehicles</strong>
            <Chip label={String(props.vehicles.length)} />
          </div>
          <div
            className="monitoring-vehicle-scroll-list"
            style={{ display: "flex", gap: 8, overflowX: "auto", overflowY: "hidden", padding: "2px 2px 10px" }}
          >
            {props.loading ? (
              <div className="monitoring-fleet-empty">Loading available vehicles...</div>
            ) : props.vehicles.length ? (
              props.vehicles.map((vehicle) => (
                <article
                  key={String(vehicle._id)}
                  className="monitoring-driver-profile"
                  tabIndex={0}
                  aria-label={`${vehicle.name}, ${vehicle.status}`}
                  title={[vehicle.vehicleType, vehicle.plateNumber, vehicle.capacity ? `Capacity: ${vehicle.capacity}` : null].filter(Boolean).join(" | ")}
                  style={{
                    position: "relative",
                    flex: "0 0 74px",
                    display: "grid",
                    justifyItems: "center",
                    alignContent: "start",
                    gap: 4,
                    minHeight: 96,
                    padding: 2,
                    borderRadius: 12,
                    outline: "none",
                  }}
                >
                  <span
                    style={{
                      maxWidth: 70,
                      padding: "2px 6px",
                      borderRadius: 999,
                      fontSize: 9,
                      fontWeight: 800,
                      lineHeight: 1.2,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      background: vehicle.status === "Available" ? "rgba(34,197,94,0.15)" : "rgba(var(--brand-900-rgb),0.08)",
                      color: vehicle.status === "Available" ? "rgb(21,128,61)" : "var(--foreground)",
                    }}
                  >
                    {vehicle.status}
                  </span>
                  <div
                    aria-hidden="true"
                    style={{
                      width: 44,
                      height: 44,
                      display: "grid",
                      placeItems: "center",
                      borderRadius: 999,
                      border: "1px solid #d1d5db",
                      background: "#e5e7eb",
                      color: "#374151",
                    }}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 11L7 5H17L19 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      <rect x="2" y="11" width="20" height="7" rx="2" stroke="currentColor" strokeWidth="1.7" />
                      <circle cx="6.5" cy="18.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="17.5" cy="18.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M2 14H22" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                  </div>
                  <strong
                    style={{
                      width: "100%",
                      color: "var(--foreground)",
                      fontSize: 11,
                      lineHeight: 1.25,
                      textAlign: "center",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {vehicle.name}
                  </strong>
                </article>
              ))
            ) : (
              <div className="monitoring-fleet-empty">No vehicles are marked available right now.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function FleetManagementModal(props: {
  open: boolean;
  loading: boolean;
  drivers: FleetDriverAvailabilityRow[];
  vehicles: FleetVehicleAvailabilityRow[];
  driverForm: FleetDriverFormState;
  vehicleForm: FleetVehicleFormState;
  editingDriverId: Id<"fleetDrivers"> | null;
  editingVehicleId: Id<"fleetVehicles"> | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onDriverFormChange: (form: FleetDriverFormState) => void;
  onVehicleFormChange: (form: FleetVehicleFormState) => void;
  onSaveDriver: () => void;
  onSaveVehicle: () => void;
  onEditDriver: (driver: FleetDriverAvailabilityRow) => void;
  onEditVehicle: (vehicle: FleetVehicleAvailabilityRow) => void;
  onDeleteDriver: (driver: FleetDriverAvailabilityRow) => void;
  onDeleteVehicle: (vehicle: FleetVehicleAvailabilityRow) => void;
  onResetDriver: () => void;
  onResetVehicle: () => void;
}) {
  if (!props.open) return null;

  return (
    <MonitoringFormModal open={props.open} onClose={props.onClose} width={1080}>
      <section className="saas-card monitoring-form-card monitoring-fleet-manage-card">
        <div className="monitoring-form-head">
          <div className="type-section-title">Fleet Management</div>
          <div className="type-helper">HR/Admin and Admin can add, edit, or remove drivers and vehicles.</div>
        </div>
        <FormErrorBanner message={props.error} />

        <div className="monitoring-fleet-manage-grid">
          <section className="monitoring-fleet-manage-section">
            <div className="monitoring-fleet-column-head">
              <strong>{props.editingDriverId ? "Edit Driver" : "Add Driver"}</strong>
              {props.editingDriverId ? (
                <button type="button" className="btn-secondary" onClick={props.onResetDriver} disabled={props.saving}>
                  New Driver
                </button>
              ) : null}
            </div>
            <div className="monitoring-form-grid">
              <FieldGroup label="Driver Name" required>
                <input
                  className="input-base"
                  value={props.driverForm.name}
                  onChange={(event) => props.onDriverFormChange({ ...props.driverForm, name: event.target.value })}
                  placeholder="Full name"
                />
              </FieldGroup>
              <FieldGroup label="Position">
                <input
                  className="input-base"
                  value={props.driverForm.position}
                  onChange={(event) => props.onDriverFormChange({ ...props.driverForm, position: event.target.value })}
                  placeholder="Company Driver"
                />
              </FieldGroup>
              <FieldGroup label="Contact Number">
                <input
                  className="input-base"
                  value={props.driverForm.contactNumber}
                  onChange={(event) =>
                    props.onDriverFormChange({ ...props.driverForm, contactNumber: event.target.value })
                  }
                  placeholder="Mobile number"
                />
              </FieldGroup>
              <FieldGroup label="Status" required>
                <select
                  className="input-base"
                  value={props.driverForm.status}
                  onChange={(event) => props.onDriverFormChange({ ...props.driverForm, status: event.target.value })}
                >
                  {FLEET_DRIVER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </FieldGroup>
            </div>
            <FieldGroup label="Notes">
              <textarea
                className="input-base monitoring-form-textarea"
                value={props.driverForm.notes}
                onChange={(event) => props.onDriverFormChange({ ...props.driverForm, notes: event.target.value })}
                placeholder="Optional notes"
              />
            </FieldGroup>
            <div className="monitoring-form-actions">
              <button type="button" className="btn-primary" onClick={props.onSaveDriver} disabled={props.saving}>
                {props.saving ? "Saving..." : props.editingDriverId ? "Save Driver" : "Add Driver"}
              </button>
            </div>

            <div className="fleet-manage-card-grid">
              {props.loading ? (
                <div className="monitoring-fleet-empty" style={{ gridColumn: "1/-1" }}>Loading drivers...</div>
              ) : props.drivers.length ? (
                props.drivers.map((driver) => (
                  <article key={driver._id} className="fleet-manage-card">
                    <div className="fleet-manage-card-top">
                      <div className="fleet-manage-avatar" style={getFleetAvatarPalette()}>
                        {getFleetInitials(driver.name)}
                      </div>
                      <span className="fleet-manage-badge" style={getFleetStatusBadgeStyle(driver.status)}>
                        {driver.status}
                      </span>
                    </div>
                    <div>
                      <div className="fleet-manage-name">{driver.name}</div>
                      <div className="fleet-manage-sub">{driver.position || "Driver"}</div>
                    </div>
                    {driver.contactNumber ? (
                      <div className="fleet-manage-contact">{driver.contactNumber}</div>
                    ) : null}
                    {driver.notes ? (
                      <div className="fleet-manage-notes">{driver.notes}</div>
                    ) : null}
                    <hr className="member-divider" />
                    <div className="member-action-row">
                      <button type="button" className="btn-secondary" style={{ flex: 1, fontSize: 12, padding: "5px 8px" }} onClick={() => props.onEditDriver(driver)}>Edit</button>
                      <button type="button" className="btn-secondary" style={{ flex: 1, fontSize: 12, padding: "5px 8px" }} onClick={() => props.onDeleteDriver(driver)}>Remove</button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="monitoring-fleet-empty" style={{ gridColumn: "1/-1" }}>No drivers added yet.</div>
              )}
            </div>
          </section>

          <section className="monitoring-fleet-manage-section">
            <div className="monitoring-fleet-column-head">
              <strong>{props.editingVehicleId ? "Edit Vehicle" : "Add Vehicle"}</strong>
              {props.editingVehicleId ? (
                <button type="button" className="btn-secondary" onClick={props.onResetVehicle} disabled={props.saving}>
                  New Vehicle
                </button>
              ) : null}
            </div>
            <div className="monitoring-form-grid">
              <FieldGroup label="Vehicle Name" required>
                <input
                  className="input-base"
                  value={props.vehicleForm.name}
                  onChange={(event) => props.onVehicleFormChange({ ...props.vehicleForm, name: event.target.value })}
                  placeholder="Toyota Hiace"
                />
              </FieldGroup>
              <FieldGroup label="Plate Number" required>
                <input
                  className="input-base"
                  value={props.vehicleForm.plateNumber}
                  onChange={(event) =>
                    props.onVehicleFormChange({ ...props.vehicleForm, plateNumber: event.target.value })
                  }
                  placeholder="ABC 1234"
                />
              </FieldGroup>
              <FieldGroup label="Type" required>
                <input
                  className="input-base"
                  value={props.vehicleForm.vehicleType}
                  onChange={(event) =>
                    props.onVehicleFormChange({ ...props.vehicleForm, vehicleType: event.target.value })
                  }
                  placeholder="Van, Sedan, Pickup"
                />
              </FieldGroup>
              <FieldGroup label="Capacity">
                <input
                  className="input-base"
                  type="number"
                  min="1"
                  value={props.vehicleForm.capacity}
                  onChange={(event) =>
                    props.onVehicleFormChange({ ...props.vehicleForm, capacity: event.target.value })
                  }
                  placeholder="Seats"
                />
              </FieldGroup>
              <FieldGroup label="Status" required>
                <select
                  className="input-base"
                  value={props.vehicleForm.status}
                  onChange={(event) => props.onVehicleFormChange({ ...props.vehicleForm, status: event.target.value })}
                >
                  {FLEET_VEHICLE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </FieldGroup>
            </div>
            <FieldGroup label="Notes">
              <textarea
                className="input-base monitoring-form-textarea"
                value={props.vehicleForm.notes}
                onChange={(event) => props.onVehicleFormChange({ ...props.vehicleForm, notes: event.target.value })}
                placeholder="Optional notes"
              />
            </FieldGroup>
            <div className="monitoring-form-actions">
              <button type="button" className="btn-primary" onClick={props.onSaveVehicle} disabled={props.saving}>
                {props.saving ? "Saving..." : props.editingVehicleId ? "Save Vehicle" : "Add Vehicle"}
              </button>
            </div>

            <div className="fleet-manage-card-grid">
              {props.loading ? (
                <div className="monitoring-fleet-empty" style={{ gridColumn: "1/-1" }}>Loading vehicles...</div>
              ) : props.vehicles.length ? (
                props.vehicles.map((vehicle) => (
                  <article key={vehicle._id} className="fleet-manage-card">
                    <div className="fleet-manage-card-top">
                      <div className="fleet-manage-avatar fleet-manage-avatar--vehicle">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14l4 4v4a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="7.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
                          <circle cx="17.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
                        </svg>
                      </div>
                      <span className="fleet-manage-badge" style={getFleetStatusBadgeStyle(vehicle.status)}>
                        {vehicle.status}
                      </span>
                    </div>
                    <div>
                      <div className="fleet-manage-name">{vehicle.name}</div>
                      <div className="fleet-manage-sub">{vehicle.vehicleType} · {vehicle.plateNumber}</div>
                    </div>
                    {vehicle.capacity ? (
                      <div className="fleet-manage-contact">{vehicle.capacity} seats</div>
                    ) : null}
                    {vehicle.notes ? (
                      <div className="fleet-manage-notes">{vehicle.notes}</div>
                    ) : null}
                    <hr className="member-divider" />
                    <div className="member-action-row">
                      <button type="button" className="btn-secondary" style={{ flex: 1, fontSize: 12, padding: "5px 8px" }} onClick={() => props.onEditVehicle(vehicle)}>Edit</button>
                      <button type="button" className="btn-secondary" style={{ flex: 1, fontSize: 12, padding: "5px 8px" }} onClick={() => props.onDeleteVehicle(vehicle)}>Remove</button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="monitoring-fleet-empty" style={{ gridColumn: "1/-1" }}>No vehicles added yet.</div>
              )}
            </div>
          </section>
        </div>

        <div className="monitoring-form-actions">
          <button type="button" className="btn-secondary" onClick={props.onClose} disabled={props.saving}>
            Close
          </button>
        </div>
      </section>
    </MonitoringFormModal>
  );
}

function FleetAssignmentModal(props: {
  open: boolean;
  ticket: FleetAssignmentTicket | null;
  form: FleetAssignmentFormState;
  drivers: FleetDriverAvailabilityRow[];
  vehicles: FleetVehicleAvailabilityRow[];
  saving: boolean;
  error: string;
  conflictWarning: { driverTickets: string[]; vehicleTickets: string[] } | null;
  overrideReason: string;
  onOverrideReasonChange: (value: string) => void;
  onClearConflict: () => void;
  onClose: () => void;
  onFormChange: (form: FleetAssignmentFormState) => void;
  onSave: (override?: boolean) => void;
}) {
  if (!props.open || !props.ticket) return null;

  const driverOptions = props.drivers.filter(
    (driver) => driver.status === "Available" || String(driver._id) === props.form.driverId,
  );
  const vehicleOptions = props.vehicles.filter(
    (vehicle) => vehicle.status === "Available" || String(vehicle._id) === props.form.vehicleId,
  );

  return (
    <MonitoringFormModal open={props.open} onClose={props.onClose} width={720}>
      <section className="saas-card monitoring-form-card">
        <div className="monitoring-form-head">
          <div className="type-section-title">Assign Driver and Vehicle</div>
          <div className="type-helper">
            {props.ticket.ticketNumber} | {props.ticket.title}
          </div>
        </div>
        <FormErrorBanner message={props.error} />

        {/* Conflict warning banner */}
        {props.conflictWarning ? (
          <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 8, background: "#fef3c7", border: "1px solid #fcd34d", display: "grid", gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e" }}>Conflict Detected</div>
            {props.conflictWarning.driverTickets.length > 0 ? (
              <div style={{ fontSize: 13, color: "#78350f" }}>
                Driver is already assigned to: <strong>{props.conflictWarning.driverTickets.join(", ")}</strong>
              </div>
            ) : null}
            {props.conflictWarning.vehicleTickets.length > 0 ? (
              <div style={{ fontSize: 13, color: "#78350f" }}>
                Vehicle is already assigned to: <strong>{props.conflictWarning.vehicleTickets.join(", ")}</strong>
              </div>
            ) : null}
            <div style={{ marginTop: 4 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#92400e" }}>Override reason (required to proceed)</span>
                <input
                  className="input-base"
                  value={props.overrideReason}
                  onChange={(e) => props.onOverrideReasonChange(e.target.value)}
                  placeholder="Explain why this conflict is being overridden"
                  style={{ fontSize: 13 }}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 13 }}
                onClick={props.onClearConflict}
              >
                Change Selection
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: 13, background: "#d97706" }}
                disabled={props.saving || !props.overrideReason.trim()}
                onClick={() => props.onSave(true)}
              >
                {props.saving ? "Saving..." : "Override & Assign"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="monitoring-form-grid">
          <FieldGroup label="Driver" required>
            <select
              className="input-base"
              value={props.form.driverId}
              onChange={(event) => { props.onFormChange({ ...props.form, driverId: event.target.value }); props.onClearConflict(); }}
            >
              <option value="">Select driver</option>
              {driverOptions.map((driver) => (
                <option key={driver._id} value={String(driver._id)}>
                  {driver.name} | {driver.status}
                </option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="Vehicle" required>
            <select
              className="input-base"
              value={props.form.vehicleId}
              onChange={(event) => { props.onFormChange({ ...props.form, vehicleId: event.target.value }); props.onClearConflict(); }}
            >
              <option value="">Select vehicle</option>
              {vehicleOptions.map((vehicle) => (
                <option key={vehicle._id} value={String(vehicle._id)}>
                  {vehicle.name} | {vehicle.plateNumber} | {vehicle.status}
                </option>
              ))}
            </select>
          </FieldGroup>
        </div>

        {props.ticket.fleetDriverName || props.ticket.fleetVehicleName ? (
          <div className="monitoring-fleet-assignment-current">
            Current assignment: {[props.ticket.fleetDriverName, props.ticket.fleetVehicleName].filter(Boolean).join(" | ")}
          </div>
        ) : null}

        {!props.conflictWarning ? (
          <div className="monitoring-form-actions">
            <button type="button" className="btn-secondary" onClick={props.onClose} disabled={props.saving}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => props.onSave(false)} disabled={props.saving}>
              {props.saving ? "Saving..." : "Save Assignment"}
            </button>
          </div>
        ) : null}
      </section>
    </MonitoringFormModal>
  );
}

function CheckboxRow(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="monitoring-form-checkbox">
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
    <label className="monitoring-form-field">
      <span className="monitoring-form-label">
        {props.label}
        {props.required ? <span className="monitoring-form-required"> *</span> : null}
      </span>
      {props.children}
      {props.helperText ? <span className="monitoring-form-helper">{props.helperText}</span> : null}
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

function FleetAssignIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 20a7 7 0 0 1 14 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TravelDoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5l4.2 4.2L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DepartIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12h13" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M11 7l5 5-5 5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 4v16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function ViewTicketIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12s3.4-6 9.5-6s9.5 6 9.5 6s-3.4 6-9.5 6s-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CancelTravelOrderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6L18 18M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ReopenTicketIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10a8 8 0 1 1 2.3 5.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 10V5m0 5h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExportPdfIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 15h6M9 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SharedTripIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExtendTripIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 3h4M20 1v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function UploadRecordingIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const MONITORING_TABS: ReadonlyArray<{ key: MonitoringTab; label: string; description: string }> = [
  { key: "issues", label: "IT Queue", description: "IT issues, approvals, and service requests." },
  { key: "hrAdmin", label: "Travel Orders", description: "Travel orders and HR/Admin service requests." },
  { key: "meetings", label: "Meeting Requests", description: "Teams support, room setup, and reserved assets." },
  { key: "borrowing", label: "Borrowing Requests", description: "Asset releases, return dates, and borrower records." },
  { key: "internet", label: "Internet Monitoring", description: "ISP outages, affected areas, and downtime logs." },
];

function isMonitoringTab(value: string | null): value is MonitoringTab {
  return value === "issues" || value === "hrAdmin" || value === "meetings" || value === "borrowing" || value === "internet";
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
    <div className="monitoring-form-error">
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
    <div className="reservation-form-overlay">
      <button type="button" className="reservation-form-backdrop" aria-label="Close form" onClick={props.onClose} />
      <div
        className="reservation-form-shell"
        role="dialog"
        aria-modal="true"
        style={{ width: `min(${props.width ?? 860}px, 100%)`, zIndex: 1 }}
      >
        <div className="monitoring-form-scroll">{props.children}</div>
      </div>
    </div>
  );
}

export default function MonitoringClient({ actorName }: MonitoringClientProps) {
  const currentUser = useCurrentUser();
  const currentServiceGroups = normalizeServiceGroups(currentUser?.role, currentUser?.serviceGroups);
  const hasAdminAccess = isAdminRole(currentUser?.role);
  // Monitoring tab access:
  //  - Admin: all tabs
  //  - OSMD team: IT Queue + Meeting Requests + Travel Orders
  //  - Everyone else: Travel Orders only
  const isOsmd = currentServiceGroups.includes("OSMD");
  const canSeeItQueue = hasAdminAccess || isOsmd;
  // Travel Orders tab is visible to everyone who can reach Monitoring.
  const canSeeHrAdminQueue = true;
  // Full HR/Admin staff manage the queue (fleet, HR service requests); other
  // approvers get read + approve on travel orders only.
  const isHrAdminStaff =
    hasAdminAccess ||
    currentUser?.department === "HR/Admin" ||
    currentServiceGroups.includes("HR/Admin");
  const visibleMonitoringTabs = useMemo(
    () =>
      MONITORING_TABS.filter((tab) => {
        if (hasAdminAccess) return true;
        if (tab.key === "hrAdmin") return true; // Travel Orders — everyone
        if (tab.key === "issues" || tab.key === "meetings") return isOsmd; // IT + Meetings — OSMD
        return false; // borrowing, internet — admin only
      }),
    [hasAdminAccess, isOsmd],
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const assets = useQuery(api.hardwareInventory.listAll, {});
  const fleetAvailability = useQuery(
    api.fleet.listAvailability,
    canSeeHrAdminQueue ? { includeUnavailable: true } : "skip",
  );
  const syncAutoClose = useMutation(api.monitoring.syncAutoClose);
  const createTicket = useMutation(api.monitoring.createTicket);
  const updateTicket = useMutation(api.monitoring.updateTicket);
  const createFleetDriver = useMutation(api.fleet.createDriver);
  const updateFleetDriver = useMutation(api.fleet.updateDriver);
  const deleteFleetDriver = useMutation(api.fleet.deleteDriver);
  const createFleetVehicle = useMutation(api.fleet.createVehicle);
  const updateFleetVehicle = useMutation(api.fleet.updateVehicle);
  const deleteFleetVehicle = useMutation(api.fleet.deleteVehicle);
  const assignTravelOrderFleet = useMutation(api.fleet.assignTravelOrderFleet);
  const cancelTravelOrderWithReason = useMutation(api.fleet.cancelTravelOrderWithReason);
  const assignSharedTripMutation = useMutation(api.fleet.assignSharedTrip);
  const markTravelOrderDone = useMutation(api.fleet.markTravelOrderDone);
  const markTravelOrderDeparted = useMutation(api.fleet.markTravelOrderDeparted);
  const reopenTravelOrder = useMutation(api.fleet.reopenTravelOrder);
  const recordTravelApproval = useMutation(api.monitoring.recordTravelOrderApprovalDecision);
  const [travelApprovalSavingId, setTravelApprovalSavingId] = useState("");
  const extendTravelOrderMutation = useMutation(api.fleet.extendTravelOrder);
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
  const [hrAdminDateFilter, setHrAdminDateFilter] = useState("");
  const [hrAdminArchiveView, setHrAdminArchiveView] = useState<HrAdminArchiveView>("active");
  // Travel Order archive -> Export to Excel (CSV) panel state.
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportRange, setExportRange] = useState<ExportRangePreset>("month");
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exportColumns, setExportColumns] = useState<TravelOrderExportColumnKey[]>(
    () => TRAVEL_ORDER_EXPORT_COLUMNS.map((column) => column.key),
  );
  const [exportMessage, setExportMessage] = useState("");
  const [meetingArchiveView, setMeetingArchiveView] = useState<"active" | "archive">("active");
  const [borrowingArchiveView, setBorrowingArchiveView] = useState<"active" | "archive">("active");
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
  const [, setMeetingStatusDrafts] = useState<Record<string, string>>({});
  const [showFleetManage, setShowFleetManage] = useState(false);
  const [fleetSaving, setFleetSaving] = useState(false);
  const [fleetError, setFleetError] = useState("");
  const [fleetDriverForm, setFleetDriverForm] = useState<FleetDriverFormState>(defaultFleetDriverForm);
  const [fleetVehicleForm, setFleetVehicleForm] = useState<FleetVehicleFormState>(defaultFleetVehicleForm);
  const [editingFleetDriverId, setEditingFleetDriverId] = useState<Id<"fleetDrivers"> | null>(null);
  const [editingFleetVehicleId, setEditingFleetVehicleId] = useState<Id<"fleetVehicles"> | null>(null);
  const [showFleetAssignment, setShowFleetAssignment] = useState(false);
  const [fleetAssignmentTicket, setFleetAssignmentTicket] = useState<FleetAssignmentTicket | null>(null);
  const [fleetAssignmentForm, setFleetAssignmentForm] =
    useState<FleetAssignmentFormState>(defaultFleetAssignmentForm);
  const [fleetAssignmentSaving, setFleetAssignmentSaving] = useState(false);
  const [fleetAssignmentError, setFleetAssignmentError] = useState("");
  // Conflict detection state
  const [fleetConflictWarning, setFleetConflictWarning] = useState<{ driverTickets: string[]; vehicleTickets: string[] } | null>(null);
  const [fleetOverrideReason, setFleetOverrideReason] = useState("");
  // Cancel with reason modal
  const [showCancelReasonModal, setShowCancelReasonModal] = useState(false);
  const [cancelReasonTicketId, setCancelReasonTicketId] = useState<Id<"monitoringTickets"> | null>(null);
  const [cancelReason, setCancelReason] = useState("No longer needed");
  const [cancelReasonDetail, setCancelReasonDetail] = useState("");
  const [cancelReasonSaving, setCancelReasonSaving] = useState(false);
  const [cancelReasonError, setCancelReasonError] = useState("");
  // Shared trip assignment modal
  const [showSharedTripModal, setShowSharedTripModal] = useState(false);
  const [sharedTripPrimaryId, setSharedTripPrimaryId] = useState<Id<"monitoringTickets"> | null>(null);
  const [sharedTripSecondaryId, setSharedTripSecondaryId] = useState("");
  const [sharedTripSaving, setSharedTripSaving] = useState(false);
  const [sharedTripError, setSharedTripError] = useState("");
  const [prioritySavingId, setPrioritySavingId] = useState("");
  const [travelDoneSavingId] = useState("");
  const [travelCancelSavingId] = useState("");
  const [travelReopenSavingId, setTravelReopenSavingId] = useState("");
  // Odometer modal for marking travel done
  const [showOdometerModal, setShowOdometerModal] = useState(false);
  const [odometerTicketId, setOdometerTicketId] = useState<Id<"monitoringTickets"> | null>(null);
  const [odometerStart, setOdometerStart] = useState("");
  const [odometerEnd, setOdometerEnd] = useState("");
  const [odometerStartFile, setOdometerStartFile] = useState<File | null>(null);
  const [odometerEndFile, setOdometerEndFile] = useState<File | null>(null);
  const [odometerArrival, setOdometerArrival] = useState("");
  const [odometerScheduledReturn, setOdometerScheduledReturn] = useState<number | null>(null);
  const [odometerSaving, setOdometerSaving] = useState(false);
  const [odometerError, setOdometerError] = useState("");
  // Mark as Departed modal state.
  const [showDepartedModal, setShowDepartedModal] = useState(false);
  const [departedTicketId, setDepartedTicketId] = useState<Id<"monitoringTickets"> | null>(null);
  const [departedTime, setDepartedTime] = useState("");
  const [departedScheduledDeparture, setDepartedScheduledDeparture] = useState<number | null>(null);
  const [departedSaving, setDepartedSaving] = useState(false);
  const [departedError, setDepartedError] = useState("");
  const [borrowingActionSavingId, setBorrowingActionSavingId] = useState("");
  const [borrowingConfirm, setBorrowingConfirm] = useState<{ message: string; label: string; onConfirm: () => void } | null>(null);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendTicketId, setExtendTicketId] = useState<Id<"monitoringTickets"> | null>(null);
  const [extendNewReturnAt, setExtendNewReturnAt] = useState("");
  const [extendReason, setExtendReason] = useState("");
  const [extendSaving, setExtendSaving] = useState(false);
  const [extendError, setExtendError] = useState("");
  // Borrowing return condition modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnModalTicket, setReturnModalTicket] = useState<{ id: Id<"monitoringTickets">; items: Array<{ assetId: string; assetTag: string; assetLabel: string }> } | null>(null);
  const [returnConditions, setReturnConditions] = useState<Record<string, { condition: string; note: string }>>({});
  const [returnModalSaving, setReturnModalSaving] = useState(false);
  const [returnModalError, setReturnModalError] = useState("");
  const [meetingDoneConfirmId, setMeetingDoneConfirmId] = useState<Id<"monitoringTickets"> | null>(null);
  const [meetingDoneNote, setMeetingDoneNote] = useState("");
  const [meetingDoneRecording, setMeetingDoneRecording] = useState<File | null>(null);
  const [meetingDoneSaving, setMeetingDoneSaving] = useState(false);
  const [meetingDoneError, setMeetingDoneError] = useState("");
  const meetingDoneRecordingRef = useRef<HTMLInputElement | null>(null);
  const [archiveRecordingUploadId, setArchiveRecordingUploadId] = useState<Id<"monitoringTickets"> | null>(null);
  const [archiveRecordingUploading, setArchiveRecordingUploading] = useState(false);
  const archiveRecordingInputRef = useRef<HTMLInputElement | null>(null);
  const issueAttachmentRef = useRef<HTMLInputElement | null>(null);
  const borrowingAttachmentRef = useRef<HTMLInputElement | null>(null);
  const deferredIssueSearch = useDeferredValue(issueSearch);
  const deferredBorrowingAssetSearch = useDeferredValue(borrowingAssetSearch);
  const deferredMeetingAssetSearch = useDeferredValue(meetingAssetSearch);
  const deferredInternetSearch = useDeferredValue(internetSearch);

  useEffect(() => {
    const requestedTab = searchParams?.get("tab") ?? null;
    if (isMonitoringTab(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (visibleMonitoringTabs.some((tab) => tab.key === activeTab)) return;
    setActiveTab(visibleMonitoringTabs[0]?.key ?? "issues");
  }, [activeTab, visibleMonitoringTabs]);

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
  const notificationIssueRows = useQuery(api.monitoring.list, {
    view: "issues",
    showClosed: true,
  });
  const notificationInternetRows = useQuery(api.monitoring.list, {
    view: "internet",
    showClosed: true,
  });
  const generalIssueRows = [...(issueRows ?? [])]
    .filter(
      (row) =>
        row.category !== MONITORING_MEETING_REQUEST_CATEGORY &&
        row.category !== MONITORING_BORROWING_REQUEST_CATEGORY &&
        getServiceGroupForCategory(row.category) === "IT",
    )
    .filter((row) => {
      if (requestStatusFilters.length === 0) return true;
      const requestState = getDisplayStatusLabel(row.status, row.category) === "Closed" ? "Closed" : "Open";
      return requestStatusFilters.includes(requestState);
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const hrAdminRequestRows = [...(issueRows ?? [])]
    .filter((row) => getServiceGroupForCategory(row.category) === "HR/Admin")
    // Pure travel approvers (not HR/Admin staff) only see travel orders, not HR service requests.
    .filter((row) => isHrAdminStaff || row.category === MONITORING_TRAVEL_ORDER_CATEGORY)
    .filter((row) => {
      const displayStatus = getTravelOrderDisplayStatus(row);
      const archived = displayStatus === "Fulfilled" || displayStatus === "Closed" || displayStatus === "Done";
      return hrAdminArchiveView === "archive" ? archived : !archived;
    })
    .filter((row) => {
      if (!hrAdminDateFilter) return true;
      return formatDateFilterValue(row.requestReceivedAt) === hrAdminDateFilter;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const meetingStatusFilterValues = [...getMeetingRequestStatusOptions(), "Closed"];
  const meetingRequestRows = [...(issueRows ?? [])]
    .filter((row) => row.category === MONITORING_MEETING_REQUEST_CATEGORY)
    .filter((row) => {
      const normalized = normalizeMeetingRequestStatusValue(row.status);
      const isDone = normalized === "Done" || row.status === "Closed";
      return meetingArchiveView === "archive" ? isDone : !isDone;
    })
    .filter((row) =>
      meetingStatusFilters.length === 0
        ? true
        : meetingStatusFilters.includes(getDisplayStatusLabel(row.status, row.category)),
    )
    .sort((left, right) => right.createdAt - left.createdAt);
  const borrowingRequestRows = [...(issueRows ?? [])]
    .filter((row) => row.category === MONITORING_BORROWING_REQUEST_CATEGORY)
    .filter((row) => {
      const archived = row.status === "Fulfilled" || row.status === "Closed";
      return borrowingArchiveView === "archive" ? archived : !archived;
    })
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
  const tabNotificationCounts: Record<MonitoringTab, number> = {
    issues: (notificationIssueRows ?? []).filter(
      (row) =>
        row.category !== MONITORING_MEETING_REQUEST_CATEGORY &&
        row.category !== MONITORING_BORROWING_REQUEST_CATEGORY &&
        getServiceGroupForCategory(row.category) === "IT" &&
        !(row.notificationSeenByGroups ?? []).includes("IT") &&
        getDisplayStatusLabel(row.status, row.category) === "New",
    ).length,
    hrAdmin: (notificationIssueRows ?? []).filter(
      (row) =>
        getServiceGroupForCategory(row.category) === "HR/Admin" &&
        !(row.notificationSeenByGroups ?? []).includes("HR/Admin") &&
        getTravelOrderDisplayStatus(row) === "New",
    ).length,
    meetings: (notificationIssueRows ?? []).filter(
      (row) =>
        row.category === MONITORING_MEETING_REQUEST_CATEGORY &&
        !(row.notificationSeenByGroups ?? []).includes("IT") &&
        getDisplayStatusLabel(row.status, row.category) === "New",
    ).length,
    borrowing: (notificationIssueRows ?? []).filter(
      (row) =>
        row.category === MONITORING_BORROWING_REQUEST_CATEGORY &&
        !(row.notificationSeenByGroups ?? []).includes("IT") &&
        getDisplayStatusLabel(row.status, row.category) === "New",
    ).length,
    internet: (notificationInternetRows ?? []).filter(
      (row) => row.status === "Investigating" && !(row.notificationSeenByGroups ?? []).includes("IT"),
    ).length,
  };

  const requestRows =
    activeTab === "meetings"
      ? meetingRequestRows
      : activeTab === "borrowing"
        ? borrowingRequestRows
        : activeTab === "hrAdmin"
          ? hrAdminRequestRows
          : generalIssueRows;
  const requestSearchPlaceholder =
    activeTab === "meetings"
      ? "Search requester, request #, meeting, location"
      : activeTab === "borrowing"
        ? "Search requester, request #, asset, borrower"
        : activeTab === "hrAdmin"
          ? "Search requester, ticket #, travel order"
          : "Search requester, ticket #, concern";
  const requestEmptyState =
    activeTab === "meetings"
      ? meetingArchiveView === "archive"
        ? "No archived meeting requests match the current filters."
        : "No active meeting requests match the current filters."
      : activeTab === "borrowing"
        ? "No borrowing requests match the current filters."
        : activeTab === "hrAdmin"
          ? hrAdminArchiveView === "archive"
            ? "No archived HR/Admin requests match the current filters."
            : "No active HR/Admin requests match the current filters."
          : "No IT tickets match the current filters.";
  const requestMetaColumnLabel =
    activeTab === "meetings"
      ? "Meeting Mode"
      : activeTab === "borrowing"
        ? "Linked Assets"
        : activeTab === "hrAdmin"
          ? "Fleet Assignment"
          : "Approval";
  const canApproveMeetings =
    hasAdminAccess ||
    currentUser?.role === "approver" ||
    currentServiceGroups.includes("OSMD");
  const showRequestTypeColumn = activeTab !== "meetings" && activeTab !== "hrAdmin";
  const showPriorityColumn = activeTab !== "meetings";
  const showFleetActionColumn = activeTab === "hrAdmin";
  const showMeetingActionColumn = activeTab === "meetings";
  const showBorrowingActionColumn = activeTab === "borrowing";
  const showScheduleColumn = activeTab !== "hrAdmin";
  const requestColumnCount =
    6 +
    (showRequestTypeColumn ? 1 : 0) +
    (showPriorityColumn ? 1 : 0) +
    (showFleetActionColumn ? 1 : 0) +
    (showMeetingActionColumn ? 1 : 0) +
    (showBorrowingActionColumn ? 1 : 0) +
    (showScheduleColumn ? 1 : 0);
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
  const fleetDrivers = (fleetAvailability?.drivers ?? []) as FleetDriverAvailabilityRow[];
  const fleetVehicles = (fleetAvailability?.vehicles ?? []) as FleetVehicleAvailabilityRow[];
  const availableFleetVehicles = fleetVehicles.filter((vehicle) => vehicle.status === "Available");
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

  async function handleMeetingMarkDone() {
    if (!meetingDoneConfirmId) return;
    if (!meetingDoneNote.trim()) {
      setMeetingDoneError("A fulfillment note is required.");
      return;
    }
    setMeetingDoneSaving(true);
    setMeetingDoneError("");
    try {
      const recordingStorageId = meetingDoneRecording
        ? await uploadFileToStorage(meetingDoneRecording, "Recording upload failed.")
        : undefined;
      await updateTicket({
        ticketId: meetingDoneConfirmId,
        actorName,
        status: "Done",
        fulfillmentNote: meetingDoneNote.trim(),
        ...(recordingStorageId
          ? {
              attachments: [{
                kind: "Meeting Recording" as const,
                label: "Meeting recording",
                fileName: meetingDoneRecording?.name ?? "Meeting recording",
                contentType: meetingDoneRecording?.type || undefined,
                storageId: recordingStorageId,
                uploadedBy: actorName,
              }],
            }
          : {}),
      });
      setMeetingDoneConfirmId(null);
      setMeetingDoneNote("");
      setMeetingDoneRecording(null);
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Failed to mark as Done.";
      const cleaned = raw
        .replace(/^\[CONVEX[^\]]*\]\s*(\[Request[^\]]*\])?\s*(Server Error\s*)?(Uncaught Error:\s*)?/i, "")
        .replace(/\s+at handler[\s\S]*$/i, "")
        .trim();
      setMeetingDoneError(cleaned || raw);
    } finally {
      setMeetingDoneSaving(false);
    }
  }

  async function handleArchiveRecordingUpload(ticketId: Id<"monitoringTickets">, file: File) {
    setArchiveRecordingUploading(true);
    setRequestTableError("");
    try {
      const storageId = await uploadFileToStorage(file, "Recording upload failed.");
      if (!storageId) throw new Error("Recording upload failed.");
      await updateTicket({
        ticketId,
        actorName,
        attachments: [{
          kind: "Meeting Recording" as const,
          label: "Meeting recording",
          fileName: file.name,
          contentType: file.type || undefined,
          storageId,
          uploadedBy: actorName,
        }],
      });
      setArchiveRecordingUploadId(null);
    } catch (error) {
      setRequestTableError(error instanceof Error ? error.message : "Recording upload failed.");
    } finally {
      setArchiveRecordingUploading(false);
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
      if (!meetingEndAt) {
        throw new Error("Meeting end is required.");
      }
      if (meetingEndAt <= meetingStartAt) {
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

  function resetFleetDriverForm() {
    setEditingFleetDriverId(null);
    setFleetDriverForm(defaultFleetDriverForm);
    setFleetError("");
  }

  function resetFleetVehicleForm() {
    setEditingFleetVehicleId(null);
    setFleetVehicleForm(defaultFleetVehicleForm);
    setFleetError("");
  }

  function editFleetDriver(driver: FleetDriverAvailabilityRow) {
    setEditingFleetDriverId(driver._id);
    setFleetDriverForm({
      name: driver.name,
      position: driver.position ?? "",
      contactNumber: driver.contactNumber ?? "",
      status: driver.status,
      notes: driver.notes ?? "",
    });
    setFleetError("");
  }

  function editFleetVehicle(vehicle: FleetVehicleAvailabilityRow) {
    setEditingFleetVehicleId(vehicle._id);
    setFleetVehicleForm({
      name: vehicle.name,
      plateNumber: vehicle.plateNumber,
      vehicleType: vehicle.vehicleType,
      capacity: vehicle.capacity ? String(vehicle.capacity) : "",
      status: vehicle.status,
      notes: vehicle.notes ?? "",
    });
    setFleetError("");
  }

  async function handleSaveFleetDriver() {
    try {
      setFleetSaving(true);
      setFleetError("");
      const payload = {
        name: fleetDriverForm.name,
        position: fleetDriverForm.position || undefined,
        contactNumber: fleetDriverForm.contactNumber || undefined,
        status: fleetDriverForm.status,
        notes: fleetDriverForm.notes || undefined,
      };

      if (editingFleetDriverId) {
        await updateFleetDriver({ driverId: editingFleetDriverId, ...payload });
      } else {
        await createFleetDriver(payload);
      }

      resetFleetDriverForm();
    } catch (error) {
      setFleetError(error instanceof Error ? error.message : "Driver save failed.");
    } finally {
      setFleetSaving(false);
    }
  }

  async function handleSaveFleetVehicle() {
    try {
      setFleetSaving(true);
      setFleetError("");
      const capacity = fleetVehicleForm.capacity.trim() ? Number(fleetVehicleForm.capacity) : undefined;
      const payload = {
        name: fleetVehicleForm.name,
        plateNumber: fleetVehicleForm.plateNumber,
        vehicleType: fleetVehicleForm.vehicleType,
        capacity,
        status: fleetVehicleForm.status,
        notes: fleetVehicleForm.notes || undefined,
      };

      if (editingFleetVehicleId) {
        await updateFleetVehicle({ vehicleId: editingFleetVehicleId, ...payload });
      } else {
        await createFleetVehicle(payload);
      }

      resetFleetVehicleForm();
    } catch (error) {
      setFleetError(error instanceof Error ? error.message : "Vehicle save failed.");
    } finally {
      setFleetSaving(false);
    }
  }

  async function handleDeleteFleetDriver(driver: FleetDriverAvailabilityRow) {
    if (!window.confirm(`Remove driver "${driver.name}" from the fleet list?`)) return;
    try {
      setFleetSaving(true);
      setFleetError("");
      await deleteFleetDriver({ driverId: driver._id });
      if (editingFleetDriverId === driver._id) {
        resetFleetDriverForm();
      }
    } catch (error) {
      setFleetError(error instanceof Error ? error.message : "Driver remove failed.");
    } finally {
      setFleetSaving(false);
    }
  }

  async function handleDeleteFleetVehicle(vehicle: FleetVehicleAvailabilityRow) {
    if (!window.confirm(`Remove vehicle "${vehicle.name}" from the fleet list?`)) return;
    try {
      setFleetSaving(true);
      setFleetError("");
      await deleteFleetVehicle({ vehicleId: vehicle._id });
      if (editingFleetVehicleId === vehicle._id) {
        resetFleetVehicleForm();
      }
    } catch (error) {
      setFleetError(error instanceof Error ? error.message : "Vehicle remove failed.");
    } finally {
      setFleetSaving(false);
    }
  }

  function openFleetAssignmentModal(ticket: FleetAssignmentTicket) {
    setFleetAssignmentTicket(ticket);
    setFleetAssignmentForm({
      driverId: ticket.fleetDriverId ? String(ticket.fleetDriverId) : "",
      vehicleId: ticket.fleetVehicleId ? String(ticket.fleetVehicleId) : "",
    });
    setFleetAssignmentError("");
    setShowFleetAssignment(true);
  }

  function closeFleetAssignmentModal() {
    setShowFleetAssignment(false);
    setFleetAssignmentTicket(null);
    setFleetAssignmentForm(defaultFleetAssignmentForm);
    setFleetAssignmentError("");
    setFleetConflictWarning(null);
    setFleetOverrideReason("");
  }

  async function handleSaveFleetAssignment(overrideConflict = false) {
    if (!fleetAssignmentTicket) return;

    try {
      setFleetAssignmentSaving(true);
      setFleetAssignmentError("");
      if (!fleetAssignmentForm.driverId) {
        throw new Error("Select a driver.");
      }
      if (!fleetAssignmentForm.vehicleId) {
        throw new Error("Select a vehicle.");
      }

      await assignTravelOrderFleet({
        ticketId: fleetAssignmentTicket._id,
        driverId: fleetAssignmentForm.driverId as Id<"fleetDrivers">,
        vehicleId: fleetAssignmentForm.vehicleId as Id<"fleetVehicles">,
        actorName,
        overrideConflict,
        overrideReason: overrideConflict ? (fleetOverrideReason.trim() || "Override approved by dispatcher.") : undefined,
      });
      setFleetConflictWarning(null);
      setFleetOverrideReason("");
      closeFleetAssignmentModal();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Fleet assignment failed.";
      if (message.startsWith("CONFLICT_DETECTED:")) {
        // Parse conflict payload: "CONFLICT_DETECTED:driver1,driver2|vehicle1"
        const payload = message.slice("CONFLICT_DETECTED:".length);
        const [driverPart, vehiclePart] = payload.split("|");
        setFleetConflictWarning({
          driverTickets: driverPart ? driverPart.split(",").filter(Boolean) : [],
          vehicleTickets: vehiclePart ? vehiclePart.split(",").filter(Boolean) : [],
        });
        setFleetAssignmentError("");
      } else {
        setFleetAssignmentError(message);
      }
    } finally {
      setFleetAssignmentSaving(false);
    }
  }

  async function handleCancelWithReason() {
    if (!cancelReasonTicketId || !cancelReason.trim()) {
      setCancelReasonError("Cancellation reason is required.");
      return;
    }
    setCancelReasonSaving(true);
    setCancelReasonError("");
    try {
      await cancelTravelOrderWithReason({
        ticketId: cancelReasonTicketId,
        cancellationReason: cancelReason,
        cancellationReasonDetail: cancelReasonDetail.trim() || undefined,
        actorName,
        actorRole: "admin",
      });
      setShowCancelReasonModal(false);
      setCancelReasonTicketId(null);
      setCancelReason("No longer needed");
      setCancelReasonDetail("");
    } catch (error) {
      setCancelReasonError(error instanceof Error ? error.message : "Cancellation failed.");
    } finally {
      setCancelReasonSaving(false);
    }
  }

  async function handleAssignSharedTrip() {
    if (!sharedTripPrimaryId || !sharedTripSecondaryId.trim()) {
      setSharedTripError("Select both travel orders.");
      return;
    }
    setSharedTripSaving(true);
    setSharedTripError("");
    try {
      await assignSharedTripMutation({
        primaryTicketId: sharedTripPrimaryId,
        secondaryTicketId: sharedTripSecondaryId as Id<"monitoringTickets">,
        actorName,
        actorRole: "admin",
      });
      setShowSharedTripModal(false);
      setSharedTripPrimaryId(null);
      setSharedTripSecondaryId("");
    } catch (error) {
      setSharedTripError(error instanceof Error ? error.message : "Shared trip assignment failed.");
    } finally {
      setSharedTripSaving(false);
    }
  }

  async function handleTravelOrderPriorityChange(ticketId: Id<"monitoringTickets">, priority: string) {
    try {
      setPrioritySavingId(String(ticketId));
      setRequestTableError("");
      await updateTicket({
        ticketId,
        actorName,
        priority,
      });
    } catch (error) {
      setRequestTableError(error instanceof Error ? error.message : "Priority update failed.");
    } finally {
      setPrioritySavingId("");
    }
  }

  function handleMarkTravelDone(ticketId: Id<"monitoringTickets">, scheduledReturnAt?: number) {
    setOdometerTicketId(ticketId);
    setOdometerStart("");
    setOdometerEnd("");
    setOdometerStartFile(null);
    setOdometerEndFile(null);
    // Start the arrival time empty so the admin enters the real arrival, not the moment they clicked.
    setOdometerArrival("");
    setOdometerScheduledReturn(scheduledReturnAt ?? null);
    setOdometerError("");
    setShowOdometerModal(true);
  }

  async function handleConfirmTravelDone() {
    if (!odometerTicketId) return;
    if (!odometerStart || !odometerStartFile || !odometerEnd || !odometerEndFile) {
      setOdometerError("Both odometer readings and photos are required before marking as done.");
      return;
    }
    if (!odometerArrival) {
      setOdometerError("Please enter the actual arrival time before marking as done.");
      return;
    }
    try {
      setOdometerSaving(true);
      setOdometerError("");
      const startPhotoId = await uploadFileToStorage(odometerStartFile, "Odometer start photo upload failed.");
      const endPhotoId = await uploadFileToStorage(odometerEndFile, "Odometer end photo upload failed.");
      await markTravelOrderDone({
        ticketId: odometerTicketId,
        actorName,
        odometerStart: odometerStart ? Number(odometerStart) : undefined,
        odometerEnd: odometerEnd ? Number(odometerEnd) : undefined,
        odometerStartPhotoId: startPhotoId,
        odometerEndPhotoId: endPhotoId,
        arrivalTime: odometerArrival ? new Date(odometerArrival).getTime() : undefined,
      });
      setShowOdometerModal(false);
      setOdometerTicketId(null);
    } catch (error) {
      setOdometerError(error instanceof Error ? error.message : "Unable to mark travel as done.");
    } finally {
      setOdometerSaving(false);
    }
  }

  function handleMarkTravelDeparted(ticketId: Id<"monitoringTickets">, requestDetails?: string) {
    setDepartedTicketId(ticketId);
    // Start empty so the admin enters the real departure, not the moment they clicked.
    setDepartedTime("");
    // Scheduled departure is parsed from the request details text.
    const scheduled = getTravelScheduleFromDetails(requestDetails).departure;
    const scheduledMs = scheduled && scheduled !== "-" ? new Date(scheduled).getTime() : NaN;
    setDepartedScheduledDeparture(Number.isNaN(scheduledMs) ? null : scheduledMs);
    setDepartedError("");
    setShowDepartedModal(true);
  }

  async function handleConfirmTravelDeparted() {
    if (!departedTicketId) return;
    if (!departedTime) {
      setDepartedError("Please enter the actual departure time.");
      return;
    }
    try {
      setDepartedSaving(true);
      setDepartedError("");
      await markTravelOrderDeparted({
        ticketId: departedTicketId,
        actorName,
        departureTime: new Date(departedTime).getTime(),
      });
      setShowDepartedModal(false);
      setDepartedTicketId(null);
    } catch (error) {
      setDepartedError(error instanceof Error ? error.message : "Unable to mark travel as departed.");
    } finally {
      setDepartedSaving(false);
    }
  }

  async function handleReopenTravelOrder(ticketId: Id<"monitoringTickets">) {
    if (!window.confirm("Reopen this archived travel order? Its previous driver and vehicle will be reserved again if available.")) {
      return;
    }

    try {
      setTravelReopenSavingId(String(ticketId));
      setRequestTableError("");
      await reopenTravelOrder({
        ticketId,
        actorName,
      });
      setHrAdminArchiveView("active");
    } catch (error) {
      setRequestTableError(error instanceof Error ? error.message : "Unable to reopen travel order.");
    } finally {
      setTravelReopenSavingId("");
    }
  }

  // Inline approve / return-for-revision for the row's current approver (non-HR approvers).
  async function handleRowTravelApproval(
    ticketId: Id<"monitoringTickets">,
    decision: "Approved" | "For Revision",
  ) {
    try {
      setTravelApprovalSavingId(String(ticketId));
      setRequestTableError("");
      await recordTravelApproval({
        ticketId,
        decision,
        actorName,
        actorUsername: currentUser?.username ?? "",
        note: decision === "Approved" ? "Approved." : "Returned for revision.",
      });
    } catch (error) {
      setRequestTableError(error instanceof Error ? error.message : "Unable to record decision.");
    } finally {
      setTravelApprovalSavingId("");
    }
  }

  // Open a printable document for a single travel order so the user can save it as PDF.
  function handleExportTravelOrderPdf(row: Parameters<typeof buildTravelOrderPdfHtml>[0]) {
    try {
      const printWindow = window.open("", "_blank", "width=900,height=700");
      if (!printWindow) {
        setRequestTableError("Please allow pop-ups for this site to export the travel order as PDF.");
        return;
      }
      printWindow.document.write(buildTravelOrderPdfHtml(row));
      printWindow.document.close();
      printWindow.focus();
    } catch (error) {
      setRequestTableError(error instanceof Error ? error.message : "Unable to export travel order as PDF.");
    }
  }

  // Tick / untick a column in the Export to Excel panel.
  function toggleExportColumn(key: TravelOrderExportColumnKey) {
    setExportColumns((prev) =>
      prev.includes(key) ? prev.filter((existing) => existing !== key) : [...prev, key],
    );
  }

  // Build and download a CSV of the archived travel orders that fall in the chosen period.
  function handleExportTravelOrders() {
    setExportMessage("");
    try {
      const range = getExportRange(exportRange, new Date(), exportFrom, exportTo);
      if (!range) {
        setExportMessage("Please choose a valid start and end date.");
        return;
      }
      // Keep the columns in their defined order, regardless of tick order.
      const selectedColumns = TRAVEL_ORDER_EXPORT_COLUMNS.filter((column) =>
        exportColumns.includes(column.key),
      );
      if (selectedColumns.length === 0) {
        setExportMessage("Please select at least one column to export.");
        return;
      }

      let skipped = 0;
      const matched = (requestRows ?? []).filter((row) => {
        if (row.category !== MONITORING_TRAVEL_ORDER_CATEGORY) return false;
        const departureMs = getTravelDepartureTimestamp(row.requestDetails);
        if (departureMs === null) {
          skipped += 1;
          return false;
        }
        return departureMs >= range.start && departureMs < range.end;
      });

      if (matched.length === 0) {
        setExportMessage(
          `No travel orders found in the selected period.${skipped ? ` (${skipped} skipped: no valid departure date.)` : ""}`,
        );
        return;
      }

      const dataRows = matched.map((row) => {
        const values = getTravelOrderExportValues(row);
        return selectedColumns.map((column) => values[column.key]);
      });
      const csv = buildCsv(selectedColumns.map((column) => column.label), dataRows);
      downloadCsvFile(`travel-orders-${exportRange}.csv`, csv);

      setExportMessage(
        `Exported ${matched.length} travel order(s).${skipped ? ` ${skipped} row(s) skipped: no valid departure date.` : ""}`,
      );
      setShowExportPanel(false);
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Export failed.");
    }
  }

  function handleBorrowingAction(ticketId: Id<"monitoringTickets">, nextStatus: string) {
    const messages: Record<string, string> = {
      "Reserved": "The equipment will be marked as reserved in the asset inventory.",
      "Claimed": "The equipment will be recorded as borrowed by the requestee.",
      "Closed": "This borrowing request will be closed.",
    };
    const labels: Record<string, string> = {
      "Reserved": "Reserve Equipment",
      "Claimed": "Mark as Claimed",
      "Closed": "Close Request",
    };
    setBorrowingConfirm({
      message: messages[nextStatus] ?? `Set status to ${nextStatus}?`,
      label: labels[nextStatus] ?? "Proceed",
      onConfirm: async () => {
        setBorrowingConfirm(null);
        try {
          setBorrowingActionSavingId(String(ticketId));
          setRequestTableError("");
          await updateTicket({ ticketId, actorName, status: nextStatus });
        } catch (error) {
          setRequestTableError(error instanceof Error ? error.message : "Unable to update status.");
        } finally {
          setBorrowingActionSavingId("");
        }
      },
    });
  }

  function openReturnModal(row: { _id: Id<"monitoringTickets">; borrowingItems?: Array<{ assetId: string; assetTag: string; assetLabel: string }> | null }) {
    const items = (row.borrowingItems ?? []) as Array<{ assetId: string; assetTag: string; assetLabel: string }>;
    const initial: Record<string, { condition: string; note: string }> = {};
    for (const item of items) {
      initial[item.assetId] = { condition: MONITORING_BORROW_CONDITION_OPTIONS[0], note: "" };
    }
    setReturnModalTicket({ id: row._id, items });
    setReturnConditions(initial);
    setReturnModalError("");
    setShowReturnModal(true);
  }

  async function handleBorrowingReturn() {
    if (!returnModalTicket) return;
    const items = returnModalTicket.items.map((item) => ({
      assetId: item.assetId as Id<"hardwareInventory">,
      releaseCondition: returnConditions[item.assetId]?.condition ?? MONITORING_BORROW_CONDITION_OPTIONS[0],
      returnCondition: returnConditions[item.assetId]?.condition ?? MONITORING_BORROW_CONDITION_OPTIONS[0],
      returnedAt: Date.now(),
    }));
    try {
      setReturnModalSaving(true);
      setReturnModalError("");
      await updateTicket({
        ticketId: returnModalTicket.id,
        actorName,
        status: "Fulfilled",
        borrowingItems: items,
      });
      setShowReturnModal(false);
      setReturnModalTicket(null);
    } catch (error) {
      setReturnModalError(error instanceof Error ? error.message : "Unable to complete return.");
    } finally {
      setReturnModalSaving(false);
    }
  }

  async function handleExtendTravelOrder() {
    if (!extendTicketId || !extendNewReturnAt) {
      setExtendError("New return date and time is required.");
      return;
    }
    const newReturnAt = toTimestamp(extendNewReturnAt);
    if (!newReturnAt) {
      setExtendError("Invalid date and time.");
      return;
    }
    setExtendSaving(true);
    setExtendError("");
    try {
      await extendTravelOrderMutation({
        ticketId: extendTicketId,
        newReturnAt,
        reason: extendReason.trim() || undefined,
        actorName,
      });
      setShowExtendModal(false);
      setExtendTicketId(null);
      setExtendNewReturnAt("");
      setExtendReason("");
    } catch (error) {
      setExtendError(error instanceof Error ? error.message : "Extension failed.");
    } finally {
      setExtendSaving(false);
    }
  }

  return (
    <div className="monitoring-page" style={{ display: "grid", gap: 4 }}>
      <section
        className="panel"
        style={{
          padding: "14px 18px 4px",
          display: "grid",
          gap: 14,
          border: "none",
          boxShadow: "none",
          borderRadius: 0,
          background: "transparent",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <h1 className="type-page-title">Monitoring</h1>
            <div className="type-page-subtitle">
              Internal service monitoring for IT tickets, HR/Admin requests, approvals, major incidents, and office
              internet uptime.
            </div>
          </div>
        </div>

      </section>

      <section
        className="panel monitoring-tab-panel"
        style={{ padding: 16, display: "grid", gap: 14, border: "none", boxShadow: "none", borderRadius: 0, background: "transparent" }}
      >
        {visibleMonitoringTabs.length > 0 ? (
          <div className="monitoring-tab-strip" role="tablist" aria-label="Monitoring sections">
            {visibleMonitoringTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={`monitoring-tab-btn${activeTab === tab.key ? " active" : ""}${
                  tabNotificationCounts[tab.key] > 0 ? " has-notification" : ""
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                <span className="monitoring-tab-copy">
                  <span className="monitoring-tab-label-row">
                    <span className="monitoring-tab-label">{tab.label}</span>
                    {tabNotificationCounts[tab.key] > 0 ? (
                      <span className="monitoring-tab-badge" aria-label={`${tabNotificationCounts[tab.key]} new items`}>
                        {tabNotificationCounts[tab.key]}
                      </span>
                    ) : null}
                  </span>
                  <span className="monitoring-tab-description">{tab.description}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <MonitoringFormModal open={showIssueCreate && activeTab === "issues"} onClose={() => setShowIssueCreate(false)} width={920}>
          <section className="saas-card monitoring-form-card">
            <div className="monitoring-form-head">
              <div className="type-section-title">New Issue / Request</div>
              <div className="type-helper">* Required fields</div>
            </div>
            <FormErrorBanner message={formError} />
            <div className="monitoring-form-grid">
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
              <FieldGroup label="Team">
                <input
                  className="input-base"
                  placeholder="Team"
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
                className="input-base monitoring-form-textarea"
                placeholder="Issue / Request Details"
                value={issueForm.requestDetails}
                onChange={(event) => setIssueForm((prev) => ({ ...prev, requestDetails: event.target.value }))}
              />
            </FieldGroup>
            <FieldGroup label="Original Teams Form Snapshot" required>
              <textarea
                className="input-base monitoring-form-textarea"
                placeholder="Original Teams Form Snapshot"
                value={issueForm.requestSnapshot}
                onChange={(event) => setIssueForm((prev) => ({ ...prev, requestSnapshot: event.target.value }))}
              />
            </FieldGroup>
            <div className="monitoring-form-checklist">
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
            <div className="monitoring-form-file">
              <FileUploadCard
                label="Attachment"
                inputRef={issueAttachmentRef}
                accept="*/*"
                onFileChange={setIssueAttachmentFile}
                file={issueAttachmentFile}
                hasAttachment={Boolean(issueAttachmentFile)}
                displayName={issueAttachmentFile?.name ?? "No file selected"}
                helperText="Save to upload."
                badge="1"
                ariaLabel="Issue attachment"
                onRemove={() => setIssueAttachmentFile(null)}
                compact
              />
            </div>
            <div className="monitoring-form-actions">
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
          <section className="saas-card monitoring-form-card">
            <div className="monitoring-form-head">
              <div className="type-section-title">New Borrowing Request</div>
              <div className="type-helper">* Required fields</div>
            </div>
            <FormErrorBanner message={formError} />
            <div className="monitoring-form-grid">
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
              <FieldGroup label="Team">
                <input
                  className="input-base"
                  placeholder="Team"
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
              <div className="monitoring-form-stack">
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
                  <div className="monitoring-form-stack">
                    {borrowingForm.borrowingItems.map((item, index) => (
                      <div
                        key={`${item.assetId}-${index}`}
                        className="saas-card monitoring-form-selection-card monitoring-form-selection-card--asset"
                      >
                        <div className="monitoring-form-selected-copy">
                          <strong>{item.assetTag}</strong>
                          <span>{item.assetLabel}</span>
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
                  <div className="saas-card monitoring-form-empty-card">
                    No linked assets added yet.
                  </div>
                )}
              </div>
            </FieldGroup>
            <FieldGroup label="Borrowing Purpose / Notes" required>
              <textarea
                className="input-base monitoring-form-textarea"
                placeholder="Purpose of the borrowing request, usage notes, or handling reminders."
                value={borrowingForm.requestDetails}
                onChange={(event) => setBorrowingForm((prev) => ({ ...prev, requestDetails: event.target.value }))}
              />
            </FieldGroup>
            <FieldGroup label="Original Borrower's Form Snapshot" required>
              <textarea
                className="input-base monitoring-form-textarea"
                placeholder="Paste the Microsoft Form / borrower's form details here."
                value={borrowingForm.requestSnapshot}
                onChange={(event) => setBorrowingForm((prev) => ({ ...prev, requestSnapshot: event.target.value }))}
              />
            </FieldGroup>
            <div className="monitoring-form-file">
              <FileUploadCard
                label="Borrowing File"
                inputRef={borrowingAttachmentRef}
                accept="*/*"
                onFileChange={setBorrowingAttachmentFile}
                file={borrowingAttachmentFile}
                hasAttachment={Boolean(borrowingAttachmentFile)}
                displayName={borrowingAttachmentFile?.name ?? "No file selected"}
                helperText="Save to upload."
                badge="1"
                ariaLabel="Borrowing attachment"
                onRemove={() => setBorrowingAttachmentFile(null)}
                compact
              />
            </div>
            <div className="monitoring-form-actions">
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
          <section className="saas-card monitoring-form-card">
            <div className="monitoring-form-head">
              <div className="type-section-title">New Meeting Request</div>
              <div className="type-helper">Paste the Teams reservation snapshot, add the meeting details, and reserve any storage assets needed.</div>
            </div>
            <FormErrorBanner message={formError} />
            <div className="monitoring-form-grid">
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
              <FieldGroup label="Team">
                <input
                  className="input-base"
                  placeholder="Team"
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
              <div className="monitoring-form-stack">
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
                  <div className="monitoring-form-stack">
                    {meetingForm.meetingAssets.map((item, index) => (
                      <div
                        key={`${item.assetId}-${index}`}
                        className="saas-card monitoring-form-selection-card monitoring-form-selection-card--meeting"
                      >
                        <div className="monitoring-form-selected-copy">
                          <strong>{item.assetTag}</strong>
                          <span>{item.assetLabel}</span>
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
                  <div className="saas-card monitoring-form-empty-card">
                    No reserved assets added yet.
                  </div>
                )}
              </div>
            </FieldGroup>
            <FieldGroup label="Additional Notes">
              <textarea
                className="input-base monitoring-form-textarea"
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
                className="input-base monitoring-form-textarea"
                placeholder="Paste the Teams meeting reservation snapshot here."
                value={meetingForm.requestSnapshot}
                onChange={(event) => setMeetingForm((prev) => ({ ...prev, requestSnapshot: event.target.value }))}
              />
            </FieldGroup>
            <div className="monitoring-form-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowMeetingCreate(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={meetingSubmitting} onClick={() => void handleMeetingCreate()}>
                {meetingSubmitting ? "Creating..." : "Create"}
              </button>
            </div>
          </section>
        </MonitoringFormModal>

        <MonitoringFormModal open={activeTab === "internet" && showInternetCreate} onClose={() => setShowInternetCreate(false)} width={860}>
          <section className="saas-card monitoring-form-card">
            <div className="monitoring-form-head">
              <div className="type-section-title">New Internet Outage</div>
              <div className="type-helper">* Required fields</div>
            </div>
            <FormErrorBanner message={formError} />
            <div className="monitoring-form-grid">
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
                className="input-base monitoring-form-textarea"
                placeholder="Outage details"
                value={internetForm.details}
                onChange={(event) => setInternetForm((prev) => ({ ...prev, details: event.target.value }))}
              />
            </FieldGroup>
            <FieldGroup label="Cause / Action Taken" helperText="Required only when the outage is marked Resolved.">
              <textarea
                className="input-base monitoring-form-textarea"
                placeholder="Cause / Action Taken"
                value={internetForm.causeActionTaken}
                onChange={(event) => setInternetForm((prev) => ({ ...prev, causeActionTaken: event.target.value }))}
              />
            </FieldGroup>
            <div className="monitoring-form-actions">
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

        <FleetManagementModal
          open={showFleetManage}
          loading={fleetAvailability === undefined}
          drivers={fleetDrivers}
          vehicles={fleetVehicles}
          driverForm={fleetDriverForm}
          vehicleForm={fleetVehicleForm}
          editingDriverId={editingFleetDriverId}
          editingVehicleId={editingFleetVehicleId}
          saving={fleetSaving}
          error={fleetError}
          onClose={() => {
            setShowFleetManage(false);
            setFleetError("");
          }}
          onDriverFormChange={setFleetDriverForm}
          onVehicleFormChange={setFleetVehicleForm}
          onSaveDriver={() => void handleSaveFleetDriver()}
          onSaveVehicle={() => void handleSaveFleetVehicle()}
          onEditDriver={editFleetDriver}
          onEditVehicle={editFleetVehicle}
          onDeleteDriver={(driver) => void handleDeleteFleetDriver(driver)}
          onDeleteVehicle={(vehicle) => void handleDeleteFleetVehicle(vehicle)}
          onResetDriver={resetFleetDriverForm}
          onResetVehicle={resetFleetVehicleForm}
        />

        <FleetAssignmentModal
          open={showFleetAssignment}
          ticket={fleetAssignmentTicket}
          form={fleetAssignmentForm}
          drivers={fleetDrivers}
          vehicles={fleetVehicles}
          saving={fleetAssignmentSaving}
          error={fleetAssignmentError}
          conflictWarning={fleetConflictWarning}
          overrideReason={fleetOverrideReason}
          onOverrideReasonChange={setFleetOverrideReason}
          onClearConflict={() => { setFleetConflictWarning(null); setFleetOverrideReason(""); }}
          onClose={closeFleetAssignmentModal}
          onFormChange={setFleetAssignmentForm}
          onSave={(override) => void handleSaveFleetAssignment(override)}
        />

        {/* Cancel with reason modal */}
        {showCancelReasonModal ? (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: "100%", maxWidth: 480, display: "grid", gap: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Cancel Travel Order</div>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Reason</span>
                <select className="input-base" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>
                  {["No longer needed","Schedule conflict","Requester request","Vehicle unavailable","Driver unavailable","Weather or road conditions","Budget constraints","Admin decision","Other"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Additional details (optional)</span>
                <textarea className="input-base" style={{ minHeight: 72, resize: "vertical" as const }} value={cancelReasonDetail} onChange={(e) => setCancelReasonDetail(e.target.value)} placeholder="Provide more context if needed." />
              </label>
              {cancelReasonError ? <div style={{ color: "#991b1b", fontSize: 13 }}>{cancelReasonError}</div> : null}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" disabled={cancelReasonSaving} onClick={() => { setShowCancelReasonModal(false); setCancelReasonError(""); }}>Cancel</button>
                <button type="button" className="btn-primary" style={{ background: "#dc2626" }} disabled={cancelReasonSaving} onClick={() => void handleCancelWithReason()}>
                  {cancelReasonSaving ? "Cancelling..." : "Confirm Cancellation"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {meetingDoneConfirmId ? (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: "100%", maxWidth: 480, display: "grid", gap: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Mark Meeting as Done?</div>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                This will mark the meeting as completed. All linked equipment will be released back to inventory.
              </p>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  Fulfillment Note <span style={{ color: "var(--color-error, #dc2626)" }}>*</span>
                </span>
                <textarea
                  className="input-base monitoring-form-textarea"
                  rows={3}
                  placeholder="Describe what was set up, equipment deployed, or any relevant notes…"
                  value={meetingDoneNote}
                  onChange={(e) => setMeetingDoneNote(e.target.value)}
                  disabled={meetingDoneSaving}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Meeting Recording <span style={{ fontWeight: 400, color: "var(--muted)" }}>(optional)</span></span>
                <input
                  ref={meetingDoneRecordingRef}
                  type="file"
                  accept="video/*,audio/*,.mp4,.mov,.mkv,.avi,.webm,.mp3,.m4a"
                  style={{ display: "none" }}
                  onChange={(e) => setMeetingDoneRecording(e.target.files?.[0] ?? null)}
                />
                {meetingDoneRecording ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meetingDoneRecording.name}</span>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "2px 10px", fontSize: 12 }}
                      onClick={() => { setMeetingDoneRecording(null); if (meetingDoneRecordingRef.current) meetingDoneRecordingRef.current.value = ""; }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ justifySelf: "start" }}
                    disabled={meetingDoneSaving}
                    onClick={() => meetingDoneRecordingRef.current?.click()}
                  >
                    Upload Recording
                  </button>
                )}
              </label>
              {meetingDoneError ? <div style={{ color: "#991b1b", fontSize: 13 }}>{meetingDoneError}</div> : null}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={meetingDoneSaving}
                  onClick={() => {
                    setMeetingDoneConfirmId(null);
                    setMeetingDoneNote("");
                    setMeetingDoneRecording(null);
                    setMeetingDoneError("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={meetingDoneSaving}
                  onClick={() => void handleMeetingMarkDone()}
                >
                  {meetingDoneSaving ? "Saving…" : "Mark as Done"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <input
          ref={archiveRecordingInputRef}
          type="file"
          accept="video/*,audio/*,.mp4,.mov,.avi,.mkv,.webm,.mp3,.m4a"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            if (file && archiveRecordingUploadId) {
              void handleArchiveRecordingUpload(archiveRecordingUploadId, file);
            }
            e.target.value = "";
          }}
        />

        {showSharedTripModal ? (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: "100%", maxWidth: 480, display: "grid", gap: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Combine as Shared Trip</div>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                Both orders will share the same driver and vehicle. The billing party is determined automatically — whichever order had fleet assigned first pays; the other rides for free.
              </p>
              {(() => {
                const primary = hrAdminRequestRows.find((r) => r._id === sharedTripPrimaryId);
                return (
                  <div style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Primary order</span>
                    <div style={{ fontSize: 13, padding: "8px 12px", background: "var(--surface-raised, #f8fafc)", borderRadius: 8, border: "1px solid var(--border)", display: "grid", gap: 2 }}>
                      <span>{primary ? `${primary.ticketNumber} — ${primary.requesterName}${primary.requesterDepartment ? ` (${primary.requesterDepartment})` : ""}` : "—"}</span>
                      {primary?.fleetDriverName ? (
                        <span style={{ color: "var(--muted)", fontSize: 12 }}>
                          {primary.fleetDriverName} · {primary.fleetVehicleName}{primary.fleetVehiclePlateNumber ? ` (${primary.fleetVehiclePlateNumber})` : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })()}
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Second order to combine with</span>
                <select
                  className="input-base"
                  value={sharedTripSecondaryId}
                  onChange={(e) => setSharedTripSecondaryId(e.target.value)}
                >
                  <option value="">Select a travel order…</option>
                  {hrAdminRequestRows
                    .filter(
                      (r) =>
                        r.category === MONITORING_TRAVEL_ORDER_CATEGORY &&
                        r._id !== sharedTripPrimaryId &&
                        !r.sharedTripId &&
                        getTravelOrderDisplayStatus(r) !== "Fulfilled" &&
                        getTravelOrderDisplayStatus(r) !== "Closed",
                    )
                    .map((r) => (
                      <option key={r._id} value={r._id}>
                        {r.ticketNumber} — {r.requesterName}{r.requesterDepartment ? ` (${r.requesterDepartment})` : ""}
                      </option>
                    ))}
                </select>
              </label>
              {sharedTripError ? <div style={{ color: "#991b1b", fontSize: 13 }}>{sharedTripError}</div> : null}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={sharedTripSaving}
                  onClick={() => { setShowSharedTripModal(false); setSharedTripError(""); setSharedTripPrimaryId(null); setSharedTripSecondaryId(""); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={sharedTripSaving || !sharedTripSecondaryId}
                  onClick={() => void handleAssignSharedTrip()}
                >
                  {sharedTripSaving ? "Combining…" : "Confirm Shared Trip"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {borrowingConfirm ? (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: "100%", maxWidth: 380, display: "grid", gap: 20 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Confirm Action</div>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>{borrowingConfirm.message}</p>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" onClick={() => setBorrowingConfirm(null)}>Cancel</button>
                <button type="button" className="btn-primary" onClick={() => void borrowingConfirm.onConfirm()}>{borrowingConfirm.label}</button>
              </div>
            </div>
          </div>
        ) : null}

        {showReturnModal && returnModalTicket ? (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: "100%", maxWidth: 520, display: "grid", gap: 16, maxHeight: "90vh", overflowY: "auto" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Log Return Condition</div>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>Record the condition of each item before completing the return.</p>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {returnModalTicket.items.map((item) => (
                  <div key={item.assetId} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{item.assetTag}</span>
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>{item.assetLabel}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Condition</span>
                        <select
                          className="input-base"
                          value={returnConditions[item.assetId]?.condition ?? MONITORING_BORROW_CONDITION_OPTIONS[0]}
                          onChange={(e) => setReturnConditions((prev) => ({ ...prev, [item.assetId]: { ...prev[item.assetId], condition: e.target.value } }))}
                        >
                          {MONITORING_BORROW_CONDITION_OPTIONS.map((condition) => (
                            <option key={condition} value={condition}>{condition}</option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Note (optional)</span>
                        <input
                          className="input-base"
                          placeholder="e.g. minor scratch on screen"
                          value={returnConditions[item.assetId]?.note ?? ""}
                          onChange={(e) => setReturnConditions((prev) => ({ ...prev, [item.assetId]: { ...prev[item.assetId], note: e.target.value } }))}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              {returnModalError ? <div style={{ color: "#dc2626", fontSize: 13 }}>{returnModalError}</div> : null}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" disabled={returnModalSaving} onClick={() => { setShowReturnModal(false); setReturnModalTicket(null); }}>Cancel</button>
                <button type="button" className="btn-primary" disabled={returnModalSaving} onClick={() => void handleBorrowingReturn()}>
                  {returnModalSaving ? "Saving…" : "Complete Return"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showOdometerModal ? (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: "100%", maxWidth: 520, display: "grid", gap: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Mark Travel Order as Done</div>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                Record the odometer readings before completing this trip. Photos and typed values are both optional but recommended.
              </p>

              {/* Odometer Start */}
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Odometer — Start of Trip</div>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Reading (km)</span>
                  <input
                    className="input-base"
                    type="number"
                    min={0}
                    placeholder="e.g. 12500"
                    value={odometerStart}
                    onChange={(e) => setOdometerStart(e.target.value)}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Photo of odometer</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="input-base"
                    style={{ padding: "6px 10px" }}
                    onChange={(e) => setOdometerStartFile(e.target.files?.[0] ?? null)}
                  />
                  {odometerStartFile ? (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{odometerStartFile.name}</span>
                  ) : null}
                </label>
              </div>

              {/* Odometer End */}
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Odometer — End of Trip</div>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Reading (km)</span>
                  <input
                    className="input-base"
                    type="number"
                    min={0}
                    placeholder="e.g. 12850"
                    value={odometerEnd}
                    onChange={(e) => setOdometerEnd(e.target.value)}
                  />
                </label>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Photo of odometer</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="input-base"
                    style={{ padding: "6px 10px" }}
                    onChange={(e) => setOdometerEndFile(e.target.files?.[0] ?? null)}
                  />
                  {odometerEndFile ? (
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{odometerEndFile.name}</span>
                  ) : null}
                </label>
              </div>

              {/* Arrival time */}
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  Arrival Time <span style={{ color: "#dc2626" }}>*</span>
                </div>
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Enter when the trip <strong>actually</strong> arrived — not the time you are clicking this button.
                  </span>
                  <input
                    className="input-base"
                    type="datetime-local"
                    value={odometerArrival}
                    onChange={(e) => setOdometerArrival(e.target.value)}
                  />
                </label>
                {odometerScheduledReturn ? (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Scheduled return: {formatDateTime(odometerScheduledReturn)}
                  </span>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    No scheduled return on record — early/late cannot be calculated.
                  </span>
                )}
                {odometerArrival && odometerScheduledReturn
                  ? (() => {
                      const comparison = getScheduleComparison(
                        new Date(odometerArrival).getTime(),
                        odometerScheduledReturn,
                      );
                      return (
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: comparison.tone === "late" ? "#991b1b" : "#166534",
                          }}
                        >
                          {comparison.label}
                        </span>
                      );
                    })()
                  : null}
              </div>

              {odometerError ? <div style={{ color: "#991b1b", fontSize: 13 }}>{odometerError}</div> : null}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" disabled={odometerSaving} onClick={() => { setShowOdometerModal(false); setOdometerError(""); }}>Cancel</button>
                <button type="button" className="btn-primary" disabled={odometerSaving || !odometerStart || !odometerStartFile || !odometerEnd || !odometerEndFile || !odometerArrival} onClick={() => void handleConfirmTravelDone()}>
                  {odometerSaving ? "Saving..." : "Mark as Done"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showDepartedModal ? (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420, display: "grid", gap: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Mark Travel Order as Departed</div>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                Record when the trip <strong>actually</strong> departed — not the time you are clicking this button.
              </p>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  Actual Departure Time <span style={{ color: "#dc2626" }}>*</span>
                </span>
                <input
                  className="input-base"
                  type="datetime-local"
                  value={departedTime}
                  onChange={(e) => setDepartedTime(e.target.value)}
                />
              </label>
              {departedScheduledDeparture ? (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  Scheduled departure: {formatDateTime(departedScheduledDeparture)}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  No scheduled departure on record — early/late cannot be calculated.
                </span>
              )}
              {departedTime && departedScheduledDeparture
                ? (() => {
                    const comparison = getScheduleComparison(
                      new Date(departedTime).getTime(),
                      departedScheduledDeparture,
                    );
                    return (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: comparison.tone === "late" ? "#991b1b" : "#166534",
                        }}
                      >
                        {comparison.label}
                      </span>
                    );
                  })()
                : null}
              {departedError ? <div style={{ color: "#991b1b", fontSize: 13 }}>{departedError}</div> : null}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" disabled={departedSaving} onClick={() => { setShowDepartedModal(false); setDepartedError(""); }}>Cancel</button>
                <button type="button" className="btn-primary" disabled={departedSaving || !departedTime} onClick={() => void handleConfirmTravelDeparted()}>
                  {departedSaving ? "Saving..." : "Mark as Departed"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showExtendModal ? (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: "100%", maxWidth: 420, display: "grid", gap: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Extend Return Time</div>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
                Set a new expected return date and time for this travel order.
              </p>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>New Return Date / Time <span style={{ color: "#dc2626" }}>*</span></span>
                <input
                  className="input-base"
                  type="datetime-local"
                  value={extendNewReturnAt}
                  onChange={(e) => setExtendNewReturnAt(e.target.value)}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Reason (optional)</span>
                <textarea
                  className="input-base"
                  style={{ minHeight: 64, resize: "vertical" as const }}
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                  placeholder="e.g. Traffic delay, additional client visit, weather"
                />
              </label>
              {extendError ? <div style={{ color: "#991b1b", fontSize: 13 }}>{extendError}</div> : null}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn-secondary" disabled={extendSaving} onClick={() => { setShowExtendModal(false); setExtendError(""); }}>Cancel</button>
                <button type="button" className="btn-primary" disabled={extendSaving || !extendNewReturnAt} onClick={() => void handleExtendTravelOrder()}>
                  {extendSaving ? "Saving..." : "Extend Return Time"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div key={activeTab} className="monitoring-tab-content">
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

            <div className="saas-table-wrap monitoring-tab-table-wrap">
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
            {activeTab === "hrAdmin" && isHrAdminStaff ? (
              <FleetAvailabilitySection
                loading={fleetAvailability === undefined}
                drivers={fleetDrivers}
                vehicles={availableFleetVehicles}
                canManage={isHrAdminStaff}
                onManage={() => {
                  setFleetError("");
                  setShowFleetManage(true);
                }}
              />
            ) : null}

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
                {activeTab === "hrAdmin" ? (
                  <div className="monitoring-date-filter">
                    <input
                      id="hr-admin-date-filter"
                      className="input-base"
                      type="date"
                      value={hrAdminDateFilter}
                      onChange={(event) => setHrAdminDateFilter(event.target.value)}
                      aria-label="Filter HR/Admin requests by submitted date"
                    />
                    {hrAdminDateFilter ? (
                      <button type="button" className="btn-secondary" onClick={() => setHrAdminDateFilter("")}>
                        Clear
                      </button>
                    ) : null}
                    {hrAdminArchiveView === "archive" ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        aria-expanded={showExportPanel}
                        onClick={() => {
                          setShowExportPanel((open) => !open);
                          setExportMessage("");
                        }}
                      >
                        Export to Excel
                      </button>
                    ) : null}
                  </div>
                ) : (
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
                )}
              </div>
              {activeTab === "hrAdmin" && isHrAdminStaff ? (
                <div className="asset-master-view-filters monitoring-archive-tabs" aria-label="HR/Admin request view">
                  <button
                    type="button"
                    aria-pressed={hrAdminArchiveView === "active"}
                    className={`asset-master-view-filter${hrAdminArchiveView === "active" ? " active" : ""}`}
                    onClick={() => setHrAdminArchiveView("active")}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    aria-pressed={hrAdminArchiveView === "archive"}
                    className={`asset-master-view-filter${hrAdminArchiveView === "archive" ? " active" : ""}`}
                    onClick={() => setHrAdminArchiveView("archive")}
                  >
                    Archive
                  </button>
                </div>
              ) : null}
              {activeTab === "meetings" ? (
                <div className="asset-master-view-filters monitoring-archive-tabs" aria-label="Meeting request view">
                  <button
                    type="button"
                    aria-pressed={meetingArchiveView === "active"}
                    className={`asset-master-view-filter${meetingArchiveView === "active" ? " active" : ""}`}
                    onClick={() => setMeetingArchiveView("active")}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    aria-pressed={meetingArchiveView === "archive"}
                    className={`asset-master-view-filter${meetingArchiveView === "archive" ? " active" : ""}`}
                    onClick={() => setMeetingArchiveView("archive")}
                  >
                    Archive
                  </button>
                </div>
              ) : null}
              {activeTab === "borrowing" ? (
                <div className="asset-master-view-filters monitoring-archive-tabs" aria-label="Borrowing request view">
                  <button
                    type="button"
                    aria-pressed={borrowingArchiveView === "active"}
                    className={`asset-master-view-filter${borrowingArchiveView === "active" ? " active" : ""}`}
                    onClick={() => setBorrowingArchiveView("active")}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    aria-pressed={borrowingArchiveView === "archive"}
                    className={`asset-master-view-filter${borrowingArchiveView === "archive" ? " active" : ""}`}
                    onClick={() => setBorrowingArchiveView("archive")}
                  >
                    Archive
                  </button>
                </div>
              ) : null}
            </div>

            {showExportPanel ? (
              <div
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
                onClick={() => { setShowExportPanel(false); setExportMessage(""); }}
              >
                <div
                  onClick={(event) => event.stopPropagation()}
                  style={{
                    background: "var(--surface)",
                    borderRadius: 12,
                    padding: 24,
                    width: "100%",
                    maxWidth: 560,
                    maxHeight: "85vh",
                    overflowY: "auto",
                    display: "grid",
                    gap: 14,
                  }}
                >
                <div style={{ display: "grid", gap: 6 }}>
                  <strong style={{ fontSize: 14 }}>Export travel orders to Excel</strong>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    Filtered by departure date. The file opens directly in Excel.
                  </span>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Time period</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {([
                      { value: "week", label: "This week" },
                      { value: "month", label: "This month" },
                      { value: "year", label: "This year" },
                      { value: "custom", label: "Custom range" },
                    ] as const).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={exportRange === option.value}
                        className={`asset-master-view-filter${exportRange === option.value ? " active" : ""}`}
                        onClick={() => setExportRange(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {exportRange === "custom" ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
                      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                        From
                        <input
                          className="input-base"
                          type="date"
                          value={exportFrom}
                          onChange={(event) => setExportFrom(event.target.value)}
                        />
                      </label>
                      <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                        To
                        <input
                          className="input-base"
                          type="date"
                          value={exportTo}
                          onChange={(event) => setExportTo(event.target.value)}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Columns to include</span>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {TRAVEL_ORDER_EXPORT_COLUMNS.map((column) => (
                      <label key={column.key} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={exportColumns.includes(column.key)}
                          onChange={() => toggleExportColumn(column.key)}
                        />
                        {column.label}
                      </label>
                    ))}
                  </div>
                </div>

                {exportMessage ? (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{exportMessage}</span>
                ) : null}

                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn-primary" onClick={handleExportTravelOrders}>
                    Download CSV
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowExportPanel(false);
                      setExportMessage("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
                </div>
              </div>
            ) : null}

            {activeTab === "hrAdmin" && hrAdminArchiveView === "archive" ? (
              <div className="saas-table-wrap monitoring-tab-table-wrap">
                {requestTableError ? <FormErrorBanner message={requestTableError} /> : null}
                <table className="saas-table" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Requester</th>
                      <th>Purpose</th>
                      <th>Departure</th>
                      <th>Return</th>
                      <th>Driver</th>
                      <th>Vehicle</th>
                      <th>Status</th>
                      <th>Closed</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestRows.length === 0 ? (
                      <tr><td colSpan={10} style={{ padding: "24px 16px", textAlign: "center", color: "var(--muted)" }}>{requestEmptyState}</td></tr>
                    ) : requestRows.map((row) => {
                      const rowId = String(row._id);
                      const displayStatus = getTravelOrderDisplayStatus(row);
                      const travelSchedule = getTravelScheduleFromDetails(row.requestDetails);
                      const travelPurpose = row.category === MONITORING_TRAVEL_ORDER_CATEGORY ? getTravelPurposeFromDetails(row.requestDetails) : null;
                      return (
                        <tr
                          key={row._id}
                          className="table-row-hover"
                          style={{ cursor: "pointer" }}
                          onClick={() => router.push(`/monitoring/${row._id}`)}
                        >
                          <td>
                            <div className="monitoring-request-cell">
                              <div className="monitoring-request-title-row">
                                <strong>{row.ticketNumber}</strong>
                                {row.sharedTripId ? (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "#ede9fe", color: "#5b21b6" }}>Shared</span>
                                ) : null}
                              </div>
                              <span className="monitoring-request-title">{row.title}</span>
                            </div>
                          </td>
                          <td>
                            <div style={{ display: "grid", gap: 2 }}>
                              <span style={{ fontWeight: 600 }}>{row.requesterName}</span>
                              <span style={{ color: "var(--muted)", fontSize: 12 }}>{row.requesterDepartment ?? "—"}</span>
                            </div>
                          </td>
                          <td style={{ maxWidth: 200 }}>
                            <span style={{ fontSize: 12, color: "var(--muted)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {travelPurpose ?? (row.requestDetails?.slice(0, 60) ?? "—")}
                            </span>
                          </td>
                          <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{row.category === MONITORING_TRAVEL_ORDER_CATEGORY ? formatCompactTravelDate(travelSchedule.departure) : "—"}</td>
                          <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{row.category === MONITORING_TRAVEL_ORDER_CATEGORY ? formatCompactTravelDate(travelSchedule.returnAt) : "—"}</td>
                          <td style={{ fontSize: 12 }}>{row.fleetDriverName ?? "—"}</td>
                          <td style={{ fontSize: 12 }}>{row.fleetVehicleName ? `${row.fleetVehicleName}${row.fleetVehiclePlateNumber ? ` · ${row.fleetVehiclePlateNumber}` : ""}` : "—"}</td>
                          <td><Chip label={displayStatus} /></td>
                          <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{formatDateTime(row.updatedAt)}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="monitoring-table-actions">
                              <button
                                type="button"
                                className="monitoring-icon-action-btn"
                                title="View details"
                                onClick={() => router.push(`/monitoring/${row._id}`)}
                              >
                                <ViewTicketIcon />
                              </button>
                              <button
                                type="button"
                                className="monitoring-icon-action-btn"
                                data-tooltip="Export as PDF"
                                aria-label={`Export ${row.ticketNumber} as PDF`}
                                onClick={() => handleExportTravelOrderPdf(row)}
                              >
                                <ExportPdfIcon />
                              </button>
                              <button
                                type="button"
                                className="monitoring-icon-action-btn is-warning"
                                title="Reopen travel order"
                                onClick={() => void handleReopenTravelOrder(row._id)}
                                disabled={travelReopenSavingId === rowId}
                              >
                                <ReopenTicketIcon />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : activeTab === "hrAdmin" ? (
              <div className="to-card-grid">
                {requestTableError ? <FormErrorBanner message={requestTableError} /> : null}
                {requestRows.length === 0 ? (
                  <p className="type-helper" style={{ gridColumn: "1/-1", padding: "24px 0" }}>{requestEmptyState}</p>
                ) : requestRows.map((row) => {
                  const rowId = String(row._id);
                  const displayStatus = getTravelOrderDisplayStatus(row);
                  const rowServiceGroup = getServiceGroupForCategory(row.category);
                  const isTODone = row.category === MONITORING_TRAVEL_ORDER_CATEGORY && (displayStatus === "Fulfilled" || displayStatus === "Closed");
                  const isUnopened = displayStatus === "New" && !(row.notificationSeenByGroups ?? []).includes(rowServiceGroup);
                  const isOverdue = row.category === MONITORING_TRAVEL_ORDER_CATEGORY && !!row.travelReturnAt && Date.now() > row.travelReturnAt && !isTODone;
                  const travelSchedule = getTravelScheduleFromDetails(row.requestDetails);
                  const travelPurpose = row.category === MONITORING_TRAVEL_ORDER_CATEGORY ? getTravelPurposeFromDetails(row.requestDetails) : null;
                  const avatarPalette = getFleetAvatarPalette();
                  const requesterInitials = getFleetInitials(row.requesterName ?? "?");
                  const hasFleet = Boolean(row.fleetDriverName || row.fleetVehicleName);
                  return (
                    <article
                      key={row._id}
                      className={`to-card${isUnopened ? " to-card--unopened" : ""}${isOverdue ? " to-card--overdue" : ""}`}
                      onClick={() => router.push(`/monitoring/${row._id}`)}
                    >
                      <div className="to-card-header">
                        <div className="to-card-header-left">
                          <span className="to-card-ticket">{row.ticketNumber}</span>
                          {isUnopened ? <span className="monitoring-unopened-pill">New</span> : null}
                          {isOverdue ? (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" }}>
                              Overdue
                            </span>
                          ) : null}
                          {row.sharedTripId ? (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "#ede9fe", color: "#5b21b6" }}>
                              Shared
                            </span>
                          ) : null}
                        </div>
                        <Chip label={displayStatus} />
                      </div>

                      <div className="to-card-requester">
                        <div className="to-card-avatar" style={avatarPalette}>{requesterInitials}</div>
                        <div>
                          <div className="to-card-name">{row.requesterName}</div>
                          <div className="to-card-dept">{row.requesterDepartment ?? "—"}</div>
                        </div>
                      </div>

                      {row.category === MONITORING_TRAVEL_ORDER_CATEGORY ? (
                        <div className="to-card-schedule">
                          <div>
                            <span className="to-card-schedule-label">Departure</span>
                            <span className="to-card-schedule-val">{formatCompactTravelDate(travelSchedule.departure) || "—"}</span>
                          </div>
                          <div>
                            <span className="to-card-schedule-label">Return</span>
                            <span className="to-card-schedule-val">{formatCompactTravelDate(travelSchedule.returnAt) || "—"}</span>
                          </div>
                        </div>
                      ) : null}

                      {travelPurpose ? (
                        <div className="to-card-purpose">{travelPurpose}</div>
                      ) : row.requestDetails ? (
                        <div className="to-card-purpose">{row.requestDetails.slice(0, 80)}{row.requestDetails.length > 80 ? "…" : ""}</div>
                      ) : null}

                      {row.category === MONITORING_TRAVEL_ORDER_CATEGORY ? (
                        <div className="to-card-fleet">
                          {hasFleet ? (
                            <>
                              <span className="to-card-fleet-driver">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                                {row.fleetDriverName ?? "No driver"}
                              </span>
                              <span className="to-card-fleet-vehicle">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14l4 4v4a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="2"/><circle cx="17.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="2"/></svg>
                                {row.fleetVehicleName ?? "No vehicle"}{row.fleetVehiclePlateNumber ? ` · ${row.fleetVehiclePlateNumber}` : ""}
                              </span>
                            </>
                          ) : (
                            <span className="to-card-fleet-empty">Needs fleet assignment</span>
                          )}
                        </div>
                      ) : null}

                      <div className="to-card-footer" onClick={(e) => e.stopPropagation()}>
                        {row.category === MONITORING_TRAVEL_ORDER_CATEGORY ? (
                          <>
                            <select
                              className="input-base"
                              style={{ fontSize: 11, padding: "3px 6px", height: 28, width: 64 }}
                              value={row.priority ?? "P4"}
                              onChange={(e) => void handleTravelOrderPriorityChange(row._id, e.target.value)}
                              disabled={prioritySavingId === rowId}
                              title="Priority"
                              aria-label={`Priority for ${row.ticketNumber}`}
                            >
                              {MONITORING_PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <button type="button" className="monitoring-icon-action-btn" data-tooltip={row.fleetDriverId && row.fleetVehicleId ? "Edit fleet" : "Assign fleet"} aria-label={row.fleetDriverId && row.fleetVehicleId ? "Edit fleet" : "Assign fleet"} onClick={() => openFleetAssignmentModal({ _id: row._id, ticketNumber: row.ticketNumber, title: row.title, fleetDriverId: row.fleetDriverId, fleetDriverName: row.fleetDriverName, fleetVehicleId: row.fleetVehicleId, fleetVehicleName: row.fleetVehicleName, fleetVehiclePlateNumber: row.fleetVehiclePlateNumber })}>
                              <FleetAssignIcon />
                            </button>
                            {!isTODone ? (
                              <button type="button" className="monitoring-icon-action-btn is-warning" data-tooltip="Extend return time" aria-label="Extend return time" onClick={() => { setExtendTicketId(row._id); setExtendNewReturnAt(""); setExtendReason(""); setExtendError(""); setShowExtendModal(true); }}>
                                <ExtendTripIcon />
                              </button>
                            ) : null}
                            {!isTODone && !row.actualDepartureTime ? (
                              <button type="button" className="monitoring-icon-action-btn" data-tooltip="Mark as departed" aria-label="Mark as departed" onClick={() => handleMarkTravelDeparted(row._id, row.requestDetails)}>
                                <DepartIcon />
                              </button>
                            ) : null}
                            <button type="button" className="monitoring-icon-action-btn is-success" data-tooltip="Mark travel done" aria-label="Mark travel done" disabled={isTODone || travelDoneSavingId === rowId} onClick={() => void handleMarkTravelDone(row._id, row.travelReturnAt)}>
                              <TravelDoneIcon />
                            </button>
                            <button type="button" className="monitoring-icon-action-btn is-destructive" data-tooltip="Cancel travel order" aria-label="Cancel travel order" disabled={isTODone || travelCancelSavingId === rowId} onClick={() => { setCancelReasonTicketId(row._id); setCancelReason("No longer needed"); setCancelReasonDetail(""); setCancelReasonError(""); setShowCancelReasonModal(true); }}>
                              <CancelTravelOrderIcon />
                            </button>
                            {!row.sharedTripId && row.fleetDriverId && row.fleetVehicleId ? (
                              <button type="button" className="monitoring-icon-action-btn" data-tooltip="Combine as shared trip" aria-label="Combine as shared trip" disabled={isTODone} onClick={() => { setSharedTripPrimaryId(row._id); setSharedTripSecondaryId(""); setSharedTripError(""); setShowSharedTripModal(true); }}>
                                <SharedTripIcon />
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
            <div className="saas-table-wrap monitoring-tab-table-wrap">
              {requestTableError ? <FormErrorBanner message={requestTableError} /> : null}
              <table className="saas-table" style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th>{activeTab === "issues" ? "Ticket" : "Request"}</th>
                    {showRequestTypeColumn ? <th>Type</th> : null}
                    <th>{activeTab === "meetings" ? "Meeting Title" : "Category"}</th>
                    <th>Requester</th>
                    {showScheduleColumn ? <th>Schedule</th> : null}
                    {showPriorityColumn ? <th>Priority</th> : null}
                    <th>Status</th>
                    <th>{requestMetaColumnLabel}</th>
                    {!showBorrowingActionColumn ? <th>Last Updated</th> : null}
                    {showFleetActionColumn ? <th>Action</th> : null}
                    {showMeetingActionColumn ? <th>Action</th> : null}
                    {showBorrowingActionColumn ? <th>Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {requestRows.map((row) => {
                    const rowId = String(row._id);
                    const displayStatus = getTravelOrderDisplayStatus(row);
                    const rowServiceGroup = getServiceGroupForCategory(row.category);
                    const isTravelOrderDone =
                      row.category === MONITORING_TRAVEL_ORDER_CATEGORY &&
                      (displayStatus === "Fulfilled" || displayStatus === "Closed");
                    // The row's current pending approver (for inline approve/decline by non-HR approvers).
                    const rowPendingApprover = row.travelApprovalChain?.find(
                      (step) => step.status === "Pending",
                    )?.approverUsername;
                    const isMyApprovalRow =
                      row.category === MONITORING_TRAVEL_ORDER_CATEGORY &&
                      !isHrAdminStaff &&
                      Boolean(rowPendingApprover) &&
                      rowPendingApprover === currentUser?.username;
                    const isUnopenedRequest =
                      displayStatus === "New" && !(row.notificationSeenByGroups ?? []).includes(rowServiceGroup);
                    const requestListTitle =
                      activeTab === "meetings" ? getMeetingRequestListTitle(row.title) : row.title;
                    const borrowingRequestType = formatRequesterRequestType(row);
                    const borrowingAssetLabel = formatRequesterAssetLabel(row);
                    const isBorrowingPastDue =
                      activeTab === "borrowing" &&
                      row.category === MONITORING_BORROWING_REQUEST_CATEGORY &&
                      row.status === "Claimed" &&
                      row.expectedReturnAt != null &&
                      row.expectedReturnAt < Date.now();
                    return (
                      <tr
                        key={row._id}
                        className={`table-row-hover${isUnopenedRequest ? " monitoring-row-unopened" : ""}`}
                        style={{ cursor: "pointer", background: isBorrowingPastDue ? "#fff1f2" : undefined }}
                        onClick={() => router.push(`/monitoring/${row._id}`)}
                      >
                        <td>
                          <div className="monitoring-request-cell">
                            <div className="monitoring-request-title-row">
                              <strong>{row.ticketNumber}</strong>
                              {isUnopenedRequest ? <span className="monitoring-unopened-pill">New</span> : null}
                            </div>
                            <span className="monitoring-request-title">{requestListTitle}</span>
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
                            ) : row.requestedItemsText ? (
                              <span style={{ color: "var(--muted)", fontSize: 12 }}>
                                Requested: {row.requestedItemsText}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        {showRequestTypeColumn ? (
                          <td>{activeTab === "borrowing" ? borrowingRequestType : row.workType}</td>
                        ) : null}
                        <td>
                          {activeTab === "meetings" ? (
                            requestListTitle || "-"
                          ) : activeTab === "borrowing" ? (
                            borrowingAssetLabel
                          ) : (
                            row.category
                          )}
                        </td>
                        <td>{row.requesterName}</td>
                        {showScheduleColumn ? (
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
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span>{formatDateTime(row.expectedReturnAt)}</span>
                                  {isBorrowingPastDue ? (
                                    <span style={{ padding: "2px 7px", borderRadius: 999, background: "#fee2e2", color: "#991b1b", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                                      Past Due
                                    </span>
                                  ) : null}
                                </div>
                                <span style={{ color: "var(--muted)", fontSize: 12 }}>
                                  {row.requestedBorrowDate
                                    ? `Borrow ${formatDateTime(row.requestedBorrowDate)}`
                                    : "Expected return"}
                                </span>
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                        ) : null}
                        {showPriorityColumn ? (
                          <td onClick={(event) => event.stopPropagation()}>
                            {activeTab === "borrowing" && canSeeItQueue ? (
                              <select
                                className="input-base"
                                style={{ fontSize: 11, padding: "3px 6px", height: 28, width: 64 }}
                                value={row.priority ?? "P4"}
                                onChange={(e) => void handleTravelOrderPriorityChange(row._id, e.target.value)}
                                disabled={prioritySavingId === rowId}
                                aria-label={`Priority for ${row.ticketNumber}`}
                              >
                                {MONITORING_PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                              </select>
                            ) : (
                              row.priority ? <Chip label={row.priority} /> : "-"
                            )}
                          </td>
                        ) : null}
                        <td onClick={(event) => event.stopPropagation()}>
                          <Chip label={displayStatus} />
                        </td>
                        <td>
                          {activeTab === "meetings"
                            ? row.meetingMode || "-"
                            : activeTab === "borrowing"
                              ? row.borrowingItems?.length
                                ? `${row.borrowingItems.length} ${borrowingAssetLabel.toLowerCase()} linked`
                                : row.requestedItemsText
                                  ? "Needs asset matching"
                                  : "-"
                              : row.approvalRequired
                                ? <Chip label={row.approvalStage} />
                                : "-"}
                        </td>
                        {!showBorrowingActionColumn ? <td>{formatDateTime(row.updatedAt)}</td> : null}
                        {showFleetActionColumn ? (
                          <td onClick={(event) => event.stopPropagation()}>
                            {row.category === MONITORING_TRAVEL_ORDER_CATEGORY ? (
                              isHrAdminStaff ? (
                              <div className="monitoring-table-actions">
                                {hrAdminArchiveView === "archive" ? (
                                  <>
                                    <button
                                      type="button"
                                      className="monitoring-icon-action-btn"
                                      aria-label={`View ${row.ticketNumber}`}
                                      title="View details"
                                      onClick={() => router.push(`/monitoring/${row._id}`)}
                                    >
                                      <ViewTicketIcon />
                                    </button>
                                    <button
                                      type="button"
                                      className="monitoring-icon-action-btn is-warning"
                                      aria-label={`Reopen ${row.ticketNumber}`}
                                      title="Reopen travel order"
                                      disabled={travelReopenSavingId === rowId}
                                      onClick={() => void handleReopenTravelOrder(row._id)}
                                    >
                                      <ReopenTicketIcon />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="monitoring-icon-action-btn"
                                      aria-label={
                                        row.fleetDriverId && row.fleetVehicleId
                                          ? `Edit fleet assignment for ${row.ticketNumber}`
                                          : `Assign fleet for ${row.ticketNumber}`
                                      }
                                      title={row.fleetDriverId && row.fleetVehicleId ? "Edit fleet" : "Assign fleet"}
                                      onClick={() =>
                                        openFleetAssignmentModal({
                                          _id: row._id,
                                          ticketNumber: row.ticketNumber,
                                          title: row.title,
                                          fleetDriverId: row.fleetDriverId,
                                          fleetDriverName: row.fleetDriverName,
                                          fleetVehicleId: row.fleetVehicleId,
                                          fleetVehicleName: row.fleetVehicleName,
                                          fleetVehiclePlateNumber: row.fleetVehiclePlateNumber,
                                        })
                                      }
                                    >
                                      <FleetAssignIcon />
                                    </button>
                                    {!isTravelOrderDone && !row.actualDepartureTime ? (
                                      <button
                                        type="button"
                                        className="monitoring-icon-action-btn"
                                        aria-label={`Mark ${row.ticketNumber} as departed`}
                                        title="Mark as departed"
                                        onClick={() => handleMarkTravelDeparted(row._id, row.requestDetails)}
                                      >
                                        <DepartIcon />
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="monitoring-icon-action-btn is-success"
                                      aria-label={`Mark ${row.ticketNumber} travel done`}
                                      title="Mark travel done"
                                      disabled={isTravelOrderDone || travelDoneSavingId === rowId}
                                      onClick={() => void handleMarkTravelDone(row._id, row.travelReturnAt)}
                                    >
                                      <TravelDoneIcon />
                                    </button>
                                    <button
                                      type="button"
                                      className="monitoring-icon-action-btn is-destructive"
                                      aria-label={`Cancel ${row.ticketNumber}`}
                                      title="Cancel travel order"
                                      disabled={isTravelOrderDone || travelCancelSavingId === rowId}
                                      onClick={() => { setCancelReasonTicketId(row._id); setCancelReason("No longer needed"); setCancelReasonDetail(""); setCancelReasonError(""); setShowCancelReasonModal(true); }}
                                    >
                                      <CancelTravelOrderIcon />
                                    </button>
                                    {!row.sharedTripId && row.fleetDriverId && row.fleetVehicleId ? (
                                      <button
                                        type="button"
                                        className="monitoring-icon-action-btn"
                                        aria-label={`Combine ${row.ticketNumber} as shared trip`}
                                        title="Combine as shared trip"
                                        disabled={isTravelOrderDone}
                                        onClick={() => { setSharedTripPrimaryId(row._id); setSharedTripSecondaryId(""); setSharedTripError(""); setShowSharedTripModal(true); }}
                                      >
                                        <SharedTripIcon />
                                      </button>
                                    ) : null}
                                  </>
                                )}
                              </div>
                              ) : isMyApprovalRow ? (
                                <div className="monitoring-table-actions">
                                  <button
                                    type="button"
                                    className="monitoring-icon-action-btn is-success"
                                    aria-label={`Approve ${row.ticketNumber}`}
                                    title="Approve"
                                    disabled={travelApprovalSavingId === rowId}
                                    onClick={() => void handleRowTravelApproval(row._id, "Approved")}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                                      <path d="M2.5 7.5L6 11L12.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="monitoring-icon-action-btn is-destructive"
                                    aria-label={`Return ${row.ticketNumber} for revision`}
                                    title="Decline (return for revision)"
                                    disabled={travelApprovalSavingId === rowId}
                                    onClick={() => void handleRowTravelApproval(row._id, "For Revision")}
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                  </button>
                                </div>
                              ) : (
                                "-"
                              )
                            ) : (
                              "-"
                            )}
                          </td>
                        ) : null}
                        {showMeetingActionColumn ? (
                          <td onClick={(event) => event.stopPropagation()}>
                            <div className="monitoring-table-actions">
                              {canApproveMeetings ? (
                                <>
                                  {normalizeMeetingRequestStatusValue(row.status) === "New" ? (
                                    <button
                                      type="button"
                                      className="monitoring-icon-action-btn is-success"
                                      aria-label={`Approve ${row.ticketNumber}`}
                                      title="Approve"
                                      disabled={meetingStatusSavingId === rowId}
                                      onClick={() => void handleMeetingStatusChange(row._id, "Reserved")}
                                    >
                                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                                        <path d="M2.5 7.5L6 11L12.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                    </button>
                                  ) : null}
                                  {normalizeMeetingRequestStatusValue(row.status) === "Ready" ? (
                                    <button
                                      type="button"
                                      className="monitoring-icon-action-btn is-success"
                                      aria-label={`Mark ${row.ticketNumber} as Done`}
                                      title="Mark as Done"
                                      disabled={meetingStatusSavingId === rowId}
                                      onClick={() => setMeetingDoneConfirmId(row._id)}
                                    >
                                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                                        <path d="M1 7.5L4.5 11L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M5 7.5L8.5 11L14.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                                      </svg>
                                    </button>
                                  ) : null}
                                  {normalizeMeetingRequestStatusValue(row.status) !== "Done" && row.status !== "Closed" ? (
                                    <button
                                      type="button"
                                      className="monitoring-icon-action-btn is-destructive"
                                      aria-label={`Cancel ${row.ticketNumber}`}
                                      title="Cancel"
                                      disabled={meetingStatusSavingId === rowId}
                                      onClick={() => void handleMeetingStatusChange(row._id, "Closed")}
                                    >
                                      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                                        <path d="M3.5 3.5L11.5 11.5M11.5 3.5L3.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                      </svg>
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="monitoring-icon-action-btn"
                                    aria-label={`Reschedule ${row.ticketNumber}`}
                                    title="Reschedule / Edit"
                                    onClick={() => router.push(`/monitoring/${row._id}`)}
                                  >
                                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                                      <rect x="2" y="3" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
                                      <path d="M2 6H13" stroke="currentColor" strokeWidth="1.5" />
                                      <path d="M5 2V4M10 2V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="monitoring-icon-action-btn"
                                  aria-label={`Open ${row.ticketNumber}`}
                                  title="Open"
                                  onClick={() => router.push(`/monitoring/${row._id}`)}
                                >
                                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                                    <path d="M5.5 3.5H3C2.72 3.5 2.5 3.72 2.5 4V12C2.5 12.28 2.72 12.5 3 12.5H11C11.28 12.5 11.5 12.28 11.5 12V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    <path d="M8.5 2.5H12.5V6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    <path d="M12.5 2.5L7 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                  </svg>
                                </button>
                              )}
                              {meetingArchiveView === "archive" && !(row.attachments ?? []).some((a) => a.kind === "Meeting Recording") ? (
                                <button
                                  type="button"
                                  className="monitoring-icon-action-btn"
                                  aria-label={`Upload recording for ${row.ticketNumber}`}
                                  title={archiveRecordingUploading && String(archiveRecordingUploadId) === rowId ? "Uploading…" : "Upload recording"}
                                  disabled={archiveRecordingUploading && String(archiveRecordingUploadId) === rowId}
                                  onClick={() => {
                                    setArchiveRecordingUploadId(row._id);
                                    archiveRecordingInputRef.current?.click();
                                  }}
                                >
                                  <UploadRecordingIcon />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                        {showBorrowingActionColumn ? (
                          <td onClick={(event) => event.stopPropagation()}>
                            <div className="monitoring-table-actions">
                              {/* Approve & Reserve — New/Triage/For Revision/Pending Approval */}
                              {borrowingArchiveView === "active" && (row.status === "New" || row.status === "Triage" || row.status === "For Revision" || row.status === "Pending Approval") ? (
                                <button
                                  type="button"
                                  className="monitoring-icon-action-btn is-success"
                                  title="Approve & Reserve equipment"
                                  aria-label={`Approve and reserve ${row.ticketNumber}`}
                                  disabled={borrowingActionSavingId === rowId}
                                  onClick={() => void handleBorrowingAction(row._id, "Reserved")}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M4 12L9 17L20 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                              ) : null}
                              {/* Mark Claimed — Reserved */}
                              {borrowingArchiveView === "active" && row.status === "Reserved" ? (
                                <button
                                  type="button"
                                  className="monitoring-icon-action-btn is-success"
                                  title="Mark as Claimed"
                                  aria-label={`Mark ${row.ticketNumber} as claimed`}
                                  disabled={borrowingActionSavingId === rowId}
                                  onClick={() => void handleBorrowingAction(row._id, "Claimed")}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                  </svg>
                                </button>
                              ) : null}
                              {/* Log Return — Claimed */}
                              {borrowingArchiveView === "active" && row.status === "Claimed" ? (
                                <button
                                  type="button"
                                  className="monitoring-icon-action-btn is-success"
                                  title="Log Return Condition"
                                  aria-label={`Log return for ${row.ticketNumber}`}
                                  disabled={borrowingActionSavingId === rowId}
                                  onClick={() => openReturnModal(row)}
                                >
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M2 12L7 17L18 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M8 12L13 17L24 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                              ) : null}
                              {/* View */}
                              <button
                                type="button"
                                className="monitoring-icon-action-btn"
                                title="View details"
                                aria-label={`View ${row.ticketNumber}`}
                                onClick={() => router.push(`/monitoring/${row._id}`)}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="2"/>
                                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                                </svg>
                              </button>
                            </div>
                          </td>
                        ) : null}
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
            )}
          </div>
        )}
        </div>

      </section>
    </div>
  );
}
