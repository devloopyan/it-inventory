"use client";

import { Suspense, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import OperationsClient from "./operations-client";
import WorkflowsPanel from "./workflows-panel";
import WorkflowLogPanel from "./workflow-log-panel";

const OPERATIONS_TABS = [
  {
    key: "planner",
    label: "Planner",
    description: "Kanban board for IT operations tasks.",
  },
  {
    key: "workflows",
    label: "Workflows",
    description: "Guided processes like Onboarding and Offboarding.",
  },
  {
    key: "log",
    label: "Log",
    description: "Audit record of completed workflows.",
  },
] as const;

type OperationsTabKey = (typeof OPERATIONS_TABS)[number]["key"];

function isOperationsTabKey(value: string | null): value is OperationsTabKey {
  return OPERATIONS_TABS.some((tab) => tab.key === value);
}

function OperationsTabsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPathname = pathname ?? "/operations";
  const tabParam = searchParams?.get("tab") ?? null;
  const activeTab: OperationsTabKey = isOperationsTabKey(tabParam) ? tabParam : "planner";

  const setActiveTab = useCallback(
    (key: OperationsTabKey) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (key === "planner") {
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
    <div className="dashboard-page operations-page">
      <section
        className="panel"
        style={{
          padding: "14px 18px 4px",
          display: "grid",
          gap: 14,
          border: "none",
          boxShadow: "none",
          borderRadius: 0,
          background: "transparent",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="type-page-title">Operations</h1>
          <div className="type-page-subtitle">
            Task planning, guided workflows, and an audit log for IT operations.
          </div>
        </div>
      </section>

      <section
        className="panel operations-tab-panel"
        style={{
          padding: 16,
          display: "grid",
          gap: 14,
          border: "none",
          boxShadow: "none",
          borderRadius: 0,
          background: "transparent",
        }}
      >
        <div
          className="monitoring-tab-strip"
          role="tablist"
          aria-label="Operations sections"
        >
          {OPERATIONS_TABS.map((tab) => (
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

      {activeTab === "planner" ? (
        <OperationsClient />
      ) : activeTab === "workflows" ? (
        <WorkflowsPanel />
      ) : (
        <WorkflowLogPanel />
      )}
    </div>
  );
}

export default function OperationsTabs() {
  return (
    <Suspense fallback={null}>
      <OperationsTabsInner />
    </Suspense>
  );
}
