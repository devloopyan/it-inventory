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
        <section className="panel request-page-panel">
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
        <section className="panel request-page-panel">
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

  return (
    <div className="request-page">
      <section className="panel request-page-panel">
        <div className="request-page-head">
          <div>
            <h1 className="request-page-title">{ticket.ticketNumber}</h1>
            <p className="request-page-subtitle">{ticket.title}</p>
          </div>
          <Link href="/requests/my" className="btn-secondary">
            Back
          </Link>
        </div>

        <div className="my-request-detail-summary">
          <div>
            <span>Status</span>
            <strong>{ticket.status}</strong>
          </div>
          <div>
            <span>Request Type</span>
            <strong>{formatRequesterRequestType(ticket)}</strong>
          </div>
          <div>
            <span>Submitted</span>
            <strong>{formatDateTime(ticket.createdAt)}</strong>
          </div>
          <div>
            <span>{ticket.expectedReturnAt ? "Expected Return" : "Approval"}</span>
            <strong>{ticket.expectedReturnAt ? formatDateTime(ticket.expectedReturnAt) : ticket.approvalStage}</strong>
          </div>
        </div>

        <section className="my-request-detail-block">
          <h2>Progress</h2>
          <div className="req-progress-bar" aria-label="Request progress">
            {/* Track line */}
            <div className="req-progress-track">
              <div
                className="req-progress-fill"
                style={{
                  width: progressSteps.length <= 1
                    ? "100%"
                    : `${(progressIndex / (progressSteps.length - 1)) * 100}%`,
                }}
              />
            </div>
            {/* Nodes */}
            {progressSteps.map((step, index) => {
              const isDone = index < progressIndex;
              const isCurrent = index === progressIndex;
              return (
                <div key={step.label} className="req-progress-node">
                  <div className={`req-progress-circle${isDone ? " is-done" : isCurrent ? " is-current" : ""}`}>
                    {isDone ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </div>
                  <span className={`req-progress-label${isCurrent ? " is-current" : isDone ? " is-done" : ""}`}>
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
            <div className="request-selected-asset-list">
              {ticket.borrowingItems.map((item) => (
                <div key={String(item.assetId)} className="request-selected-asset-row">
                  <strong>{item.assetTag}</strong>
                  <span>{item.assetLabel}</span>
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
          <DetailsBlock text={ticket.requestDetails} />
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
            <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>No attachments uploaded.</p>
          )}
        </section>
      </section>
    </div>
  );
}
