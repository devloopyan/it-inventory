"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { OFFICE_TIMEZONE } from "@/lib/monitoring";

type ReportRow = {
  label: string;
  value: number;
  helper: string;
  tone: string;
};

const REPORT_PALETTE = ["#2563eb", "#4f46e5", "#0f766e", "#d97706", "#dc2626", "#7c3aed"] as const;

function withAlpha(color: string, alpha: string) {
  return `${color}${alpha}`;
}

function formatCount(value: number, ready: boolean) {
  return ready ? value.toLocaleString("en-US") : "-";
}

function formatPercent(value: number | undefined, digits = 1) {
  if (typeof value !== "number") return "-";
  return `${value.toFixed(digits)}%`;
}

function formatDuration(minutes: number | undefined) {
  if (typeof minutes !== "number" || Number.isNaN(minutes) || minutes <= 0) return "-";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  if (remainingMinutes === 0) return `${hours} hr`;
  return `${hours} hr ${remainingMinutes} min`;
}

function formatTimestamp(value: number) {
  return new Date(value).toLocaleString("en-US", {
    timeZone: OFFICE_TIMEZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getWorkflowLabel(workflowType: string) {
  switch (workflowType) {
    case "serviceRequest":
      return "Service Request";
    case "internetOutage":
      return "Internet Outage";
    case "incident":
    default:
      return "Incident";
  }
}

function getTicketTone(status: string) {
  switch (status) {
    case "Closed":
    case "Resolved":
    case "Fulfilled":
    case "Meeting Held":
    case "Done":
      return "#16a34a";
    case "Reserved":
    case "Assets Reserved":
    case "Pending Approval":
    case "Pending":
    case "For Revision":
      return "#d97706";
    case "Ready":
    case "Setup Complete":
      return "#7c3aed";
    case "Investigating":
    case "Identified":
      return "#dc2626";
    case "In Progress":
    case "Monitoring":
    case "New":
      return "#2563eb";
    default:
      return "#64748b";
  }
}

function getActivityMeta(eventType: string) {
  switch (eventType) {
    case "asset_created":
      return { label: "Created", tone: "#2563eb" };
    case "asset_updated":
      return { label: "Updated", tone: "#64748b" };
    case "status_changed":
      return { label: "Status Change", tone: "#64748b" };
    case "asset_assigned":
      return { label: "Assigned", tone: "#0f766e" };
    case "asset_borrowed":
      return { label: "Borrowed", tone: "#d97706" };
    case "asset_for_repair":
      return { label: "Repair", tone: "#dc2626" };
    case "asset_retired":
      return { label: "Retired", tone: "#7c3aed" };
    case "reservation_created":
      return { label: "Reserved", tone: "#2563eb" };
    case "reservation_claimed":
      return { label: "Claimed", tone: "#16a34a" };
    case "reservation_cancelled":
      return { label: "Cancelled", tone: "#d97706" };
    case "asset_returned":
      return { label: "Returned", tone: "#16a34a" };
    case "drone_flight_report_uploaded":
      return { label: "Flight Report", tone: "#4f46e5" };
    case "receiving_form_uploaded":
      return { label: "Receiving Form", tone: "#2563eb" };
    case "turnover_form_uploaded":
      return { label: "Turnover Form", tone: "#0f766e" };
    case "asset_deleted":
      return { label: "Deleted", tone: "#dc2626" };
    default:
      return { label: "Activity", tone: "#64748b" };
  }
}

function getBarWidth(value: number, maxValue: number) {
  if (value <= 0 || maxValue <= 0) return "0%";
  return `${Math.max(12, Math.round((value / maxValue) * 100))}%`;
}

function buildRankedRows(
  source: Map<string, number>,
  total: number,
  emptyHelper: string,
) {
  return [...source.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([label, value], index) => ({
      label,
      value,
      helper: total > 0 ? `${((value / total) * 100).toFixed(1)}% of tracked records` : emptyHelper,
      tone: REPORT_PALETTE[index % REPORT_PALETTE.length],
    }));
}

export default function ReportsClient() {
  const [reportTimestamp] = useState(() => Date.now());
  const monitoringOverview = useQuery(api.monitoring.getOverview, {});
  const incidentRows = useQuery(api.monitoring.list, { view: "incident", showClosed: true });
  const outageRows = useQuery(api.monitoring.list, { view: "internet", showClosed: true });
  const inventoryRows = useQuery(api.hardwareInventory.listAll, {});
  const assetActivity = useQuery(api.hardwareInventory.listRecentActivity, { limit: 6 });

  const ready =
    monitoringOverview !== undefined &&
    incidentRows !== undefined &&
    outageRows !== undefined &&
    inventoryRows !== undefined &&
    assetActivity !== undefined;

  const ticketRows = [...(incidentRows ?? []), ...(outageRows ?? [])];
  const assets = inventoryRows ?? [];
  const recentAssetActivity = assetActivity ?? [];

  const latestRecordTimestamp = Math.max(
    reportTimestamp,
    ...ticketRows.map((ticket) => ticket.updatedAt),
    ...assets.map((asset) => asset.updatedAt),
    ...recentAssetActivity.map((activity) => activity.createdAt),
  );
  const thirtyDaysAgo = reportTimestamp - 30 * 24 * 60 * 60 * 1000;

  let majorIncidents = 0;
  let missingIncidentReports = 0;
  let closedLast30Days = 0;
  let resolvedOutageCount = 0;
  let resolvedOutageMinutes = 0;

  const categoryCounts = new Map<string, number>();

  for (const ticket of ticketRows) {
    categoryCounts.set(ticket.category, (categoryCounts.get(ticket.category) ?? 0) + 1);

    if (ticket.majorIncident) {
      majorIncidents += 1;
    }

    if (ticket.incidentReportRequired && !ticket.incidentReportAttached) {
      missingIncidentReports += 1;
    }

    const completedAt = ticket.closedAt ?? ticket.fulfilledAt ?? ticket.resolvedAt;
    if (completedAt && completedAt >= thirtyDaysAgo) {
      closedLast30Days += 1;
    }

    if (ticket.workflowType === "internetOutage" && ticket.status === "Resolved" && ticket.totalDowntimeMinutes) {
      resolvedOutageCount += 1;
      resolvedOutageMinutes += ticket.totalDowntimeMinutes;
    }
  }

  let readyPoolAssets = 0;
  let assignedAssets = 0;
  let borrowedAssets = 0;
  let reservedAssets = 0;
  let repairAssets = 0;
  let retiredAssets = 0;
  let documentedAssets = 0;

  const departmentCounts = new Map<string, number>();

  for (const asset of assets) {
    const row = asset as Record<string, unknown>;
    const department = asset.department?.trim() || "Unassigned";
    const isReserved = row.reservationStatus === "Reserved";
    const hasSupportingDocument = Boolean(
      row.receivingFormStorageId || row.turnoverFormStorageId || row.droneFlightReportStorageId,
    );

    departmentCounts.set(department, (departmentCounts.get(department) ?? 0) + 1);

    if (hasSupportingDocument) {
      documentedAssets += 1;
    }

    if (
      asset.locationPersonAssigned === "MAIN STORAGE" &&
      (asset.status === "Available" || asset.status === "Working") &&
      !isReserved
    ) {
      readyPoolAssets += 1;
    }

    if (asset.status === "Assigned") assignedAssets += 1;
    if (asset.status === "Borrowed") borrowedAssets += 1;
    if (asset.status === "For Repair") repairAssets += 1;
    if (asset.status === "Retired") retiredAssets += 1;
    if (isReserved) reservedAssets += 1;
  }

  const totalAssets = assets.length;
  const auditCoverage = totalAssets > 0 ? Math.round((documentedAssets / totalAssets) * 100) : 0;
  const averageResolvedOutageMinutes =
    resolvedOutageCount > 0 ? resolvedOutageMinutes / resolvedOutageCount : undefined;

  const summaryTitle = !ready
    ? "Compiling the latest reporting picture."
    : (monitoringOverview?.activeInternetOutages ?? 0) > 0
      ? `${monitoringOverview?.activeInternetOutages} active outage records need attention.`
      : missingIncidentReports > 0
        ? `${missingIncidentReports} major incidents still need report attachments.`
        : (monitoringOverview?.pendingApprovals ?? 0) > 0
          ? `${monitoringOverview?.pendingApprovals} approval items are still waiting on review.`
          : borrowedAssets > readyPoolAssets && borrowedAssets > 0
            ? `${borrowedAssets} assets are still in circulation outside storage.`
            : "Operations look stable across Monitoring and Assets.";

  const summaryCopy = !ready
    ? "Live data from the current workspaces will appear here once the report inputs finish loading."
    : `${formatPercent(monitoringOverview?.monthlyUptime, 2)} uptime this month, ${closedLast30Days} completed work items in the last 30 days, and ${readyPoolAssets} ready assets in main storage.`;

  const executiveStats = [
    {
      label: "Completed 30d",
      value: formatCount(closedLast30Days, ready),
      helper: "Resolved, fulfilled, or closed items in the last 30 days.",
    },
    {
      label: "Avg outage",
      value: ready ? formatDuration(averageResolvedOutageMinutes) : "-",
      helper: "Average duration for resolved internet outage records.",
    },
    {
      label: "Documented assets",
      value: ready ? `${auditCoverage}%` : "-",
      helper: ready
        ? `${documentedAssets.toLocaleString("en-US")} assets include forms or flight reports.`
        : "Checking attachments and handoff forms.",
    },
  ];

  const monitoringRowsForCard: ReportRow[] = [
    {
      label: "Open work items",
      value: monitoringOverview?.openTickets ?? 0,
      helper: "Incident and service request records that are still active.",
      tone: "#2563eb",
    },
    {
      label: "Pending approvals",
      value: monitoringOverview?.pendingApprovals ?? 0,
      helper: "Requests blocked on leadership approval.",
      tone: "#d97706",
    },
    {
      label: "Active outages",
      value: monitoringOverview?.activeInternetOutages ?? 0,
      helper: "Internet outage records not yet resolved.",
      tone: "#dc2626",
    },
    {
      label: "Major incidents",
      value: majorIncidents,
      helper: "High-impact records that require stronger audit coverage.",
      tone: "#7c3aed",
    },
    {
      label: "Missing reports",
      value: missingIncidentReports,
      helper: "Major incidents that still need an attached incident report.",
      tone: "#ea580c",
    },
    {
      label: "Closed last 30d",
      value: closedLast30Days,
      helper: "Completed items across incidents, requests, and outages.",
      tone: "#16a34a",
    },
  ];

  const assetRowsForCard: ReportRow[] = [
    {
      label: "Ready in storage",
      value: readyPoolAssets,
      helper: "Available or working units currently ready in MAIN STORAGE.",
      tone: "#16a34a",
    },
    {
      label: "Assigned",
      value: assignedAssets,
      helper: "Assets already deployed through turnover.",
      tone: "#0f766e",
    },
    {
      label: "Borrowed",
      value: borrowedAssets,
      helper: "Items still checked out and expected to come back.",
      tone: "#d97706",
    },
    {
      label: "Reserved",
      value: reservedAssets,
      helper: "Storage assets queued for a future handoff.",
      tone: "#2563eb",
    },
    {
      label: "For repair",
      value: repairAssets,
      helper: "Units currently unavailable because of repair work.",
      tone: "#dc2626",
    },
    {
      label: "Retired",
      value: retiredAssets,
      helper: "Assets removed from active service.",
      tone: "#7c3aed",
    },
  ];

  const topCategories = buildRankedRows(
    categoryCounts,
    ticketRows.length,
    "No category data is available yet.",
  );
  const topDepartments = buildRankedRows(
    departmentCounts,
    totalAssets,
    "No department assignments are available yet.",
  );

  const recentTickets = [...ticketRows].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 6);

  const sourceRows = [
    {
      label: "Monitoring feed",
      value: formatCount(ticketRows.length, ready),
      helper: "Incident, request, and internet outage records included in this snapshot.",
    },
    {
      label: "Asset register",
      value: formatCount(totalAssets, ready),
      helper: "Tracked hardware items, including reservations and storage stock.",
    },
    {
      label: "Current month uptime",
      value: ready ? formatPercent(monitoringOverview?.monthlyUptime, 2) : "-",
      helper: "Business-hour availability derived from outage records and the office calendar.",
    },
    {
      label: "Audit readiness",
      value: ready ? `${auditCoverage}%` : "-",
      helper: ready
        ? `${documentedAssets.toLocaleString("en-US")} assets currently include forms or flight reports.`
        : "Checking attached receiving forms, turnover forms, and drone flight reports.",
    },
  ];

  const monitoringMax = monitoringRowsForCard.reduce((max, row) => Math.max(max, row.value), 0);
  const assetMax = assetRowsForCard.reduce((max, row) => Math.max(max, row.value), 0);
  const categoryMax = topCategories.reduce((max, row) => Math.max(max, row.value), 0);
  const departmentMax = topDepartments.reduce((max, row) => Math.max(max, row.value), 0);

  return (
    <div className="dashboard-page reports-page">
      <div className="dashboard-header">
        <div className="dashboard-heading">
          <div className="reports-eyebrow">IT Operations Hub</div>
          <h1 className="dashboard-title">Reports</h1>
          <p className="dashboard-subtitle">
            Live operational reporting across Monitoring and Assets, with a read-only snapshot for
            workload, uptime, documentation, and recent activity.
          </p>
        </div>

        <div className="reports-header-meta">
          <span className="reports-header-chip">Live Sync</span>
          <span className="dashboard-subtitle">
            {ready ? `Updated ${formatTimestamp(latestRecordTimestamp)}` : "Loading current workspace data"}
          </span>
        </div>
      </div>

      <div className="metric-strip">
        <div className="metric-item">
          <div className="metric-head">
            <span className="metric-icon" style={{ background: "#2563eb" }} aria-hidden="true" />
            Monthly Uptime
          </div>
          <div className="metric-value">
            <strong>{ready ? formatPercent(monitoringOverview?.monthlyUptime, 2) : "-"}</strong>
          </div>
          <div className="dashboard-subtitle">Business-hour availability from outage records.</div>
        </div>

        <div className="metric-item">
          <div className="metric-head">
            <span className="metric-icon" style={{ background: "#0f766e" }} aria-hidden="true" />
            Open Work Items
          </div>
          <div className="metric-value">
            <strong>{formatCount(monitoringOverview?.openTickets ?? 0, ready)}</strong>
          </div>
          <div className="dashboard-subtitle">Active incidents and service requests still in motion.</div>
        </div>

        <div className="metric-item">
          <div className="metric-head">
            <span className="metric-icon" style={{ background: "#4f46e5" }} aria-hidden="true" />
            Tracked Assets
          </div>
          <div className="metric-value">
            <strong>{formatCount(totalAssets, ready)}</strong>
          </div>
          <div className="dashboard-subtitle">
            {ready
              ? `${readyPoolAssets.toLocaleString("en-US")} ready in storage, ${borrowedAssets.toLocaleString("en-US")} borrowed.`
              : "Checking inventory readiness and current circulation."}
          </div>
        </div>

        <div className="metric-item">
          <div className="metric-head">
            <span className="metric-icon" style={{ background: "#d97706" }} aria-hidden="true" />
            Audit Coverage
          </div>
          <div className="metric-value">
            <strong>{ready ? `${auditCoverage}%` : "-"}</strong>
          </div>
          <div className="dashboard-subtitle">
            {ready
              ? `${documentedAssets.toLocaleString("en-US")} assets have forms or flight reports attached.`
              : "Checking supporting documentation across tracked assets."}
          </div>
        </div>
      </div>

      <div className="reports-grid reports-grid-hero">
        <section className="dashboard-reminder-card reports-summary-card">
          <div className="reports-panel-head">
            <span className="reports-section-kicker">Executive Snapshot</span>
            <h2 className="reports-panel-title">{summaryTitle}</h2>
            <p className="reports-panel-subtitle">{summaryCopy}</p>
          </div>

          <div className="reports-chip-list" aria-label="Current reporting highlights">
            <span className="reports-chip">
              {ready ? `${monitoringOverview?.pendingApprovals ?? 0} approval items` : "Approval queue"}
            </span>
            <span className="reports-chip">
              {ready ? `${missingIncidentReports} missing incident reports` : "Incident report coverage"}
            </span>
            <span className="reports-chip">
              {ready ? `${borrowedAssets} borrowed assets` : "Borrowed asset circulation"}
            </span>
            <span className="reports-chip">
              {ready ? `${reservedAssets} active reservations` : "Reservation queue"}
            </span>
          </div>

          <div className="reports-stat-grid">
            {executiveStats.map((stat) => (
              <div key={stat.label} className="reports-stat-card">
                <div className="reports-stat-label">{stat.label}</div>
                <div className="reports-stat-value">{stat.value}</div>
                <div className="reports-stat-helper">{stat.helper}</div>
              </div>
            ))}
          </div>

          <div className="reports-actions">
            <Link href="/monitoring" className="btn-primary">
              Open Monitoring
            </Link>
            <Link href="/assets" className="btn-secondary">
              Open Assets
            </Link>
            <Link href="/operations" className="btn-secondary">
              Open Operations
            </Link>
          </div>
        </section>

        <section className="saas-card reports-panel">
          <div className="reports-panel-head">
            <span className="reports-section-kicker">Source Coverage</span>
            <h2 className="reports-panel-title">What this tab is reading right now</h2>
            <p className="reports-panel-subtitle">
              The report is assembled from live data in the current workspaces, so the numbers here
              move as tickets and assets are updated.
            </p>
          </div>

          <div className="reports-source-list">
            {sourceRows.map((row) => (
              <div key={row.label} className="reports-source-row">
                <div className="reports-source-copy">
                  <div className="reports-source-label">{row.label}</div>
                  <div className="reports-source-helper">{row.helper}</div>
                </div>
                <div className="reports-source-value">{row.value}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="reports-grid reports-grid-half">
        <section className="saas-card reports-panel">
          <div className="reports-panel-head">
            <span className="reports-section-kicker">Monitoring Load</span>
            <h2 className="reports-panel-title">Current ticket posture</h2>
            <p className="reports-panel-subtitle">
              Queue pressure, approval blockers, and incident-report follow-through.
            </p>
          </div>

          <div className="reports-bar-list">
            {monitoringRowsForCard.map((row) => (
              <div key={row.label} className="reports-bar-row">
                <div className="reports-bar-top">
                  <div className="reports-bar-copy">
                    <div className="reports-bar-label">{row.label}</div>
                    <div className="reports-bar-helper">{row.helper}</div>
                  </div>
                  <div className="reports-bar-value">{formatCount(row.value, ready)}</div>
                </div>
                <div className="reports-bar-track" aria-hidden="true">
                  <div
                    className="reports-bar-fill"
                    style={{
                      width: getBarWidth(row.value, monitoringMax),
                      background: row.tone,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="saas-card reports-panel">
          <div className="reports-panel-head">
            <span className="reports-section-kicker">Asset Posture</span>
            <h2 className="reports-panel-title">Inventory readiness and circulation</h2>
            <p className="reports-panel-subtitle">
              Storage readiness, active deployments, reservations, and service-impacting issues.
            </p>
          </div>

          <div className="reports-bar-list">
            {assetRowsForCard.map((row) => (
              <div key={row.label} className="reports-bar-row">
                <div className="reports-bar-top">
                  <div className="reports-bar-copy">
                    <div className="reports-bar-label">{row.label}</div>
                    <div className="reports-bar-helper">{row.helper}</div>
                  </div>
                  <div className="reports-bar-value">{formatCount(row.value, ready)}</div>
                </div>
                <div className="reports-bar-track" aria-hidden="true">
                  <div
                    className="reports-bar-fill"
                    style={{
                      width: getBarWidth(row.value, assetMax),
                      background: row.tone,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="reports-grid reports-grid-half">
        <section className="saas-card reports-panel">
          <div className="reports-panel-head">
            <span className="reports-section-kicker">Demand Signals</span>
            <h2 className="reports-panel-title">Top monitoring categories</h2>
            <p className="reports-panel-subtitle">
              The categories receiving the most monitoring traffic in the current dataset.
            </p>
          </div>

          {ready && topCategories.length > 0 ? (
            <div className="reports-bar-list">
              {topCategories.map((row) => (
                <div key={row.label} className="reports-bar-row">
                  <div className="reports-bar-top">
                    <div className="reports-bar-copy">
                      <div className="reports-bar-label">{row.label}</div>
                      <div className="reports-bar-helper">{row.helper}</div>
                    </div>
                    <div className="reports-bar-value">{row.value.toLocaleString("en-US")}</div>
                  </div>
                  <div className="reports-bar-track" aria-hidden="true">
                    <div
                      className="reports-bar-fill"
                      style={{
                        width: getBarWidth(row.value, categoryMax),
                        background: row.tone,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="reports-empty">
              {ready ? "No monitoring categories have been recorded yet." : "Loading category totals."}
            </div>
          )}
        </section>

        <section className="saas-card reports-panel">
          <div className="reports-panel-head">
            <span className="reports-section-kicker">Department Footprint</span>
            <h2 className="reports-panel-title">Where assets are allocated</h2>
            <p className="reports-panel-subtitle">
              Department distribution based on the current hardware inventory register.
            </p>
          </div>

          {ready && topDepartments.length > 0 ? (
            <div className="reports-bar-list">
              {topDepartments.map((row) => (
                <div key={row.label} className="reports-bar-row">
                  <div className="reports-bar-top">
                    <div className="reports-bar-copy">
                      <div className="reports-bar-label">{row.label}</div>
                      <div className="reports-bar-helper">{row.helper}</div>
                    </div>
                    <div className="reports-bar-value">{row.value.toLocaleString("en-US")}</div>
                  </div>
                  <div className="reports-bar-track" aria-hidden="true">
                    <div
                      className="reports-bar-fill"
                      style={{
                        width: getBarWidth(row.value, departmentMax),
                        background: row.tone,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="reports-empty">
              {ready ? "No department allocations have been recorded yet." : "Loading department totals."}
            </div>
          )}
        </section>
      </div>

      <div className="reports-grid reports-grid-half">
        <section className="saas-card reports-panel">
          <div className="reports-panel-head">
            <span className="reports-section-kicker">Recent Monitoring Updates</span>
            <h2 className="reports-panel-title">Latest ticket movement</h2>
            <p className="reports-panel-subtitle">
              Most recently updated incidents, service requests, and outage records.
            </p>
          </div>

          {ready && recentTickets.length > 0 ? (
            <div className="reports-list">
              {recentTickets.map((ticket) => {
                const tone = getTicketTone(ticket.status);
                return (
                  <Link
                    key={ticket._id}
                    href={`/monitoring/${ticket._id}`}
                    className="reports-list-item"
                  >
                    <div className="reports-list-main">
                      <div className="reports-list-title">{ticket.title}</div>
                      <div className="reports-list-subtitle">
                        {ticket.ticketNumber} | {getWorkflowLabel(ticket.workflowType)} | {ticket.category}
                      </div>
                    </div>

                    <div className="reports-list-side">
                      <span
                        className="reports-status-badge"
                        style={{
                          color: tone,
                          borderColor: withAlpha(tone, "33"),
                          background: withAlpha(tone, "14"),
                        }}
                      >
                        {ticket.status}
                      </span>
                      <span className="reports-list-meta">{formatTimestamp(ticket.updatedAt)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="reports-empty">
              {ready ? "No monitoring records are available yet." : "Loading recent monitoring activity."}
            </div>
          )}
        </section>

        <section className="saas-card reports-panel">
          <div className="reports-panel-head">
            <span className="reports-section-kicker">Recent Asset Activity</span>
            <h2 className="reports-panel-title">Latest inventory movement</h2>
            <p className="reports-panel-subtitle">
              Recent status changes, reservations, returns, and form uploads from the hardware log.
            </p>
          </div>

          {ready && recentAssetActivity.length > 0 ? (
            <div className="reports-list">
              {recentAssetActivity.map((activity) => {
                const meta = getActivityMeta(activity.eventType);
                const subtitleParts = [activity.message];
                if (activity.relatedPerson) subtitleParts.push(activity.relatedPerson);
                if (activity.location) subtitleParts.push(activity.location);

                return (
                  <Link
                    key={activity._id}
                    href={activity.inventoryId ? `/hardware-inventory/${activity.inventoryId}` : "/assets"}
                    className="reports-list-item"
                    >
                      <div className="reports-list-main">
                        <div className="reports-list-title">
                          {activity.assetTag}
                          {activity.assetNameDescription ? ` | ${activity.assetNameDescription}` : ""}
                        </div>
                      <div className="reports-list-subtitle">{subtitleParts.join(" | ")}</div>
                    </div>

                    <div className="reports-list-side">
                      <span
                        className="reports-status-badge"
                        style={{
                          color: meta.tone,
                          borderColor: withAlpha(meta.tone, "33"),
                          background: withAlpha(meta.tone, "14"),
                        }}
                      >
                        {meta.label}
                      </span>
                      <span className="reports-list-meta">{formatTimestamp(activity.createdAt)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="reports-empty">
              {ready ? "No asset activity has been recorded yet." : "Loading recent inventory activity."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
