"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/app/current-user-context";
import { formatRequesterAssetLabel, formatRequesterRequestType } from "@/lib/requestDisplay";

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
            <span>Expected Return</span>
            <strong>{formatDateTime(ticket.expectedReturnAt)}</strong>
          </div>
        </div>

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

        <section className="my-request-detail-block">
          <h2>Request Details</h2>
          <p>{ticket.requestDetails}</p>
        </section>
      </section>
    </div>
  );
}
