export const ACTIVE_WORKFLOW_STORAGE_KEY = "it-inventory-active-workflow-v1";

export type ActiveWorkflow = {
  workflowId: string;
  employeeId: string;
  employeeName: string;
  startedBy: string;
  currentStepIndex: number;
  completedStepIds: string[];
  skippedStepIds: string[];
  startedAt: number;
};

export function readActiveWorkflow(): ActiveWorkflow | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACTIVE_WORKFLOW_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveWorkflow;
    if (
      typeof parsed.workflowId === "string" &&
      typeof parsed.employeeId === "string" &&
      typeof parsed.employeeName === "string" &&
      typeof parsed.startedBy === "string" &&
      typeof parsed.currentStepIndex === "number" &&
      Array.isArray(parsed.completedStepIds) &&
      Array.isArray(parsed.skippedStepIds) &&
      typeof parsed.startedAt === "number"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeActiveWorkflow(value: ActiveWorkflow | null) {
  if (typeof window === "undefined") return;
  if (value === null) {
    window.localStorage.removeItem(ACTIVE_WORKFLOW_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_WORKFLOW_STORAGE_KEY, JSON.stringify(value));
}
