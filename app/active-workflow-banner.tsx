"use client";

import { useRouter } from "next/navigation";
import { useActiveWorkflow } from "./active-workflow-context";
import { getWorkflowById } from "@/lib/workflows";

export default function ActiveWorkflowBanner() {
  const router = useRouter();
  const { activeWorkflow, markDone, skip, cancel } = useActiveWorkflow();

  if (!activeWorkflow) return null;

  const workflow = getWorkflowById(activeWorkflow.workflowId);
  if (!workflow) return null;

  const currentStep = workflow.steps[activeWorkflow.currentStepIndex];
  if (!currentStep) return null;

  const stepNumber = activeWorkflow.currentStepIndex + 1;
  const totalSteps = workflow.steps.length;
  const isLastStep = activeWorkflow.currentStepIndex >= totalSteps - 1;
  const nextStep = isLastStep ? null : workflow.steps[activeWorkflow.currentStepIndex + 1];

  function handleAdvance(mode: "done" | "skip") {
    if (mode === "done") markDone();
    else skip();
    if (nextStep) {
      router.push(nextStep.targetPath);
    }
  }

  return (
    <div className="active-workflow-banner" role="region" aria-label="Active workflow">
      <div className="active-workflow-banner-main">
        <div className="active-workflow-banner-eyebrow">
          {workflow.label} · {activeWorkflow.employeeName}
        </div>
        <div className="active-workflow-banner-step">
          Step {stepNumber} of {totalSteps}: {currentStep.label}
        </div>
        <div className="active-workflow-banner-description">
          {currentStep.description}
        </div>
      </div>
      <div className="active-workflow-banner-actions">
        <button
          type="button"
          className="active-workflow-banner-btn skip"
          onClick={() => handleAdvance("skip")}
        >
          Skip
        </button>
        <button
          type="button"
          className="active-workflow-banner-btn done"
          onClick={() => handleAdvance("done")}
        >
          {isLastStep ? "Mark Done & Finish" : "Mark Done & Continue"}
        </button>
        <button
          type="button"
          className="active-workflow-banner-btn cancel"
          aria-label="Cancel workflow"
          onClick={cancel}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
