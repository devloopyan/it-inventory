"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "@/app/current-user-context";

type Urgency = "overdue" | "today" | "soon" | "upcoming";

const AVATAR_PALETTE = [
  { bg: "#e0e7ff", color: "#3730a3" },
  { bg: "#dcfce7", color: "#166534" },
  { bg: "#fee2e2", color: "#991b1b" },
  { bg: "#fce7f3", color: "#9d174d" },
  { bg: "#ccfbf1", color: "#0f766e" },
  { bg: "#fef9c3", color: "#854d0e" },
];

const BADGE_BG: Record<Urgency, string> = {
  overdue: "#ef4444",
  today: "#f97316",
  soon: "#eab308",
  upcoming: "#6366f1",
};

function avatarColor(name: string) {
  let h = 0;
  for (const c of name) h = c.charCodeAt(0) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function urgency(ts: number): Urgency {
  const d = ts - Date.now();
  if (d < 0) return "overdue";
  if (d < 86400000) return "today";
  if (d < 3 * 86400000) return "soon";
  return "upcoming";
}

function relTime(ts: number) {
  const diff = Date.now() - ts;
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor(abs / 3600000);
  const mins = Math.floor(abs / 60000);
  if (diff > 0) {
    if (days > 0) return `${days}d overdue`;
    if (hours > 0) return `${hours}h overdue`;
    return `${mins}m overdue`;
  }
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

function desc(u: Urgency, items: Array<{ assetTag: string }>) {
  const tags = items.slice(0, 2).map((b) => b.assetTag).join(", ") + (items.length > 2 ? ` +${items.length - 2} more` : "");
  const subject = items.length ? tags : "borrowed equipment";
  if (u === "overdue") return `Return of ${subject} is overdue.`;
  if (u === "today") return `${subject} is due for return today.`;
  if (u === "soon") return `${subject} needs to be returned soon.`;
  return `Upcoming return for ${subject}.`;
}

export default function TopbarActivityMenu() {
  const pathname = usePathname();
  const currentUser = useCurrentUser();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const requesterName = currentUser?.displayName ?? currentUser?.username ?? "";
  const userRole = currentUser?.role ?? "";
  const userServiceGroups = currentUser?.serviceGroups ?? [];
  const isOsmdStaff = userRole === "admin" || userRole === "approver" || userServiceGroups.includes("OSMD");
  const isItStaff = userRole === "admin" || userRole === "it_staff" || userServiceGroups.includes("IT");
  const borrowingNotifications = useQuery(
    api.monitoring.listBorrowingNotifications,
    requesterName ? { requesterName } : "skip",
  );
  const meetingInvitations = useQuery(
    api.monitoring.listMeetingInvitations,
    requesterName ? { displayName: requesterName } : "skip",
  );
  const pendingMeetingApprovals = useQuery(
    api.monitoring.listPendingMeetingApprovals,
    isOsmdStaff ? {} : "skip",
  );
  const meetingRequestsForIT = useQuery(
    api.monitoring.listMeetingRequestsForIT,
    isItStaff ? {} : "skip",
  );
  const open = Boolean(pathname && openPath === pathname);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpenPath(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenPath(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const sortedBorrowing = (borrowingNotifications ?? []).slice().sort((a, b) => a.expectedReturnAt - b.expectedReturnAt);
  const unreadBorrowing = sortedBorrowing.filter((n) => { const u = urgency(n.expectedReturnAt); return u === "overdue" || u === "today"; });
  const inviteCount = meetingInvitations?.length ?? 0;
  const pendingApprovalItems = pendingMeetingApprovals ?? [];
  const itSetupItems = meetingRequestsForIT ?? [];
  const allItems: Array<{
    type: "borrow" | "invite" | "pending_approval" | "it_setup";
    data: (typeof sortedBorrowing)[0] | NonNullable<typeof meetingInvitations>[0] | (typeof pendingApprovalItems)[0] | (typeof itSetupItems)[0];
  }> =
    tab === "unread"
      ? [
          ...unreadBorrowing.map((d) => ({ type: "borrow" as const, data: d })),
          ...(meetingInvitations ?? []).map((d) => ({ type: "invite" as const, data: d })),
          ...pendingApprovalItems.map((d) => ({ type: "pending_approval" as const, data: d })),
          ...itSetupItems.map((d) => ({ type: "it_setup" as const, data: d })),
        ]
      : [
          ...sortedBorrowing.map((d) => ({ type: "borrow" as const, data: d })),
          ...(meetingInvitations ?? []).map((d) => ({ type: "invite" as const, data: d })),
          ...pendingApprovalItems.map((d) => ({ type: "pending_approval" as const, data: d })),
          ...itSetupItems.map((d) => ({ type: "it_setup" as const, data: d })),
        ];
  const unreadCount = unreadBorrowing.length + inviteCount + pendingApprovalItems.length + itSetupItems.length;
  const badge = unreadCount || sortedBorrowing.length;

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "min(460px, calc(100vw - 28px))",
            background: "var(--dropdown-menu-bg)",
            border: "1px solid var(--dropdown-menu-border)",
            borderRadius: 14,
            boxShadow: "var(--dropdown-card-outline, 0 0 0 1px rgba(0,0,0,.06)), var(--dropdown-card-shadow, 0 8px 24px rgba(0,0,0,.12))",
            padding: "14px 14px 10px",
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>Notifications</span>
            <button
              type="button"
              style={{ fontSize: 12, fontWeight: 500, color: "#4f46e5", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              Mark all as read
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--border-subtle)", marginLeft: -14, marginRight: -14, paddingLeft: 14, paddingRight: 8, gap: 0, marginBottom: 0 }}>
            <div style={{ display: "flex", flex: 1 }}>
              {(["all", "unread"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  style={{
                    padding: "8px 14px",
                    fontSize: 13,
                    fontWeight: tab === key ? 600 : 500,
                    color: tab === key ? "var(--foreground)" : "var(--muted-strong, #64748b)",
                    background: "none",
                    border: "none",
                    borderBottom: tab === key ? "2px solid #4f46e5" : "2px solid transparent",
                    marginBottom: -1,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {key === "all" ? "All Notifications" : `Unread${unreadCount ? ` (${unreadCount})` : ""}`}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="Filter"
              style={{ padding: 6, background: "none", border: "none", cursor: "pointer", color: "var(--muted-strong, #64748b)", display: "flex", alignItems: "center", borderRadius: 6 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M3 6H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M7 12H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M11 18H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", overflowX: "hidden", maxHeight: "min(400px, calc(100vh - 220px))", marginLeft: -14, marginRight: -14 }}>
            {borrowingNotifications === undefined && meetingInvitations === undefined ? (
              <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>Loading…</div>
            ) : allItems.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
                {tab === "unread" ? "No urgent notifications." : "No notifications."}
              </div>
            ) : (
              allItems.map((item, i) => {
                const av = avatarColor(item.data.requesterName);
                const isLast = i === allItems.length - 1;
                const rowStyle = { display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", textDecoration: "none", color: "inherit", borderBottom: isLast ? "none" : "1px solid var(--border-subtle)" } as const;

                if (item.type === "pending_approval") {
                  const appr = item.data as (typeof pendingApprovalItems)[0];
                  const meetingDate = appr.meetingStartAt
                    ? new Date(appr.meetingStartAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "Date TBD";
                  return (
                    <Link key={`appr-${String(appr._id)}`} href="/monitoring?tab=meetings" onClick={() => setOpenPath(null)} className="notif-card" style={rowStyle}>
                      <div style={{ position: "relative", flexShrink: 0, width: 42, height: 42 }}>
                        <div style={{ width: 42, height: 42, borderRadius: "50%", background: av.bg, color: av.color, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {initials(appr.requesterName)}
                        </div>
                        <div style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: "#f97316", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--dropdown-menu-bg)" }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                            <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 3 }}>{appr.requesterName}</div>
                        <div style={{ fontSize: 12, color: "var(--muted-strong, #64748b)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          New meeting request — awaiting Data Hub approval
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, paddingTop: 2 }}>
                        <span style={{ fontSize: 11, color: "var(--muted, #94a3b8)", whiteSpace: "nowrap" }}>{meetingDate}</span>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316", display: "block" }} />
                      </div>
                    </Link>
                  );
                }

                if (item.type === "it_setup") {
                  const setup = item.data as (typeof itSetupItems)[0];
                  const meetingDate = setup.meetingStartAt
                    ? new Date(setup.meetingStartAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "Date TBD";
                  return (
                    <Link key={`itsetup-${String(setup._id)}`} href="/monitoring?tab=meetings" onClick={() => setOpenPath(null)} className="notif-card" style={rowStyle}>
                      <div style={{ position: "relative", flexShrink: 0, width: 42, height: 42 }}>
                        <div style={{ width: 42, height: 42, borderRadius: "50%", background: av.bg, color: av.color, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {initials(setup.requesterName)}
                        </div>
                        <div style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: "#6366f1", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--dropdown-menu-bg)" }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2.2" />
                            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2.2" />
                          </svg>
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 3 }}>{setup.requesterName}</div>
                        <div style={{ fontSize: 12, color: "var(--muted-strong, #64748b)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          Approved by Data Hub — assign assets &amp; set up
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, paddingTop: 2 }}>
                        <span style={{ fontSize: 11, color: "var(--muted, #94a3b8)", whiteSpace: "nowrap" }}>{meetingDate}</span>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", display: "block" }} />
                      </div>
                    </Link>
                  );
                }

                if (item.type === "invite") {
                  const inv = item.data as NonNullable<typeof meetingInvitations>[0];
                  const meetingDate = inv.meetingStartAt
                    ? new Date(inv.meetingStartAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                    : "Date TBD";
                  return (
                    <Link key={`invite-${String(inv._id)}`} href="/monitoring?tab=meetings" onClick={() => setOpenPath(null)} className="notif-card" style={rowStyle}>
                      <div style={{ position: "relative", flexShrink: 0, width: 42, height: 42 }}>
                        <div style={{ width: 42, height: 42, borderRadius: "50%", background: av.bg, color: av.color, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {initials(inv.requesterName)}
                        </div>
                        <div style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: "#6366f1", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--dropdown-menu-bg)" }}>
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="2.4" />
                            <path d="M8 2V6M16 2V6M3 10H21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                          </svg>
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 3 }}>{inv.requesterName}</div>
                        <div style={{ fontSize: 12, color: "var(--muted-strong, #64748b)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          invited you to a meeting: {inv.title.replace(/^Meeting Support\s*-\s*/i, "")}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, paddingTop: 2 }}>
                        <span style={{ fontSize: 11, color: "var(--muted, #94a3b8)", whiteSpace: "nowrap" }}>{meetingDate}</span>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", display: "block" }} />
                      </div>
                    </Link>
                  );
                }

                const borrow = item.data as NonNullable<typeof borrowingNotifications>[0];
                const u = urgency(borrow.expectedReturnAt);
                const isUnread = u === "overdue" || u === "today";
                const unreturned = borrow.borrowingItems.filter((b) => !b.returnedAt);
                return (
                  <Link key={`borrow-${String(borrow._id)}`} href="/monitoring?tab=borrowing" onClick={() => setOpenPath(null)} className="notif-card" style={rowStyle}>
                    <div style={{ position: "relative", flexShrink: 0, width: 42, height: 42 }}>
                      <div style={{ width: 42, height: 42, borderRadius: "50%", background: av.bg, color: av.color, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {initials(borrow.requesterName)}
                      </div>
                      <div style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: BADGE_BG[u], color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--dropdown-menu-bg)" }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
                          <path d="M12 7V12L15 15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      </div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", marginBottom: 3 }}>{borrow.requesterName}</div>
                      <div style={{ fontSize: 12, color: "var(--muted-strong, #64748b)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {desc(u, unreturned)}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, paddingTop: 2 }}>
                      <span style={{ fontSize: 11, color: "var(--muted, #94a3b8)", whiteSpace: "nowrap" }}>{relTime(borrow.expectedReturnAt)}</span>
                      {isUnread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", display: "block" }} />}
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{ borderTop: "1px solid var(--border-subtle)", marginLeft: -14, marginRight: -14, marginTop: 4, paddingTop: 8, paddingLeft: 14, paddingRight: 14 }}>
            <Link
              href="/monitoring?tab=meetings"
              onClick={() => setOpenPath(null)}
              style={{ display: "block", textAlign: "center", fontSize: 13, fontWeight: 500, color: "#4f46e5", textDecoration: "none" }}
            >
              View All Notifications
            </Link>
          </div>
        </div>
      )}

      {/* Bell trigger */}
      <button
        type="button"
        className={`activity-trigger${open ? " open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open notifications"
        onClick={() => setOpenPath((prev) => (pathname && prev !== pathname ? pathname : null))}
      >
        <span className="activity-trigger-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M6 10C6 6.68629 8.68629 4 12 4C15.3137 4 18 6.68629 18 10V15L20 17H4L6 15V10Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M10 17C10 18.1046 10.8954 19 12 19C13.1046 19 14 18.1046 14 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        {badge > 0 && <span className="activity-trigger-badge">{badge}</span>}
      </button>
    </div>
  );
}
