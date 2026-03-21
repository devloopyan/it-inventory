import type { ReactNode } from "react";

export type ActivityTone = "blue" | "green" | "amber" | "red" | "slate";

export type HardwareActivityRecord = {
  _id: string;
  inventoryId?: string;
  assetTag: string;
  assetNameDescription?: string;
  eventType: string;
  message: string;
  relatedPerson?: string;
  location?: string;
  status?: string;
  createdAt: number;
};

export function getActivityMeta(eventType: string): {
  label: string;
  tone: ActivityTone;
  urgent?: boolean;
} {
  switch (eventType) {
    case "asset_created":
      return { label: "Created", tone: "blue" };
    case "asset_updated":
      return { label: "Updated", tone: "slate" };
    case "status_changed":
      return { label: "Status Change", tone: "slate" };
    case "asset_assigned":
      return { label: "Assigned", tone: "blue" };
    case "asset_borrowed":
      return { label: "Borrowed", tone: "amber", urgent: true };
    case "asset_for_repair":
      return { label: "For Repair", tone: "red", urgent: true };
    case "asset_retired":
      return { label: "Retired", tone: "slate" };
    case "reservation_created":
      return { label: "Reserved", tone: "blue" };
    case "reservation_claimed":
      return { label: "Claimed", tone: "green" };
    case "reservation_cancelled":
      return { label: "Reservation Cancelled", tone: "amber" };
    case "asset_returned":
      return { label: "Returned", tone: "green" };
    case "drone_flight_report_uploaded":
      return { label: "Flight Report", tone: "blue" };
    case "receiving_form_uploaded":
      return { label: "Receiving Form", tone: "green" };
    case "turnover_form_uploaded":
      return { label: "Turnover Form", tone: "blue" };
    case "asset_deleted":
      return { label: "Deleted", tone: "red", urgent: true };
    default:
      return { label: "Activity", tone: "slate" };
  }
}

export function formatActivityTime(value: number) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function renderActivityIcon(eventType: string): ReactNode {
  switch (eventType) {
    case "reservation_created":
    case "reservation_claimed":
    case "reservation_cancelled":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 4H17V8H7V4Z" stroke="currentColor" strokeWidth="2" />
          <path d="M7 12H17V20H7V12Z" stroke="currentColor" strokeWidth="2" />
          <path d="M9 8V12" stroke="currentColor" strokeWidth="2" />
          <path d="M15 8V12" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "asset_borrowed":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 5L19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "asset_for_repair":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M14 6L18 10L10 18H6V14L14 6Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "receiving_form_uploaded":
    case "turnover_form_uploaded":
    case "drone_flight_report_uploaded":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 3H16L20 7V21H4V3H8Z" stroke="currentColor" strokeWidth="2" />
          <path d="M16 3V7H20" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "asset_returned":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M19 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
}
