"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function formatWhen(value?: number) {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Shows Travel Orders waiting on the current user's approval step.
// Renders nothing when there are none (so it's safe on any dashboard).
export default function TravelApprovalsCard({ username }: { username?: string }) {
  const pending = useQuery(
    api.monitoring.listTravelApprovalsForUser,
    username ? { username } : "skip",
  );

  if (!pending || pending.length === 0) return null;

  return (
    <section
      style={{
        border: "1px solid #fde68a",
        background: "#fffbeb",
        borderRadius: 14,
        padding: "16px 18px",
        display: "grid",
        gap: 12,
      }}
      aria-label="Travel orders awaiting your approval"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "#92400e",
            background: "#fef3c7",
            border: "1px solid #fde68a",
            borderRadius: 999,
            padding: "2px 9px",
          }}
        >
          {pending.length}
        </span>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#92400e" }}>
          Travel Orders awaiting your approval
        </h2>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        {pending.map((p) => {
          const when = formatWhen(p.travelDepartAt);
          return (
            <Link
              key={String(p._id)}
              href={`/monitoring/${String(p._id)}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 12px",
                background: "#fff",
                border: "1px solid #fde68a",
                borderRadius: 10,
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>
                  {p.ticketNumber} · {p.requesterName}
                </span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {p.title}
                  {p.requesterDepartment ? ` · ${p.requesterDepartment}` : ""}
                  {when ? ` · departs ${when}` : ""}
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "#92400e",
                  background: "#fef3c7",
                  borderRadius: 999,
                  padding: "3px 10px",
                  whiteSpace: "nowrap",
                }}
              >
                Your step: {p.stepRole}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
