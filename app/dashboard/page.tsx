"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "../current-user-context";
import FileUploadCard from "../hardware-inventory/file-upload-card";
import { HARDWARE_BORROW_CONDITION_OPTIONS } from "@/lib/hardwareBorrowConditions";
import { HARDWARE_STATUSES, type HardwareStatus } from "@/lib/hardwareStatuses";
import { MONITORING_BORROWING_REQUEST_CATEGORY } from "@/lib/monitoring";
import { normalizeServiceGroups, normalizeUserRole } from "@/lib/roles";
import { getServiceGroupForCategory } from "@/lib/serviceGroups";
import RequesterDashboard from "./requester-dashboard";
import DashboardStaffDropdown from "./staff-dropdown";

type TabKey = "workstation" | "master" | "storage" | "borrowed" | "reserved" | "requested" | "available";
type ReservationStatus = "Reserved" | "Claimed" | "Cancelled" | "Expired";
type ActivityTone = "blue" | "green" | "amber" | "red" | "slate";
type HardwareActivityRecord = {
  _id: string;
  inventoryId?: string;
  assetTag: string;
  assetNameDescription?: string;
  eventType: string;
  message: string;
  relatedPerson?: string;
  location?: string;
  status?: string;
  createdAt: number;
};

type DashboardCalendarEvent = {
  _id: string;
  ticketNumber: string;
  title: string;
  requesterName: string;
  requesterSection?: string;
  requesterDepartment?: string;
  meetingMode?: string;
  meetingLocation?: string;
  workflowType: string;
  category: string;
  eventKind: "meeting" | "ticket" | "borrowing" | "internet" | "support" | "travel";
  eventStartAt: number;
  eventEndAt?: number;
  status: string;
  relatedAssetsCount: number;
  contextLine?: string;
  referenceLabel?: string;
  assignedStaff?: string[];
  neededItems?: string;
  notes?: string;
  href?: string;
};

type DashboardSupportEventFormState = {
  title: string;
  requestedBy: string;
  assignedStaff: string[];
  startAt: string;
  endAt: string;
  location: string;
  neededItems: string;
  notes: string;
};

const defaultSupportEventForm: DashboardSupportEventFormState = {
  title: "",
  requestedBy: "",
  assignedStaff: [],
  startAt: "",
  endAt: "",
  location: "",
  neededItems: "",
  notes: "",
};

const IT_SUPPORT_STAFF_OPTIONS = [
  "Belle Clarice Dela Cerna",
  "Josef Scott Suico",
  "Leanne Ondong",
] as const;

const CALENDAR_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const tabs: { key: TabKey; label: string }[] = [
  { key: "borrowed", label: "Borrowed" },
  { key: "reserved", label: "Reserved" },
  { key: "requested", label: "Requested" },
  { key: "available", label: "Available" },
];

const DEFAULT_BORROW_CONDITION = HARDWARE_BORROW_CONDITION_OPTIONS[0];

function matchesSearch(
  row: {
    assetTag: string;
    serialNumber: string;
    assetNameDescription?: string;
    turnoverTo?: string;
  },
  search: string,
) {
  if (!search) return true;
  const term = search.toLowerCase();
  return [
    row.assetTag,
    row.serialNumber,
    row.assetNameDescription ?? "",
    row.turnoverTo ?? "",
  ].some((value) => String(value).toLowerCase().includes(term));
}

function groupBy<T>(rows: T[], key: (row: T) => string) {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const groupKey = key(row) || "Unassigned";
    if (!map.has(groupKey)) map.set(groupKey, []);
    map.get(groupKey)?.push(row);
  });
  return map;
}

function isWorkstationRecord(row: {
  assetType?: string;
  registerMode?: string;
  workstationType?: string;
  turnoverTo?: string;
  turnoverFormStorageId?: string;
}) {
  if (row.registerMode === "workstation") return true;
  if (row.workstationType === "Laptop" || row.workstationType === "Desktop/PC") return true;
  if (row.assetType === "Laptop" || row.assetType === "Desktop/PC") {
    const turnoverTo = row.turnoverTo?.trim();
    return Boolean(
      row.turnoverFormStorageId &&
        turnoverTo &&
        turnoverTo.toLowerCase() !== "unassigned",
    );
  }
  return false;
}

function getWorkstationAssetType(row: {
  assetType?: string;
  workstationType?: string;
}) {
  if (row.workstationType === "Desktop/PC" || row.workstationType === "Laptop") {
    return row.workstationType;
  }
  if (row.assetType === "Desktop/PC" || row.assetType === "Laptop") {
    return row.assetType;
  }
  return "";
}

function getReservationStatus(row: Record<string, unknown>) {
  return row.reservationStatus as ReservationStatus | undefined;
}

function isReservedRecord(row: Record<string, unknown>) {
  return getReservationStatus(row) === "Reserved";
}

function getReservationBorrower(row: Record<string, unknown>) {
  return (row.reservationBorrower as string | undefined) ?? "";
}

function getReservationDepartment(row: Record<string, unknown>) {
  return (row.reservationDepartment as string | undefined) ?? "";
}

function isDroneKitRecord(row: {
  assetType?: string;
  registerMode?: string;
}) {
  return row.assetType === "Drone" || row.registerMode === "droneKit";
}

function formatPercent(value?: number) {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(2)}%`;
}

function getCalendarMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addCalendarMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getCalendarGridRange(date: Date) {
  const monthStart = getCalendarMonthStart(date);
  const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  gridStart.setHours(0, 0, 0, 0);
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));
  gridEnd.setHours(23, 59, 59, 999);
  return { monthStart, monthEnd, gridStart, gridEnd };
}

function getCalendarDateKey(value: Date | number) {
  const date = typeof value === "number" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseCalendarDateKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isSameCalendarMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function formatCalendarMonthLabel(date: Date) {
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function formatCalendarDateLabel(date: Date) {
  return date.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatCalendarTime(value: number) {
  return new Date(value).toLocaleString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatCalendarEventTime(start: number, end?: number) {
  const startLabel = formatCalendarTime(start);
  if (!end) return startLabel;

  const endDate = new Date(end);
  const sameDay = getCalendarDateKey(start) === getCalendarDateKey(endDate);
  const endLabel = sameDay
    ? formatCalendarTime(end)
    : endDate.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return `${startLabel} - ${endLabel}`;
}

function toDateTimeLocalValue(value?: number) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function toTimestamp(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.getTime();
}

function getDefaultSupportEventStart(dayKey: string) {
  const date = parseCalendarDateKey(dayKey);
  date.setHours(8, 0, 0, 0);
  return toDateTimeLocalValue(date.getTime());
}

const SCHEDULE_CELL_H = 36;
const SCHEDULE_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

function formatScheduleHour(hour: number): string {
  if (hour === 12) return "12 PM";
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

function getScheduleWeekStart(offsetWeeks: number): Date {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) + offsetWeeks * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getScheduleWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
}

function formatScheduleTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatScheduleWeekLabel(weekStart: Date): string {
  const fri = new Date(weekStart);
  fri.setDate(weekStart.getDate() + 4);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${weekStart.toLocaleDateString("en-US", opts)} – ${fri.toLocaleDateString("en-US", opts)}`;
}

function getMeetingCalendarStatusClass(status?: string) {
  switch (status) {
    case "New":
      return "is-new";
    case "Reserved":
    case "Assets Reserved":
      return "is-reserved";
    case "Ready":
    case "Setup Complete":
      return "is-setup";
    case "Done":
      return "is-done";
    default:
      return "is-neutral";
  }
}

function getDashboardCalendarEventClass(event: DashboardCalendarEvent) {
  switch (event.eventKind) {
    case "meeting":
      return getMeetingCalendarStatusClass(event.status);
    case "internet":
      return "is-internet";
    case "borrowing":
      return "is-borrowing";
    case "support":
      return "is-support";
    case "travel":
      return "is-travel";
    case "ticket":
    default:
      return "is-ticket";
  }
}

function getDashboardCalendarEventKindLabel(event: DashboardCalendarEvent) {
  switch (event.eventKind) {
    case "meeting":
      return "Meeting Request";
    case "internet":
      return "Internet Outage";
    case "borrowing":
      return "Borrowing Request";
    case "support":
      return "IT Support";
    case "travel":
      return "Travel Order";
    case "ticket":
    default:
      return "Ticket";
  }
}

function getDashboardCalendarEventTitle(event: DashboardCalendarEvent) {
  if (event.eventKind !== "meeting") return event.title;

  return event.title
    .replace(/^Meeting Support - /i, "")
    .replace(/ - [A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M$/i, "")
    .trim();
}

function getMeetingSpanDateKeys(start: number, end?: number) {
  const keys: string[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const boundary = new Date(end ?? start);
  boundary.setHours(0, 0, 0, 0);

  while (cursor.getTime() <= boundary.getTime() && keys.length < 14) {
    keys.push(getCalendarDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return keys;
}

function getActivityMeta(eventType: string): {
  label: string;
  tone: ActivityTone;
  urgent?: boolean;
} {
  switch (eventType) {
    case "asset_created":
      return { label: "Created", tone: "blue" };
    case "asset_updated":
      return { label: "Updated", tone: "slate" };
    case "status_changed":
      return { label: "Status Change", tone: "slate" };
    case "asset_assigned":
      return { label: "Assigned", tone: "blue" };
    case "asset_borrowed":
      return { label: "Borrowed", tone: "amber", urgent: true };
    case "asset_for_repair":
      return { label: "For Repair", tone: "red", urgent: true };
    case "asset_retired":
      return { label: "Retired", tone: "slate" };
    case "reservation_created":
      return { label: "Reserved", tone: "blue" };
    case "reservation_claimed":
      return { label: "Claimed", tone: "green" };
    case "reservation_cancelled":
      return { label: "Reservation Cancelled", tone: "amber" };
    case "asset_returned":
      return { label: "Returned", tone: "green" };
    case "drone_flight_report_uploaded":
      return { label: "Flight Report", tone: "blue" };
    case "receiving_form_uploaded":
      return { label: "Receiving Form", tone: "green" };
    case "turnover_form_uploaded":
      return { label: "Turnover Form", tone: "blue" };
    case "asset_deleted":
      return { label: "Deleted", tone: "red", urgent: true };
    default:
      return { label: "Activity", tone: "slate" };
  }
}

function formatActivityTime(value: number) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderActivityIcon(eventType: string) {
  switch (eventType) {
    case "reservation_created":
    case "reservation_claimed":
    case "reservation_cancelled":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 4H17V8H7V4Z" stroke="currentColor" strokeWidth="2" />
          <path d="M7 12H17V20H7V12Z" stroke="currentColor" strokeWidth="2" />
          <path d="M9 8V12" stroke="currentColor" strokeWidth="2" />
          <path d="M15 8V12" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "asset_borrowed":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 5L19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "asset_for_repair":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M14 6L18 10L10 18H6V14L14 6Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "receiving_form_uploaded":
    case "turnover_form_uploaded":
    case "drone_flight_report_uploaded":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 3H16L20 7V21H4V3H8Z" stroke="currentColor" strokeWidth="2" />
          <path d="M16 3V7H20" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "asset_returned":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M19 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
}

function DashboardCalendarAgendaCard({ event, compactTimeLabel = false }: { event: DashboardCalendarEvent; compactTimeLabel?: boolean }) {
  const cardContent = (
    <>
      <div className="dashboard-calendar-agenda-card-top">
        <span className={`dashboard-calendar-status-pill ${getDashboardCalendarEventClass(event)}`}>
          {getDashboardCalendarEventKindLabel(event)}
        </span>
        <span className="dashboard-calendar-agenda-ticket">
          {compactTimeLabel
            ? formatCalendarEventTime(event.eventStartAt, event.eventEndAt)
            : event.referenceLabel || event.ticketNumber || formatCalendarEventTime(event.eventStartAt, event.eventEndAt)}
        </span>
      </div>
      <strong className="dashboard-calendar-agenda-card-title">{getDashboardCalendarEventTitle(event)}</strong>
      <div className="dashboard-calendar-agenda-meta">{formatCalendarEventTime(event.eventStartAt, event.eventEndAt)}</div>
      <div className="dashboard-calendar-agenda-meta">{event.contextLine || event.category}</div>
      <div className="dashboard-calendar-agenda-footer">
        <span>
          {event.eventKind === "support"
            ? [event.referenceLabel, event.requesterName].filter(Boolean).join(" · ") || "IT support event"
            : [event.requesterName, event.status].filter(Boolean).join(" · ")}
        </span>
        <span>
          {event.eventKind === "support"
            ? event.neededItems || "No needed items listed"
            : event.relatedAssetsCount
              ? `${event.relatedAssetsCount} linked asset${event.relatedAssetsCount === 1 ? "" : "s"}`
              : "No linked assets"}
        </span>
      </div>
    </>
  );

  if (event.href) {
    return (
      <Link href={event.href} className="dashboard-calendar-agenda-card">
        {cardContent}
      </Link>
    );
  }

  return <div className="dashboard-calendar-agenda-card">{cardContent}</div>;
}

export default function DashboardPage() {
  const currentUser = useCurrentUser();
  const currentRole = normalizeUserRole(currentUser?.role);
  const currentServiceGroups = normalizeServiceGroups(currentRole, currentUser?.serviceGroups);
  const hasItDashboardAccess = currentRole === "admin" || currentServiceGroups.includes("IT");
  const isHrAdminCalendarOnlyDashboard =
    currentRole !== "member" && !hasItDashboardAccess && currentServiceGroups.includes("HR/Admin");
  const isOsmdApproverDashboard =
    !hasItDashboardAccess &&
    currentRole !== "member" &&
    !isHrAdminCalendarOnlyDashboard &&
    currentServiceGroups.includes("OSMD");
  // Pure TO approvers (reviewer / team lead without IT access) have no asset or
  // monitoring data, so the "Pending Actions" metrics strip is all zeros for them.
  const isPureApproverDashboard =
    (currentRole === "reviewer" || currentRole === "team_lead") && !hasItDashboardAccess;
  // Show the Conference Room Schedule (instead of the inventory Activities feed)
  // on every monitoring dashboard: OSMD approvers, pure reviewers / team leads,
  // and admin / IT staff.
  const showConferenceRoomPanel =
    isOsmdApproverDashboard || isPureApproverDashboard || hasItDashboardAccess;
  // Pure approvers see a read-only equipment borrowing availability panel instead
  // of the full inventory management workspace.
  const showEquipmentAvailabilityPanel = isPureApproverDashboard;
  const shouldLoadHardwareDashboardData =
    currentRole === "member" || hasItDashboardAccess || showEquipmentAvailabilityPanel;
  const shouldLoadSupportCalendar = !isHrAdminCalendarOnlyDashboard;
  // Travel order calendar visibility:
  //  - admins and approvers (team leaders/managers): see ALL travel orders
  //  - everyone else: see only travel orders filed within their own SECTION (their own + teammates')
  const viewerSection = currentUser?.section ?? "";
  const travelTeamScope: "all" | "section" =
    currentRole === "admin" || currentRole === "owner" || currentRole === "reviewer" || currentRole === "team_lead"
      ? "all"
      : "section";
  const [calendarMonth, setCalendarMonth] = useState(() => getCalendarMonthStart(new Date()));
  const [selectedMeetingDay, setSelectedMeetingDay] = useState(() => getCalendarDateKey(new Date()));
  const [scheduleWeekOffset, setScheduleWeekOffset] = useState(0);
  const [isCalendarDetailOpen, setIsCalendarDetailOpen] = useState(false);
  const [showSupportEventCreate, setShowSupportEventCreate] = useState(false);
  const [supportEventForm, setSupportEventForm] = useState<DashboardSupportEventFormState>(() => ({
    ...defaultSupportEventForm,
    startAt: getDefaultSupportEventStart(getCalendarDateKey(new Date())),
  }));
  const [supportEventSaving, setSupportEventSaving] = useState(false);
  const [supportEventError, setSupportEventError] = useState("");
  const meetingCalendarRange = getCalendarGridRange(calendarMonth);
  const allRows = useQuery(api.hardwareInventory.listAll, shouldLoadHardwareDashboardData ? {} : "skip");
  const openBorrowingRequests = useQuery(
    api.monitoring.list,
    shouldLoadHardwareDashboardData
      ? {
          view: "issues",
          showClosed: false,
        }
      : "skip",
  );
  const monitoringCalendarFeed = useQuery(api.monitoring.getMeetingCalendar, {
    rangeStart: meetingCalendarRange.gridStart.getTime(),
    rangeEnd: meetingCalendarRange.gridEnd.getTime(),
    viewerUsername: currentUser?.username,
  }) as DashboardCalendarEvent[] | undefined;
  const scheduleWeekStart = getScheduleWeekStart(scheduleWeekOffset);
  const scheduleWeekFeed = useQuery(api.monitoring.getMeetingCalendar, {
    rangeStart: scheduleWeekStart.getTime(),
    rangeEnd: scheduleWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000,
    viewerUsername: currentUser?.username,
  }) as DashboardCalendarEvent[] | undefined;
  const monitoringOverview = useQuery(api.monitoring.getOverview, hasItDashboardAccess ? {} : "skip");
  const supportCalendarFeed = useQuery(
    api.dashboardCalendar.listSupportEvents,
    shouldLoadSupportCalendar
      ? {
          rangeStart: meetingCalendarRange.gridStart.getTime(),
          rangeEnd: meetingCalendarRange.gridEnd.getTime(),
        }
      : "skip",
  ) as DashboardCalendarEvent[] | undefined;
  const activityFeed = useQuery(
    (api.hardwareInventory as Record<string, unknown>)["listRecentActivity"] as never,
    (hasItDashboardAccess ? { limit: 8 } : "skip") as never,
  ) as unknown as HardwareActivityRecord[] | undefined;
  const migrateLegacy = useMutation(api.hardwareInventory.migrateLegacy);
  const createSupportEvent = useMutation(api.dashboardCalendar.createSupportEvent);
  const claimReservation = useMutation(
    (api.hardwareInventory as Record<string, unknown>)["claimReservation"] as never,
  ) as unknown as (args: { inventoryId: never; releaseCondition: string }) => Promise<unknown>;
  const cancelReservation = useMutation(
    (api.hardwareInventory as Record<string, unknown>)["cancelReservation"] as never,
  ) as unknown as (args: { inventoryId: never }) => Promise<unknown>;
  const generateUploadUrl = useMutation(api.hardwareInventory.generateUploadUrl);
  const returnBorrowedAsset = useMutation(
    (api.hardwareInventory as Record<string, unknown>)["returnBorrowedAsset"] as never,
  ) as unknown as (args: { inventoryId: never; returnCondition: string }) => Promise<unknown>;
  const returnDronePackage = useMutation(
    (api.hardwareInventory as Record<string, unknown>)["returnDronePackage"] as never,
  ) as unknown as (args: {
    inventoryIds: never[];
    reportTargetInventoryId: never;
    droneFlightReportStorageId: never;
    returnCondition: string;
  }) => Promise<unknown>;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("borrowed");
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [requesterBorrowingListIds, setRequesterBorrowingListIds] = useState<string[]>([]);
  const [reservationError, setReservationError] = useState("");
  const [reservationBusyId, setReservationBusyId] = useState("");
  const [claimConditionInventoryId, setClaimConditionInventoryId] = useState("");
  const [claimConditionValue, setClaimConditionValue] = useState<string>(DEFAULT_BORROW_CONDITION);
  const [claimConditionError, setClaimConditionError] = useState("");
  const [returnConditionInventoryId, setReturnConditionInventoryId] = useState("");
  const [returnConditionValue, setReturnConditionValue] = useState<string>(DEFAULT_BORROW_CONDITION);
  const [returnConditionError, setReturnConditionError] = useState("");
  const [selectedReturnDroneFlightReportFile, setSelectedReturnDroneFlightReportFile] = useState<File | null>(
    null,
  );
  const returnDroneFlightReportInputRef = useRef<HTMLInputElement | null>(null);
  const migrationRan = useRef(false);
  const workspaceSectionRef = useRef<HTMLElement | null>(null);
  const calendarFeed = useMemo(() => {
    if (monitoringCalendarFeed === undefined) return undefined;
    if (shouldLoadSupportCalendar && supportCalendarFeed === undefined) return undefined;
    return [
      ...monitoringCalendarFeed.map((event) => ({ ...event, href: `/monitoring/${event._id}` })),
      ...(supportCalendarFeed ?? []),
    ].sort((left, right) => left.eventStartAt - right.eventStartAt);
  }, [monitoringCalendarFeed, shouldLoadSupportCalendar, supportCalendarFeed]);
  const dashboardCalendarFeed = useMemo(() => {
    if (calendarFeed === undefined) return undefined;
    // Scope travel orders to the viewer's level in the org hierarchy.
    const teamScoped =
      travelTeamScope === "all"
        ? calendarFeed
        : calendarFeed.filter(
            (event) => event.eventKind !== "travel" || (event.requesterSection ?? "") === viewerSection,
          );
    if (!isHrAdminCalendarOnlyDashboard) return teamScoped;
    return teamScoped.filter((event) => getServiceGroupForCategory(event.category) === "HR/Admin");
  }, [calendarFeed, isHrAdminCalendarOnlyDashboard, travelTeamScope, viewerSection]);

  useEffect(() => {
    const selectedDate = parseCalendarDateKey(selectedMeetingDay);
    if (isSameCalendarMonth(selectedDate, calendarMonth)) return;

    const today = new Date();
    const monthEvents = (dashboardCalendarFeed ?? []).filter((item) =>
      isSameCalendarMonth(new Date(item.eventStartAt), calendarMonth),
    );
    const fallbackDate =
      isSameCalendarMonth(today, calendarMonth)
        ? today
        : monthEvents.length
          ? new Date(monthEvents[0].eventStartAt)
          : calendarMonth;

    setSelectedMeetingDay(getCalendarDateKey(fallbackDate));
  }, [dashboardCalendarFeed, calendarMonth, selectedMeetingDay]);

  useEffect(() => {
    if (migrationRan.current) return;
    if (!allRows?.length) return;
    const needsMigration = allRows.some(
      (row) =>
        !row.assetType ||
        !row.assetNameDescription ||
        !row.specifications ||
        !row.locationPersonAssigned ||
        !row.department ||
        !row.turnoverTo ||
        !row.warranty,
    );
    if (!needsMigration) return;
    migrationRan.current = true;
    void migrateLegacy();
  }, [allRows, migrateLegacy]);

  function openClaimConditionDialog(inventoryId: string) {
    setClaimConditionInventoryId(inventoryId);
    setClaimConditionValue(DEFAULT_BORROW_CONDITION);
    setClaimConditionError("");
  }

  function closeClaimConditionDialog() {
    setClaimConditionInventoryId("");
    setClaimConditionValue(DEFAULT_BORROW_CONDITION);
    setClaimConditionError("");
  }

  async function handleClaimReservation() {
    if (!claimConditionInventoryId) return;
    try {
      setReservationBusyId(claimConditionInventoryId);
      setClaimConditionError("");
      await claimReservation({
        inventoryId: claimConditionInventoryId as never,
        releaseCondition: claimConditionValue,
      });
      closeClaimConditionDialog();
    } catch (error) {
      setClaimConditionError(error instanceof Error ? error.message : "Claim failed.");
    } finally {
      setReservationBusyId("");
    }
  }

  async function handleCancelReservation(inventoryId: string) {
    try {
      setReservationBusyId(inventoryId);
      setReservationError("");
      await cancelReservation({ inventoryId: inventoryId as never });
    } catch (error) {
      setReservationError(error instanceof Error ? error.message : "Cancel failed.");
    } finally {
      setReservationBusyId("");
    }
  }

  function openReturnConditionDialog(inventoryId: string) {
    setReturnConditionInventoryId(inventoryId);
    setReturnConditionValue(DEFAULT_BORROW_CONDITION);
    setReturnConditionError("");
    setSelectedReturnDroneFlightReportFile(null);
    if (returnDroneFlightReportInputRef.current) {
      returnDroneFlightReportInputRef.current.value = "";
    }
  }

  function closeReturnConditionDialog() {
    setReturnConditionInventoryId("");
    setReturnConditionValue(DEFAULT_BORROW_CONDITION);
    setReturnConditionError("");
    setSelectedReturnDroneFlightReportFile(null);
    if (returnDroneFlightReportInputRef.current) {
      returnDroneFlightReportInputRef.current.value = "";
    }
  }

  async function handleReturnBorrowedAsset() {
    if (!returnConditionInventoryId) return;
    const isDroneReturn = returnConditionTargetRow ? isDroneKitRecord(returnConditionTargetRow) : false;
    if (isDroneReturn && !selectedReturnDroneFlightReportFile) {
      setReturnConditionError("Flight report is required before returning this drone kit.");
      return;
    }

    try {
      setReservationBusyId(returnConditionInventoryId);
      setReturnConditionError("");
      if (isDroneReturn && selectedReturnDroneFlightReportFile) {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": selectedReturnDroneFlightReportFile.type || "application/octet-stream",
          },
          body: selectedReturnDroneFlightReportFile,
        });

        if (!uploadResult.ok) {
          throw new Error("Drone flight report upload failed.");
        }

        const uploadData = (await uploadResult.json()) as { storageId?: string };
        if (!uploadData.storageId) {
          throw new Error("Drone flight report upload failed.");
        }

        await returnDronePackage({
          inventoryIds: [returnConditionInventoryId as never],
          reportTargetInventoryId: returnConditionInventoryId as never,
          droneFlightReportStorageId: uploadData.storageId as never,
          returnCondition: returnConditionValue,
        });
      } else {
        await returnBorrowedAsset({
          inventoryId: returnConditionInventoryId as never,
          returnCondition: returnConditionValue,
        });
      }
      closeReturnConditionDialog();
    } catch (error) {
      setReturnConditionError(error instanceof Error ? error.message : "Return failed.");
    } finally {
      setReservationBusyId("");
    }
  }

  const counts = useMemo(() => {
    const base: { total: number; byStatus: Record<HardwareStatus, number> } = {
      total: 0,
      byStatus: Object.fromEntries(
        HARDWARE_STATUSES.map((status) => [status, 0]),
      ) as Record<HardwareStatus, number>,
    };
    for (const row of allRows ?? []) {
      base.total += 1;
      if (HARDWARE_STATUSES.includes(row.status as HardwareStatus)) {
        base.byStatus[row.status as HardwareStatus] += 1;
      }
    }
    return base;
  }, [allRows]);

  const availableStatuses = useMemo(
    () =>
      HARDWARE_STATUSES.filter(
        (status): status is HardwareStatus =>
          status === "Available" || status === "Working",
      ),
    [],
  );

  const searched = useMemo(
    () => (allRows ?? []).filter((row) => matchesSearch(row, search)),
    [allRows, search],
  );

  const openBorrowingTicketByAssetId = useMemo(
    () => {
      const lookup = new Map<string, { ticketId: string; ticketNumber?: string; title?: string }>();

      for (const request of openBorrowingRequests ?? []) {
        if (request.category !== MONITORING_BORROWING_REQUEST_CATEGORY) continue;

        for (const item of request.borrowingItems ?? []) {
          const assetId = String(item.assetId);
          if (!lookup.has(assetId)) {
            lookup.set(assetId, {
              ticketId: String(request._id),
              ticketNumber: request.ticketNumber,
              title: request.title,
            });
          }
        }
      }

      return lookup;
    },
    [openBorrowingRequests],
  );
  const openBorrowingAssetIds = useMemo(
    () => new Set(openBorrowingTicketByAssetId.keys()),
    [openBorrowingTicketByAssetId],
  );

  const tabRows = useMemo(() => {
    switch (activeTab) {
      case "workstation":
        return searched.filter((row) => isWorkstationRecord(row));
      case "master":
        return searched;
      case "storage":
        return searched.filter((row) => row.locationPersonAssigned === "MAIN STORAGE");
      case "borrowed":
        return searched.filter((row) => row.status === "Borrowed");
      case "reserved":
        return searched.filter(
          (row) =>
            row.locationPersonAssigned === "MAIN STORAGE" &&
            isReservedRecord(row as Record<string, unknown>),
        );
      case "requested":
        return searched.filter(
          (row) =>
            row.locationPersonAssigned === "MAIN STORAGE" &&
            row.status !== "Borrowed" &&
            !isReservedRecord(row as Record<string, unknown>) &&
            openBorrowingAssetIds.has(String(row._id)),
        );
      case "available": 
        return searched.filter(
          (row) =>
            row.locationPersonAssigned === "MAIN STORAGE" &&
            availableStatuses.includes(row.status as HardwareStatus) &&
            !isReservedRecord(row as Record<string, unknown>) &&
            !openBorrowingAssetIds.has(String(row._id)),
        );
      default:
        return searched;
    }
  }, [searched, activeTab, availableStatuses, openBorrowingAssetIds]);

  const groupedRows = useMemo(() => {
    if (activeTab === "workstation") {
      return groupBy(tabRows, (row) => row.turnoverTo ?? "");
    }
    if (
      activeTab === "storage" ||
      activeTab === "borrowed" ||
      activeTab === "available" ||
      activeTab === "reserved" ||
      activeTab === "requested"
    ) {
      if (activeTab === "reserved") {
        return groupBy(tabRows, (row) => getReservationBorrower(row as Record<string, unknown>));
      }
      return groupBy(tabRows, (row) => row.locationPersonAssigned ?? "");
    }
    return new Map<string, typeof tabRows>();
  }, [tabRows, activeTab]);
  const workstationSections = useMemo(
    () =>
      [
        { key: "Desktop/PC", label: "PC Desktop" },
        { key: "Laptop", label: "Laptop" },
      ].map((section) => {
        const rows = tabRows.filter((row) => getWorkstationAssetType(row) === section.key);
        return {
          ...section,
          rows,
          groupedRows: groupBy(rows, (row) => row.turnoverTo ?? ""),
        };
      }),
    [tabRows],
  );

  const recentRows = useMemo(() => (allRows ?? []).slice(0, 5), [allRows]);
  const reservableMainStorageRows = useMemo(
    () =>
      (allRows ?? []).filter(
        (row) =>
          row.locationPersonAssigned === "MAIN STORAGE" &&
          availableStatuses.includes(row.status as HardwareStatus) &&
          !isReservedRecord(row as Record<string, unknown>) &&
          !openBorrowingAssetIds.has(String(row._id)),
      ),
    [allRows, availableStatuses, openBorrowingAssetIds],
  );
  const adjustedAvailableCount = useMemo(
    () =>
      (allRows ?? []).filter(
        (row) =>
          row.status === "Available" &&
          !isReservedRecord(row as Record<string, unknown>) &&
          !openBorrowingAssetIds.has(String(row._id)),
      ).length,
    [allRows, openBorrowingAssetIds],
  );
  const openBorrowingTicketsCount = useMemo(
    () =>
      (openBorrowingRequests ?? []).filter(
        (r) => r.category === MONITORING_BORROWING_REQUEST_CATEGORY,
      ).length,
    [openBorrowingRequests],
  );
  const reservedCount = useMemo(
    () =>
      (allRows ?? []).filter((row) => isReservedRecord(row as Record<string, unknown>)).length,
    [allRows],
  );
  const searchedReservableEquipmentRows = useMemo(
    () =>
      searched.filter(
        (row) =>
          row.locationPersonAssigned === "MAIN STORAGE" &&
          availableStatuses.includes(row.status as HardwareStatus) &&
          !isReservedRecord(row as Record<string, unknown>) &&
          !openBorrowingAssetIds.has(String(row._id)) &&
          !isDroneKitRecord(row),
      ),
    [searched, availableStatuses, openBorrowingAssetIds],
  );
  const searchedReservableDroneRows = useMemo(
    () =>
      searched.filter(
        (row) =>
          row.locationPersonAssigned === "MAIN STORAGE" &&
          availableStatuses.includes(row.status as HardwareStatus) &&
          !isReservedRecord(row as Record<string, unknown>) &&
          !openBorrowingAssetIds.has(String(row._id)) &&
          isDroneKitRecord(row),
      ),
    [searched, availableStatuses, openBorrowingAssetIds],
  );
  const searchedReservedEquipmentRows = useMemo(
    () =>
      searched.filter(
        (row) =>
          row.locationPersonAssigned === "MAIN STORAGE" &&
          isReservedRecord(row as Record<string, unknown>) &&
          !isDroneKitRecord(row),
      ),
    [searched],
  );
  const searchedReservedDroneRows = useMemo(
    () =>
      searched.filter(
        (row) =>
          row.locationPersonAssigned === "MAIN STORAGE" &&
          isReservedRecord(row as Record<string, unknown>) &&
          isDroneKitRecord(row),
      ),
    [searched],
  );
  const searchedRequestedEquipmentRows = useMemo(
    () =>
      searched.filter(
        (row) =>
          row.locationPersonAssigned === "MAIN STORAGE" &&
          row.status !== "Borrowed" &&
          !isReservedRecord(row as Record<string, unknown>) &&
          openBorrowingAssetIds.has(String(row._id)) &&
          !isDroneKitRecord(row),
      ),
    [searched, openBorrowingAssetIds],
  );
  const searchedRequestedDroneRows = useMemo(
    () =>
      searched.filter(
        (row) =>
          row.locationPersonAssigned === "MAIN STORAGE" &&
          row.status !== "Borrowed" &&
          !isReservedRecord(row as Record<string, unknown>) &&
          openBorrowingAssetIds.has(String(row._id)) &&
          isDroneKitRecord(row),
      ),
    [searched, openBorrowingAssetIds],
  );
  const visibleActivityFeed = useMemo(
    () => (activityExpanded ? activityFeed ?? [] : (activityFeed ?? []).slice(0, 3)),
    [activityFeed, activityExpanded],
  );
  const hasMoreActivity = (activityFeed?.length ?? 0) > 3;
  const scheduleWeekDays = useMemo(() => getScheduleWeekDays(scheduleWeekStart), [scheduleWeekStart]);
  const scheduleWeekMeetings = useMemo(() => {
    const feed = scheduleWeekFeed ?? [];
    return feed.filter((e) => {
      if (e.eventKind !== "meeting") return false;
      if (e.status !== "Reserved" && e.status !== "Assets Reserved") return false;
      const hour = new Date(e.eventStartAt).getHours();
      return hour >= 8 && hour < 17;
    });
  }, [scheduleWeekFeed]);
  const scheduleWeekLabel = formatScheduleWeekLabel(scheduleWeekStart);
  const requesterAvailableEquipment = useMemo(
    () =>
      reservableMainStorageRows
        .filter((row) => !isDroneKitRecord(row))
        .filter((row) => !openBorrowingAssetIds.has(String(row._id)))
        .sort((left, right) => left.assetTag.localeCompare(right.assetTag))
        .slice(0, 8),
    [openBorrowingAssetIds, reservableMainStorageRows],
  );
  const requesterUnavailableEquipment = useMemo(
    () =>
      (allRows ?? [])
        .filter(
          (row) =>
            row.status === "Borrowed" ||
            isReservedRecord(row as Record<string, unknown>) ||
            openBorrowingAssetIds.has(String(row._id)),
        )
        .sort((left, right) => {
          const leftName =
            left.borrower ||
            getReservationBorrower(left as Record<string, unknown>) ||
            left.turnoverTo ||
            "";
          const rightName =
            right.borrower ||
            getReservationBorrower(right as Record<string, unknown>) ||
            right.turnoverTo ||
            "";
          return leftName.localeCompare(rightName);
        })
        .slice(0, 8),
    [allRows, openBorrowingAssetIds],
  );
  const requesterUpcomingMeetings = useMemo(
    () =>
      (calendarFeed ?? [])
        .filter(
          (event) =>
            travelTeamScope === "all" ||
            event.eventKind !== "travel" ||
            (event.requesterSection ?? "") === viewerSection,
        )
        .filter((event) => event.eventStartAt >= Date.now())
        .sort((left, right) => left.eventStartAt - right.eventStartAt)
        .slice(0, 5),
    [calendarFeed, travelTeamScope, viewerSection],
  );
  const requesterBorrowingListRows = useMemo(
    () =>
      requesterBorrowingListIds
        .map((inventoryId) => requesterAvailableEquipment.find((row) => String(row._id) === inventoryId))
        .filter((row): row is NonNullable<typeof requesterAvailableEquipment>[number] => Boolean(row)),
    [requesterAvailableEquipment, requesterBorrowingListIds],
  );

  const activeTabSummary: Record<TabKey, string> = {
    master: "Full inventory register with department drilldown and signed-turnover filtering.",
    workstation: "Grouped workstation views for laptop and desktop turnover assignments.",
    storage: "Everything currently sitting in main storage for quick dispatch review.",
    borrowed: "Borrowed assets that are currently out with users or teams.",
    available: "Review IT equipment and drone kits that are not borrowed, reserved, or already requested.",
    reserved: "Manage queued equipment and drone reservations waiting for pickup, claim, or cancellation.",
    requested: "Review borrowing requests submitted by requestees before reserving assets.",
  };
  const claimConditionTargetRow = useMemo(
    () => allRows?.find((row) => String(row._id) === claimConditionInventoryId),
    [allRows, claimConditionInventoryId],
  );
  const returnConditionTargetRow = useMemo(
    () => allRows?.find((row) => String(row._id) === returnConditionInventoryId),
    [allRows, returnConditionInventoryId],
  );
  const returnConditionTargetIsDrone = useMemo(
    () => (returnConditionTargetRow ? isDroneKitRecord(returnConditionTargetRow) : false),
    [returnConditionTargetRow],
  );

  const renderTable = (
    rows: typeof tabRows,
    actionMode: "none" | "reserved" | "borrowed" = "none",
  ) => (
    <div className="saas-table-wrap">
      <table className="saas-table">
        <thead>
          <tr>
            {["Asset Tag", "Asset Type", "Asset Name / Specs", "Location", "Status", "Turnover to"].map((header) => (
              <th key={header}>{header}</th>
            ))}
            {actionMode !== "none" ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            (() => {
              const reservationRow = row as Record<string, unknown>;
              const reserved = isReservedRecord(reservationRow);
              const requested =
                !reserved &&
                row.status !== "Borrowed" &&
                openBorrowingAssetIds.has(String(row._id));
              const requestedTicket = requested
                ? openBorrowingTicketByAssetId.get(String(row._id))
                : undefined;
              const reservationBorrower = getReservationBorrower(reservationRow);
              const reservationDepartment = getReservationDepartment(reservationRow);
              const borrowReleaseCondition = reservationRow.borrowReleaseCondition as string | undefined;
              const borrowReturnCondition = reservationRow.borrowReturnCondition as string | undefined;
              const reservationAssignee = [reservationBorrower, reservationDepartment]
                .filter(Boolean)
                .join(" | ");
              return (
                <tr key={row._id} className="table-row-hover">
                  <td>{row.assetTag}</td>
                  <td>{row.assetType ?? "-"}</td>
                  <td>
                    <div style={{ display: "grid", gap: 4 }}>
                      <div>{row.assetNameDescription ?? "-"}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{row.specifications ?? "-"}</div>
                      {reserved ? (
                        <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 600 }}>
                          Reserved for {reservationAssignee || "Pending borrower"}
                        </div>
                      ) : null}
                      {requested ? (
                        <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600 }}>
                          Requested in {requestedTicket?.ticketNumber ?? "an open borrowing ticket"}
                        </div>
                      ) : null}
                      {row.status === "Borrowed" && borrowReleaseCondition ? (
                        <div style={{ fontSize: 12, color: "#b45309", fontWeight: 600 }}>
                          Release condition: {borrowReleaseCondition}
                        </div>
                      ) : null}
                      {row.status !== "Borrowed" && borrowReturnCondition ? (
                        <div style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>
                          Last returned condition: {borrowReturnCondition}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td>{row.locationPersonAssigned ?? "-"}</td>
                  <td>{reserved ? "Reserved" : requested ? "Requested" : row.status}</td>
                  <td>
                    {reserved
                      ? reservationAssignee || "-"
                      : requested
                        ? "Pending request"
                        : row.turnoverTo ?? "-"}
                  </td>
                  {actionMode === "reserved" ? (
                    <td>
                      {reserved ? (
                        <div className="dashboard-showcase-table-actions">
                          <button
                            className="btn-primary"
                            type="button"
                            disabled={reservationBusyId === row._id}
                            onClick={() => openClaimConditionDialog(String(row._id))}
                          >
                            Claim
                          </button>
                          <button
                            className="btn-secondary"
                            type="button"
                            disabled={reservationBusyId === row._id}
                            onClick={() => void handleCancelReservation(String(row._id))}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="dashboard-showcase-table-actions">
                          {requestedTicket ? (
                            <Link
                              href={`/monitoring/${requestedTicket.ticketId}`}
                              className="dashboard-request-link"
                              title={requestedTicket.title}
                            >
                              Request
                            </Link>
                          ) : (
                            <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
                              Pending request
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  ) : null}
                  {actionMode === "borrowed" ? (
                    <td>
                      <div className="dashboard-showcase-table-actions">
                        <button
                          className="btn-secondary"
                          type="button"
                          disabled={reservationBusyId === row._id}
                          onClick={() => openReturnConditionDialog(String(row._id))}
                        >
                          Return
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              );
            })()
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={actionMode === "none" ? 6 : 7}>No assets match this tab and search.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  const renderGroupedTables = (
    groups: Map<string, typeof tabRows>,
    emptyState: React.ReactNode = renderTable([]),
    actionMode: "none" | "reserved" | "borrowed" = "none",
  ) => (
    <div className="dashboard-group-list" style={{ display: "grid", gap: 16 }}>
      {[...groups.entries()].map(([group, rows]) => (
        <div key={group} className="saas-card dashboard-group-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{group}</div>
          {renderTable(rows, actionMode)}
        </div>
      ))}
      {!groups.size ? emptyState : null}
    </div>
  );

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    const cursor = new Date(meetingCalendarRange.gridStart);
    while (cursor.getTime() <= meetingCalendarRange.gridEnd.getTime()) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [meetingCalendarRange.gridEnd, meetingCalendarRange.gridStart]);
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, DashboardCalendarEvent[]>();

    for (const item of dashboardCalendarFeed ?? []) {
      for (const dayKey of getMeetingSpanDateKeys(item.eventStartAt, item.eventEndAt)) {
        const entries = grouped.get(dayKey) ?? [];
        entries.push(item);
        grouped.set(dayKey, entries);
      }
    }

    for (const entries of grouped.values()) {
      entries.sort((left, right) => left.eventStartAt - right.eventStartAt);
    }

    return grouped;
  }, [dashboardCalendarFeed]);
  const selectedMeetingDate = useMemo(() => parseCalendarDateKey(selectedMeetingDay), [selectedMeetingDay]);
  const selectedDayEvents = useMemo(
    () => eventsByDay.get(selectedMeetingDay) ?? [],
    [eventsByDay, selectedMeetingDay],
  );
  const selectedDayRelatedAssets = useMemo(
    () => selectedDayEvents.reduce((total, item) => total + item.relatedAssetsCount, 0),
    [selectedDayEvents],
  );
  const calendarMonthLabel = formatCalendarMonthLabel(calendarMonth);
  const selectedDayLabel = formatCalendarDateLabel(selectedMeetingDate);
  const dashboardCalendarTitle = isHrAdminCalendarOnlyDashboard ? "HR/Admin Calendar" : "Monitoring Calendar";
  const dashboardCalendarCopy = isHrAdminCalendarOnlyDashboard
    ? "Travel orders and HR/Admin service requests scheduled for follow-up."
    : "Live Monitoring timeline for tickets, meetings, borrowing requests, internet outages, and IT support assignments.";
  const dashboardCalendarEmptyCopy = isHrAdminCalendarOnlyDashboard
    ? "No HR/Admin records are scheduled for this day yet."
    : "No monitoring records are scheduled for this day yet.";
  const dashboardCalendarLoadingCopy = isHrAdminCalendarOnlyDashboard
    ? "Loading HR/Admin records..."
    : "Loading monitoring records...";
  function openCalendarDetail(dayKey: string) {
    setSelectedMeetingDay(dayKey);
    setIsCalendarDetailOpen(true);
  }

  function openSupportEventCreate() {
    setSupportEventError("");
    setSupportEventForm({
      ...defaultSupportEventForm,
      startAt: getDefaultSupportEventStart(selectedMeetingDay),
    });
    setShowSupportEventCreate(true);
  }

  async function handleCreateSupportEvent() {
    const title = supportEventForm.title.trim();
    const neededItems = supportEventForm.neededItems.trim();
    const requestedBy = supportEventForm.requestedBy.trim();
    const location = supportEventForm.location.trim();
    const notes = supportEventForm.notes.trim();
    const assignedStaff = supportEventForm.assignedStaff.map((value) => value.trim()).filter(Boolean);
    const startAt = toTimestamp(supportEventForm.startAt);
    const endAt = toTimestamp(supportEventForm.endAt);

    if (!title) {
      setSupportEventError("Event title is required.");
      return;
    }
    if (!neededItems) {
      setSupportEventError("Needed things are required.");
      return;
    }
    if (!assignedStaff.length) {
      setSupportEventError("Assigned IT staff is required.");
      return;
    }
    if (!startAt) {
      setSupportEventError("Schedule start is required.");
      return;
    }

    try {
      setSupportEventSaving(true);
      setSupportEventError("");
      await createSupportEvent({
        title,
        requestedBy: requestedBy || undefined,
        assignedStaff,
        neededItems,
        location: location || undefined,
        notes: notes || undefined,
        startAt,
        endAt,
        createdBy: "Dashboard",
      });
      setSelectedMeetingDay(getCalendarDateKey(startAt));
      setShowSupportEventCreate(false);
      setSupportEventForm(defaultSupportEventForm);
    } catch (error) {
      setSupportEventError(error instanceof Error ? error.message : "Event creation failed.");
    } finally {
      setSupportEventSaving(false);
    }
  }

  function addRequesterBorrowingListItem(inventoryId: string) {
    setRequesterBorrowingListIds((current) =>
      current.includes(inventoryId) ? current : [...current, inventoryId],
    );
  }

  function removeRequesterBorrowingListItem(inventoryId: string) {
    setRequesterBorrowingListIds((current) => current.filter((id) => id !== inventoryId));
  }

  if (currentRole === "member") {
    return (
      <RequesterDashboard
        equipmentLoading={allRows === undefined || openBorrowingRequests === undefined}
        unavailableLoading={allRows === undefined || openBorrowingRequests === undefined}
        meetingsLoading={calendarFeed === undefined}
        availableEquipment={requesterAvailableEquipment}
        unavailableEquipment={requesterUnavailableEquipment}
        upcomingMeetings={requesterUpcomingMeetings}
        borrowingListRows={requesterBorrowingListRows}
        borrowingListIds={requesterBorrowingListIds}
        openBorrowingAssetIds={openBorrowingAssetIds}
        onAddBorrowingItem={addRequesterBorrowingListItem}
        onRemoveBorrowingItem={removeRequesterBorrowingListItem}
      />
    );
  }

  return (
    <div className="dashboard-page">
      {!isHrAdminCalendarOnlyDashboard && !isPureApproverDashboard ? (
      <section className="panel dashboard-top-card">
        <div className="dashboard-top-card-head">
          <div className="dashboard-heading">
            <h1 className="dashboard-title">Pending Actions</h1>
            <p className="dashboard-subtitle">Items needing attention right now.</p>
          </div>
        </div>
        <div className="dashboard-top-card-metrics">
          <div className="dashboard-top-card-metric">
            <div className="metric-head">Open Requests</div>
            <div className="metric-value">
              <strong>{openBorrowingTicketsCount}</strong>
            </div>
          </div>
          <div className="dashboard-top-card-metric">
            <div className="metric-head">Reserved</div>
            <div className="metric-value">
              <strong>{reservedCount}</strong>
            </div>
          </div>
          <div className="dashboard-top-card-metric">
            <div className="metric-head">Borrowed</div>
            <div className="metric-value">
              <strong>{counts.byStatus["Borrowed"]}</strong>
            </div>
          </div>
          <div className="dashboard-top-card-metric">
            <div className="metric-head">For Repair</div>
            <div className="metric-value">
              <strong>{counts.byStatus["For Repair"]}</strong>
            </div>
          </div>
          <div className="dashboard-top-card-metric">
            <div className="metric-head">Available</div>
            <div className="metric-value">
              <strong>{adjustedAvailableCount}</strong>
            </div>
          </div>
          <div className="dashboard-top-card-metric">
            <div className="metric-head">Total Assets</div>
            <div className="metric-value">
              <strong>{counts.total}</strong>
            </div>
          </div>
          <div className="dashboard-top-card-metric">
            <div className="metric-head">Active Outages</div>
            <div className="metric-value">
              <strong>{monitoringOverview?.activeInternetOutages ?? "-"}</strong>
            </div>
          </div>
          <div className="dashboard-top-card-metric">
            <div className="metric-head">Monthly Uptime</div>
            <div className="metric-value">
              <strong>{formatPercent(monitoringOverview?.monthlyUptime)}</strong>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      <div className="dashboard-row dashboard-row-primary">
        <div className="panel dashboard-panel dashboard-primary-panel" style={{ padding: 16 }}>
          <div className="dashboard-calendar-layout">
            <div className="dashboard-calendar-head">
              <div>
                <h3 className="type-section-title" style={{ marginBottom: 6 }}>{dashboardCalendarTitle}</h3>
                <p className="type-section-copy" style={{ margin: 0 }}>
                  {dashboardCalendarCopy}
                </p>
              </div>
            </div>

            <div className="dashboard-calendar-shell">
              <div className="dashboard-calendar-board">
                <div className="dashboard-calendar-toolbar">
                  <div className="dashboard-calendar-month-nav">
                    <button
                      type="button"
                      className="dashboard-calendar-nav-btn"
                      aria-label="Previous month"
                      onClick={() => setCalendarMonth((prev) => addCalendarMonths(prev, -1))}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M9.5 3.5L5 8L9.5 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <div className="dashboard-calendar-month-label">{calendarMonthLabel}</div>
                    <button
                      type="button"
                      className="dashboard-calendar-nav-btn"
                      aria-label="Next month"
                      onClick={() => setCalendarMonth((prev) => addCalendarMonths(prev, 1))}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M6.5 3.5L11 8L6.5 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                  <div className="dashboard-calendar-head-actions">
                    {!isHrAdminCalendarOnlyDashboard ? (
                    <button type="button" className="btn-primary" onClick={openSupportEventCreate}>
                      Add Event
                    </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        const today = new Date();
                        setCalendarMonth(getCalendarMonthStart(today));
                        setSelectedMeetingDay(getCalendarDateKey(today));
                      }}
                    >
                      Today
                    </button>
                  </div>
                </div>

                <div className="dashboard-calendar-grid-wrap">
                  <div className="dashboard-calendar-weekdays">
                    {CALENDAR_DAY_LABELS.map((label) => (
                      <span key={label} className="dashboard-calendar-weekday">
                        {label}
                      </span>
                    ))}
                  </div>

                  <div className="dashboard-calendar-grid">
                    {calendarDays.map((day) => {
                      const dayKey = getCalendarDateKey(day);
                      const dayEvents = eventsByDay.get(dayKey) ?? [];
                      const isOutsideMonth = !isSameCalendarMonth(day, calendarMonth);
                      const isSelected = dayKey === selectedMeetingDay;
                      const isToday = dayKey === getCalendarDateKey(new Date());

                      return (
                        <button
                          key={dayKey}
                          type="button"
                          className={`dashboard-calendar-day${
                            isOutsideMonth ? " is-outside" : ""
                          }${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}${dayEvents.length ? " has-meetings" : ""}`}
                          aria-haspopup="dialog"
                          onClick={() => openCalendarDetail(dayKey)}
                        >
                          <div className="dashboard-calendar-day-top">
                            <span className="dashboard-calendar-day-number">{day.getDate()}</span>
                            {dayEvents.length ? <span className="dashboard-calendar-day-count">{dayEvents.length}</span> : null}
                          </div>
                          <div className="dashboard-calendar-day-events">
                            {dayEvents.slice(0, 2).map((event) => (
                              <span
                                key={`${dayKey}-${event._id}`}
                                className={`dashboard-calendar-event-pill ${getDashboardCalendarEventClass(event)}`}
                              >
                                <span className="dashboard-calendar-event-time">{formatCalendarTime(event.eventStartAt)}</span>
                                <span className="dashboard-calendar-event-title">{getDashboardCalendarEventTitle(event)}</span>
                              </span>
                            ))}
                            {dayEvents.length > 2 ? (
                              <span className="dashboard-calendar-event-more">+{dayEvents.length - 2} more</span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {isCalendarDetailOpen ? (
        <div className="dashboard-calendar-modal" role="dialog" aria-modal="true" aria-label="Calendar day details">
          <button
            type="button"
            className="dashboard-calendar-modal-backdrop"
            aria-label="Close calendar day details"
            onClick={() => setIsCalendarDetailOpen(false)}
          />
          <div className="dashboard-calendar-modal-shell">
            <div className="dashboard-calendar-modal-card">
              <div className="dashboard-calendar-modal-head">
                <div className="dashboard-calendar-agenda-header">
                  <div>
                    <div className="dashboard-calendar-agenda-eyebrow">Selected Day</div>
                    <h4 className="dashboard-calendar-agenda-title">{selectedDayLabel}</h4>
                    <p className="dashboard-calendar-agenda-copy" style={{ margin: 0 }}>
                      {selectedDayEvents.length
                        ? `${selectedDayEvents.length} record${selectedDayEvents.length === 1 ? "" : "s"} on the calendar`
                        : "No monitoring records scheduled"}
                    </p>
                  </div>
                  <div className="dashboard-calendar-agenda-summary">
                    <span className="dashboard-calendar-agenda-summary-label">Linked Assets</span>
                    <strong className="dashboard-calendar-agenda-summary-value">{selectedDayRelatedAssets}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="dashboard-calendar-modal-close"
                  aria-label="Close calendar day details"
                  onClick={() => setIsCalendarDetailOpen(false)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M4 4L12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="dashboard-calendar-agenda-list">
                {selectedDayEvents.map((event) => (
                  <DashboardCalendarAgendaCard key={event._id} event={event} />
                ))}
                {dashboardCalendarFeed === undefined ? (
                  <div className="dashboard-calendar-empty">{dashboardCalendarLoadingCopy}</div>
                ) : null}
                {dashboardCalendarFeed !== undefined && !selectedDayEvents.length ? (
                  <div className="dashboard-calendar-empty">
                    {dashboardCalendarEmptyCopy}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!isHrAdminCalendarOnlyDashboard && showSupportEventCreate ? (
        <div className="dashboard-calendar-modal" role="dialog" aria-modal="true" aria-label="Add IT support event">
          <button
            type="button"
            className="dashboard-calendar-modal-backdrop"
            aria-label="Close add event form"
            onClick={() => setShowSupportEventCreate(false)}
          />
          <div className="dashboard-calendar-modal-shell dashboard-support-form-shell">
            <div className="dashboard-calendar-modal-card dashboard-support-form-card">
              <div className="dashboard-calendar-modal-head">
                <div className="dashboard-calendar-agenda-header">
                  <div>
                    <div className="dashboard-calendar-agenda-eyebrow">Dashboard Event</div>
                    <h4 className="dashboard-calendar-agenda-title">Add IT Support Event</h4>
                    <p className="dashboard-calendar-agenda-copy" style={{ margin: 0 }}>
                      Add a reminder for field support, accompanied work, or any scheduled IT assignment.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="dashboard-calendar-modal-close"
                  aria-label="Close add event form"
                  onClick={() => setShowSupportEventCreate(false)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M4 4L12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="reservation-form-grid dashboard-support-form-grid">
                <div className="reservation-form-field" style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Event Title</div>
                  <input
                    className="input-base reservation-input"
                    value={supportEventForm.title}
                    onChange={(e) => setSupportEventForm((current) => ({ ...current, title: e.target.value }))}
                    placeholder="Field support for technical staff"
                    aria-label="Support event title"
                  />
                </div>

                <div className="reservation-form-field">
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Requested By</div>
                  <input
                    className="input-base reservation-input"
                    value={supportEventForm.requestedBy}
                    onChange={(e) => setSupportEventForm((current) => ({ ...current, requestedBy: e.target.value }))}
                    placeholder="Team or requester"
                    aria-label="Requested by"
                  />
                </div>

                <div className="reservation-form-field">
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Location</div>
                  <input
                    className="input-base reservation-input"
                    value={supportEventForm.location}
                    onChange={(e) => setSupportEventForm((current) => ({ ...current, location: e.target.value }))}
                    placeholder="Site, room, or platform"
                    aria-label="Support event location"
                  />
                </div>

                <div className="reservation-form-field">
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Start</div>
                  <input
                    className="input-base reservation-input"
                    type="datetime-local"
                    value={supportEventForm.startAt}
                    onChange={(e) => setSupportEventForm((current) => ({ ...current, startAt: e.target.value }))}
                    aria-label="Support event start"
                  />
                </div>

                <div className="reservation-form-field">
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>End</div>
                  <input
                    className="input-base reservation-input"
                    type="datetime-local"
                    value={supportEventForm.endAt}
                    onChange={(e) => setSupportEventForm((current) => ({ ...current, endAt: e.target.value }))}
                    aria-label="Support event end"
                  />
                </div>

                <div className="reservation-form-field" style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Assigned IT Staff</div>
                  <DashboardStaffDropdown
                    value={supportEventForm.assignedStaff}
                    options={IT_SUPPORT_STAFF_OPTIONS}
                    onChange={(value) => setSupportEventForm((current) => ({ ...current, assignedStaff: value }))}
                  />
                  <div className="dashboard-support-form-help">Select one or more IT staff for this support event.</div>
                </div>

                <div className="reservation-form-field" style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Needed Things</div>
                  <textarea
                    className="input-base reservation-input reservation-textarea dashboard-support-form-textarea"
                    value={supportEventForm.neededItems}
                    onChange={(e) => setSupportEventForm((current) => ({ ...current, neededItems: e.target.value }))}
                    placeholder="Laptops, tools, network setup, projector, or other support needs"
                    aria-label="Needed things"
                  />
                </div>

                <div className="reservation-form-field" style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Notes</div>
                  <textarea
                    className="input-base reservation-input reservation-textarea dashboard-support-form-textarea"
                    value={supportEventForm.notes}
                    onChange={(e) => setSupportEventForm((current) => ({ ...current, notes: e.target.value }))}
                    placeholder="Extra coordination details or reminders"
                    aria-label="Support event notes"
                  />
                </div>
              </div>

              {supportEventError ? <div className="reservation-error">{supportEventError}</div> : null}

              <div className="reservation-form-actions">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setShowSupportEventCreate(false)}
                  disabled={supportEventSaving}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void handleCreateSupportEvent()}
                  disabled={supportEventSaving}
                >
                  {supportEventSaving ? "Saving..." : "Save Event"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!isHrAdminCalendarOnlyDashboard && claimConditionInventoryId ? (
        <div className="dashboard-calendar-modal" role="dialog" aria-modal="true" aria-label="Confirm release condition">
          <button
            type="button"
            className="dashboard-calendar-modal-backdrop"
            aria-label="Close release condition dialog"
            onClick={closeClaimConditionDialog}
          />
          <div className="dashboard-calendar-modal-shell dashboard-support-form-shell">
            <div className="dashboard-calendar-modal-card dashboard-support-form-card">
              <div className="dashboard-calendar-modal-head">
                <div className="dashboard-calendar-agenda-header">
                  <div>
                    <div className="dashboard-calendar-agenda-eyebrow">Borrower Check-Out</div>
                    <h4 className="dashboard-calendar-agenda-title">Confirm Release Condition</h4>
                    <p className="dashboard-calendar-agenda-copy" style={{ margin: 0 }}>
                      Record the equipment condition before handing it over to the borrower.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="dashboard-calendar-modal-close"
                  aria-label="Close release condition dialog"
                  onClick={closeClaimConditionDialog}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M4 4L12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    display: "grid",
                    gap: 4,
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid var(--border-subtle)",
                    background: "var(--surface-subtle)",
                  }}
                >
                  <strong>{claimConditionTargetRow?.assetTag ?? "Selected asset"}</strong>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>
                    {claimConditionTargetRow?.assetNameDescription ?? claimConditionTargetRow?.assetType ?? "Asset"}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--muted-strong)" }}>
                    Borrower: {((claimConditionTargetRow as Record<string, unknown> | undefined)?.reservationBorrower as string | undefined) ?? "-"}
                  </span>
                </div>

                <div className="reservation-form-field">
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Release Condition</div>
                  <select
                    className="input-base reservation-input"
                    value={claimConditionValue}
                    onChange={(event) => setClaimConditionValue(event.target.value)}
                    aria-label="Release condition"
                  >
                    {HARDWARE_BORROW_CONDITION_OPTIONS.map((condition) => (
                      <option key={condition} value={condition}>
                        {condition}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {claimConditionError ? <div className="reservation-error">{claimConditionError}</div> : null}

              <div className="reservation-form-actions">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={closeClaimConditionDialog}
                  disabled={reservationBusyId === claimConditionInventoryId}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void handleClaimReservation()}
                  disabled={reservationBusyId === claimConditionInventoryId}
                >
                  {reservationBusyId === claimConditionInventoryId ? "Saving..." : "Confirm Claim"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!isHrAdminCalendarOnlyDashboard && returnConditionInventoryId ? (
        <div className="dashboard-calendar-modal" role="dialog" aria-modal="true" aria-label="Confirm returned condition">
          <button
            type="button"
            className="dashboard-calendar-modal-backdrop"
            aria-label="Close returned condition dialog"
            onClick={closeReturnConditionDialog}
          />
          <div className="dashboard-calendar-modal-shell dashboard-support-form-shell">
            <div className="dashboard-calendar-modal-card dashboard-support-form-card">
              <div className="dashboard-calendar-modal-head">
                <div className="dashboard-calendar-agenda-header">
                  <div>
                    <div className="dashboard-calendar-agenda-eyebrow">Borrower Check-In</div>
                    <h4 className="dashboard-calendar-agenda-title">Confirm Returned Condition</h4>
                    <p className="dashboard-calendar-agenda-copy" style={{ margin: 0 }}>
                      {returnConditionTargetIsDrone
                        ? "Record the drone condition and attach the flight report before returning it."
                        : "Record the equipment condition after it comes back from the borrower."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="dashboard-calendar-modal-close"
                  aria-label="Close returned condition dialog"
                  onClick={closeReturnConditionDialog}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M4 4L12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div style={{ display: "grid", gap: 14 }}>
                <div
                  style={{
                    display: "grid",
                    gap: 4,
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid var(--border-subtle)",
                    background: "var(--surface-subtle)",
                  }}
                >
                  <strong>{returnConditionTargetRow?.assetTag ?? "Selected asset"}</strong>
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>
                    {returnConditionTargetRow?.assetNameDescription ?? returnConditionTargetRow?.assetType ?? "Asset"}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--muted-strong)" }}>
                    Release condition: {((returnConditionTargetRow as Record<string, unknown> | undefined)?.borrowReleaseCondition as string | undefined) ?? "-"}
                  </span>
                </div>

                <div className="reservation-form-field">
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Returned Condition</div>
                  <select
                    className="input-base reservation-input"
                    value={returnConditionValue}
                    onChange={(event) => setReturnConditionValue(event.target.value)}
                    aria-label="Returned condition"
                  >
                    {HARDWARE_BORROW_CONDITION_OPTIONS.map((condition) => (
                      <option key={condition} value={condition}>
                        {condition}
                      </option>
                    ))}
                  </select>
                </div>

                {returnConditionTargetIsDrone ? (
                  <FileUploadCard
                    label="Flight Report"
                    inputRef={returnDroneFlightReportInputRef}
                    accept=".pdf,image/*"
                    onFileChange={(file) => {
                      setSelectedReturnDroneFlightReportFile(file);
                      if (file) {
                        setReturnConditionError("");
                      }
                    }}
                    file={selectedReturnDroneFlightReportFile}
                    hasAttachment={Boolean(selectedReturnDroneFlightReportFile)}
                    displayName={
                      selectedReturnDroneFlightReportFile
                        ? selectedReturnDroneFlightReportFile.name
                        : "No file selected"
                    }
                    helperText={
                      selectedReturnDroneFlightReportFile
                        ? "Flight report selected. Confirm return to finish."
                        : "Required before returning this drone kit."
                    }
                    badge="PDF"
                    ariaLabel="Drone flight report upload"
                    onRemove={() => {
                      setSelectedReturnDroneFlightReportFile(null);
                      setReturnConditionError("");
                      if (returnDroneFlightReportInputRef.current) {
                        returnDroneFlightReportInputRef.current.value = "";
                      }
                    }}
                    compact
                  />
                ) : null}
              </div>

              {returnConditionError ? <div className="reservation-error">{returnConditionError}</div> : null}

              <div className="reservation-form-actions">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={closeReturnConditionDialog}
                  disabled={reservationBusyId === returnConditionInventoryId}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void handleReturnBorrowedAsset()}
                  disabled={reservationBusyId === returnConditionInventoryId}
                >
                  {reservationBusyId === returnConditionInventoryId
                    ? "Returning..."
                    : returnConditionTargetIsDrone
                      ? "Upload Report & Return"
                      : "Confirm Return"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!isHrAdminCalendarOnlyDashboard ? (
      <div className="dashboard-row dashboard-row-secondary">
        <div
          className="panel dashboard-panel dashboard-activity-panel"
          style={showConferenceRoomPanel ? { padding: 16, height: "auto", minHeight: 0 } : { padding: 16 }}
        >
          {showConferenceRoomPanel ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
                <h3 className="type-section-title">Conference Room Schedule</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button type="button" className="dashboard-calendar-nav-btn" aria-label="Previous week" onClick={() => setScheduleWeekOffset((p) => p - 1)}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M9.5 3.5L5 8L9.5 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <span style={{ fontSize: 11, color: "var(--muted)", whiteSpace: "nowrap", minWidth: 124, textAlign: "center" }}>{scheduleWeekLabel}</span>
                  <button type="button" className="dashboard-calendar-nav-btn" aria-label="Next week" onClick={() => setScheduleWeekOffset((p) => p + 1)}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6.5 3.5L11 8L6.5 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  {scheduleWeekOffset !== 0 ? (
                    <button type="button" className="dashboard-calendar-nav-btn" style={{ fontSize: 10, marginLeft: 2 }} onClick={() => setScheduleWeekOffset(0)}>Today</button>
                  ) : null}
                </div>
              </div>

              {/* Day header row */}
              <div style={{ display: "grid", gridTemplateColumns: `44px repeat(5, 1fr)`, borderBottom: "1px solid var(--border)", paddingBottom: 4, marginBottom: 0 }}>
                <div />
                {scheduleWeekDays.map((day, i) => {
                  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
                  const isToday = getCalendarDateKey(day) === getCalendarDateKey(new Date());
                  return (
                    <div key={i} style={{ textAlign: "center", padding: "2px 0" }}>
                      <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: isToday ? "#3b82f6" : "var(--muted)" }}>{DAY_LABELS[i]}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1, color: isToday ? "#3b82f6" : "var(--text)" }}>{day.getDate()}</div>
                    </div>
                  );
                })}
              </div>

              {/* Time grid */}
              <div style={{ display: "flex" }}>
                {/* Hour labels */}
                <div style={{ width: 44, flexShrink: 0 }}>
                  {SCHEDULE_HOURS.map((h) => (
                    <div key={h} style={{ height: SCHEDULE_CELL_H, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 6, paddingTop: 2 }}>
                      <span style={{ fontSize: 9, color: "var(--muted)", whiteSpace: "nowrap" }}>{formatScheduleHour(h)}</span>
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {scheduleWeekDays.map((day) => {
                  const dayKey = getCalendarDateKey(day);
                  const isToday = dayKey === getCalendarDateKey(new Date());
                  const dayMeetings = scheduleWeekMeetings.filter((e) => getCalendarDateKey(e.eventStartAt) === dayKey);
                  const totalH = SCHEDULE_HOURS.length * SCHEDULE_CELL_H;
                  return (
                    <div
                      key={dayKey}
                      style={{ flex: 1, position: "relative", borderLeft: "1px solid var(--border)", background: isToday ? "#f0f7ff" : undefined }}
                    >
                      {/* Hour rule lines */}
                      {SCHEDULE_HOURS.map((h) => (
                        <div key={h} style={{ height: SCHEDULE_CELL_H, borderBottom: "1px solid #f1f5f9" }} />
                      ))}

                      {/* Meeting blocks */}
                      {dayMeetings.map((event) => {
                        const start = new Date(event.eventStartAt);
                        const end = event.eventEndAt ? new Date(event.eventEndAt) : new Date(event.eventStartAt + 60 * 60 * 1000);
                        const topPx = (start.getHours() - 8) * SCHEDULE_CELL_H + start.getMinutes() * (SCHEDULE_CELL_H / 60);
                        const durationMin = (end.getHours() - start.getHours()) * 60 + (end.getMinutes() - start.getMinutes());
                        const heightPx = Math.max(durationMin * (SCHEDULE_CELL_H / 60), 22);
                        const clampedTop = Math.max(0, Math.min(topPx, totalH - heightPx));
                        return (
                          <Link
                            key={event._id}
                            href={`/monitoring/${event._id}`}
                            style={{
                              position: "absolute",
                              top: clampedTop,
                              left: 2,
                              right: 2,
                              height: heightPx,
                              background: "#dbeafe",
                              border: "1px solid #93c5fd",
                              borderLeft: "3px solid #3b82f6",
                              borderRadius: 4,
                              padding: "2px 5px",
                              overflow: "hidden",
                              zIndex: 1,
                              textDecoration: "none",
                              display: "block",
                            }}
                          >
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#1d4ed8", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {event.title}
                            </div>
                            {heightPx >= 26 ? (
                              <div style={{ fontSize: 9, color: "#3b82f6", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {formatScheduleTime(event.eventStartAt)}{event.eventEndAt ? ` – ${formatScheduleTime(event.eventEndAt)}` : ""}
                              </div>
                            ) : null}
                            {heightPx >= 44 && event.meetingLocation ? (
                              <div style={{ fontSize: 9, color: "#3b82f6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {event.meetingLocation}
                              </div>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
          <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 10,
            }}
          >
            <h3 className="type-section-title">Activities</h3>
            {hasMoreActivity ? (
              <button
                type="button"
                className="activity-feed-toggle"
                onClick={() => setActivityExpanded((prev) => !prev)}
              >
                {activityExpanded ? "Show Less" : "View More"}
              </button>
            ) : null}
          </div>
          <div className="activity-feed activity-feed-scroll">
            {visibleActivityFeed.map((event) => {
              const meta = getActivityMeta(event.eventType);
              return (
                <div
                  key={event._id}
                  className={`activity-feed-card${meta.urgent ? " urgent" : ""}`}
                >
                  <div className="activity-feed-main">
                    <div className={`activity-feed-icon tone-${meta.tone}`}>
                      {renderActivityIcon(event.eventType)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="activity-feed-topline">
                        <span className={`activity-feed-chip tone-${meta.tone}`}>{meta.label}</span>
                        <span className="activity-feed-time">{formatActivityTime(event.createdAt)}</span>
                      </div>
                      <div className="activity-feed-title">
                        {event.assetTag}
                        {event.assetNameDescription ? ` - ${event.assetNameDescription}` : ""}
                      </div>
                      <div className="activity-feed-message">{event.message}</div>
                      <div className="activity-feed-meta">
                        <span>{event.relatedPerson || "No person linked"}</span>
                        <span>{event.location || "-"}</span>
                        <span>{event.status || "-"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="activity-feed-actions">
                    <button
                      className="btn-secondary activity-feed-action-btn"
                      type="button"
                      onClick={() => {
                        setActiveTab("master");
                        setSearch(event.assetTag);
                      }}
                    >
                      View
                    </button>
                    <button
                      className="btn-secondary activity-feed-action-btn"
                      type="button"
                      onClick={() => {
                        setActiveTab("master");
                        setSearch(event.assetTag);
                      }}
                    >
                      Locate
                    </button>
                  </div>
                </div>
              );
            })}
            {!visibleActivityFeed.length ? (
              <div className="activity-feed-empty">
                No structured activity events yet. New inventory actions will start appearing here.
              </div>
            ) : null}
          </div>
          </>
          )}
        </div>

        <div className="panel dashboard-panel dashboard-secondary-panel recent-assets-card" style={{ padding: 16 }}>
          <h3 className="type-section-title" style={{ marginBottom: 10 }}>Recent Assets</h3>
          <div className="saas-table-wrap recent-assets-table-wrap">
            <table className="saas-table" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Status</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {recentRows.map((row) => (
                  <tr key={row._id} className="table-row-hover">
                    <td>{row.assetTag}</td>
                    <td>{row.status}</td>
                    <td>{row.locationPersonAssigned ?? "-"}</td>
                  </tr>
                ))}
                {!recentRows.length ? (
                  <tr>
                    <td colSpan={3}>No assets yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      ) : null}

      {isHrAdminCalendarOnlyDashboard ? null : showEquipmentAvailabilityPanel ? (
      <section className="panel dashboard-panel dashboard-showcase-workspace">
        <div className="dashboard-showcase-panel-head">
          <div>
            <h2 className="dashboard-showcase-panel-title">Equipment Availability</h2>
            <p className="dashboard-showcase-panel-copy">
              Check which IT equipment is free to borrow before approving or filing a request.
            </p>
          </div>
        </div>
        <div className="requester-dashboard-grid">
          <section className="panel requester-dashboard-section">
            <div className="requester-section-head">
              <div>
                <h2>Available Equipment</h2>
                <p>Main storage items that can be borrowed right now.</p>
              </div>
              <span className="requester-count-pill">{requesterAvailableEquipment.length}</span>
            </div>
            <div className="requester-list">
              {allRows === undefined ? (
                <div className="requester-empty">Loading equipment...</div>
              ) : requesterAvailableEquipment.length ? (
                requesterAvailableEquipment.map((row) => (
                  <div key={String(row._id)} className="requester-list-row">
                    <div className="requester-row-main">
                      <div className="requester-row-title">{row.assetNameDescription || row.assetTag}</div>
                      <div className="requester-row-copy">
                        {[row.assetTag, row.assetType, row.specifications].filter(Boolean).join(" - ")}
                      </div>
                    </div>
                    <span className="requester-status-pill">Available</span>
                  </div>
                ))
              ) : (
                <div className="requester-empty">No equipment is available to borrow right now.</div>
              )}
            </div>
          </section>

          <section className="panel requester-dashboard-section">
            <div className="requester-section-head">
              <div>
                <h2>Requested / Reserved / Borrowed Equipment</h2>
                <p>Items that are not available to borrow right now.</p>
              </div>
            </div>
            <div className="requester-list">
              {allRows === undefined ? (
                <div className="requester-empty">Loading equipment...</div>
              ) : requesterUnavailableEquipment.length ? (
                requesterUnavailableEquipment.map((row) => {
                  const reserved = isReservedRecord(row as Record<string, unknown>);
                  const requested =
                    !reserved && row.status !== "Borrowed" && openBorrowingAssetIds.has(String(row._id));
                  const borrower =
                    row.borrower ||
                    getReservationBorrower(row as Record<string, unknown>) ||
                    row.turnoverTo ||
                    "Not listed";
                  return (
                    <div key={String(row._id)} className="requester-list-row">
                      <div className="requester-row-main">
                        <div className="requester-row-title">{row.assetNameDescription || row.assetTag}</div>
                        <div className="requester-row-copy">
                          {row.assetTag} -{" "}
                          {requested ? "Request pending" : `${reserved ? "Reserved for:" : "Borrower:"} ${borrower}`}
                        </div>
                      </div>
                      <span
                        className={`requester-status-pill${
                          requested ? " is-requested" : reserved ? " is-reserved" : " is-borrowed"
                        }`}
                      >
                        {requested ? "Requested" : reserved ? "Reserved" : "Borrowed"}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="requester-empty">No requested, reserved, or borrowed equipment right now.</div>
              )}
            </div>
          </section>
        </div>
      </section>
      ) : (
      <section ref={workspaceSectionRef} className="panel dashboard-panel dashboard-showcase-workspace">
        <div className="dashboard-showcase-panel-head">
          <div>
            <h2 className="dashboard-showcase-panel-title">
              {tabs.find((tab) => tab.key === activeTab)?.label ?? "Workspace"}
            </h2>
            <p className="dashboard-showcase-panel-copy">{activeTabSummary[activeTab]}</p>
          </div>
        </div>

        <div className="dashboard-tab-strip">
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab(tab.key);
                }}
                className={`dashboard-tab-btn${active ? " active" : ""}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {reservationError ? (
          <div className="reservation-error reservation-error-inline">{reservationError}</div>
        ) : null}

        {activeTab === "master" ? (
          renderTable(tabRows)
        ) : activeTab === "workstation" ? (
          <div style={{ display: "grid", gap: 24 }}>
            {workstationSections.map((section) => (
              <section key={section.key} style={{ display: "grid", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <h3 style={{ margin: 0 }}>{section.label}</h3>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {section.rows.length} asset{section.rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                {renderGroupedTables(
                  section.groupedRows,
                  <div
                    className="saas-card dashboard-group-card"
                    style={{ padding: 12, fontSize: 13, color: "var(--muted)" }}
                  >
                    No {section.label.toLowerCase()} workstation assets match this search.
                  </div>,
                )}
              </section>
            ))}
          </div>
        ) : activeTab === "available" ? (
          <div style={{ display: "grid", gap: 24 }}>
            {[
              {
                key: "equipment",
                label: "IT Equipment",
                rows: searchedReservableEquipmentRows,
                empty: "No reservable IT equipment matches this search.",
              },
              {
                key: "drone",
                label: "Drone Kits",
                rows: searchedReservableDroneRows,
                empty: "No reservable drone kits match this search.",
              },
            ].map((section) => (
              <section key={section.key} style={{ display: "grid", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <h3 className="type-section-title">{section.label}</h3>
                  <span style={{ fontSize: "var(--type-label)", color: "var(--muted)" }}>
                    {section.rows.length} asset{section.rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                {section.rows.length ? (
                  renderTable(section.rows)
                ) : (
                  <div
                    className="saas-card dashboard-group-card"
                    style={{ padding: 12, fontSize: 13, color: "var(--muted)" }}
                  >
                    {section.empty}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : activeTab === "reserved" ? (
          <div style={{ display: "grid", gap: 24 }}>
            {[
              {
                key: "equipment",
                label: "Reserved IT Equipment",
                rows: searchedReservedEquipmentRows,
                empty: "No reserved IT equipment matches this search.",
              },
              {
                key: "drone",
                label: "Reserved Drone Kits",
                rows: searchedReservedDroneRows,
                empty: "No reserved drone kits match this search.",
              },
            ].map((section) => (
              <section key={section.key} style={{ display: "grid", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <h3 className="type-section-title">{section.label}</h3>
                  <span style={{ fontSize: "var(--type-label)", color: "var(--muted)" }}>
                    {section.rows.length} asset{section.rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                {section.rows.length ? (
                  renderTable(section.rows, "reserved")
                ) : (
                  <div
                    className="saas-card dashboard-group-card"
                    style={{ padding: 12, fontSize: 13, color: "var(--muted)" }}
                  >
                    {section.empty}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : activeTab === "requested" ? (
          <div style={{ display: "grid", gap: 24 }}>
            {[
              {
                key: "equipment",
                label: "Requested IT Equipment",
                rows: searchedRequestedEquipmentRows,
                empty: "No requested IT equipment matches this search.",
              },
              {
                key: "drone",
                label: "Requested Drone Kits",
                rows: searchedRequestedDroneRows,
                empty: "No requested drone kits match this search.",
              },
            ].map((section) => (
              <section key={section.key} style={{ display: "grid", gap: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <h3 className="type-section-title">{section.label}</h3>
                  <span style={{ fontSize: "var(--type-label)", color: "var(--muted)" }}>
                    {section.rows.length} asset{section.rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                {section.rows.length ? (
                  renderTable(section.rows, "reserved")
                ) : (
                  <div
                    className="saas-card dashboard-group-card"
                    style={{ padding: 12, fontSize: 13, color: "var(--muted)" }}
                  >
                    {section.empty}
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : activeTab === "borrowed" ? (
          renderGroupedTables(groupedRows, renderTable([], "borrowed"), "borrowed")
        ) : (
          renderGroupedTables(groupedRows)
        )}
      </section>
      )}
    </div>
  );
}
