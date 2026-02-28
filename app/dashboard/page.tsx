"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { HARDWARE_STATUSES, type HardwareStatus } from "@/lib/hardwareStatuses";

type TabKey = "workstation" | "master" | "storage" | "borrowed" | "available";

const tabs: { key: TabKey; label: string }[] = [
  { key: "workstation", label: "Workstation" },
  { key: "master", label: "Master Tracker" },
  { key: "storage", label: "Storage" },
  { key: "borrowed", label: "Borrowed" },
  { key: "available", label: "Available" },
];

const statusIconColor: Record<HardwareStatus, string> = {
  Borrowed: "#f97316",
  Assigned: "#22c55e",
  "For Repair": "#ef4444",
  Retired: "#6b7280",
  Available: "#3b82f6",
  Working: "#06b6d4",
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

export default function DashboardPage() {
  const allRows = useQuery(api.hardwareInventory.listAll, {});
  const migrateLegacy = useMutation(api.hardwareInventory.migrateLegacy);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("workstation");
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
        !row.assignedDate ||
        !row.purchaseDate ||
        !row.warranty,
    );
    if (!needsMigration) return;
    migrationRan.current = true;
    void migrateLegacy();
  }, [allRows, migrateLegacy]);

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
        return searched.filter((row) => row.turnoverTo);
      case "master":
        return searched;
      case "storage":
        return searched.filter((row) => row.locationPersonAssigned === "MAIN STORAGE");
      case "borrowed":
        return searched.filter(
          (row) => row.locationPersonAssigned === "MAIN STORAGE" && row.status === "Borrowed",
        );
      case "available":
        return searched.filter(
          (row) =>
            row.locationPersonAssigned === "MAIN STORAGE" &&
            availableStatuses.includes(row.status as HardwareStatus),
        );
      default:
        return searched;
    }
  }, [searched, activeTab, availableStatuses]);

  const groupedRows = useMemo(() => {
    if (activeTab === "workstation") {
      return groupBy(tabRows, (row) => row.turnoverTo ?? "");
    }
    if (activeTab === "storage" || activeTab === "borrowed" || activeTab === "available") {
      return groupBy(tabRows, (row) => row.locationPersonAssigned ?? "");
    }
    return new Map<string, typeof tabRows>();
  }, [tabRows, activeTab]);

  const recentRows = useMemo(() => (allRows ?? []).slice(0, 5), [allRows]);

  const analyticsBars = useMemo(() => {
    const values = HARDWARE_STATUSES.map((status) => counts.byStatus[status]);
    const maxValue = Math.max(...values, 1);
    return HARDWARE_STATUSES.map((status) => ({
      label: status,
      height: Math.max(20, Math.round((counts.byStatus[status] / maxValue) * 120)),
      active: status === "Available",
    }));
  }, [counts]);

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
            <tr key={row._id} className="table-row-hover">
              <td>{row.assetTag}</td>
              <td>{row.assetType ?? "-"}</td>
              <td>
                <div style={{ display: "grid", gap: 4 }}>
                  <div>{row.assetNameDescription ?? "-"}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{row.specifications ?? "-"}</div>
                </div>
              </td>
              <td>{row.locationPersonAssigned ?? "-"}</td>
              <td>{row.status}</td>
              <td>{row.turnoverTo ?? "-"}</td>
            </tr>
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

  return (
    <div>
      <h1 style={{ fontSize: 30, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        Hardware performance and operations overview.
      </p>

      <div className="search-field" style={{ marginBottom: 16 }}>
        <span className="search-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" />
          </svg>
        </span>
        <input
          className="input-base"
          placeholder="Tap to search assets"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="metric-strip" style={{ marginBottom: 16 }}>
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
              <strong>{counts.byStatus[status]}</strong>
              <span className="trend-chip">live</span>
            </div>
          </div>
        ))}
      </div>

      <div className="dashboard-row" style={{ marginBottom: 16 }}>
        <div className="panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--muted)" }}>Status Distribution</div>
          <div style={{ fontSize: 32, fontWeight: 700, marginTop: 4 }}>{counts.total}</div>
          <div className="analytics-bars">
            {analyticsBars.map((bar) => (
              <div key={bar.label} style={{ textAlign: "center" }}>
                <div className={`analytics-bar ${bar.active ? "active" : ""}`} style={{ height: bar.height }} />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{bar.label.slice(0, 3)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="promo-card">
          <span className="promo-pill">NEW</span>
          <h3 style={{ margin: "14px 0 8px 0", fontSize: 28, lineHeight: 1.2 }}>
            Hardware dashboard upgraded
          </h3>
          <p style={{ margin: 0, opacity: 0.92, lineHeight: 1.5 }}>
            Faster insights, cleaner views, and actionable lifecycle tracking.
          </p>
          <button className="btn-secondary" style={{ marginTop: 20, width: "100%" }}>
            Explore Overview
          </button>
        </div>
      </div>

      <div className="dashboard-row" style={{ marginBottom: 16 }}>
        <div className="panel" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Activities</h3>
          <div className="activity-list">
            {recentRows.map((row) => (
              <div key={row._id} className="activity-item">
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{row.status}</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>{row.assetTag}</div>
                <div style={{ color: "var(--muted)", fontSize: 13 }}>
                  {row.turnoverTo ?? "Unassigned"} • {row.locationPersonAssigned ?? "-"}
                </div>
              </div>
            ))}
            {!recentRows.length ? <div style={{ color: "var(--muted)" }}>No recent activity.</div> : null}
          </div>
        </div>

        <div className="panel" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0, marginBottom: 10 }}>Recent Assets</h3>
          <div className="saas-table-wrap">
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

      <div className="panel" style={{ padding: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {tabs.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={active ? "btn-primary" : "btn-secondary"}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === "master" ? (
          renderTable(tabRows)
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {[...groupedRows.entries()].map(([group, rows]) => (
              <div key={group} className="saas-card" style={{ padding: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{group}</div>
                {renderTable(rows)}
              </div>
            ))}
            {!groupedRows.size ? renderTable([]) : null}
          </div>
        )}
      </div>
    </div>
  );
}
