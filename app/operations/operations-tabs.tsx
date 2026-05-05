"use client";

import { useState } from "react";
import OperationsClient from "./operations-client";
import WorkflowsPanel from "./workflows-panel";

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
] as const;

type OperationsTabKey = (typeof OPERATIONS_TABS)[number]["key"];

export default function OperationsTabs() {
  const [activeTab, setActiveTab] = useState<OperationsTabKey>("planner");

  return (
    <div className="dashboard-page operations-page">
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
          className="operations-tab-strip"
          role="tablist"
          aria-label="Operations sections"
        >
          {OPERATIONS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`operations-tab-btn${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="operations-tab-copy">
                <span className="operations-tab-label">{tab.label}</span>
                <span className="operations-tab-description">{tab.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {activeTab === "planner" ? <OperationsClient /> : <WorkflowsPanel />}
    </div>
  );
}
