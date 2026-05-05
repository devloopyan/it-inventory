"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useActiveWorkflow } from "@/app/active-workflow-context";
import { WORKFLOWS, type Workflow } from "@/lib/workflows";
import WorkflowEmployeePicker, { type SelectedEmployee } from "./workflow-employee-picker";

export default function WorkflowsPanel() {
  const router = useRouter();
  const { activeWorkflow, start } = useActiveWorkflow();
  const [pickerWorkflow, setPickerWorkflow] = useState<Workflow | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function handleCardClick(workflow: Workflow) {
    if (activeWorkflow) {
      setWarning(
        "A workflow is already in progress. Finish or cancel it from the banner before starting another.",
      );
      return;
    }
    setWarning(null);
    setPickerWorkflow(workflow);
  }

  function handleSelect(employee: SelectedEmployee) {
    if (!pickerWorkflow) return;
    const firstStep = pickerWorkflow.steps[0];
    if (!firstStep) return;
    start({
      workflowId: pickerWorkflow.id,
      employeeId: employee.id,
      employeeName: employee.displayName,
    });
    setPickerWorkflow(null);
    router.push(firstStep.targetPath);
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

        {warning ? <div className="operations-simple-alert">{warning}</div> : null}

        <div className="operations-workflow-grid">
          {WORKFLOWS.map((workflow) => (
            <button
              key={workflow.id}
              type="button"
              className="operations-workflow-card"
              onClick={() => handleCardClick(workflow)}
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
