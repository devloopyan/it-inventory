"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/app/current-user-context";
import { formatRequesterAssetLabel, formatRequesterRequestType } from "@/lib/requestDisplay";
import {
  MONITORING_BORROWING_REQUEST_CATEGORY,
  MONITORING_MEETING_REQUEST_CATEGORY,
  normalizeMeetingRequestStatusValue,
} from "@/lib/monitoring";

function normalizeName(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function formatDateTime(value?: number) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStatusBadgeStyle(status: string) {
  const s = status.toLowerCase();
  if (s.includes("closed") || s.includes("done") || s.includes("fulfilled") || s.includes("resolved") || s.includes("meeting held"))
    return { background: "#dcfce7", color: "#166534" };
  if (s.includes("assigned") || s.includes("approved") || s.includes("monitoring"))
    return { background: "#dcfce7", color: "#166534" };
  if (s.includes("new"))
    return { background: "#dbeafe", color: "#1d4ed8" };
  if (s.includes("progress") || s.includes("pending") || s.includes("investigating") || s.includes("reserved") || s.includes("claimed"))
    return { background: "#fef3c7", color: "#92400e" };
  if (s.includes("cancel") || s.includes("reject"))
    return { background: "#fee2e2", color: "#991b1b" };
  return { background: "#e5e7eb", color: "#374151" };
}

type ParsedDetails = {
  notes: string[];
  pairs: Array<{ key: string; value: string }>;
  lists: Array<{ header: string; items: string[] }>;
};

function parseDetailsText(text: string): ParsedDetails {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const notes: string[] = [];
  const pairs: Array<{ key: string; value: string }> = [];
  const lists: Array<{ header: string; items: string[] }> = [];
  let currentList: { header: string; items: string[] } | null = null;

  for (const line of lines) {
    if (/^[-•]/.test(line)) {
      const item = line.replace(/^[-•]\s*/, "");
      if (currentList) {
        currentList.items.push(item);
      } else {
        const anon = { header: "", items: [item] };
        lists.push(anon);
        currentList = anon;
      }
      continue;
    }
    currentList = null;
    const kvMatch = line.match(/^([^:]{1,50}):\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const val = kvMatch[2].replace(/\.$/, "").trim();
      if (val) {
        pairs.push({ key, value: val });
      } else {
        const listEntry = { header: key, items: [] };
        lists.push(listEntry);
        currentList = listEntry;
      }
    } else {
      notes.push(line);
    }
  }

  return { notes, pairs, lists };
}

type RequestProgressStep = {
  label: string;
  statuses: readonly string[];
};

function resolveProgressSteps(args: {
  category: string;
  workflowType?: string;
  approvalRequired?: boolean;
}): RequestProgressStep[] {
  if (args.category === MONITORING_MEETING_REQUEST_CATEGORY) {
    return [
      { label: "New", statuses: ["New"] },
      { label: "Reserved", statuses: ["Reserved"] },
      { label: "Ready", statuses: ["Ready"] },
      { label: "Done", statuses: ["Done", "Closed"] },
    ];
  }

  if (args.category === MONITORING_BORROWING_REQUEST_CATEGORY) {
    return [
      { label: "Requested", statuses: ["New", "Triage", "Pending Approval", "For Revision"] },
      { label: "Reserved", statuses: ["Reserved"] },
      { label: "Claimed", statuses: ["Claimed", "In Progress"] },
      { label: "Returned", statuses: ["Fulfilled"] },
      { label: "Closed", statuses: ["Closed"] },
    ];
  }

  if (args.workflowType === "incident") {
    return [
      { label: "New", statuses: ["New"] },
      { label: "Triage", statuses: ["Triage", "Pending"] },
      { label: "In Progress", statuses: ["In Progress"] },
      { label: "Resolved", statuses: ["Resolved", "Closed"] },
    ];
  }

  return [
    { label: "New", statuses: ["New", "Triage"] },
    {
      label: args.approvalRequired ? "Approval" : "Review",
      statuses: ["Pending Approval", "For Revision", "Pending"],
    },
    { label: "In Progress", statuses: ["In Progress"] },
    { label: "Fulfilled", statuses: ["Fulfilled", "Closed"] },
  ];
}

function resolveProgressIndex(steps: RequestProgressStep[], status: string) {
  const normalizedStatus = normalizeMeetingRequestStatusValue(status) ?? status;
  const matchedIndex = steps.findIndex((step) => step.statuses.includes(normalizedStatus));
  return matchedIndex >= 0 ? matchedIndex : 0;
}

function DetailsBlock({ text }: { text?: string }) {
  if (!text?.trim()) return <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>No details provided.</p>;

  const { notes, pairs, lists } = parseDetailsText(text);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {notes.length > 0 && (
        <div style={{
          padding: "12px 14px",
          background: "var(--surface-subtle)",
          borderRadius: 8,
          borderLeft: "3px solid var(--border)",
          fontSize: 13,
          color: "var(--foreground)",
          lineHeight: 1.6,
        }}>
          {notes.join(" ")}
        </div>
      )}

      {pairs.length > 0 && (
        <div style={{ display: "grid", gap: 1, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
          {pairs.map(({ key, value }) => (
            <div key={key} style={{
              display: "grid",
              gridTemplateColumns: "160px 1fr",
              gap: 12,
              padding: "9px 14px",
              background: "var(--surface)",
              fontSize: 13,
              borderBottom: "1px solid var(--border-subtle)",
            }}>
              <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 12 }}>{key}</span>
              <span style={{ color: "var(--foreground)" }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {lists.map((list, i) => (
        <div key={i} style={{ display: "grid", gap: 4 }}>
          {list.header && (
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)" }}>
              {list.header}
            </span>
          )}
          <div style={{ display: "grid", gap: 1, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
            {list.items.map((item, j) => (
              <div key={j} style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 14px",
                background: "var(--surface)",
                fontSize: 13,
                borderBottom: "1px solid var(--border-subtle)",
                color: "var(--foreground)",
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--muted)", flexShrink: 0 }} />
                {item}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function MyRequestDetailClient({ ticketId }: { ticketId: Id<"monitoringTickets"> }) {
  const currentUser = useCurrentUser();
  const detail = useQuery(api.monitoring.getById, { ticketId });
  const ticket = detail?.ticket;
  const isOwnRequest =
    ticket &&
    (normalizeName(ticket.requesterName) === normalizeName(currentUser?.displayName) ||
      normalizeName(ticket.createdBy) === normalizeName(currentUser?.displayName));

  if (detail === undefined) {
    return (
      <div className="request-page">
        <section className="request-page-panel">
          <div className="request-empty-state">
            <div className="request-empty-title">Loading request...</div>
          </div>
        </section>
      </div>
    );
  }

  if (!ticket || !isOwnRequest) {
    return (
      <div className="request-page">
        <section className="request-page-panel">
          <div className="request-page-head">
            <div>
              <h1 className="request-page-title">Request Not Available</h1>
              <p className="request-page-subtitle">This request could not be found for your account.</p>
            </div>
            <Link href="/requests/my" className="btn-secondary">
              Back
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const assetLabel = formatRequesterAssetLabel(ticket);
  const attachments = detail.attachments;
  const approvalHistory = detail.approvalHistory;
  const progressSteps = resolveProgressSteps({
    category: ticket.category,
    workflowType: ticket.workflowType,
    approvalRequired: ticket.approvalRequired,
  });
  const progressIndex = resolveProgressIndex(progressSteps, ticket.status);
  const isBorrowing = ticket.category === MONITORING_BORROWING_REQUEST_CATEGORY;

  return (
    <div className="request-page">
      <section className="request-page-panel">
        <div className="request-page-head">
          <div>
            <h1 className="request-page-title">{ticket.ticketNumber}</h1>
            <p className="request-page-subtitle">
              {ticket.category}
              {" · "}
              {ticket.createdBy}
              {ticket.borrowingItems?.[0]?.assetTag ? ` · ${ticket.borrowingItems[0].assetTag}` : null}
            </p>
          </div>
          <Link href="/requests/my" className="btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back
          </Link>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 4 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "13px 16px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", color: "var(--muted)", marginBottom: 6 }}>Status</div>
            <span style={{ ...getStatusBadgeStyle(ticket.status), display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              {ticket.status}
            </span>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "13px 16px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", color: "var(--muted)", marginBottom: 6 }}>Request Type</div>
            <span style={{ background: "#eff4ff", color: "#2563eb", display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
              {formatRequesterRequestType(ticket)}
            </span>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "13px 16px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", color: "var(--muted)", marginBottom: 6 }}>Submitted</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{formatDateTime(ticket.createdAt)}</div>
          </div>
        </div>

        <section className="my-request-detail-block">
          <h2>Progress</h2>
          <div style={{ display: "flex", alignItems: "flex-start", padding: "20px 16px 16px" }} aria-label="Request progress">
            {progressSteps.map((step, index) => {
              const isDone = index < progressIndex;
              const isCurrent = index === progressIndex;
              const isLast = index === progressSteps.length - 1;
              return (
                <div key={step.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
                  {!isLast && (
                    <div style={{
                      position: "absolute",
                      top: 15,
                      left: "calc(50% + 17px)",
                      right: "calc(-50% + 17px)",
                      height: 2,
                      background: isDone ? "#22c55e" : "var(--border)",
                      zIndex: 0,
                    }} />
                  )}
                  <div style={{
                    width: 32, height: 32,
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700,
                    border: `2px solid ${isDone ? "#22c55e" : isCurrent ? "var(--foreground)" : "var(--border)"}`,
                    background: isDone ? "#22c55e" : isCurrent ? "var(--foreground)" : "var(--surface)",
                    color: isDone || isCurrent ? "#fff" : "var(--muted)",
                    position: "relative", zIndex: 1,
                  }}>
                    {isDone ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>
                  <span style={{
                    marginTop: 8,
                    fontSize: 11.5, fontWeight: 600,
                    color: isDone ? "#22c55e" : isCurrent ? "var(--foreground)" : "var(--muted)",
                    textAlign: "center",
                    whiteSpace: "nowrap",
                  }}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {ticket.borrowingItems?.length ? (
          <section className="request-selected-assets">
            <div className="request-selected-assets-head">
              <h2>{assetLabel}</h2>
              <span className="request-type-status">{ticket.borrowingItems.length}</span>
            </div>
            <div style={{ display: "grid", gap: 8, padding: "16px 20px" }}>
              {ticket.borrowingItems.map((item) => (
                <div key={String(item.assetId)} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px",
                  background: "var(--surface-subtle)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                }}>
                  <div style={{
                    width: 40, height: 40, flexShrink: 0,
                    borderRadius: 9,
                    background: "#dcfce7",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#166534",
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                    </svg>
                  </div>
                  <div>
                    <span style={{
                      fontFamily: "monospace",
                      fontSize: 11, fontWeight: 500,
                      color: "#166534", background: "#dcfce7",
                      borderRadius: 4, padding: "2px 6px",
                      display: "inline-block", marginBottom: 3,
                    }}>
                      {item.assetTag}
                    </span>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{item.assetLabel}</div>
                  </div>
                  {item.releaseCondition ? (
                    <span style={{
                      marginLeft: "auto", flexShrink: 0,
                      fontSize: 11.5, fontWeight: 700,
                      color: "#166534", background: "#dcfce7",
                      borderRadius: 20, padding: "4px 11px",
                    }}>
                      ✓ {item.releaseCondition}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {ticket.meetingStartAt || ticket.meetingLocation ? (
          <section className="my-request-detail-block">
            <h2>Meeting Schedule</h2>
            <div className="my-request-detail-grid">
              <div>
                <span>Start</span>
                <strong>{formatDateTime(ticket.meetingStartAt)}</strong>
              </div>
              <div>
                <span>End</span>
                <strong>{formatDateTime(ticket.meetingEndAt)}</strong>
              </div>
              <div>
                <span>Location / Platform</span>
                <strong>{ticket.meetingLocation || "-"}</strong>
              </div>
              <div>
                <span>Attendees</span>
                <strong>{ticket.meetingAttendeeCount || "-"}</strong>
              </div>
            </div>
          </section>
        ) : null}

        <section className="my-request-detail-block">
          <h2>Request Details</h2>
          {isBorrowing ? (
            <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              {[
                { label: "Purpose", value: ticket.requestDetails.split(/\r?\n/)[0]?.trim() || "-", mono: false },
                { label: "Requested Date", value: ticket.requestedBorrowDate ? formatDateTime(ticket.requestedBorrowDate) : "-", mono: true },
                { label: "Expected Return", value: ticket.expectedReturnAt ? formatDateTime(ticket.expectedReturnAt) : "-", mono: true },
              ].map(({ label, value, mono }, i, arr) => (
                <div key={label} style={{
                  display: "flex", alignItems: "center",
                  padding: "12px 16px", gap: 12,
                  borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
                  background: "var(--surface)",
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", minWidth: 130 }}>{label}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)", fontFamily: mono ? "monospace" : "inherit" }}>{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <DetailsBlock text={ticket.requestDetails} />
          )}
        </section>

        {approvalHistory.length ? (
          <section className="my-request-detail-block">
            <h2>Approval History</h2>
            <div className="my-request-attachment-list">
              {approvalHistory.map((entry) => (
                <div key={entry._id} className="my-request-attachment-row">
                  <div>
                    <strong>{entry.approver}</strong>
                    <span>{entry.note || entry.reference || "No note provided"}</span>
                  </div>
                  <span>{entry.decision}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="my-request-detail-block">
          <h2>Attachments</h2>
          {attachments.length ? (
            <div className="my-request-attachment-list">
              {attachments.map((attachment) => (
                <div key={String(attachment.storageId)} className="my-request-attachment-row">
                  <div>
                    <strong>{attachment.label}</strong>
                    <span>{attachment.fileName}</span>
                  </div>
                  {attachment.url ? (
                    <a href={attachment.url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : (
                    <span>Unavailable</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 28, color: "var(--muted)" }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "var(--surface-subtle)", border: "1px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>No attachments uploaded.</p>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
