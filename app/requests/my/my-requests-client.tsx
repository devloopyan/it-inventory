"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "@/app/current-user-context";
import { formatRequesterRequestType } from "@/lib/requestDisplay";
import { MONITORING_TRAVEL_ORDER_CATEGORY, MONITORING_MEETING_REQUEST_CATEGORY, MONITORING_BORROWING_REQUEST_CATEGORY } from "@/lib/monitoring";

function normalizeName(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function formatDate(value?: number) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCompact(value?: number | string) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function timeAgo(ts?: number) {
  if (!ts) return "";
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function getStatusStyle(status: string) {
  const s = status.toLowerCase();
  if (s.includes("closed") || s.includes("done") || s.includes("fulfilled") || s.includes("resolved") || s.includes("meeting held"))
    return { background: "#dcfce7", color: "#166534" };
  if (s.includes("assigned") || s.includes("approved") || s.includes("monitoring"))
    return { background: "#dcfce7", color: "#166534" };
  if (s.includes("new"))
    return { background: "#dbeafe", color: "#1d4ed8" };
  if (s.includes("progress") || s.includes("pending") || s.includes("investigating") || s.includes("reserved"))
    return { background: "#fef3c7", color: "#92400e" };
  if (s.includes("cancel") || s.includes("reject"))
    return { background: "#fee2e2", color: "#991b1b" };
  return { background: "#e5e7eb", color: "#374151" };
}

function getCategoryVisual(category: string) {
  if (category === MONITORING_TRAVEL_ORDER_CATEGORY)
    return { bg: "#ede9fe", color: "#5b21b6", icon: TravelIcon };
  if (category === MONITORING_MEETING_REQUEST_CATEGORY)
    return { bg: "#dcfce7", color: "#166534", icon: MeetingIcon };
  if (category === MONITORING_BORROWING_REQUEST_CATEGORY)
    return { bg: "#fef3c7", color: "#92400e", icon: BorrowIcon };
  return { bg: "#f1f5f9", color: "#475569", icon: TicketIcon };
}

function getTravelSchedule(requestDetails?: string) {
  const lines = requestDetails?.split(/\r?\n/).map((l) => l.trim()) ?? [];
  const departure = lines.find((l) => /^Departure:/i.test(l))?.replace(/^Departure:\s*/i, "").trim();
  const returnAt = lines.find((l) => /^Return:/i.test(l))?.replace(/^Return:\s*/i, "").trim();
  return { departure: departure || "—", returnAt: returnAt || "—" };
}

function getTravelPurpose(requestDetails?: string) {
  const line = requestDetails?.split(/\r?\n/).find((l) => /^Purpose of travel:/i.test(l.trim()));
  return line?.replace(/^Purpose of travel:\s*/i, "").trim() || null;
}

function extractUserNote(requestDetails?: string): string | null {
  if (!requestDetails) return null;
  const notes = requestDetails
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^[^:]{1,50}:\s/.test(l) && !/^[-•]/.test(l));
  return notes.length > 0 ? notes.join(" ") : null;
}

function isArchivedStatus(status: string) {
  const s = status.toLowerCase();
  return s.includes("closed") || s.includes("done") || s.includes("fulfilled") ||
    s.includes("resolved") || s.includes("meeting held") ||
    s.includes("cancel") || s.includes("reject");
}

function TravelIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14l4 4v4a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="7.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="2"/>
      <circle cx="17.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function MeetingIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function BorrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
      <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 0 0-2 2v3a2 2 0 0 1 0 4v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a2 2 0 0 1 0-4V7a2 2 0 0 0-2-2H5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function MyRequestsClient() {
  const currentUser = useCurrentUser();
  const rows = useQuery(api.monitoring.list, { view: "issues", showClosed: true });
  const [archiveOpen, setArchiveOpen] = useState(false);

  const currentDisplayName = normalizeName(currentUser?.displayName);
  const myRequests = useMemo(
    () =>
      (rows ?? []).filter((row) => {
        const requesterName = normalizeName(row.requesterName);
        const createdBy = normalizeName(row.createdBy);
        return requesterName === currentDisplayName || createdBy === currentDisplayName;
      }),
    [currentDisplayName, rows],
  );

  const activeRequests = useMemo(() => myRequests.filter((r) => !isArchivedStatus(r.status)), [myRequests]);
  const archivedRequests = useMemo(() => myRequests.filter((r) => isArchivedStatus(r.status)), [myRequests]);

  return (
    <div className="request-page">
      <div className="request-page-head" style={{ padding: "0 0 16px" }}>
        <div>
          <h1 className="request-page-title">My Requests</h1>
          <p className="request-page-subtitle">Track the requests you submitted.</p>
        </div>
        {activeRequests.length > 0 ? (
          <span className="my-requests-count">{activeRequests.length}</span>
        ) : null}
      </div>

      {rows === undefined ? (
        <p className="type-helper" style={{ padding: "24px 0" }}>Loading requests…</p>
      ) : myRequests.length === 0 ? (
        <div className="request-empty-state">
          <div className="request-empty-title">No requests to show yet.</div>
          <div className="request-empty-copy">Submitted requests will appear here.</div>
        </div>
      ) : (
        <>
        {activeRequests.length === 0 ? (
          <div className="request-empty-state">
            <div className="request-empty-title">No active requests.</div>
            <div className="request-empty-copy">All your requests have been closed or fulfilled.</div>
          </div>
        ) : (
        <div className="mr-card-grid">
          {activeRequests.map((request) => {
            const isTravelOrder = request.category === MONITORING_TRAVEL_ORDER_CATEGORY;
            const isMeeting = request.category === MONITORING_MEETING_REQUEST_CATEGORY;
            const isBorrowing = request.category === MONITORING_BORROWING_REQUEST_CATEGORY;
            const travelSchedule = isTravelOrder ? getTravelSchedule(request.requestDetails) : null;
            const travelPurpose = isTravelOrder ? getTravelPurpose(request.requestDetails) : null;
            const requestType = formatRequesterRequestType(request);
            const statusStyle = getStatusStyle(request.status);
            const { bg: iconBg, color: iconColor, icon: Icon } = getCategoryVisual(request.category);
            const hasFleet = isTravelOrder && (request.fleetDriverName || request.fleetVehicleName);
            const userNote = extractUserNote(request.requestDetails);
            const displayTitle = isMeeting
              ? request.title.replace(/^Meeting Support\s*-\s*/i, "").replace(/\s*-\s*[^-]*$/, "").trim() || request.title
              : isBorrowing
              ? userNote ?? requestType ?? request.category
              : request.title;

            return (
              <Link key={String(request._id)} href={`/requests/my/${request._id}`} className="mr-card">

                {/* Top: icon + status */}
                <div className="mr-card-top">
                  <div className="mr-card-icon" style={{ background: iconBg, color: iconColor }}>
                    <Icon />
                  </div>
                  <span className="mr-card-status" style={statusStyle}>{request.status}</span>
                </div>

                {/* Meta: category · time */}
                <div className="mr-card-meta">
                  <span>{request.category}</span>
                  <span className="mr-card-meta-sep">·</span>
                  <span>{timeAgo(request.createdAt)}</span>
                </div>

                {/* Title */}
                <div className="mr-card-title">{displayTitle}</div>

                {/* Tags */}
                <div className="mr-card-tags">
                  <span className="mr-card-tag">{request.ticketNumber}</span>
                  {request.sharedTripId ? (
                    <span className="mr-card-tag mr-card-tag--shared">Shared</span>
                  ) : null}
                  {requestType && requestType !== request.category ? (
                    <span className="mr-card-tag">{requestType}</span>
                  ) : null}
                </div>

                {/* Body: schedule / details / fleet */}
                <div className="mr-card-body">
                  {travelSchedule ? (
                    <div className="to-card-schedule">
                      <div>
                        <span className="to-card-schedule-label">Departure</span>
                        <span className="to-card-schedule-val">{travelSchedule.departure}</span>
                      </div>
                      <div>
                        <span className="to-card-schedule-label">Return</span>
                        <span className="to-card-schedule-val">{travelSchedule.returnAt}</span>
                      </div>
                    </div>
                  ) : request.meetingStartAt ? (
                    <div className="to-card-schedule">
                      <div>
                        <span className="to-card-schedule-label">Start</span>
                        <span className="to-card-schedule-val">{formatCompact(request.meetingStartAt)}</span>
                      </div>
                      <div>
                        <span className="to-card-schedule-label">{request.meetingEndAt ? "End" : "Location"}</span>
                        <span className="to-card-schedule-val">
                          {request.meetingEndAt ? formatCompact(request.meetingEndAt) : (request.meetingLocation ?? "—")}
                        </span>
                      </div>
                    </div>
                  ) : request.expectedReturnAt ? (
                    <div className="to-card-schedule">
                      <div>
                        <span className="to-card-schedule-label">Return by</span>
                        <span className="to-card-schedule-val">{formatCompact(request.expectedReturnAt)}</span>
                      </div>
                    </div>
                  ) : null}

                  {travelPurpose ? (
                    <div className="to-card-purpose">{travelPurpose}</div>
                  ) : isBorrowing && userNote ? (
                    <div className="to-card-purpose">{userNote}</div>
                  ) : !isMeeting && !isBorrowing && request.requestDetails ? (
                    <div className="to-card-purpose">
                      {request.requestDetails.slice(0, 80)}{request.requestDetails.length > 80 ? "…" : ""}
                    </div>
                  ) : null}

                  {isBorrowing && (request.borrowingItems?.length || request.requestedItemsText) ? (
                    <div className="to-card-fleet">
                      <span className="to-card-fleet-driver">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="2"/>
                          <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                        {request.borrowingItems?.length
                          ? `${request.borrowingItems.length} asset${request.borrowingItems.length > 1 ? "s" : ""} — ${request.borrowingItems.map((i) => i.assetTag).slice(0, 2).join(", ")}${request.borrowingItems.length > 2 ? "…" : ""}`
                          : request.requestedItemsText}
                      </span>
                    </div>
                  ) : null}

                  {isTravelOrder ? (
                    <div className="to-card-fleet">
                      {hasFleet ? (
                        <>
                          <span className="to-card-fleet-driver">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                            {request.fleetDriverName ?? "No driver"}
                          </span>
                          <span className="to-card-fleet-vehicle">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14l4 4v4a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="2"/><circle cx="17.5" cy="17.5" r="2.5" stroke="currentColor" strokeWidth="2"/></svg>
                            {request.fleetVehicleName ?? "No vehicle"}{request.fleetVehiclePlateNumber ? ` · ${request.fleetVehiclePlateNumber}` : ""}
                          </span>
                        </>
                      ) : (
                        <span className="to-card-fleet-empty">Pending fleet assignment</span>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Footer */}
                <div className="mr-card-footer">
                  <span className="mr-card-date">Submitted {formatDate(request.createdAt)}</span>
                  <span className="mr-card-cta">
                    View
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
        )}

        {archivedRequests.length > 0 && (
          <div className="mr-archive">
            <button
              className="mr-archive-toggle"
              onClick={() => setArchiveOpen((o) => !o)}
              aria-expanded={archiveOpen}
            >
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                style={{ transform: archiveOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
              >
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Archive
              <span className="mr-archive-count">{archivedRequests.length}</span>
            </button>

            {archiveOpen && (
              <div className="mr-archive-list">
                {archivedRequests.map((request) => {
                  const isBorrowing = request.category === MONITORING_BORROWING_REQUEST_CATEGORY;
                  const isMeeting = request.category === MONITORING_MEETING_REQUEST_CATEGORY;
                  const requestType = formatRequesterRequestType(request);
                  const userNote = extractUserNote(request.requestDetails);
                  const statusStyle = getStatusStyle(request.status);
                  const { bg: iconBg, color: iconColor, icon: Icon } = getCategoryVisual(request.category);
                  const displayTitle = isMeeting
                    ? request.title.replace(/^Meeting Support\s*-\s*/i, "").replace(/\s*-\s*[^-]*$/, "").trim() || request.title
                    : isBorrowing
                    ? userNote ?? requestType ?? request.category
                    : request.title;

                  return (
                    <Link key={String(request._id)} href={`/requests/my/${request._id}`} className="mr-archive-row">
                      <div className="mr-archive-row-icon" style={{ background: iconBg, color: iconColor }}>
                        <Icon />
                      </div>
                      <div className="mr-archive-row-main">
                        <span className="mr-archive-row-title">{displayTitle}</span>
                        <span className="mr-archive-row-meta">{request.ticketNumber} · {request.category} · {formatDate(request.createdAt)}</span>
                      </div>
                      <span className="mr-archive-row-status" style={statusStyle}>{request.status}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </>
      )}
    </div>
  );
}
