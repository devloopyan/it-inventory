"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { HARDWARE_DEPARTMENTS } from "@/lib/hardwareDepartments";
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

function getReservationReturnDueDate(row: Record<string, unknown>) {
  return (row.reservationReturnDueDate as string | undefined) ?? "";
}

function isDroneKitRecord(row: {
  assetType?: string;
  registerMode?: string;
}) {
  return row.assetType === "Drone" || row.registerMode === "droneKit";
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
    case "return_reminder_sent":
      return { label: "Reminder Sent", tone: "amber" };
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
    case "return_reminder_sent":
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
  const allRows = useQuery(api.hardwareInventory.listAll, {});
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
    borrowerEmail: string;
    department: string;
    requestedDate: string;
    expectedPickupDate?: string;
    returnDueDate: string;
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
  const [reservationBorrowerEmail, setReservationBorrowerEmail] = useState("");
  const [reservationDepartment, setReservationDepartment] = useState("");
  const [reservationRequestedDate, setReservationRequestedDate] = useState("");
  const [reservationPickupDate, setReservationPickupDate] = useState("");
  const [reservationReturnDueDate, setReservationReturnDueDate] = useState("");
  const [reservationSlipNote, setReservationSlipNote] = useState("");
  const [reservationError, setReservationError] = useState("");
  const [reservationBusyId, setReservationBusyId] = useState("");
  const [teamsTestEmail, setTeamsTestEmail] = useState("");
  const [teamsTestBusy, setTeamsTestBusy] = useState(false);
  const [teamsTestError, setTeamsTestError] = useState("");
  const [teamsTestMessage, setTeamsTestMessage] = useState("");
  const migrationRan = useRef(false);

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
    setReservationBorrowerEmail("");
    setReservationDepartment("");
    setReservationRequestedDate("");
    setReservationPickupDate("");
    setReservationReturnDueDate("");
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
    if (!reservationBorrowerEmail.trim()) {
      setReservationError("Borrower Microsoft email is required.");
      return;
    }
    if (!reservationRequestedDate) {
      setReservationError("Requested date is required.");
      return;
    }
    if (!reservationReturnDueDate) {
      setReservationError("Return due date is required.");
      return;
    }

    try {
      setReservationBusyId(reservationTargetId);
      setReservationError("");
      await reserveAsset({
        inventoryId: reservationTargetId as never,
        borrowerName: reservationBorrower,
        borrowerEmail: reservationBorrowerEmail,
        department: reservationDepartment,
        requestedDate: reservationRequestedDate,
        expectedPickupDate: reservationPickupDate || undefined,
        returnDueDate: reservationReturnDueDate,
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

  async function handleSendTeamsTest() {
    if (!teamsTestEmail.trim()) {
      setTeamsTestError("Enter a Microsoft email first.");
      setTeamsTestMessage("");
      return;
    }

    try {
      setTeamsTestBusy(true);
      setTeamsTestError("");
      setTeamsTestMessage("");
      const response = await fetch("/api/internal/teams-test-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipientEmail: teamsTestEmail,
        }),
      });
      const result = (await response.json()) as {
        recipientEmail?: string;
        dueDate?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(result.error || "Teams test reminder failed.");
      }
      setTeamsTestMessage(
        `Test reminder sent to ${result.recipientEmail}. Due date used: ${result.dueDate}.`,
      );
    } catch (error) {
      setTeamsTestError(error instanceof Error ? error.message : "Teams test reminder failed.");
    } finally {
      setTeamsTestBusy(false);
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
  const generalReservableCount = reservableMainStorageGeneralRows.length;
  const droneReservableCount = reservableMainStorageDroneRows.length;
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

  const renderTable = (rows: typeof tabRows) => (
    <div className="saas-table-wrap">
      <table className="saas-table">
        <thead>
          <tr>
            {["Asset Tag", "Asset Type", "Asset Name / Specs", "Location", "Status", "Turnover to"].map((header) => (
              <th key={header}>{header}</th>
            ))}
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
                </tr>
              );
            })()
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={6}>No assets match this tab and search.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );

  const renderGroupedTables = (
    groups: Map<string, typeof tabRows>,
    emptyState: React.ReactNode = renderTable([]),
  ) => (
    <div className="dashboard-group-list" style={{ display: "grid", gap: 16 }}>
      {[...groups.entries()].map(([group, rows]) => (
        <div key={group} className="saas-card dashboard-group-card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>{group}</div>
          {renderTable(rows)}
        </div>
      ))}
      {!groups.size ? emptyState : null}
    </div>
  );

  const renderReservationForm = () => {
    if (!reservationTargetId || !selectedReservationRow) return null;

    return (
      <div
        className="reservation-form-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Reservation form"
        onClick={resetReservationForm}
      >
        <div className="reservation-form-backdrop" />
        <div className="reservation-form-shell" onClick={(e) => e.stopPropagation()}>
          <div className="reservation-form-wrap">
            <div className="reservation-form-head">
              <div style={{ minWidth: 0 }}>
                <div className="reservation-form-title">
                  Reserve {selectedReservationRow.assetTag}
                </div>
                <div className="reservation-form-note">
                  When claimed, the asset status will change to Borrowed.
                  A return due date is required.
                  {selectedReservationIsDrone ? " A flight report is required upon return." : ""}
                </div>
              </div>
            </div>
            <div className="reservation-form-grid">
              <div className="reservation-form-field">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>
                  Borrower Name
                </div>
                <input
                  className="input-base reservation-input"
                  value={reservationBorrower}
                  onChange={(e) => setReservationBorrower(e.target.value)}
                  placeholder="Enter borrower name"
                  aria-label="Borrower name"
                />
              </div>
              <div className="reservation-form-field">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>
                  Microsoft Email
                </div>
                <input
                  className="input-base reservation-input"
                  type="email"
                  value={reservationBorrowerEmail}
                  onChange={(e) => setReservationBorrowerEmail(e.target.value)}
                  placeholder="name@company.com"
                  aria-label="Borrower Microsoft email"
                />
              </div>
            </div>
            <div className="reservation-form-grid">
              <div className="reservation-form-field">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>
                  Department
                </div>
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
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>
                  Requested Date
                </div>
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
            <div className="reservation-form-grid">
              <div className="reservation-form-field">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>
                  Return Due Date
                </div>
                <input
                  className="input-base reservation-input"
                  type="date"
                  value={reservationReturnDueDate}
                  onChange={(e) => setReservationReturnDueDate(e.target.value)}
                  aria-label="Return due date"
                />
              </div>
            </div>
            <div className="reservation-form-field">
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-strong)" }}>
                Borrower Slip Note
              </div>
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
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="dashboard-heading">
          <h1 className="dashboard-title">Asset Operations</h1>
          <p className="dashboard-subtitle">Hardware performance and operations overview.</p>
        </div>
        <div className="search-field dashboard-search">
          <span className="search-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" />
            </svg>
          </span>
          <input
            className="input-base"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="metric-strip dashboard-metric-strip">
        <div className="metric-item">
          <div className="metric-head">
            <span className="metric-icon" style={{ background: "#fb923c" }} />
            Total Assets
          </div>
          <div className="metric-value">
            <strong>{counts.total}</strong>
            <span className="trend-chip">+6%</span>
          </div>
        </div>
        {HARDWARE_STATUSES.slice(0, 5).map((status) => (
          <div key={status} className="metric-item">
            <div className="metric-head">
              <span className="metric-icon" style={{ background: statusIconColor[status] }} />
              {status}
            </div>
            <div className="metric-value">
              <strong>{status === "Available" ? adjustedAvailableCount : counts.byStatus[status]}</strong>
              <span className="trend-chip">live</span>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-row dashboard-row-primary">
        <div className="panel dashboard-panel dashboard-primary-panel" style={{ padding: 16 }}>
          <div className="dashboard-reservation-stack">
            <div className="reservation-section reservation-section-reserved">
              <div className="reservation-section-head">
                <div>
                  <div className="reservation-section-titlebar">
                    <div className="reservation-section-title">Reserved in Main Storage</div>
                    <span className="reservation-count-badge">{reservedCount}</span>
                  </div>
                  <div className="reservation-section-subtitle">
                    Reserved items are held for approved borrower slips and excluded from free availability.
                  </div>
                </div>  
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setActiveTab("reserved");
                    setDepartmentDrilldown("");
                  }}
                >
                  View Reserved
                </button>
              </div>
              <div className="reservation-list reservation-list-scroll">
                {reservedMainStorageRows.map((row) => {
                  const reservationRow = row as Record<string, unknown>;
                  const pickupDate = getReservationPickupDate(reservationRow);
                  const requestDate = getReservationRequestedDate(reservationRow);
                  const returnDueDate = getReservationReturnDueDate(reservationRow);
                  const reservationAssignee = [
                    getReservationBorrower(reservationRow),
                    getReservationDepartment(reservationRow),
                  ]
                    .filter(Boolean)
                    .join(" | ");
                  const reserveLabel = [
                    pickupDate ? `Pickup ${pickupDate}` : `Requested ${requestDate}`,
                    returnDueDate ? `Due ${returnDueDate}` : "",
                  ]
                    .filter(Boolean)
                    .join(" | ");
                  return (
                    <div key={row._id} className="reservation-card reservation-card-reserved">
                      <div className="reservation-card-row">
                        <div style={{ minWidth: 0 }}>
                          <div className="reservation-card-topline">
                            <span className="reservation-tag">{row.assetTag}</span>
                            <span className="reservation-chip reservation-chip-reserved">Reserved</span>
                          </div>
                          <div className="reservation-card-text">
                            {row.assetNameDescription ?? "-"} | Reserved for {reservationAssignee || "Pending borrower"}
                          </div>
                          <div className="reservation-card-meta">{reserveLabel}</div>
                        </div>
                        <div className="reservation-card-actions">
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
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() => {
                              setActiveTab("master");
                              setSearch(row.assetTag);
                              setDepartmentDrilldown("");
                            }}
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!reservedMainStorageRows.length ? (
                  <div className="reservation-empty">No reserved main-storage assets right now.</div>
                ) : null}
              </div>
            </div>

            <div className="reservation-section reservation-section-available">
              <div>
                <div className="reservation-section-titlebar">
                  <div className="reservation-section-title">Reserve from Main Storage</div>
                  <span className="reservation-count-badge reservation-count-badge-available">
                    {generalReservableCount}
                  </span>
                </div>
                <div className="reservation-section-subtitle">
                  Ready to reserve now: {generalReservableCount}
                </div>
              </div>
              <div className="reservation-list reservation-list-scroll">
                {reservableMainStorageGeneralRows.map((row) => (
                  <div key={row._id} className="reservation-card reservation-card-available">
                    <div className="reservation-card-row">
                      <div style={{ minWidth: 0 }}>
                        <div className="reservation-card-topline">
                          <span className="reservation-tag">{row.assetTag}</span>
                          <span className="reservation-chip reservation-chip-available">{row.status}</span>
                        </div>
                        <div className="reservation-card-text">
                          {row.assetNameDescription ?? "-"} | {row.status}
                        </div>
                      </div>
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
                  </div>
                ))}
                {!reservableMainStorageGeneralRows.length ? (
                  <div className="reservation-empty">No main-storage assets are currently free to reserve.</div>
                ) : null}
              </div>
            </div>

            <div className="reservation-section reservation-section-drone">
              <div>
                <div className="reservation-section-titlebar">
                  <div className="reservation-section-title">Drone Kit Borrowing</div>
                  <span className="reservation-count-badge reservation-count-badge-drone">
                    {droneReservableCount}
                  </span>
                </div>
                <div className="reservation-section-subtitle">
                  Reserve a drone kit from main storage. A flight report must be uploaded upon return.
                </div>
              </div>
              <div className="reservation-list reservation-list-scroll">
                {reservableMainStorageDroneRows.map((row) => {
                  const droneComponents =
                    ((row as Record<string, unknown>).workstationComponents as unknown[] | undefined)?.length ?? 0;
                  return (
                    <div key={row._id} className="reservation-card reservation-card-drone">
                      <div className="reservation-card-row">
                        <div style={{ minWidth: 0 }}>
                          <div className="reservation-card-topline">
                            <span className="reservation-tag">{row.assetTag}</span>
                            <span className="reservation-chip reservation-chip-drone">Drone Kit</span>
                          </div>
                          <div className="reservation-card-text">
                            {row.assetNameDescription ?? "Drone kit"} | {droneComponents} tracked kit parts
                          </div>
                          <div className="reservation-card-meta">
                            Flight report required upon return.
                          </div>
                        </div>
                        <button
                          className={`btn-secondary${
                            reservationTargetId === String(row._id) ? " reservation-available-btn is-selected" : ""
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
                    </div>
                  );
                })}
                {!reservableMainStorageDroneRows.length ? (
                  <div className="reservation-empty">No drone kits are currently ready for borrowing.</div>
                ) : null}
              </div>
            </div>
          </div>
          {reservationTargetId ? renderReservationForm() : null}
          {reservationError && !reservationTargetId ? (
            <div className="reservation-error reservation-error-inline">{reservationError}</div>
          ) : null}
        </div>
        <div className="dashboard-side-stack">
          <div className="dashboard-reminder-card">
            <span className="dashboard-reminder-badge">REMINDER</span>
            <div className="dashboard-reminder-title">Follow up on reserved assets before pickup.</div>
            <div className="dashboard-reminder-copy">
              Review borrower, department, and pickup details so reservations stay accurate and
              ready to claim.
            </div>
            <button
              className="dashboard-reminder-btn"
              type="button"
              onClick={() => {
                setSearch("");
                setActiveTab("reserved");
                setDepartmentDrilldown("");
              }}
            >
              Review Now
            </button>
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid var(--border)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700 }}>Send Teams Test</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Sends a direct Teams reminder to the Microsoft account below.
              </div>
              <input
                className="input-base"
                type="email"
                value={teamsTestEmail}
                onChange={(event) => {
                  setTeamsTestEmail(event.target.value);
                  setTeamsTestError("");
                  setTeamsTestMessage("");
                }}
                placeholder="name@company.com"
                aria-label="Test Teams recipient email"
                disabled={teamsTestBusy}
              />
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void handleSendTeamsTest()}
                disabled={teamsTestBusy}
              >
                {teamsTestBusy ? "Sending..." : "Send Test"}
              </button>
              {teamsTestError ? (
                <div style={{ fontSize: 12, color: "#b91c1c" }}>{teamsTestError}</div>
              ) : null}
              {teamsTestMessage ? (
                <div style={{ fontSize: 12, color: "var(--foreground)" }}>{teamsTestMessage}</div>
              ) : null}
            </div>
          </div>
          <div className="panel dashboard-panel dashboard-department-panel" style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: 6 }}>Assets per Department</h3>
            <p style={{ marginTop: 0, marginBottom: 10, fontSize: 12, color: "var(--muted)" }}>
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
                <div style={{ fontSize: 13, color: "var(--muted)" }}>
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
            <h3 style={{ margin: 0 }}>Activities</h3>
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
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Recent Assets</h3>
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

      <div className="panel dashboard-panel" style={{ padding: 12 }}>
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
          <div style={{ marginBottom: 10, fontSize: 13, color: "var(--muted)" }}>
            Department drilldown: <strong style={{ color: "var(--foreground)" }}>{departmentDrilldown}</strong>
          </div>
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
        ) : (
          renderGroupedTables(groupedRows)
        )}
      </div>
    </div>
  );
}
