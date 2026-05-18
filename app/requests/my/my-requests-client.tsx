"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentUser } from "@/app/current-user-context";
import { formatRequesterAssetLabel, formatRequesterRequestType } from "@/lib/requestDisplay";

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

function formatDateTime(value?: number) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStatusTone(status: string) {
  const normalized = status.trim().toLowerCase();
  if (
    normalized.includes("closed") ||
    normalized.includes("done") ||
    normalized.includes("completed") ||
    normalized.includes("resolved") ||
    normalized.includes("fulfilled")
  ) {
    return "is-complete";
  }
  if (normalized.includes("progress") || normalized.includes("review") || normalized.includes("pending")) {
    return "is-active";
  }
  if (normalized.includes("cancel") || normalized.includes("reject")) {
    return "is-danger";
  }
  return "is-new";
}

export default function MyRequestsClient() {
  const currentUser = useCurrentUser();
  const rows = useQuery(api.monitoring.list, {
    view: "issues",
    showClosed: true,
  });
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

  return (
    <div className="request-page">
      <section className="panel request-page-panel">
        <div className="request-page-head">
          <div>
            <h1 className="request-page-title">My Requests</h1>
            <p className="request-page-subtitle">Track the requests you submitted.</p>
          </div>
          <span className="my-requests-count">{myRequests.length}</span>
        </div>

        {rows === undefined ? (
          <div className="request-empty-state">
            <div className="request-empty-title">Loading requests...</div>
          </div>
        ) : myRequests.length ? (
          <div className="my-requests-list">
            {myRequests.map((request) => {
              const linkedAssets =
                request.borrowingItems?.map((item) => item.assetTag).join(", ") ||
                request.requestedItemsText ||
                "";
              const assetLabel = formatRequesterAssetLabel(request);
              const contextLine = request.meetingStartAt
                ? `Scheduled: ${formatDateTime(request.meetingStartAt)}${request.meetingLocation ? ` - ${request.meetingLocation}` : ""}`
                : request.expectedReturnAt
                  ? `Expected return: ${formatDateTime(request.expectedReturnAt)}`
                  : request.approvalRequired
                    ? `Approval: ${request.approvalStage}`
                    : `Category: ${request.category}`;

              return (
                <Link key={String(request._id)} href={`/requests/my/${request._id}`} className="my-request-row">
                  <div className="my-request-main">
                    <div className="my-request-eyebrow">
                      <span>{request.ticketNumber}</span>
                      <span>{formatRequesterRequestType(request)}</span>
                    </div>
                    <div className="my-request-title">{request.title}</div>
                    <div className="my-request-meta">
                      {linkedAssets ? <span>{assetLabel}: {linkedAssets}</span> : null}
                      <span>{contextLine}</span>
                    </div>
                  </div>
                  <div className="my-request-side">
                    <span className={`my-request-status ${getStatusTone(request.status)}`}>{request.status}</span>
                    <span className="my-request-date">Submitted {formatDate(request.createdAt)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="request-empty-state">
            <div className="request-empty-title">No requests to show yet.</div>
            <div className="request-empty-copy">Submitted requests will appear here.</div>
          </div>
        )}
      </section>
    </div>
  );
}
