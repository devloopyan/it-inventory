"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

type OperationsReminder = {
  badge: string;
  title: string;
  copy: string;
  actionLabel: string;
  actionHref: string;
  tags?: string[];
};

type QueueCard = {
  title: string;
  count: number;
  description: string;
  href: string;
  actionLabel: string;
  tags?: string[];
};

type ChecklistCard = {
  title: string;
  eyebrow: string;
  description: string;
  steps: string[];
  note?: string;
};

function isReservedRecord(row: Record<string, unknown>) {
  return row.reservationStatus === "Reserved";
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

function pushPreview(list: string[], value?: string) {
  if (!value || list.includes(value) || list.length >= 3) return;
  list.push(value);
}

function formatMetric(value: number, ready: boolean) {
  return ready ? String(value) : "-";
}

export default function OperationsClient() {
  const monitoringOverview = useQuery(api.monitoring.getOverview, {});
  const allRows = useQuery(api.hardwareInventory.listAll, {});
  const inventoryRows = allRows ?? [];
  const ready = monitoringOverview !== undefined && allRows !== undefined;

  let readyStorageAssets = 0;
  let readyWorkstations = 0;
  let reservedQueue = 0;
  let borrowedAssets = 0;
  let repairAssets = 0;
  let newAssets = 0;

  const reservedPreview: string[] = [];
  const borrowedPreview: string[] = [];
  const repairPreview: string[] = [];
  const readyPreview: string[] = [];

  for (const row of inventoryRows) {
    const reservationRow = row as Record<string, unknown>;
    const reserved =
      row.locationPersonAssigned === "MAIN STORAGE" &&
      isReservedRecord(reservationRow);
    const readyForStorage =
      row.locationPersonAssigned === "MAIN STORAGE" &&
      (row.status === "Available" || row.status === "Working") &&
      !reserved;

    if (reserved) {
      reservedQueue += 1;
      pushPreview(reservedPreview, row.assetTag);
    }

    if (readyForStorage) {
      readyStorageAssets += 1;
      pushPreview(readyPreview, row.assetTag);
      if (isWorkstationRecord(row)) {
        readyWorkstations += 1;
      }
    }

    if (row.status === "Borrowed") {
      borrowedAssets += 1;
      pushPreview(borrowedPreview, row.assetTag);
    }

    if (row.status === "For Repair") {
      repairAssets += 1;
      pushPreview(repairPreview, row.assetTag);
    }

    if (row.status === "NEW") {
      newAssets += 1;
    }
  }

  const pendingApprovals = monitoringOverview?.pendingApprovals ?? 0;
  const activeInternetOutages = monitoringOverview?.activeInternetOutages ?? 0;

  const primaryReminder: OperationsReminder = !ready
    ? {
        badge: "SYNCING",
        title: "Loading onboarding support queues.",
        copy: "Pulling the latest signals from Monitoring and Assets so IT staff can see what may affect onboarding readiness.",
        actionLabel: "Open Monitoring",
        actionHref: "/monitoring",
      }
    : pendingApprovals > 0
      ? {
          badge: "APPROVAL",
          title:
            pendingApprovals === 1
              ? "1 approval may be blocking onboarding preparation."
              : `${pendingApprovals} approvals may be blocking onboarding preparation.`,
          copy: "Review approvals first so account provisioning or related setup work does not start without the needed authorization.",
          actionLabel: "Review approvals",
          actionHref: "/monitoring",
        }
      : reservedQueue > 0
        ? {
            badge: "HANDOFF",
            title:
              reservedQueue === 1
                ? "1 reserved asset is waiting for onboarding prep."
                : `${reservedQueue} reserved assets are waiting for onboarding prep.`,
            copy: "Use the asset queue to prepare equipment before the employee handoff and keep the turnover process moving.",
            actionLabel: "Open asset queue",
            actionHref: "/assets",
            tags: reservedPreview,
          }
        : readyWorkstations > 0
          ? {
              badge: "READY",
              title:
                readyWorkstations === 1
                  ? "1 workstation is ready for the next onboarding handoff."
                  : `${readyWorkstations} workstations are ready for the next onboarding handoff.`,
              copy: "The ready pool is healthy enough to prepare the next employee setup. Reserve the correct unit before deployment.",
              actionLabel: "Open Assets",
              actionHref: "/assets",
              tags: readyPreview,
            }
          : repairAssets > 0
            ? {
                badge: "REPAIR",
                title:
                  repairAssets === 1
                    ? "1 repair item is reducing onboarding capacity."
                    : `${repairAssets} repair items are reducing onboarding capacity.`,
                copy: "Check repair progress and return usable devices back to the ready pool as soon as possible.",
                actionLabel: "Review repair items",
                actionHref: "/assets",
                tags: repairPreview,
              }
            : borrowedAssets > 0
              ? {
                  badge: "RETURN",
                  title:
                    borrowedAssets === 1
                      ? "1 borrowed asset may need recovery for future onboarding."
                      : `${borrowedAssets} borrowed assets may need recovery for future onboarding.`,
                  copy: "Recovering unused borrowed assets helps keep enough equipment available for the next onboarding cycle.",
                  actionLabel: "Review borrowed assets",
                  actionHref: "/assets",
                  tags: borrowedPreview,
                }
              : activeInternetOutages > 0
                ? {
                    badge: "OUTAGE",
                    title:
                      activeInternetOutages === 1
                        ? "1 active outage may affect onboarding setup."
                        : `${activeInternetOutages} active outages may affect onboarding setup.`,
                    copy: "Keep Monitoring current so the team knows whether account setup or remote onboarding steps are affected by connectivity issues.",
                    actionLabel: "Open Monitoring",
                    actionHref: "/monitoring",
                  }
                : {
                    badge: "CLEAR",
                    title: "Onboarding support queues are under control.",
                    copy: "No urgent blockers are visible right now. Use the onboarding checklist below to prepare the next employee setup correctly.",
                    actionLabel: "Open Assets",
                    actionHref: "/assets",
                  };

  const queueCards: QueueCard[] = [
    {
      title: "Approval Queue",
      count: pendingApprovals,
      description: "Requests that may block account setup or other onboarding-related preparation.",
      href: "/monitoring",
      actionLabel: "Open Monitoring",
    },
    {
      title: "Device Prep Queue",
      count: reservedQueue,
      description: "Reserved units in main storage that should be prepared before employee handoff.",
      href: "/assets",
      actionLabel: "Open Assets",
      tags: reservedPreview,
    },
    {
      title: "Ready Workstations",
      count: readyWorkstations,
      description: "Laptops and desktops already in the ready pool for the next onboarding request.",
      href: "/assets",
      actionLabel: "Review Ready Units",
      tags: readyPreview,
    },
    {
      title: "Repair Follow-Up",
      count: repairAssets,
      description: "Assets that still need repair follow-up before they can return to the onboarding pool.",
      href: "/assets",
      actionLabel: "Check Repairs",
      tags: repairPreview,
    },
  ];

  const onboardingChecklist: ChecklistCard[] = [
    {
      title: "Trigger and Authorization",
      eyebrow: "Step 01",
      description: "IT Operations starts onboarding only after HR submits the approved physical request form.",
      steps: [
        "Receive the physical Onboarding Request Form initiated by HR.",
        "Confirm the form is signed by HR and the OSMD Manager.",
        "Do not proceed without the signed physical form.",
        "Treat the signed form as the official authorization and audit evidence.",
      ],
      note: "No onboarding work should begin until the signed physical form is in hand.",
    },
    {
      title: "Account Provisioning",
      eyebrow: "Step 02",
      description: "Provision only the accounts and access required for the employee's role.",
      steps: [
        "Create the employee's Microsoft 365 account for Teams, Outlook, and SharePoint.",
        "Grant Admin Portal access only when it applies to the employee's role.",
        "Do not create a company Google account.",
        "Provision system access based on role requirements.",
        "Apply least-privilege access principles for all assigned access.",
      ],
    },
    {
      title: "Device Preparation and Deployment",
      eyebrow: "Step 03A",
      description: "Company-issued devices are the default onboarding case and must be prepared with controlled access.",
      steps: [
        "Configure one IT-controlled local administrator account on the company-issued device.",
        "Configure one separate standard user account for the employee.",
        "Ensure the employee account has no administrative rights by default.",
        "Grant administrative rights only on a case-by-case basis with approval from the employee's Manager and the IT Head.",
        "Require the employee to sign the IT Equipment Turnover Form upon issuance.",
        "Update the Hardware Asset Inventory after the device is issued.",
      ],
    },
    {
      title: "Personal Device Exception",
      eyebrow: "Step 03B",
      description: "Personal device use is a rare exception and still requires documentation and asset registration.",
      steps: [
        "Confirm personal device use has been permitted before proceeding.",
        "Require the employee to sign the Asset Form.",
        "Register the device in the IT asset database.",
        "Record the device without transferring ownership to the company.",
      ],
    },
    {
      title: "Documentation and Recordkeeping",
      eyebrow: "Step 04",
      description: "Keep the onboarding record complete so the activity is defensible and auditable later.",
      steps: [
        "Retain the signed Onboarding Request Form.",
        "Retain the IT Equipment Turnover Form when a company-issued device is deployed.",
        "Retain the asset database update record.",
        "File all onboarding documents according to Section 13 on documentation, records, and reporting.",
      ],
    },
  ];

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="dashboard-heading">
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            IT Operations Hub
          </div>
          <h1 className="dashboard-title">Operations</h1>
          <p className="dashboard-subtitle">
            Onboarding guidance for IT staff, supported by live queues from Monitoring and Assets.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/monitoring" className="btn-secondary">
            Monitoring
          </Link>
          <Link href="/assets" className="btn-primary">
            Assets
          </Link>
        </div>
      </div>

      <section
        className="panel dashboard-panel"
        style={{
          padding: 18,
          display: "grid",
          gap: 14,
          borderColor: "rgba(245, 158, 11, 0.34)",
          background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.02))",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Onboarding Rule
          </div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Do not proceed without the signed physical onboarding form.</h2>
          <p className="dashboard-subtitle" style={{ margin: 0 }}>
            HR initiates onboarding through the physical Onboarding Request Form, and IT Operations only proceeds after
            signatures from HR and the OSMD Manager are complete.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["Physical form required", "Signed by HR", "Signed by OSMD Manager", "Official audit evidence"].map(
            (item) => (
              <span
                key={item}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: 999,
                  padding: "6px 12px",
                  background: "rgba(255, 255, 255, 0.8)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {item}
              </span>
            ),
          )}
        </div>
      </section>

      <div className="metric-strip dashboard-metric-strip">
        <div className="metric-item">
          <div className="metric-head">
            <span className="metric-icon" style={{ background: "#f59e0b" }} />
            Pending Approvals
          </div>
          <div className="metric-value">
            <strong>{formatMetric(pendingApprovals, ready)}</strong>
            <span className="trend-chip">live</span>
          </div>
        </div>
        <div className="metric-item">
          <div className="metric-head">
            <span className="metric-icon" style={{ background: "#2563eb" }} />
            Reserved for Setup
          </div>
          <div className="metric-value">
            <strong>{formatMetric(reservedQueue, ready)}</strong>
            <span className="trend-chip">queue</span>
          </div>
        </div>
        <div className="metric-item">
          <div className="metric-head">
            <span className="metric-icon" style={{ background: "#f97316" }} />
            Borrowed Assets
          </div>
          <div className="metric-value">
            <strong>{formatMetric(borrowedAssets, ready)}</strong>
            <span className="trend-chip">follow-up</span>
          </div>
        </div>
        <div className="metric-item">
          <div className="metric-head">
            <span className="metric-icon" style={{ background: "#16a34a" }} />
            Ready Storage Assets
          </div>
          <div className="metric-value">
            <strong>{formatMetric(readyStorageAssets, ready)}</strong>
            <span className="trend-chip">available</span>
          </div>
        </div>
        <div className="metric-item">
          <div className="metric-head">
            <span className="metric-icon" style={{ background: "#ef4444" }} />
            Repair Follow-Up
          </div>
          <div className="metric-value">
            <strong>{formatMetric(repairAssets, ready)}</strong>
            <span className="trend-chip">check</span>
          </div>
        </div>
        <div className="metric-item">
          <div className="metric-head">
            <span className="metric-icon" style={{ background: "#8b5cf6" }} />
            New Assets
          </div>
          <div className="metric-value">
            <strong>{formatMetric(newAssets, ready)}</strong>
            <span className="trend-chip">intake</span>
          </div>
        </div>
      </div>

      <div className="dashboard-row dashboard-row-primary">
        <section className="dashboard-reminder-card">
          <span className="dashboard-reminder-badge">{primaryReminder.badge}</span>
          <div className="dashboard-reminder-title">{primaryReminder.title}</div>
          <div className="dashboard-reminder-copy">{primaryReminder.copy}</div>
          {primaryReminder.tags?.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {primaryReminder.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: 999,
                    padding: "5px 10px",
                    background: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="dashboard-reminder-btn" href={primaryReminder.actionHref}>
              {primaryReminder.actionLabel}
            </Link>
            <Link href="/monitoring" className="btn-secondary">
              Ticket Queue
            </Link>
            <Link href="/assets" className="btn-secondary">
              Asset Queue
            </Link>
          </div>
        </section>

        <section className="panel dashboard-panel" style={{ padding: 18, display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--muted)",
              }}
            >
              Queue Board
            </div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Supporting queues for onboarding</h2>
            <p className="dashboard-subtitle" style={{ margin: 0 }}>
              These live signals help IT staff see what may affect account setup, device preparation, and employee handoff.
            </p>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {queueCards.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="saas-card saas-card-hover"
                style={{ padding: 14, display: "grid", gap: 8 }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{card.title}</div>
                    <div className="dashboard-subtitle">{card.description}</div>
                  </div>
                  <div
                    style={{
                      minWidth: 54,
                      height: 40,
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 18,
                      fontWeight: 800,
                    }}
                  >
                    {formatMetric(card.count, ready)}
                  </div>
                </div>
                {card.tags?.length ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {card.tags.map((tag) => (
                      <span
                        key={`${card.title}-${tag}`}
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "var(--muted-strong)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--nav-active-color)" }}>{card.actionLabel}</div>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="panel dashboard-panel" style={{ padding: 18, display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Onboarding Checklist
          </div>
          <h2 style={{ margin: 0, fontSize: 22 }}>What IT staff should do during onboarding</h2>
          <p className="dashboard-subtitle" style={{ margin: 0 }}>
            This checklist is based only on the onboarding SOP you provided, so the page stays accurate while we build
            Operations step by step.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          {onboardingChecklist.map((card) => (
            <article key={card.title} className="saas-card" style={{ padding: 18, display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--muted)",
                  }}
                >
                  {card.eyebrow}
                </div>
                <h3 style={{ margin: 0, fontSize: 19 }}>{card.title}</h3>
                <p className="dashboard-subtitle" style={{ margin: 0 }}>
                  {card.description}
                </p>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {card.steps.map((step) => (
                  <div key={step} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span
                      aria-hidden="true"
                      style={{
                        marginTop: 6,
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: "var(--nav-active-color)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 13, lineHeight: 1.6 }}>{step}</span>
                  </div>
                ))}
              </div>

              {card.note ? (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.24)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  {card.note}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="panel dashboard-panel" style={{ padding: 18, display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Workspace links</h2>
          <p className="dashboard-subtitle" style={{ margin: 0 }}>
            These are the workspaces most likely to support onboarding preparation right now.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {[
            {
              href: "/monitoring",
              label: "Monitoring",
              description: "Use approvals and requests as the control center before onboarding work proceeds.",
            },
            {
              href: "/assets",
              label: "Assets",
              description: "Prepare devices and keep inventory records aligned with the actual handoff stage.",
            },
            {
              href: "/dashboard",
              label: "Dashboard",
              description: "Review live queue signals before assigning onboarding preparation work.",
            },
            {
              href: "/reports",
              label: "Reports",
              description: "Use downstream reporting later if onboarding begins producing its own record set.",
            },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="saas-card saas-card-hover"
              style={{ padding: 16, display: "grid", gap: 6 }}
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>{link.label}</div>
              <div className="dashboard-subtitle">{link.description}</div>
            </Link>
          ))}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "var(--muted)",
            borderTop: "1px dashed var(--border)",
            paddingTop: 10,
          }}
        >
          Operations is using live signals from Monitoring and Assets as support, while the onboarding checklist above
          stays tied to the SOP you confirmed. We can add the next operations process after you define it.
        </div>
      </section>
    </div>
  );
}
