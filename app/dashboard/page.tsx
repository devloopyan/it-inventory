"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { HARDWARE_DEPARTMENTS } from "@/lib/hardwareDepartments";
import { HARDWARE_BORROW_CONDITION_OPTIONS } from "@/lib/hardwareBorrowConditions";
import { HARDWARE_STATUSES, type HardwareStatus } from "@/lib/hardwareStatuses";

type TabKey = "workstation" | "master" | "storage" | "borrowed" | "available" | "reserved";
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
  eventKind: "meeting" | "ticket" | "borrowing" | "internet" | "support";
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
  { key: "master", label: "Master Tracker" },
  { key: "workstation", label: "Workstation" },
  { key: "storage", label: "Storage" },
  { key: "borrowed", label: "Borrowed" },
  { key: "reserved", label: "Reserved" },
  { key: "available", label: "Available" },
];

const DEFAULT_BORROW_CONDITION = HARDWARE_BORROW_CONDITION_OPTIONS[0];

const statusIconColor: Record<HardwareStatus, string> = {
  Borrowed: "#f97316",
  Assigned: "#22c55e",
  "For Repair": "#ef4444",
  Retired: "#6b7280",
  Available: "#3b82f6",
  Working: "#06b6d4",
  NEW: "#8b5cf6",
  "Pre-owned": "#f59e0b",
};

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

function getReservationRequestedDate(row: Record<string, unknown>) {
  return (row.reservationRequestedDate as string | undefined) ?? "";
}

function getReservationPickupDate(row: Record<string, unknown>) {
  return (row.reservationPickupDate as string | undefined) ?? "";
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

function getDefaultReservationRequestedDate() {
  return getCalendarDateKey(new Date());
}

function formatReservationAssetLabel(row: {
  assetTag: string;
  assetNameDescription?: string;
  assetType?: string;
}) {
  const detail = row.assetNameDescription?.trim() || row.assetType?.trim() || "Asset";
  return `${row.assetTag} · ${detail}`;
}

function formatReservationAssetSummary(row: {
  assetType?: string;
  specifications?: string;
  assetNameDescription?: string;
}) {
  const summary =
    [row.assetType?.trim(), row.specifications?.trim()].filter(Boolean).join(" | ") ||
    row.assetNameDescription?.trim() ||
    "Main storage asset";
  const condensed = summary.replace(/\s+/g, " ").trim();
  return condensed.length > 108 ? `${condensed.slice(0, 105).trimEnd()}...` : condensed;
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

function getStartOfCalendarDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addCalendarDays(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function getNextWeekStart(date: Date) {
  const day = getStartOfCalendarDay(date).getDay();
  const daysUntilNextMonday = ((8 - day) % 7) || 7;
  return addCalendarDays(getStartOfCalendarDay(date), daysUntilNextMonday);
}


function getDefaultSupportEventStart(dayKey: string) {
  const date = parseCalendarDateKey(dayKey);
  date.setHours(8, 0, 0, 0);
  return toDateTimeLocalValue(date.getTime());
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

function DashboardFilterChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      style={{
        transform: open ? "rotate(180deg)" : undefined,
        transition: "transform var(--interaction-duration) var(--interaction-ease)",
      }}
    >
      <path
        d="M2.75 4.5L6 7.75L9.25 4.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DashboardFilterCheckIcon() {
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

function DashboardStaffDropdown(props: {
  value: string[];
  options: ReadonlyArray<string>;
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const summary = props.value.length
    ? props.value.length === 1
      ? props.value[0]
      : `${props.value.length} selected`
    : "Select IT staff";

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
      className={`monitoring-filter-dropdown${open ? " is-open" : ""}${props.value.length ? " is-active" : ""}`}
      style={{ width: "100%", minWidth: 0 }}
    >
      <button
        type="button"
        className="monitoring-filter-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Assigned IT staff"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="monitoring-filter-trigger-main">
          <span className="monitoring-filter-trigger-text">{summary}</span>
        </span>
        <span className="monitoring-filter-trigger-icon" aria-hidden="true">
          <DashboardFilterChevronIcon open={open} />
        </span>
      </button>
      {open ? (
        <div className="monitoring-filter-menu" role="menu" aria-label="Assigned IT staff options">
          {props.options.map((option) => {
            const selected = props.value.includes(option);

            return (
              <button
                key={option}
                type="button"
                role="menuitemcheckbox"
                aria-checked={selected}
                className={`monitoring-filter-option${selected ? " is-selected" : ""}`}
                onClick={() => {
                  props.onChange(
                    selected ? props.value.filter((item) => item !== option) : [...props.value, option],
                  );
                }}
              >
                <span className="monitoring-filter-check" aria-hidden="true">
                  {selected ? <DashboardFilterCheckIcon /> : null}
                </span>
                <span className="monitoring-filter-option-text">{option}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
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
  const [calendarMonth, setCalendarMonth] = useState(() => getCalendarMonthStart(new Date()));
  const [selectedMeetingDay, setSelectedMeetingDay] = useState(() => getCalendarDateKey(new Date()));
  const [isCalendarDetailOpen, setIsCalendarDetailOpen] = useState(false);
  const [showSupportEventCreate, setShowSupportEventCreate] = useState(false);
  const [supportEventForm, setSupportEventForm] = useState<DashboardSupportEventFormState>(() => ({
    ...defaultSupportEventForm,
    startAt: getDefaultSupportEventStart(getCalendarDateKey(new Date())),
  }));
  const [supportEventSaving, setSupportEventSaving] = useState(false);
  const [supportEventError, setSupportEventError] = useState("");
  const meetingCalendarRange = getCalendarGridRange(calendarMonth);
  const allRows = useQuery(api.hardwareInventory.listAll, {});
  const monitoringCalendarFeed = useQuery(api.monitoring.getMeetingCalendar, {
    rangeStart: meetingCalendarRange.gridStart.getTime(),
    rangeEnd: meetingCalendarRange.gridEnd.getTime(),
  }) as DashboardCalendarEvent[] | undefined;
  const supportCalendarFeed = useQuery(api.dashboardCalendar.listSupportEvents, {
    rangeStart: meetingCalendarRange.gridStart.getTime(),
    rangeEnd: meetingCalendarRange.gridEnd.getTime(),
  }) as DashboardCalendarEvent[] | undefined;
  const activityFeed = useQuery(
    (api.hardwareInventory as Record<string, unknown>)["listRecentActivity"] as never,
    { limit: 8 } as never,
  ) as unknown as HardwareActivityRecord[] | undefined;
  const migrateLegacy = useMutation(api.hardwareInventory.migrateLegacy);
  const createSupportEvent = useMutation(api.dashboardCalendar.createSupportEvent);
  const reserveAssets = useMutation(
    (api.hardwareInventory as Record<string, unknown>)["reserveAssets"] as never,
  ) as unknown as (args: {
    inventoryIds: never[];
    borrowerName: string;
    department: string;
    requestedDate: string;
    expectedPickupDate?: string;
    purpose?: string;
  }) => Promise<unknown>;
  const claimReservation = useMutation(
    (api.hardwareInventory as Record<string, unknown>)["claimReservation"] as never,
  ) as unknown as (args: { inventoryId: never; releaseCondition: string }) => Promise<unknown>;
  const cancelReservation = useMutation(
    (api.hardwareInventory as Record<string, unknown>)["cancelReservation"] as never,
  ) as unknown as (args: { inventoryId: never }) => Promise<unknown>;
  const returnBorrowedAsset = useMutation(
    (api.hardwareInventory as Record<string, unknown>)["returnBorrowedAsset"] as never,
  ) as unknown as (args: { inventoryId: never; returnCondition: string }) => Promise<unknown>;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("workstation");
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [reservationPickerId, setReservationPickerId] = useState("");
  const [reservationTargetIds, setReservationTargetIds] = useState<string[]>([]);
  const [reservationBorrower, setReservationBorrower] = useState("");
  const [reservationDepartment, setReservationDepartment] = useState("");
  const [reservationRequestedDate, setReservationRequestedDate] = useState(() => getDefaultReservationRequestedDate());
  const [reservationPickupDate, setReservationPickupDate] = useState("");
  const [reservationPurpose, setReservationPurpose] = useState("");
  const [reservationError, setReservationError] = useState("");
  const [reservationBusyId, setReservationBusyId] = useState("");
  const [reservationFormBusy, setReservationFormBusy] = useState(false);
  const [claimConditionInventoryId, setClaimConditionInventoryId] = useState("");
  const [claimConditionValue, setClaimConditionValue] = useState<string>(DEFAULT_BORROW_CONDITION);
  const [claimConditionError, setClaimConditionError] = useState("");
  const [returnConditionInventoryId, setReturnConditionInventoryId] = useState("");
  const [returnConditionValue, setReturnConditionValue] = useState<string>(DEFAULT_BORROW_CONDITION);
  const [returnConditionError, setReturnConditionError] = useState("");
  const migrationRan = useRef(false);
  const workspaceSectionRef = useRef<HTMLElement | null>(null);
  const calendarFeed = useMemo(() => {
    if (monitoringCalendarFeed === undefined || supportCalendarFeed === undefined) return undefined;
    return [
      ...monitoringCalendarFeed.map((event) => ({ ...event, href: `/monitoring/${event._id}` })),
      ...supportCalendarFeed,
    ].sort((left, right) => left.eventStartAt - right.eventStartAt);
  }, [monitoringCalendarFeed, supportCalendarFeed]);

  useEffect(() => {
    const selectedDate = parseCalendarDateKey(selectedMeetingDay);
    if (isSameCalendarMonth(selectedDate, calendarMonth)) return;

    const today = new Date();
    const monthEvents = (calendarFeed ?? []).filter((item) =>
      isSameCalendarMonth(new Date(item.eventStartAt), calendarMonth),
    );
    const fallbackDate =
      isSameCalendarMonth(today, calendarMonth)
        ? today
        : monthEvents.length
          ? new Date(monthEvents[0].eventStartAt)
          : calendarMonth;

    setSelectedMeetingDay(getCalendarDateKey(fallbackDate));
  }, [calendarFeed, calendarMonth, selectedMeetingDay]);

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

  function resetReservationForm() {
    setReservationPickerId("");
    setReservationTargetIds([]);
    setReservationBorrower("");
    setReservationDepartment("");
    setReservationRequestedDate(getDefaultReservationRequestedDate());
    setReservationPickupDate("");
    setReservationPurpose("");
    setReservationError("");
    setReservationBusyId("");
    setReservationFormBusy(false);
  }

  function addReservationTarget(inventoryId: string) {
    if (!inventoryId) return;
    setReservationTargetIds((current) =>
      current.includes(inventoryId) ? current : [...current, inventoryId],
    );
    setReservationPickerId("");
    setReservationError("");
  }

  function removeReservationTarget(inventoryId: string) {
    setReservationTargetIds((current) => current.filter((id) => id !== inventoryId));
    setReservationError("");
  }

  async function handleReserveSubmit() {
    if (!reservationTargetIds.length) {
      setReservationError("Select at least one asset to reserve.");
      return;
    }
    if (!reservationBorrower.trim()) {
      setReservationError("Borrower name is required.");
      return;
    }
    if (!reservationDepartment.trim()) {
      setReservationError("Department is required.");
      return;
    }
    if (!reservationRequestedDate) {
      setReservationError("Requested date is required.");
      return;
    }

    try {
      setReservationFormBusy(true);
      setReservationError("");
      await reserveAssets({
        inventoryIds: reservationTargetIds as never[],
        borrowerName: reservationBorrower,
        department: reservationDepartment,
        requestedDate: reservationRequestedDate,
        expectedPickupDate: reservationPickupDate || undefined,
        purpose: reservationPurpose || undefined,
      });
      setActiveTab("reserved");
      resetReservationForm();
    } catch (error) {
      setReservationError(error instanceof Error ? error.message : "Reservation failed.");
      setReservationFormBusy(false);
    }
  }

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
      setReservationTargetIds((current) => current.filter((id) => id !== inventoryId));
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
  }

  function closeReturnConditionDialog() {
    setReturnConditionInventoryId("");
    setReturnConditionValue(DEFAULT_BORROW_CONDITION);
    setReturnConditionError("");
  }

  async function handleReturnBorrowedAsset() {
    if (!returnConditionInventoryId) return;
    try {
      setReservationBusyId(returnConditionInventoryId);
      setReturnConditionError("");
      await returnBorrowedAsset({
        inventoryId: returnConditionInventoryId as never,
        returnCondition: returnConditionValue,
      });
      closeReturnConditionDialog();
    } catch (error) {
      setReturnConditionError(error instanceof Error ? error.message : "Return failed.");
    } finally {
      setReservationBusyId("");
    }
  }

  function focusWorkspaceTab(nextTab: TabKey) {
    setSearch("");
    setActiveTab(nextTab);
    workspaceSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      case "available": 
        return searched.filter(
          (row) =>
            row.locationPersonAssigned === "MAIN STORAGE" &&
            availableStatuses.includes(row.status as HardwareStatus) &&
            !isReservedRecord(row as Record<string, unknown>),
        );
      default:
        return searched;
    }
  }, [searched, activeTab, availableStatuses]);

  const groupedRows = useMemo(() => {
    if (activeTab === "workstation") {
      return groupBy(tabRows, (row) => row.turnoverTo ?? "");
    }
    if (
      activeTab === "storage" ||
      activeTab === "borrowed" ||
      activeTab === "available" ||
      activeTab === "reserved"
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
  const reservedMainStorageRows = useMemo(
    () =>
      (allRows ?? [])
        .filter(
          (row) =>
            row.locationPersonAssigned === "MAIN STORAGE" &&
            isReservedRecord(row as Record<string, unknown>),
        )
        .sort((left, right) => {
          const leftPickup =
            getReservationPickupDate(left as Record<string, unknown>) ||
            getReservationRequestedDate(left as Record<string, unknown>);
          const rightPickup =
            getReservationPickupDate(right as Record<string, unknown>) ||
            getReservationRequestedDate(right as Record<string, unknown>);
          return leftPickup.localeCompare(rightPickup);
        }),
    [allRows],
  );
  const reservableMainStorageRows = useMemo(
    () =>
      (allRows ?? []).filter(
        (row) =>
          row.locationPersonAssigned === "MAIN STORAGE" &&
          availableStatuses.includes(row.status as HardwareStatus) &&
          !isReservedRecord(row as Record<string, unknown>),
      ),
    [allRows, availableStatuses],
  );
  const selectedReservationRows = useMemo(
    () =>
      reservationTargetIds
        .map((inventoryId) => allRows?.find((row) => String(row._id) === inventoryId))
        .filter((row): row is NonNullable<typeof allRows>[number] => Boolean(row)),
    [allRows, reservationTargetIds],
  );
  const selectedReservationHasDrone = selectedReservationRows.some((row) => isDroneKitRecord(row));
  const adjustedAvailableCount = useMemo(
    () =>
      (allRows ?? []).filter(
        (row) =>
          row.status === "Available" && !isReservedRecord(row as Record<string, unknown>),
      ).length,
    [allRows],
  );
  const searchedReservableEquipmentRows = useMemo(
    () =>
      searched.filter(
        (row) =>
          row.locationPersonAssigned === "MAIN STORAGE" &&
          availableStatuses.includes(row.status as HardwareStatus) &&
          !isReservedRecord(row as Record<string, unknown>) &&
          !isDroneKitRecord(row),
      ),
    [searched, availableStatuses],
  );
  const searchedReservableDroneRows = useMemo(
    () =>
      searched.filter(
        (row) =>
          row.locationPersonAssigned === "MAIN STORAGE" &&
          availableStatuses.includes(row.status as HardwareStatus) &&
          !isReservedRecord(row as Record<string, unknown>) &&
          isDroneKitRecord(row),
      ),
    [searched, availableStatuses],
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
  const availableMainStorageLaptopRows = useMemo(
    () =>
      (allRows ?? [])
        .filter(
          (row) =>
            row.locationPersonAssigned === "MAIN STORAGE" &&
            row.assetType === "Laptop" &&
            row.status === "Available",
        )
        .sort((left, right) => left.assetTag.localeCompare(right.assetTag)),
    [allRows],
  );
  const availableMainStorageLaptopPreview = useMemo(
    () => availableMainStorageLaptopRows.slice(0, 5),
    [availableMainStorageLaptopRows],
  );
  const visibleActivityFeed = useMemo(
    () => (activityExpanded ? activityFeed ?? [] : (activityFeed ?? []).slice(0, 3)),
    [activityFeed, activityExpanded],
  );
  const hasMoreActivity = (activityFeed?.length ?? 0) > 3;

  const activeTabSummary: Record<TabKey, string> = {
    master: "Full inventory register with department drilldown and signed-turnover filtering.",
    workstation: "Grouped workstation views for laptop and desktop turnover assignments.",
    storage: "Everything currently sitting in main storage for quick dispatch review.",
    borrowed: "Borrowed assets that are currently out with users or teams.",
    available: "Reserve IT equipment and drone kits from one workspace without switching sections.",
    reserved: "Manage queued equipment and drone reservations waiting for pickup, claim, or cancellation.",
  };
  const borrowingCardReadyCount = reservableMainStorageRows.length;
  const borrowingCardSaveBusy = reservationFormBusy;
  const claimConditionTargetRow = useMemo(
    () => allRows?.find((row) => String(row._id) === claimConditionInventoryId),
    [allRows, claimConditionInventoryId],
  );
  const returnConditionTargetRow = useMemo(
    () => allRows?.find((row) => String(row._id) === returnConditionInventoryId),
    [allRows, returnConditionInventoryId],
  );

  const renderTable = (
    rows: typeof tabRows,
    actionMode: "none" | "reserve" | "reserved" | "borrowed" = "none",
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
                  <td>{reserved ? "Reserved" : row.status}</td>
                  <td>{reserved ? reservationAssignee || "-" : row.turnoverTo ?? "-"}</td>
                  {actionMode === "reserve" ? (
                    <td>
                      <div className="dashboard-showcase-table-actions">
                        <button
                          className={`btn-secondary reservation-available-btn${
                            reservationTargetIds.includes(String(row._id)) ? " is-selected" : ""
                          }`}
                          type="button"
                          onClick={() => {
                            addReservationTarget(String(row._id));
                          }}
                        >
                          {reservationTargetIds.includes(String(row._id)) ? "Added" : "Add"}
                        </button>
                      </div>
                    </td>
                  ) : null}
                  {actionMode === "reserved" ? (
                    <td>
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
    actionMode: "none" | "reserve" | "reserved" | "borrowed" = "none",
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
  }, [calendarMonth, meetingCalendarRange.gridEnd, meetingCalendarRange.gridStart]);
  const eventsByDay = useMemo(() => {
    const grouped = new Map<string, DashboardCalendarEvent[]>();

    for (const item of calendarFeed ?? []) {
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
  }, [calendarFeed]);
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
    const assignedStaff = supportEventForm.assignedStaff.map((value) => value.trim()).filter(Boolean);
    const startAt = toTimestamp(supportEventForm.startAt);
    const endAt = toTimestamp(supportEventForm.endAt);

    if (!startAt) {
      setSupportEventError("Schedule start is required.");
      return;
    }

    try {
      setSupportEventSaving(true);
      setSupportEventError("");
      await createSupportEvent({
        title: supportEventForm.title,
        requestedBy: supportEventForm.requestedBy || undefined,
        assignedStaff,
        neededItems: supportEventForm.neededItems,
        location: supportEventForm.location || undefined,
        notes: supportEventForm.notes || undefined,
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

  return (
    <div className="dashboard-page">
      <section className="panel dashboard-top-card">
        <div className="dashboard-top-card-head">
          <div className="dashboard-heading">
            <h1 className="dashboard-title">Asset Operations</h1>
            <p className="dashboard-subtitle">Hardware performance and operations overview.</p>
          </div>
        </div>
        <div className="dashboard-top-card-metrics">
          <div className="dashboard-top-card-metric">
            <div className="metric-head">Total Assets</div>
            <div className="metric-value">
              <strong>{counts.total}</strong>
            </div>
          </div>
          {HARDWARE_STATUSES.slice(0, 5).map((status) => (
            <div key={status} className="dashboard-top-card-metric">
              <div className="metric-head">{status}</div>
              <div className="metric-value">
                <strong>{status === "Available" ? adjustedAvailableCount : counts.byStatus[status]}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="dashboard-row dashboard-row-primary">
        <div className="panel dashboard-panel dashboard-primary-panel" style={{ padding: 16 }}>
          <div className="dashboard-calendar-layout">
            <div className="dashboard-calendar-head">
              <div>
                <h3 className="type-section-title" style={{ marginBottom: 6 }}>Monitoring Calendar</h3>
                <p className="type-section-copy" style={{ margin: 0 }}>
                  Live Monitoring timeline for tickets, meetings, borrowing requests, internet outages, and IT support assignments.
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
                    <button type="button" className="btn-primary" onClick={openSupportEventCreate}>
                      Add Event
                    </button>
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
        <div className="dashboard-side-stack">
          <div className="dashboard-reminder-card dashboard-borrowing-card">
            <div className="dashboard-borrowing-head">
              <span className="dashboard-reminder-badge">BORROWING FORM</span>
            </div>
            <div className="dashboard-borrowing-fields">
              <div className="reservation-form-field dashboard-borrowing-field-span">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Assets from Main Storage</div>
                <div className="dashboard-borrowing-picker-row">
                  <select
                    className="input-base reservation-input"
                    value={reservationPickerId}
                    onChange={(event) => {
                      setReservationPickerId(event.target.value);
                      setReservationError("");
                    }}
                    aria-label="Assets from main storage"
                  >
                    <option value="">Select asset to add</option>
                    {reservableMainStorageRows
                      .filter((row) => !reservationTargetIds.includes(String(row._id)))
                      .map((row) => (
                        <option key={String(row._id)} value={String(row._id)}>
                          {formatReservationAssetLabel(row)}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => addReservationTarget(reservationPickerId)}
                    disabled={!reservationPickerId}
                  >
                    Add Asset
                  </button>
                </div>
              </div>
              <div className="reservation-form-field">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Borrower Name</div>
                <input
                  className="input-base reservation-input"
                  value={reservationBorrower}
                  onChange={(event) => setReservationBorrower(event.target.value)}
                  placeholder="Enter borrower name"
                  aria-label="Borrower name"
                />
              </div>
              <div className="reservation-form-field">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Department</div>
                <select
                  className="input-base reservation-input"
                  value={reservationDepartment}
                  onChange={(event) => setReservationDepartment(event.target.value)}
                  aria-label="Reservation department"
                >
                  <option value="">Select department</option>
                  {HARDWARE_DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </div>
              <div className="reservation-form-field">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Requested Date</div>
                <input
                  className="input-base reservation-input"
                  type="date"
                  value={reservationRequestedDate}
                  onChange={(event) => setReservationRequestedDate(event.target.value)}
                  aria-label="Requested date"
                />
              </div>
              <div className="reservation-form-field">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Expected Pickup Date</div>
                <input
                  className="input-base reservation-input"
                  type="date"
                  value={reservationPickupDate}
                  onChange={(event) => setReservationPickupDate(event.target.value)}
                  aria-label="Expected pickup date"
                />
              </div>
            </div>
            <div className="reservation-form-field">
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Purpose</div>
              <input
                className="input-base reservation-input"
                value={reservationPurpose}
                onChange={(event) => setReservationPurpose(event.target.value)}
                placeholder="Enter borrowing purpose"
                aria-label="Purpose"
              />
            </div>
            <div className="dashboard-borrowing-selected">
              <span className="dashboard-borrowing-selected-label">Selected Assets</span>
              {selectedReservationRows.length ? (
                <div
                  className={`dashboard-borrowing-selected-list${
                    selectedReservationRows.length > 1 ? " is-scrollable" : ""
                  }`}
                >
                  {selectedReservationRows.map((row) => (
                    <div key={String(row._id)} className="dashboard-borrowing-selected-item">
                      <div className="dashboard-borrowing-selected-item-copy">
                        <strong className="dashboard-borrowing-selected-item-title">{formatReservationAssetLabel(row)}</strong>
                        <div className="dashboard-borrowing-selected-copy">
                          {formatReservationAssetSummary(row)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => removeReservationTarget(String(row._id))}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <strong>No assets selected yet</strong>
                  {!borrowingCardReadyCount ? (
                    <div className="dashboard-borrowing-selected-copy">
                      No main storage assets are currently ready for borrowing.
                    </div>
                  ) : null}
                </>
              )}
            </div>
            {reservationError ? <div className="reservation-error">{reservationError}</div> : null}
            <div className="dashboard-borrowing-actions">
              <div className="reservation-form-actions dashboard-borrowing-form-actions">
                <button className="btn-secondary" type="button" onClick={resetReservationForm}>
                  Clear
                </button>
                <button
                  className="dashboard-reminder-btn"
                  type="button"
                  onClick={() => void handleReserveSubmit()}
                  disabled={borrowingCardSaveBusy || !reservationTargetIds.length}
                >
                  {borrowingCardSaveBusy ? "Saving..." : "Log Borrower"}
                </button>
              </div>
            </div>
          </div>
          <div className="panel dashboard-panel dashboard-today-panel" style={{ padding: 16 }}>
            <div className="dashboard-today-head">
              <div className="dashboard-today-topline">
                <span className="dashboard-reminder-badge">MAIN STORAGE</span>
                <button type="button" className="btn-secondary" onClick={() => focusWorkspaceTab("available")}>
                  Open Available Assets
                </button>
              </div>
              <h3 className="type-section-title" style={{ margin: 0 }}>Available Laptops</h3>
            </div>
            <div className="dashboard-today-list">
              {allRows === undefined ? (
                <div className="dashboard-calendar-empty">Loading laptop availability...</div>
              ) : null}
              {availableMainStorageLaptopPreview.map((row) => (
                <div key={String(row._id)} className="dashboard-storage-asset-card">
                  <div className="dashboard-storage-asset-main">
                    <strong className="dashboard-storage-asset-title">{row.assetTag}</strong>
                    <span className="dashboard-storage-asset-copy">
                      {row.assetNameDescription ?? row.assetType ?? "Laptop"}
                    </span>
                    <span className="dashboard-storage-asset-copy">{formatReservationAssetSummary(row)}</span>
                  </div>
                  <span className="dashboard-storage-asset-status">{row.status}</span>
                </div>
              ))}
              {allRows !== undefined && !availableMainStorageLaptopRows.length ? (
                <div className="dashboard-calendar-empty">
                  No laptops are currently available in main storage.
                </div>
              ) : null}
            </div>
            {allRows !== undefined && availableMainStorageLaptopRows.length > availableMainStorageLaptopPreview.length ? (
              <div className="dashboard-storage-asset-footnote">
                Showing {availableMainStorageLaptopPreview.length} of {availableMainStorageLaptopRows.length} available laptops.
              </div>
            ) : null}
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
                {calendarFeed === undefined ? (
                  <div className="dashboard-calendar-empty">Loading monitoring records...</div>
                ) : null}
                {calendarFeed !== undefined && !selectedDayEvents.length ? (
                  <div className="dashboard-calendar-empty">
                    No monitoring records are scheduled for this day yet.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showSupportEventCreate ? (
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

      {claimConditionInventoryId ? (
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

      {returnConditionInventoryId ? (
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
                      Record the equipment condition after it comes back from the borrower.
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
                  {reservationBusyId === returnConditionInventoryId ? "Returning..." : "Confirm Return"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="dashboard-row dashboard-row-secondary">
        <div className="panel dashboard-panel dashboard-activity-panel" style={{ padding: 16 }}>
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
        {reservationError && !reservationTargetIds.length ? (
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
                {section.key === "drone" ? (
                  <div className="dashboard-showcase-inline-note">
                    Drone reservations stay here too. Flight reports are still required upon return.
                  </div>
                ) : null}
                {section.rows.length ? (
                  renderTable(section.rows, "reserve")
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
        ) : activeTab === "borrowed" ? (
          renderGroupedTables(groupedRows, renderTable([], "borrowed"), "borrowed")
        ) : (
          renderGroupedTables(groupedRows)
        )}
      </section>
    </div>
  );
}
