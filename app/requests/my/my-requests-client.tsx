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


function getPriorityLabel(priority?: string | null): string {
  if (priority === "P1") return "P1 — Critical";
  if (priority === "P2") return "P2 — High";
  if (priority === "P3") return "P3 — Medium";
  if (priority === "P4") return "P4 — Low";
  return "Normal";
}

function getPriorityTagStyle(priority?: string | null) {
  if (priority === "P1") return { color: "#991b1b", borderColor: "#fca5a5" };
  if (priority === "P2") return { color: "#ea580c", borderColor: "#fed7aa" };
  if (priority === "P3") return { color: "#b45309", borderColor: "#fde68a" };
  if (priority === "P4") return { color: "#166534", borderColor: "#bbf7d0" };
  return {};
}

function getProgress(status: string): number {
  const s = status.toLowerCase();
  if (s.includes("fulfilled") || s.includes("closed") || s.includes("done") || s.includes("resolved") || s.includes("meeting held"))
    return 100;
  if (s.includes("cancel") || s.includes("reject"))
    return 100;
  if (s.includes("monitoring") || s.includes("ready") || s.includes("approved") || s.includes("assigned") || s.includes("reserved"))
    return 50;
  if (s.includes("progress") || s.includes("investigating") || s.includes("pending") || s.includes("review"))
    return 25;
  return 0;
}

const AVATAR_COLORS = [
  { bg: "#dbeafe", color: "#1e40af" },
  { bg: "#dcfce7", color: "#166534" },
  { bg: "#fef3c7", color: "#92400e" },
  { bg: "#ede9fe", color: "#5b21b6" },
  { bg: "#ffedd5", color: "#c2410c" },
  { bg: "#fce7f3", color: "#9d174d" },
];

function getAvatarColor(name: string) {
  const hash = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase();
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

function formatMeetingSchedule(startAt?: number, endAt?: number): string | null {
  if (!startAt) return null;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" };
  const start = new Date(startAt).toLocaleString("en-US", opts);
  if (!endAt) return start;
  const end = new Date(endAt).toLocaleString("en-US", opts);
  return `${start} – ${end}`;
}

function getTravelPurpose(requestDetails?: string) {
  const line = requestDetails?.split(/\r?\n/).find((l) => /^Purpose of travel:/i.test(l.trim()));
  return line?.replace(/^Purpose of travel:\s*/i, "").trim() || null;
}

function getBorrowingPurpose(requestDetails?: string): string | null {
  const firstLine = requestDetails?.split(/\r?\n/)[0]?.trim();
  return firstLine || null;
}

function extractUserNote(requestDetails?: string): string | null {
  if (!requestDetails) return null;
  const notes = requestDetails
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^[^:]{1,50}:\s/.test(l) && !/^[-•]/.test(l));
  return notes.length > 0 ? notes.join(" ") : null;
}

function getCardDescription(request: {
  category: string;
  requestDetails?: string;
  requestedItemsText?: string;
  borrowingItems?: Array<{ assetTag: string }>;
}): string | null {
  if (request.category === MONITORING_TRAVEL_ORDER_CATEGORY) {
    return getTravelPurpose(request.requestDetails) ?? null;
  }
  if (request.category === MONITORING_BORROWING_REQUEST_CATEGORY) {
    const count = request.borrowingItems?.length ?? 0;
    if (count > 0) return `${count} equipment ${count === 1 ? "item" : "items"}`;
    return null;
  }
  if (request.requestDetails) {
    const cleaned = request.requestDetails
      .split(/\r?\n/)
      .filter((l) => l.trim() && !/^[A-Za-z ]{1,40}:\s/.test(l.trim()))
      .join(" ")
      .trim();
    return cleaned.slice(0, 140) || null;
  }
  return null;
}

function isArchivedStatus(status: string) {
  const s = status.toLowerCase();
  return s.includes("closed") || s.includes("done") || s.includes("fulfilled") ||
    s.includes("resolved") || s.includes("meeting held") ||
    s.includes("cancel") || s.includes("reject");
}



function ProgressCircle({ pct }: { pct: number }) {
  const r = 8;
  const circumference = 2 * Math.PI * r;
  const dash = (pct / 100) * circumference;
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r={r} fill="none" stroke="var(--border)" strokeWidth="2"/>
      {pct > 0 ? (
        <circle
          cx="10" cy="10" r={r}
          fill="none"
          stroke={pct === 100 ? "#22c55e" : "#4f6cf7"}
          strokeWidth="2"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          transform="rotate(-90 10 10)"
        />
      ) : null}
    </svg>
  );
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
            const requestType = formatRequesterRequestType(request);
            const displayTitle = isTravelOrder
              ? request.title.replace(/^Travel Order\s*[-–]\s*/i, "").trim() || request.title
              : isMeeting
              ? request.title.replace(/^Meeting Support\s*-\s*/i, "").replace(/\s*-\s*[^-]*$/, "").trim() || request.title
              : isBorrowing
              ? getBorrowingPurpose(request.requestDetails) ?? requestType ?? request.category
              : request.title;

            const { color: categoryColor, bg: categoryBg } = getCategoryVisual(request.category);
            const progress = getProgress(request.status);
            const initials = getInitials(request.requesterName);
            const avatarColor = getAvatarColor(request.requesterName ?? "");
            const description = isMeeting
              ? formatMeetingSchedule(request.meetingStartAt, request.meetingEndAt)
              : getCardDescription(request);

            return (
              <Link key={String(request._id)} href={`/requests/my/${request._id}`} className="mr-card">

                {/* Top row: ticket type + date */}
                <div className="mr-card-top">
                  <span className="mr-card-priority" style={{ background: categoryBg, color: categoryColor }}>
                    {isTravelOrder || isMeeting || isBorrowing ? request.category : "IT Support"}
                  </span>
                  <span className="mr-card-header-date">{request.ticketNumber}</span>
                </div>

                {/* Title */}
                <div className="mr-card-title">{displayTitle}</div>

                {/* Description */}
                {description ? (
                  <div className="mr-card-desc">{description}</div>
                ) : null}

                {/* Tags */}
                <div className="mr-card-tags">
                  {!isTravelOrder && !isMeeting && !isBorrowing ? (
                    <>
                      <span className="mr-card-tag"># {request.category}</span>
                      {request.priority ? (
                        <span className="mr-card-tag" style={getPriorityTagStyle(request.priority)}># {getPriorityLabel(request.priority)}</span>
                      ) : null}
                    </>
                  ) : isTravelOrder ? (
                    request.sharedTripId ? (
                      <span className="mr-card-tag mr-card-tag--shared"># Shared Trip</span>
                    ) : null
                  ) : isBorrowing ? (
                    <>
                      {request.expectedReturnAt ? (
                        <span className="mr-card-tag"># Return: {formatDate(request.expectedReturnAt)}</span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="mr-card-tag"># {request.ticketNumber}</span>
                      <span className="mr-card-tag"># {request.category}</span>
                      {request.sharedTripId ? (
                        <span className="mr-card-tag mr-card-tag--shared"># Shared Trip</span>
                      ) : null}
                    </>
                  )}
                </div>

                {/* Footer: submitted date + progress */}
                <div className="mr-card-footer">
                  <span className="mr-card-submitted">Submitted {formatDate(request.createdAt)}</span>
                  <div className="mr-card-progress">
                    <ProgressCircle pct={progress} />
                    <span>{progress}%</span>
                  </div>
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
                  const statusStyle = getStatusStyle(request.status);
                  const { bg: iconBg, color: iconColor, icon: Icon } = getCategoryVisual(request.category);
                  const displayTitle = isMeeting
                    ? request.title.replace(/^Meeting Support\s*-\s*/i, "").replace(/\s*-\s*[^-]*$/, "").trim() || request.title
                    : isBorrowing
                    ? getBorrowingPurpose(request.requestDetails) ?? requestType ?? request.category
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
