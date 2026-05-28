"use client";

import { Suspense, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { REQUEST_TYPES } from "@/lib/requestTypes";
import MyRequestsClient from "./my/my-requests-client";

const REQUESTS_TABS = [
  {
    key: "new",
    label: "New Request",
    description: "Submit a new request to IT.",
  },
  {
    key: "my",
    label: "My Requests",
    description: "Track requests you have submitted.",
  },
] as const;

type RequestsTabKey = (typeof REQUESTS_TABS)[number]["key"];

function isRequestsTabKey(value: string | null): value is RequestsTabKey {
  return REQUESTS_TABS.some((tab) => tab.key === value);
}

function RequestsTabsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPathname = pathname ?? "/requests";
  const tabParam = searchParams?.get("tab") ?? null;
  const activeTab: RequestsTabKey = isRequestsTabKey(tabParam) ? tabParam : "new";

  const setActiveTab = useCallback(
    (key: RequestsTabKey) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (key === "new") {
        params.delete("tab");
      } else {
        params.set("tab", key);
      }
      const query = params.toString();
      router.replace(query ? `${currentPathname}?${query}` : currentPathname);
    },
    [currentPathname, router, searchParams],
  );

  return (
    <div className="dashboard-page">
      <section
        style={{
          padding: "14px 18px 4px",
          border: "none",
          boxShadow: "none",
          borderRadius: 0,
          background: "transparent",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="type-page-title">Requests</h1>
          <div className="type-page-subtitle">
            Submit a new request or track the ones you have already sent.
          </div>
        </div>
      </section>

      <section
        style={{
          padding: "0 16px",
          border: "none",
          boxShadow: "none",
          borderRadius: 0,
          background: "transparent",
        }}
      >
        <div
          className="monitoring-tab-strip"
          role="tablist"
          aria-label="Requests sections"
        >
          {REQUESTS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`monitoring-tab-btn${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="monitoring-tab-copy">
                <span className="monitoring-tab-label-row">
                  <span className="monitoring-tab-label">{tab.label}</span>
                </span>
                <span className="monitoring-tab-description">{tab.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {activeTab === "new" ? (
        <div className="request-page">
          <section className="panel request-page-panel">
            <div className="request-type-grid">
              {REQUEST_TYPES.map((requestType) =>
                requestType.enabled && requestType.href ? (
                  <Link key={requestType.id} href={requestType.href} className="request-type-card">
                    <span className="request-type-service">{requestType.serviceGroup}</span>
                    <span className="request-type-title">{requestType.label}</span>
                    <span className="request-type-copy">{requestType.description}</span>
                    <span className="request-type-examples">
                      {requestType.examples.join(" / ")}
                    </span>
                  </Link>
                ) : (
                  <button key={requestType.id} type="button" className="request-type-card is-disabled" disabled>
                    <span className="request-type-card-meta">
                      <span className="request-type-service">{requestType.serviceGroup}</span>
                      <span className="request-type-status">Coming soon</span>
                    </span>
                    <span className="request-type-title">{requestType.label}</span>
                    <span className="request-type-copy">{requestType.description}</span>
                    <span className="request-type-examples">
                      {requestType.examples.join(" / ")}
                    </span>
                  </button>
                ),
              )}
            </div>
          </section>
        </div>
      ) : (
        <MyRequestsClient />
      )}
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={null}>
      <RequestsTabsInner />
    </Suspense>
  );
}
