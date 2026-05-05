"use client";

import { useState } from "react";
import { WORKFLOWS, type Workflow } from "@/lib/workflows";
import WorkflowEmployeePicker, { type SelectedEmployee } from "./workflow-employee-picker";

export default function WorkflowsPanel() {
  const [pickerWorkflow, setPickerWorkflow] = useState<Workflow | null>(null);

  function handleSelect(employee: SelectedEmployee) {
    if (!pickerWorkflow) return;
    // Phase 3b will start the workflow run here. For now, just log and close.
    console.log("workflow selected", { workflow: pickerWorkflow.id, employee });
    setPickerWorkflow(null);
  }

  return (
    <>
      <section className="panel dashboard-panel operations-simple-shell">
        <div className="operations-simple-header">
          <div className="operations-simple-header-copy">
            <h1 className="operations-simple-title">Workflows</h1>
            <p className="operations-simple-subtitle">
              Pick a guided process to walk through it step by step.
            </p>
          </div>
        </div>

        <div className="operations-workflow-grid">
          {WORKFLOWS.map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              className="operations-workflow-card"
              onClick={() => setPickerWorkflow(workflow)}
            >
              <span className="operations-workflow-card-label">{workflow.label}</span>
              <span className="operations-workflow-card-description">
                {workflow.description}
              </span>
              <span className="operations-workflow-card-meta">
                {workflow.steps.length} steps
              </span>
            </button>
          ))}
        </div>
      </section>

      {pickerWorkflow ? (
        <WorkflowEmployeePicker
          workflow={pickerWorkflow}
          onSelect={handleSelect}
          onClose={() => setPickerWorkflow(null)}
        />
      ) : null}
    </>
  );
}
