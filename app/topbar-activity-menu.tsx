"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  formatActivityTime,
  getActivityMeta,
  renderActivityIcon,
  type HardwareActivityRecord,
} from "@/lib/hardwareActivity";

export default function TopbarActivityMenu() {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const activityMenuRef = useRef<HTMLDivElement | null>(null);
  const activityFeed = useQuery(
    (api.hardwareInventory as Record<string, unknown>)["listRecentActivity"] as never,
    { limit: 6 } as never,
  ) as unknown as HardwareActivityRecord[] | undefined;
  const activityMenuOpen = Boolean(pathname && openPath === pathname);

  useEffect(() => {
    if (!activityMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!activityMenuRef.current?.contains(event.target as Node)) {
        setOpenPath(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPath(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [activityMenuOpen]);

  const activityCount = activityFeed?.length ?? 0;

  return (
    <div className="account-menu-wrap" ref={activityMenuRef}>
      {activityMenuOpen ? (
        <div className="account-dropdown activity-dropdown" role="menu" aria-label="Recent activities">
          <div className="activity-dropdown-head">
            <div>
              <div className="activity-dropdown-title">Activities</div>
              <div className="activity-dropdown-subtitle">Latest inventory and reservation events</div>
            </div>
            <span className="activity-dropdown-count">{activityCount}</span>
          </div>

          <div className="account-dropdown-divider" />

          <div className="activity-feed activity-feed-scroll activity-dropdown-list">
            {activityFeed?.map((event) => {
              const meta = getActivityMeta(event.eventType);
              const destination = event.inventoryId ? `/hardware-inventory/${event.inventoryId}` : "/dashboard";

              return (
                <Link
                  key={event._id}
                  href={destination}
                  className={`activity-feed-card activity-dropdown-card${meta.urgent ? " urgent" : ""}`}
                  onClick={() => setOpenPath(null)}
                >
                  <div className="activity-feed-main">
                    <div className={`activity-feed-icon tone-${meta.tone}`}>{renderActivityIcon(event.eventType)}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="activity-feed-topline">
                        <span className={`activity-feed-chip tone-${meta.tone}`}>{meta.label}</span>
                        <span className="activity-feed-time">{formatActivityTime(event.createdAt)}</span>
                      </div>
                      <div className="activity-feed-title">
                        {event.assetTag}
                        {event.assetNameDescription ? ` - ${event.assetNameDescription}` : ""}
                      </div>
                      <div className="activity-feed-message">{event.message}</div>
                      <div className="activity-feed-meta">
                        <span>{event.relatedPerson || "No person linked"}</span>
                        <span>{event.location || "-"}</span>
                        <span>{event.status || "-"}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}

            {!activityFeed?.length ? (
              <div className="activity-feed-empty">
                No structured activity events yet. New inventory actions will start appearing here.
              </div>
            ) : null}
          </div>

          <div className="account-dropdown-divider" />

          <Link href="/dashboard" className="activity-dropdown-footer" onClick={() => setOpenPath(null)}>
            Open Dashboard
          </Link>
        </div>
      ) : null}

      <button
        type="button"
        className={`activity-trigger${activityMenuOpen ? " open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={activityMenuOpen}
        aria-label="Open activities"
        onClick={() => setOpenPath((prev) => (pathname && prev !== pathname ? pathname : null))}
      >
        <span className="activity-trigger-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M5 18H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M7 13H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M10 8H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="activity-trigger-label">Activities</span>
        <span className="activity-trigger-badge">{activityCount}</span>
      </button>
    </div>
  );
}
