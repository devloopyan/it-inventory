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

function getFleetAvatarPalette(name: string): { background: string; color: string } {
  const palettes = [
    { background: "#dbeafe", color: "#1d4ed8" },
    { background: "#d1fae5", color: "#065f46" },
    { background: "#fce7f3", color: "#be185d" },
    { background: "#ede9fe", color: "#5b21b6" },
    { background: "#fee2e2", color: "#991b1b" },
    { background: "#fef3c7", color: "#92400e" },
    { background: "#e0f2fe", color: "#075985" },
    { background: "#f0fdf4", color: "#166534" },
  ];
  return palettes[name.charCodeAt(0) % palettes.length];
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
  return (
    <section className="monitoring-fleet-panel" aria-label="Fleet availability">
      <div className="monitoring-fleet-head">
        <div>
          <h2 className="type-section-title">Fleet Availability</h2>
          <p className="type-section-copy">Available drivers and vehicles for travel order coordination.</p>
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
                      border: "1px solid rgba(var(--brand-900-rgb), 0.18)",
                      background: "rgba(var(--brand-900-rgb), 0.1)",
                      color: "var(--foreground)",
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
                      border: "1px solid rgba(var(--brand-900-rgb), 0.18)",
                      background: "rgba(var(--brand-900-rgb), 0.1)",
                      color: "var(--foreground)",
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
                      <div className="fleet-manage-avatar" style={getFleetAvatarPalette(driver.name)}>
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

const MONITORING_TABS: ReadonlyArray<{ key: MonitoringTab; label: string; description: string }> = [
  { key: "issues", label: "IT Queue", description: "IT issues, approvals, and service requests." },
  { key: "hrAdmin", label: "HR/Admin Queue", description: "Travel orders and HR/Admin service requests." },
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
  const canSeeItQueue =
    hasAdminAccess || currentServiceGroups.includes("IT");
  const canSeeHrAdminQueue =
    hasAdminAccess || currentServiceGroups.includes("HR/Admin");
  const canSeeMeetingsQueue =
    hasAdminAccess ||
    currentUser?.role === "approver" ||
    currentServiceGroups.includes("OSMD") ||
    currentServiceGroups.includes("IT");
  const visibleMonitoringTabs = useMemo(
    () =>
      MONITORING_TABS.filter((tab) => {
        if (hasAdminAccess) return true;
        if (tab.key === "hrAdmin") return canSeeHrAdminQueue;
        if (tab.key === "meetings") return canSeeMeetingsQueue;
        if (tab.key === "issues") return canSeeItQueue || canSeeMeetingsQueue;
        return canSeeItQueue;
      }),
    [canSeeHrAdminQueue, canSeeItQueue, canSeeMeetingsQueue, hasAdminAccess],
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
  const cancelTravelOrder = useMutation(api.fleet.cancelTravelOrder);
  const reopenTravelOrder = useMutation(api.fleet.reopenTravelOrder);
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
  const [meetingArchiveView, setMeetingArchiveView] = useState<"active" | "archive">("active");
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
  const [travelDoneSavingId, setTravelDoneSavingId] = useState("");
  const [travelCancelSavingId, setTravelCancelSavingId] = useState("");
  const [travelReopenSavingId, setTravelReopenSavingId] = useState("");
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
  const showScheduleColumn = activeTab !== "hrAdmin";
  const requestColumnCount =
    6 +
    (showRequestTypeColumn ? 1 : 0) +
    (showPriorityColumn ? 1 : 0) +
    (showFleetActionColumn ? 1 : 0) +
    (showMeetingActionColumn ? 1 : 0) +
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

  async function handleMarkTravelDone(ticketId: Id<"monitoringTickets">) {
    if (!window.confirm("Mark this travel order as done? The assigned driver and vehicle will become available again.")) {
      return;
    }

    try {
      setTravelDoneSavingId(String(ticketId));
      setRequestTableError("");
      await markTravelOrderDone({
        ticketId,
        actorName,
      });
    } catch (error) {
      setRequestTableError(error instanceof Error ? error.message : "Unable to mark travel as done.");
    } finally {
      setTravelDoneSavingId("");
    }
  }

  async function handleCancelTravelOrder(ticketId: Id<"monitoringTickets">) {
    if (!window.confirm("Cancel this travel order? The assigned driver and vehicle will become available again.")) {
      return;
    }

    try {
      setTravelCancelSavingId(String(ticketId));
      setRequestTableError("");
      await cancelTravelOrder({
        ticketId,
        actorName,
      });
    } catch (error) {
      setRequestTableError(error instanceof Error ? error.message : "Unable to cancel travel order.");
    } finally {
      setTravelCancelSavingId("");
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

  return (
    <div className="monitoring-page" style={{ display: "grid", gap: 18 }}>
      <section
        className="panel"
        style={{
          padding: 18,
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
        {visibleMonitoringTabs.length > 1 ? (
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
            {activeTab === "hrAdmin" ? (
              <FleetAvailabilitySection
                loading={fleetAvailability === undefined}
                drivers={fleetDrivers}
                vehicles={availableFleetVehicles}
                canManage={canSeeHrAdminQueue}
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
              {activeTab === "hrAdmin" ? (
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

            {activeTab === "hrAdmin" ? (
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
                  const travelSchedule = getTravelScheduleFromDetails(row.requestDetails);
                  const travelPurpose = row.category === MONITORING_TRAVEL_ORDER_CATEGORY ? getTravelPurposeFromDetails(row.requestDetails) : null;
                  const avatarPalette = getFleetAvatarPalette(row.requesterName ?? "?");
                  const requesterInitials = getFleetInitials(row.requesterName ?? "?");
                  const hasFleet = Boolean(row.fleetDriverName || row.fleetVehicleName);
                  return (
                    <article
                      key={row._id}
                      className={`to-card${isUnopened ? " to-card--unopened" : ""}`}
                      onClick={() => router.push(`/monitoring/${row._id}`)}
                    >
                      <div className="to-card-header">
                        <div className="to-card-header-left">
                          <span className="to-card-ticket">{row.ticketNumber}</span>
                          {isUnopened ? <span className="monitoring-unopened-pill">New</span> : null}
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
                        {hrAdminArchiveView === "archive" ? (
                          <button type="button" className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={() => void handleReopenTravelOrder(row._id)} disabled={travelReopenSavingId === rowId}>
                            {travelReopenSavingId === rowId ? "…" : "Reopen"}
                          </button>
                        ) : row.category === MONITORING_TRAVEL_ORDER_CATEGORY ? (
                          <>
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
                            <button type="button" className="monitoring-icon-action-btn" title={row.fleetDriverId && row.fleetVehicleId ? "Edit fleet" : "Assign fleet"} onClick={() => openFleetAssignmentModal({ _id: row._id, ticketNumber: row.ticketNumber, title: row.title, fleetDriverId: row.fleetDriverId, fleetDriverName: row.fleetDriverName, fleetVehicleId: row.fleetVehicleId, fleetVehicleName: row.fleetVehicleName, fleetVehiclePlateNumber: row.fleetVehiclePlateNumber })}>
                              <FleetAssignIcon />
                            </button>
                            <button type="button" className="monitoring-icon-action-btn is-success" title="Mark travel done" disabled={isTODone || travelDoneSavingId === rowId} onClick={() => void handleMarkTravelDone(row._id)}>
                              <TravelDoneIcon />
                            </button>
                            <button type="button" className="monitoring-icon-action-btn is-destructive" title="Cancel travel order" disabled={isTODone || travelCancelSavingId === rowId} onClick={() => { setCancelReasonTicketId(row._id); setCancelReason("No longer needed"); setCancelReasonDetail(""); setCancelReasonError(""); setShowCancelReasonModal(true); }}>
                              <CancelTravelOrderIcon />
                            </button>
                            {!row.sharedTripId && row.fleetDriverId && row.fleetVehicleId ? (
                              <button type="button" className="monitoring-icon-action-btn" title="Combine as shared trip" disabled={isTODone} onClick={() => { setSharedTripPrimaryId(row._id); setSharedTripSecondaryId(""); setSharedTripError(""); setShowSharedTripModal(true); }}>
                                <SharedTripIcon />
                              </button>
                            ) : null}
                          </>
                        ) : null}
                        <button type="button" className="monitoring-icon-action-btn" title="View details" onClick={() => router.push(`/monitoring/${row._id}`)}>
                          <ViewTicketIcon />
                        </button>
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
                    <th>Last Updated</th>
                    {showFleetActionColumn ? <th>Action</th> : null}
                    {showMeetingActionColumn ? <th>Action</th> : null}
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
                    const isUnopenedRequest =
                      displayStatus === "New" && !(row.notificationSeenByGroups ?? []).includes(rowServiceGroup);
                    const requestListTitle =
                      activeTab === "meetings" ? getMeetingRequestListTitle(row.title) : row.title;
                    const borrowingRequestType = formatRequesterRequestType(row);
                    const borrowingAssetLabel = formatRequesterAssetLabel(row);
                    const travelSchedule = getTravelScheduleFromDetails(row.requestDetails);
                    return (
                      <tr
                        key={row._id}
                        className={`table-row-hover${isUnopenedRequest ? " monitoring-row-unopened" : ""}`}
                        style={{ cursor: "pointer" }}
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
                                <span>{formatDateTime(row.expectedReturnAt)}</span>
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
                            {row.priority ? <Chip label={row.priority} /> : "-"}
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
                        <td>{formatDateTime(row.updatedAt)}</td>
                        {showFleetActionColumn ? (
                          <td onClick={(event) => event.stopPropagation()}>
                            {row.category === MONITORING_TRAVEL_ORDER_CATEGORY ? (
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
                                    <button
                                      type="button"
                                      className="monitoring-icon-action-btn is-success"
                                      aria-label={`Mark ${row.ticketNumber} travel done`}
                                      title="Mark travel done"
                                      disabled={isTravelOrderDone || travelDoneSavingId === rowId}
                                      onClick={() => void handleMarkTravelDone(row._id)}
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

      </section>
    </div>
  );
}
