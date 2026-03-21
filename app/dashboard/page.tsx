"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { HARDWARE_DEPARTMENTS } from "@/lib/hardwareDepartments";
import { HARDWARE_STATUSES, type HardwareStatus } from "@/lib/hardwareStatuses";

type TabKey = "workstation" | "master" | "storage" | "borrowed" | "available" | "reserved";
type ReservationStatus = "Reserved" | "Claimed" | "Cancelled" | "Expired";
type ActivityTone = "blue" | "green" | "amber" | "red" | "slate";
type DashboardReminderAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "tab"; label: string; tab: TabKey };
type DashboardReminder = {
  badge: string;
  title: string;
  copy: string;
  summary: string;
  tone: string;
  action: DashboardReminderAction;
};
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
  eventKind: "meeting" | "ticket" | "borrowing" | "internet";
  eventStartAt: number;
  eventEndAt?: number;
  status: string;
  relatedAssetsCount: number;
  contextLine?: string;
};

const CALENDAR_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const tabs: { key: TabKey; label: string }[] = [
  { key: "master", label: "Master Tracker" },
  { key: "workstation", label: "Workstation" },
  { key: "storage", label: "Storage" },
  { key: "borrowed", label: "Borrowed" },
  { key: "reserved", label: "Reserved" },
  { key: "available", label: "Available" },
];

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

function isOfficialTurnover(row: {
  department?: string;
  turnoverTo?: string;
  turnoverFormStorageId?: unknown;
}) {
  const department = (row.department ?? "").trim();
  const turnoverTo = (row.turnoverTo ?? "").trim();
  return (
    department.length > 0 &&
    turnoverTo.length > 0 &&
    turnoverTo.toLowerCase() !== "unassigned" &&
    Boolean(row.turnoverFormStorageId)
  );
}

function isWorkstationRecord(row: {
  assetType?: string;
  registerMode?: string;
  workstationType?: string;
}) {
  if (row.registerMode === "workstation") return true;
  if (row.workstationType === "Laptop" || row.workstationType === "Desktop/PC") return true;
  if (row.assetType === "Laptop" || row.assetType === "Desktop/PC") return true;
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

export default function DashboardPage() {
  const [calendarMonth, setCalendarMonth] = useState(() => getCalendarMonthStart(new Date()));
  const [selectedMeetingDay, setSelectedMeetingDay] = useState(() => getCalendarDateKey(new Date()));
  const [isCalendarDetailOpen, setIsCalendarDetailOpen] = useState(false);
  const meetingCalendarRange = getCalendarGridRange(calendarMonth);
  const allRows = useQuery(api.hardwareInventory.listAll, {});
  const monitoringOverview = useQuery(api.monitoring.getOverview, {});
  const calendarFeed = useQuery(api.monitoring.getMeetingCalendar, {
    rangeStart: meetingCalendarRange.gridStart.getTime(),
    rangeEnd: meetingCalendarRange.gridEnd.getTime(),
  }) as DashboardCalendarEvent[] | undefined;
  const activityFeed = useQuery(
    (api.hardwareInventory as Record<string, unknown>)["listRecentActivity"] as never,
    { limit: 8 } as never,
  ) as unknown as HardwareActivityRecord[] | undefined;
  const migrateLegacy = useMutation(api.hardwareInventory.migrateLegacy);
  const reserveAsset = useMutation(
    (api.hardwareInventory as Record<string, unknown>)["reserveAsset"] as never,
  ) as unknown as (args: {
    inventoryId: never;
    borrowerName: string;
    department: string;
    requestedDate: string;
    expectedPickupDate?: string;
    slipNote?: string;
  }) => Promise<unknown>;
  const claimReservation = useMutation(
    (api.hardwareInventory as Record<string, unknown>)["claimReservation"] as never,
  ) as unknown as (args: { inventoryId: never }) => Promise<unknown>;
  const cancelReservation = useMutation(
    (api.hardwareInventory as Record<string, unknown>)["cancelReservation"] as never,
  ) as unknown as (args: { inventoryId: never }) => Promise<unknown>;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("workstation");
  const [departmentDrilldown, setDepartmentDrilldown] = useState("");
  const [activityExpanded, setActivityExpanded] = useState(false);
  const [reservationTargetId, setReservationTargetId] = useState<string>("");
  const [reservationBorrower, setReservationBorrower] = useState("");
  const [reservationDepartment, setReservationDepartment] = useState("");
  const [reservationRequestedDate, setReservationRequestedDate] = useState("");
  const [reservationPickupDate, setReservationPickupDate] = useState("");
  const [reservationSlipNote, setReservationSlipNote] = useState("");
  const [reservationError, setReservationError] = useState("");
  const [reservationBusyId, setReservationBusyId] = useState("");
  const migrationRan = useRef(false);
  const workspaceSectionRef = useRef<HTMLElement | null>(null);

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
    setReservationTargetId("");
    setReservationBorrower("");
    setReservationDepartment("");
    setReservationRequestedDate("");
    setReservationPickupDate("");
    setReservationSlipNote("");
    setReservationError("");
    setReservationBusyId("");
  }

  async function handleReserveSubmit() {
    if (!reservationTargetId) {
      setReservationError("Select an asset to reserve.");
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
      setReservationBusyId(reservationTargetId);
      setReservationError("");
      await reserveAsset({
        inventoryId: reservationTargetId as never,
        borrowerName: reservationBorrower,
        department: reservationDepartment,
        requestedDate: reservationRequestedDate,
        expectedPickupDate: reservationPickupDate || undefined,
        slipNote: reservationSlipNote || undefined,
      });
      setActiveTab("reserved");
      resetReservationForm();
    } catch (error) {
      setReservationError(error instanceof Error ? error.message : "Reservation failed.");
      setReservationBusyId("");
    }
  }

  async function handleClaimReservation(inventoryId: string) {
    try {
      setReservationBusyId(inventoryId);
      setReservationError("");
      await claimReservation({ inventoryId: inventoryId as never });
    } catch (error) {
      setReservationError(error instanceof Error ? error.message : "Claim failed.");
    } finally {
      setReservationBusyId("");
    }
  }

  async function handleCancelReservation(inventoryId: string) {
    try {
      setReservationBusyId(inventoryId);
      setReservationError("");
      await cancelReservation({ inventoryId: inventoryId as never });
      if (reservationTargetId === inventoryId) {
        resetReservationForm();
      }
    } catch (error) {
      setReservationError(error instanceof Error ? error.message : "Cancel failed.");
    } finally {
      setReservationBusyId("");
    }
  }

  function focusWorkspaceTab(nextTab: TabKey) {
    setSearch("");
    setDepartmentDrilldown("");
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
  const reservableMainStorageGeneralRows = useMemo(
    () => reservableMainStorageRows.filter((row) => !isDroneKitRecord(row)),
    [reservableMainStorageRows],
  );
  const reservableMainStorageDroneRows = useMemo(
    () => reservableMainStorageRows.filter((row) => isDroneKitRecord(row)),
    [reservableMainStorageRows],
  );
  const selectedReservationRow = useMemo(
    () =>
      (
        reservableMainStorageRows.find((row) => String(row._id) === reservationTargetId) ??
        allRows?.find((row) => String(row._id) === reservationTargetId)
      ),
    [allRows, reservationTargetId, reservableMainStorageRows],
  );
  const selectedReservationIsDrone = isDroneKitRecord(selectedReservationRow ?? {});
  const adjustedAvailableCount = useMemo(
    () =>
      (allRows ?? []).filter(
        (row) =>
          row.status === "Available" && !isReservedRecord(row as Record<string, unknown>),
      ).length,
    [allRows],
  );
  const reservedCount = reservedMainStorageRows.length;
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
  const visibleActivityFeed = useMemo(
    () => (activityExpanded ? activityFeed ?? [] : (activityFeed ?? []).slice(0, 3)),
    [activityFeed, activityExpanded],
  );
  const hasMoreActivity = (activityFeed?.length ?? 0) > 3;
  const assetsPerDepartment = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const row of allRows ?? []) {
      if (!isOfficialTurnover(row)) continue;
      const department = row.department?.trim() ?? "";
      grouped.set(department, (grouped.get(department) ?? 0) + 1);
    }
    return [...grouped.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [allRows]);
  const masterRowsWithDepartmentDrilldown = useMemo(() => {
    if (!departmentDrilldown) return tabRows;
    return tabRows.filter(
      (row) => isOfficialTurnover(row) && (row.department?.trim() ?? "") === departmentDrilldown,
    );
  }, [tabRows, departmentDrilldown]);

  const activeTabSummary: Record<TabKey, string> = {
    master: "Full inventory register with department drilldown and signed-turnover filtering.",
    workstation: "Grouped workstation views for laptop and desktop turnover assignments.",
    storage: "Everything currently sitting in main storage for quick dispatch review.",
    borrowed: "Borrowed assets that are currently out with users or teams.",
    available: "Reserve IT equipment and drone kits from one workspace without switching sections.",
    reserved: "Manage queued equipment and drone reservations waiting for pickup, claim, or cancellation.",
  };

  const renderTable = (
    rows: typeof tabRows,
    actionMode: "none" | "reserve" | "reserved" = "none",
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
                            reservationTargetId === String(row._id) ? " is-selected" : ""
                          }`}
                          type="button"
                          onClick={() => {
                            setReservationTargetId(String(row._id));
                            setReservationError("");
                          }}
                        >
                          Reserve
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
                          onClick={() => void handleClaimReservation(String(row._id))}
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
    actionMode: "none" | "reserve" | "reserved" = "none",
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

  const renderReservationForm = () => {
    if (!reservationTargetId || !selectedReservationRow || activeTab !== "available") return null;

    return (
      <section className="saas-card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="reservation-form-title">Reserve {selectedReservationRow.assetTag}</div>
            <div className="reservation-form-note">
              When claimed, the asset status will change to Borrowed.
              {selectedReservationIsDrone ? " A flight report is required upon return." : ""}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "var(--muted-strong)" }}>
              {selectedReservationRow.assetNameDescription ?? "-"}
            </div>
          </div>
          <button className="btn-secondary" type="button" onClick={resetReservationForm}>
            Clear Selection
          </button>
        </div>
        <div className="reservation-form-grid">
          <div className="reservation-form-field">
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Borrower Name</div>
            <input
              className="input-base reservation-input"
              value={reservationBorrower}
              onChange={(e) => setReservationBorrower(e.target.value)}
              placeholder="Enter borrower name"
              aria-label="Borrower name"
            />
          </div>
          <div className="reservation-form-field">
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Department</div>
            <select
              className="input-base reservation-input"
              value={reservationDepartment}
              onChange={(e) => setReservationDepartment(e.target.value)}
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
        </div>
        <div className="reservation-form-grid">
          <div className="reservation-form-field">
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Requested Date</div>
            <input
              className="input-base reservation-input"
              type="date"
              value={reservationRequestedDate}
              onChange={(e) => setReservationRequestedDate(e.target.value)}
              aria-label="Requested date"
            />
          </div>
          <div className="reservation-form-field">
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>
              Expected Pickup Date
            </div>
            <input
              className="input-base reservation-input"
              type="date"
              value={reservationPickupDate}
              onChange={(e) => setReservationPickupDate(e.target.value)}
              aria-label="Expected pickup date"
            />
          </div>
        </div>
        <div className="reservation-form-field">
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>Borrower Slip Note</div>
          <textarea
            className="input-base reservation-input reservation-textarea"
            value={reservationSlipNote}
            onChange={(e) => setReservationSlipNote(e.target.value)}
            placeholder="Enter borrower slip reference or note"
          />
        </div>
        {reservationError ? <div className="reservation-error">{reservationError}</div> : null}
        <div className="reservation-form-actions">
          <button className="btn-secondary" type="button" onClick={resetReservationForm}>
            Cancel
          </button>
          <button
            className="btn-primary"
            type="button"
            onClick={() => void handleReserveSubmit()}
            disabled={reservationBusyId === reservationTargetId}
          >
            {reservationBusyId === reservationTargetId ? "Saving..." : "Save Reservation"}
          </button>
        </div>
      </section>
    );
  };

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
  const monthCalendarEvents = useMemo(
    () =>
      (calendarFeed ?? []).filter(
        (item) =>
          item.eventStartAt <= meetingCalendarRange.monthEnd.getTime() &&
          (item.eventEndAt ?? item.eventStartAt) >= meetingCalendarRange.monthStart.getTime(),
      ),
    [calendarFeed, meetingCalendarRange.monthEnd, meetingCalendarRange.monthStart],
  );
  const selectedMeetingDate = useMemo(() => parseCalendarDateKey(selectedMeetingDay), [selectedMeetingDay]);
  const selectedDayEvents = useMemo(
    () => eventsByDay.get(selectedMeetingDay) ?? [],
    [eventsByDay, selectedMeetingDay],
  );
  const selectedDayRelatedAssets = useMemo(
    () => selectedDayEvents.reduce((total, item) => total + item.relatedAssetsCount, 0),
    [selectedDayEvents],
  );
  const monthRelatedAssets = useMemo(
    () => monthCalendarEvents.reduce((total, item) => total + item.relatedAssetsCount, 0),
    [monthCalendarEvents],
  );
  const calendarMonthLabel = formatCalendarMonthLabel(calendarMonth);
  const selectedDayLabel = formatCalendarDateLabel(selectedMeetingDate);
  function openCalendarDetail(dayKey: string) {
    setSelectedMeetingDay(dayKey);
    setIsCalendarDetailOpen(true);
  }

  const reminderQueue = useMemo<DashboardReminder[]>(() => {
    const activeInternetOutages = monitoringOverview?.activeInternetOutages ?? 0;
    const pendingApprovals = monitoringOverview?.pendingApprovals ?? 0;
    const openTickets = monitoringOverview?.openTickets ?? 0;
    const borrowedAssets = counts.byStatus.Borrowed;
    const repairAssets = counts.byStatus["For Repair"];
    const queuedReservations = reservedCount;
    const reminders: DashboardReminder[] = [];

    if (activeInternetOutages > 0) {
      reminders.push({
        badge: "INTERNET",
        title:
          activeInternetOutages === 1
            ? "1 active internet outage needs an update."
            : `${activeInternetOutages} active internet outages need updates.`,
        copy: "Update the outage status, restored time, and cause/action taken so uptime reporting stays accurate.",
        summary:
          activeInternetOutages === 1
            ? "1 outage still unresolved"
            : `${activeInternetOutages} outages still unresolved`,
        tone: "#dc2626",
        action: { kind: "link", label: "Review outages", href: "/monitoring" },
      });
    }

    if (pendingApprovals > 0) {
      reminders.push({
        badge: "APPROVAL",
        title:
          pendingApprovals === 1
            ? "1 pending approval needs review."
            : `${pendingApprovals} pending approvals need review.`,
        copy: "Service requests are waiting for IT Team Leader or OSMD Manager action in Monitoring.",
        summary:
          pendingApprovals === 1
            ? "1 approval is waiting"
            : `${pendingApprovals} approvals are waiting`,
        tone: "#f59e0b",
        action: { kind: "link", label: "Review approvals", href: "/monitoring" },
      });
    }

    if (repairAssets > 0) {
      reminders.push({
        badge: "ASSET",
        title:
          repairAssets === 1
            ? "1 asset marked for repair needs follow-up."
            : `${repairAssets} assets marked for repair need follow-up.`,
        copy: "Check repair progress and update each asset once the unit is returned, replaced, or retired.",
        summary: repairAssets === 1 ? "1 repair item is open" : `${repairAssets} repair items are open`,
        tone: "#ef4444",
        action: { kind: "link", label: "Review assets", href: "/assets" },
      });
    }

    if (borrowedAssets > 0) {
      reminders.push({
        badge: "BORROWED",
        title:
          borrowedAssets === 1
            ? "1 borrowed asset is still out."
            : `${borrowedAssets} borrowed assets are still out.`,
        copy: "Verify borrower details are still current and mark anything already returned back into inventory.",
        summary:
          borrowedAssets === 1
            ? "1 borrowed asset needs checking"
            : `${borrowedAssets} borrowed assets need checking`,
        tone: "#f97316",
        action: { kind: "tab", label: "Show borrowed assets", tab: "borrowed" },
      });
    }

    if (queuedReservations > 0) {
      reminders.push({
        badge: "QUEUE",
        title:
          queuedReservations === 1
            ? "1 reservation is waiting in main storage."
            : `${queuedReservations} reservations are waiting in main storage.`,
        copy: "Claim or cancel queued reservations so storage availability stays accurate for the next request.",
        summary:
          queuedReservations === 1
            ? "1 reservation is queued"
            : `${queuedReservations} reservations are queued`,
        tone: "#2563eb",
        action: { kind: "tab", label: "Show reservation queue", tab: "reserved" },
      });
    }

    if (openTickets > 0) {
      reminders.push({
        badge: "TICKET",
        title: openTickets === 1 ? "1 open ticket still needs follow-up." : `${openTickets} open tickets still need follow-up.`,
        copy: "Review unresolved incidents and service requests so the queue stays current for the IT team.",
        summary: openTickets === 1 ? "1 ticket remains open" : `${openTickets} tickets remain open`,
        tone: "#2563eb",
        action: { kind: "link", label: "Open ticket queue", href: "/monitoring" },
      });
    }

    return reminders;
  }, [counts.byStatus, monitoringOverview, reservedCount]);
  const primaryReminder =
    reminderQueue[0] ??
    ({
      badge: "ALL CLEAR",
      title: "No urgent reminders right now.",
      copy: "Ticket monitoring and asset follow-ups look clear. You can still review the workspace below anytime.",
      summary: "Everything is currently up to date",
      tone: "#16a34a",
      action: { kind: "tab", label: "Open workspace", tab: "available" },
    } satisfies DashboardReminder);
  const primaryReminderAction = primaryReminder.action;
  const secondaryReminders = reminderQueue.slice(1, 3);

  return (
    <div className="dashboard-page">
      <section className="panel dashboard-top-card">
        <div className="dashboard-top-card-head">
          <div className="dashboard-heading">
            <h1 className="dashboard-title">Asset Operations</h1>
            <p className="dashboard-subtitle">Hardware performance and operations overview.</p>
          </div>
          <div className="search-field dashboard-search dashboard-top-card-search">
            <span className="search-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" />
              </svg>
            </span>
            <input
              className="input-base"
              placeholder="Search assets"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
                  Live Monitoring timeline for tickets, meetings, borrowing requests, and internet outages.
                </p>
              </div>
              <Link href="/monitoring" className="btn-secondary">
                Open Monitoring
              </Link>
            </div>

            <div className="dashboard-calendar-stat-grid">
              <div className="dashboard-calendar-stat-card">
                <span className="dashboard-calendar-stat-label">This Month</span>
                <strong className="dashboard-calendar-stat-value">{monthCalendarEvents.length}</strong>
                <span className="dashboard-calendar-stat-meta">
                  {monthCalendarEvents.length === 1 ? "record on the calendar" : "records on the calendar"}
                </span>
              </div>
              <div className="dashboard-calendar-stat-card">
                <span className="dashboard-calendar-stat-label">Selected Day</span>
                <strong className="dashboard-calendar-stat-value">{selectedDayEvents.length}</strong>
                <span className="dashboard-calendar-stat-meta">
                  {selectedDayEvents.length === 1 ? "record on this day" : "records on this day"}
                </span>
              </div>
              <div className="dashboard-calendar-stat-card">
                <span className="dashboard-calendar-stat-label">Linked Assets</span>
                <strong className="dashboard-calendar-stat-value">{monthRelatedAssets}</strong>
                <span className="dashboard-calendar-stat-meta">linked asset entries this month</span>
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
          <div className="dashboard-reminder-card">
            <span className="dashboard-reminder-badge">{primaryReminder.badge}</span>
            <div className="dashboard-reminder-title">{primaryReminder.title}</div>
            <div className="dashboard-reminder-copy">{primaryReminder.copy}</div>
            {secondaryReminders.length ? (
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  paddingTop: 8,
                  borderTop: "1px dashed var(--border)",
                }}
              >
                {secondaryReminders.map((item) => (
                  <div
                    key={`${item.badge}-${item.summary}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: "var(--type-label)",
                      color: "var(--muted)",
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: item.tone,
                        flexShrink: 0,
                      }}
                    />
                    <span>{item.summary}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {primaryReminderAction.kind === "link" ? (
              <Link className="dashboard-reminder-btn" href={primaryReminderAction.href}>
                {primaryReminderAction.label}
              </Link>
            ) : (
              <button
                type="button"
                className="dashboard-reminder-btn"
                onClick={() => focusWorkspaceTab(primaryReminderAction.tab)}
              >
                {primaryReminderAction.label}
              </button>
            )}
          </div>
          <div className="panel dashboard-panel dashboard-department-panel" style={{ padding: 16 }}>
            <h3 className="type-section-title" style={{ marginBottom: 6 }}>Assets per Department</h3>
            <p style={{ marginTop: 0, marginBottom: 10, fontSize: "var(--type-label)", color: "var(--muted)" }}>
              Includes only officially turned-over assets with signed turnover forms attached.
            </p>
            <div className="department-card-grid department-card-scroll">
              {assetsPerDepartment.map(([department, count]) => (
                <button
                  key={department}
                  type="button"
                  className={`department-card${
                    departmentDrilldown === department ? " active" : ""
                  }`}
                  onClick={() => {
                    setActiveTab("master");
                    setSearch("");
                    setDepartmentDrilldown(department);
                  }}
                >
                  <span className="department-card-label">Qualified Assets</span>
                  <div className="department-card-row">
                    <span className="department-card-name">{department}</span>
                    <strong className="department-card-count">{count}</strong>
                  </div>
                </button>
              ))}
              {!assetsPerDepartment.length ? (
                <div style={{ fontSize: "var(--type-body-sm)", color: "var(--muted)" }}>
                  No departments meet the turnover + signed-form requirement yet.
                </div>
              ) : null}
              {departmentDrilldown ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setDepartmentDrilldown("")}
                  style={{ marginTop: 4 }}
                >
                  Clear Department Drilldown
                </button>
              ) : null}
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
                  <Link key={event._id} href={`/monitoring/${event._id}`} className="dashboard-calendar-agenda-card">
                    <div className="dashboard-calendar-agenda-card-top">
                      <span className={`dashboard-calendar-status-pill ${getDashboardCalendarEventClass(event)}`}>
                        {getDashboardCalendarEventKindLabel(event)}
                      </span>
                      <span className="dashboard-calendar-agenda-ticket">{event.ticketNumber}</span>
                    </div>
                    <strong className="dashboard-calendar-agenda-card-title">{getDashboardCalendarEventTitle(event)}</strong>
                    <div className="dashboard-calendar-agenda-meta">{formatCalendarEventTime(event.eventStartAt, event.eventEndAt)}</div>
                    <div className="dashboard-calendar-agenda-meta">{event.contextLine || event.category}</div>
                    <div className="dashboard-calendar-agenda-footer">
                      <span>{[event.requesterName, event.status].filter(Boolean).join(" · ")}</span>
                      <span>
                        {event.relatedAssetsCount
                          ? `${event.relatedAssetsCount} linked asset${event.relatedAssetsCount === 1 ? "" : "s"}`
                          : "No linked assets"}
                      </span>
                    </div>
                  </Link>
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
                        setDepartmentDrilldown("");
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
                        setDepartmentDrilldown("");
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
                  setDepartmentDrilldown("");
                }}
                className={`dashboard-tab-btn${active ? " active" : ""}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {departmentDrilldown ? (
          <div className="dashboard-showcase-inline-note">
            Department drilldown: <strong>{departmentDrilldown}</strong>
          </div>
        ) : null}
        {reservationError && !reservationTargetId ? (
          <div className="reservation-error reservation-error-inline">{reservationError}</div>
        ) : null}

        {activeTab === "master" ? (
          renderTable(masterRowsWithDepartmentDrilldown)
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
        ) : (
          renderGroupedTables(groupedRows)
        )}
        {reservationTargetId ? renderReservationForm() : null}
      </section>
    </div>
  );
}
