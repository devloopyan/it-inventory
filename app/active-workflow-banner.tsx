"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useActiveWorkflow } from "./active-workflow-context";
import { getWorkflowById } from "@/lib/workflows";

export default function ActiveWorkflowBanner() {
  const router = useRouter();
  const { activeWorkflow, markDone, skip, cancel } = useActiveWorkflow();
  const recordRun = useMutation(api.workflowRuns.record);

  if (!activeWorkflow) return null;

  const workflow = getWorkflowById(activeWorkflow.workflowId);
  if (!workflow) return null;

  const currentStep = workflow.steps[activeWorkflow.currentStepIndex];
  if (!currentStep) return null;

  const stepNumber = activeWorkflow.currentStepIndex + 1;
  const totalSteps = workflow.steps.length;
  const isLastStep = activeWorkflow.currentStepIndex >= totalSteps - 1;
  const nextStep = isLastStep ? null : workflow.steps[activeWorkflow.currentStepIndex + 1];

  async function handleAdvance(mode: "done" | "skip") {
    if (!activeWorkflow || !currentStep) return;
    const finalCompletedIds =
      mode === "done"
        ? Array.from(new Set([...activeWorkflow.completedStepIds, currentStep.id]))
        : activeWorkflow.completedStepIds;
    const finalSkippedIds =
      mode === "skip"
        ? Array.from(new Set([...activeWorkflow.skippedStepIds, currentStep.id]))
        : activeWorkflow.skippedStepIds;

    if (isLastStep) {
      try {
        await recordRun({
          workflowId: activeWorkflow.workflowId,
          employeeId: activeWorkflow.employeeId as Id<"users">,
          employeeName: activeWorkflow.employeeName,
          startedBy: activeWorkflow.startedBy,
          startedAt: activeWorkflow.startedAt,
          status: "completed",
          completedStepIds: finalCompletedIds,
          skippedStepIds: finalSkippedIds,
        });
      } catch (error) {
        console.error("Failed to record workflow run", error);
      }
    }

    if (mode === "done") markDone();
    else skip();
    if (nextStep?.targetPath) {
      router.push(nextStep.targetPath);
    }
  }

  async function handleCancel() {
    if (!activeWorkflow) return;
    try {
      await recordRun({
        workflowId: activeWorkflow.workflowId,
        employeeId: activeWorkflow.employeeId as Id<"users">,
        employeeName: activeWorkflow.employeeName,
        startedBy: activeWorkflow.startedBy,
        startedAt: activeWorkflow.startedAt,
        status: "cancelled",
        completedStepIds: activeWorkflow.completedStepIds,
        skippedStepIds: activeWorkflow.skippedStepIds,
      });
    } catch (error) {
      console.error("Failed to record workflow cancellation", error);
    }
    cancel();
  }

  return (
    <div
      className="active-workflow-banner"
      role="region"
      aria-label="Active workflow"
      style={{
        background: "#4f6cf7",
        color: "#ffffff",
        padding: "18px 22px",
        borderRadius: 14,
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 18,
        boxShadow: "0 10px 30px rgba(79,108,247,0.35)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div className="active-workflow-banner-main">
        <div className="active-workflow-banner-eyebrow">
          <span className="active-workflow-banner-step-pill">
            {stepNumber}/{totalSteps}
          </span>
          {workflow.label} · {activeWorkflow.employeeName}
        </div>
        <div className="active-workflow-banner-step">{currentStep.label}</div>
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
          onClick={handleCancel}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
