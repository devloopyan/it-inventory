"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type RequesterDashboardAsset = {
  _id: string;
  assetTag: string;
  assetType?: string;
  assetNameDescription?: string;
  specifications?: string;
  imageStorageId?: Id<"_storage">;
  status?: string;
  borrower?: string;
  turnoverTo?: string;
  reservationBorrower?: string;
  reservationStatus?: string;
};

type RequesterDashboardMeeting = {
  _id: string;
  title: string;
  eventStartAt: number;
  eventEndAt?: number;
  meetingLocation?: string;
  contextLine?: string;
  status: string;
};

type RequesterDashboardProps = {
  equipmentLoading: boolean;
  unavailableLoading: boolean;
  meetingsLoading: boolean;
  availableEquipment: RequesterDashboardAsset[];
  unavailableEquipment: RequesterDashboardAsset[];
  upcomingMeetings: RequesterDashboardMeeting[];
  borrowingListRows: RequesterDashboardAsset[];
  borrowingListIds: string[];
  openBorrowingAssetIds: Set<string>;
  onAddBorrowingItem: (inventoryId: string) => void;
  onRemoveBorrowingItem: (inventoryId: string) => void;
};

type RequesterAssetThumbnailProps = {
  storageId?: Id<"_storage">;
  assetType?: string;
  label: string;
};

function getAssetThumbnailLabel(assetType?: string) {
  const words = assetType?.trim().split(/\s+/).filter(Boolean) ?? [];
  const initials = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  return initials || "IT";
}

function RequesterAssetThumbnail({ storageId, assetType, label }: RequesterAssetThumbnailProps) {
  const imageUrl = useQuery(
    api.hardwareInventory.getImageUrl,
    storageId ? { storageId } : "skip",
  );

  return (
    <div className="requester-asset-thumb" aria-hidden={!imageUrl}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={`${label} image`} />
      ) : (
        <span>{getAssetThumbnailLabel(assetType)}</span>
      )}
    </div>
  );
}

function isReservedAsset(row: RequesterDashboardAsset) {
  return row.reservationStatus === "Reserved";
}

function formatMeetingTime(start: number, end?: number) {
  const startDate = new Date(start);
  const startLabel = startDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (!end) return startLabel;

  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  const endLabel = sameDay
    ? endDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : endDate.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

  return `${startLabel} - ${endLabel}`;
}

export default function RequesterDashboard({
  equipmentLoading,
  unavailableLoading,
  meetingsLoading,
  availableEquipment,
  unavailableEquipment,
  upcomingMeetings,
  borrowingListRows,
  borrowingListIds,
  openBorrowingAssetIds,
  onAddBorrowingItem,
  onRemoveBorrowingItem,
}: RequesterDashboardProps) {
  return (
    <div className="dashboard-page requester-dashboard">
      <section className="panel requester-dashboard-hero">
        <div>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">
            Check equipment and meeting availability before sending a request.
          </p>
        </div>
        <Link href="/requests/new" className="btn-primary requester-dashboard-action">
          New Request
        </Link>
      </section>

      <div className="requester-dashboard-grid">
        <section className="panel requester-dashboard-section">
          <div className="requester-section-head">
            <div>
              <h2>Available Equipment</h2>
              <p>Main storage items that can be requested.</p>
            </div>
            <span className="requester-count-pill">{availableEquipment.length}</span>
          </div>

          <div className="requester-list">
            {equipmentLoading ? (
              <div className="requester-empty">Loading equipment...</div>
            ) : availableEquipment.length ? (
              availableEquipment.map((row) => {
                const inventoryId = String(row._id);
                const isSelected = borrowingListIds.includes(inventoryId);

                return (
                  <div key={inventoryId} className="requester-list-row">
                    <RequesterAssetThumbnail
                      storageId={row.imageStorageId}
                      assetType={row.assetType}
                      label={row.assetNameDescription || row.assetTag}
                    />
                    <div className="requester-row-main">
                      <div className="requester-row-title">{row.assetNameDescription || row.assetTag}</div>
                      <div className="requester-row-copy">
                        {[row.assetTag, row.assetType, row.specifications].filter(Boolean).join(" - ")}
                      </div>
                    </div>
                    {isSelected ? (
                      <span className="requester-row-added-label">Added</span>
                    ) : (
                      <button
                        type="button"
                        className="requester-row-add-btn"
                        onClick={() => onAddBorrowingItem(inventoryId)}
                      >
                        Add
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="requester-empty">No equipment is available for a new request right now.</div>
            )}
          </div>

          <div className="requester-borrowing-list">
            <div className="requester-borrowing-list-head">
              <div>
                <h3>Borrowing List</h3>
                <p>Items selected for a borrowing request.</p>
              </div>
            </div>

            {borrowingListRows.length ? (
              <div className="requester-borrowing-list-items">
                {borrowingListRows.map((row) => {
                  const inventoryId = String(row._id);

                  return (
                    <div key={inventoryId} className="requester-borrowing-list-row">
                      <span className="requester-borrowing-item-name">
                        {row.assetNameDescription || row.assetTag}
                      </span>
                      <button
                        type="button"
                        className="requester-row-remove-btn"
                        onClick={() => onRemoveBorrowingItem(inventoryId)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
                <div className="requester-borrowing-list-actions">
                  <Link
                    href={`/requests/new/equipment-borrower?assets=${encodeURIComponent(borrowingListIds.join(","))}`}
                    className="btn-primary requester-dashboard-action"
                  >
                    Continue Request
                  </Link>
                </div>
              </div>
            ) : (
              <div className="requester-empty">No items added yet.</div>
            )}
          </div>
        </section>

        <section className="panel requester-dashboard-section">
          <div className="requester-section-head">
            <div>
              <h2>Requested / Reserved / Borrowed Equipment</h2>
              <p>Items that are not available to request right now.</p>
            </div>
          </div>

          <div className="requester-list">
            {unavailableLoading ? (
              <div className="requester-empty">Loading unavailable equipment...</div>
            ) : unavailableEquipment.length ? (
              unavailableEquipment.map((row) => {
                const inventoryId = String(row._id);
                const reserved = isReservedAsset(row);
                const requested = !reserved && row.status !== "Borrowed" && openBorrowingAssetIds.has(inventoryId);
                const borrower =
                  row.borrower ||
                  row.reservationBorrower ||
                  row.turnoverTo ||
                  "Not listed";

                return (
                  <div key={inventoryId} className="requester-list-row">
                    <RequesterAssetThumbnail
                      storageId={row.imageStorageId}
                      assetType={row.assetType}
                      label={row.assetNameDescription || row.assetTag}
                    />
                    <div className="requester-row-main">
                      <div className="requester-row-title">{row.assetNameDescription || row.assetTag}</div>
                      <div className="requester-row-copy">
                        {row.assetTag} -{" "}
                        {requested ? "Request pending" : `${reserved ? "Reserved for:" : "Borrower:"} ${borrower}`}
                      </div>
                    </div>
                    <span
                      className={`requester-status-pill${
                        requested ? " is-requested" : reserved ? " is-reserved" : " is-borrowed"
                      }`}
                    >
                      {requested ? "Requested" : reserved ? "Reserved" : "Borrowed"}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="requester-empty">No requested, reserved, or borrowed equipment right now.</div>
            )}
          </div>
        </section>
      </div>

      <section className="panel requester-dashboard-section">
        <div className="requester-section-head">
          <div>
            <h2>Meeting Availability</h2>
            <p>Upcoming meeting bookings and support schedules.</p>
          </div>
        </div>

        <div className="requester-list">
          {meetingsLoading ? (
            <div className="requester-empty">Loading meeting schedule...</div>
          ) : upcomingMeetings.length ? (
            upcomingMeetings.map((event) => (
              <div key={event._id} className="requester-list-row">
                <div>
                  <div className="requester-row-title">{event.title}</div>
                  <div className="requester-row-copy">
                    {new Date(event.eventStartAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    {formatMeetingTime(event.eventStartAt, event.eventEndAt)}
                    {event.meetingLocation || event.contextLine ? ` - ${event.meetingLocation || event.contextLine}` : ""}
                  </div>
                </div>
                <span className="requester-status-pill is-meeting">{event.status}</span>
              </div>
            ))
          ) : (
            <div className="requester-empty">No upcoming meetings are scheduled in this view.</div>
          )}
        </div>
      </section>
    </div>
  );
}
