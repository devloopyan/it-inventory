"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ACTIVE_WORKFLOW_STORAGE_KEY,
  readActiveWorkflow,
  writeActiveWorkflow,
  type ActiveWorkflow,
} from "@/lib/activeWorkflow";
import { getWorkflowById } from "@/lib/workflows";

const ACTIVE_WORKFLOW_CHANGED_EVENT = "active-workflow-changed";

let cachedRaw: string | null | undefined = undefined;
let cachedValue: ActiveWorkflow | null = null;

function getSnapshot(): ActiveWorkflow | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACTIVE_WORKFLOW_STORAGE_KEY);
  if (raw === cachedRaw) return cachedValue;
  cachedRaw = raw;
  cachedValue = readActiveWorkflow();
  return cachedValue;
}

function getServerSnapshot(): ActiveWorkflow | null {
  return null;
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  function handleStorage(event: StorageEvent) {
    if (event.key !== ACTIVE_WORKFLOW_STORAGE_KEY) return;
    callback();
  }
  window.addEventListener("storage", handleStorage);
  window.addEventListener(ACTIVE_WORKFLOW_CHANGED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(ACTIVE_WORKFLOW_CHANGED_EVENT, callback);
  };
}

function persist(value: ActiveWorkflow | null) {
  writeActiveWorkflow(value);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ACTIVE_WORKFLOW_CHANGED_EVENT));
  }
}

type StartInput = {
  workflowId: string;
  employeeId: string;
  employeeName: string;
  startedBy: string;
};

type ActiveWorkflowContextValue = {
  activeWorkflow: ActiveWorkflow | null;
  start: (input: StartInput) => void;
  markDone: () => void;
  skip: () => void;
  cancel: () => void;
};

const ActiveWorkflowContext = createContext<ActiveWorkflowContextValue | null>(null);

export function ActiveWorkflowProvider({ children }: { children: ReactNode }) {
  const activeWorkflow = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const start = useCallback((input: StartInput) => {
    const workflow = getWorkflowById(input.workflowId);
    if (!workflow || workflow.steps.length === 0) return;
    persist({
      workflowId: input.workflowId,
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      startedBy: input.startedBy,
      currentStepIndex: 0,
      completedStepIds: [],
      skippedStepIds: [],
      startedAt: Date.now(),
    });
  }, []);

  const advance = useCallback((mode: "done" | "skip") => {
    const current = readActiveWorkflow();
    if (!current) return;
    const workflow = getWorkflowById(current.workflowId);
    if (!workflow) {
      persist(null);
      return;
    }
    const currentStep = workflow.steps[current.currentStepIndex];
    if (!currentStep) {
      persist(null);
      return;
    }
    const isLast = current.currentStepIndex >= workflow.steps.length - 1;
    if (isLast) {
      persist(null);
      return;
    }
    persist({
      ...current,
      completedStepIds:
        mode === "done"
          ? Array.from(new Set([...current.completedStepIds, currentStep.id]))
          : current.completedStepIds,
      skippedStepIds:
        mode === "skip"
          ? Array.from(new Set([...current.skippedStepIds, currentStep.id]))
          : current.skippedStepIds,
      currentStepIndex: current.currentStepIndex + 1,
    });
  }, []);

  const markDone = useCallback(() => advance("done"), [advance]);
  const skip = useCallback(() => advance("skip"), [advance]);
  const cancel = useCallback(() => persist(null), []);

  const value = useMemo<ActiveWorkflowContextValue>(
    () => ({ activeWorkflow, start, markDone, skip, cancel }),
    [activeWorkflow, start, markDone, skip, cancel],
  );

  return (
    <ActiveWorkflowContext.Provider value={value}>
      {children}
    </ActiveWorkflowContext.Provider>
  );
}

export function useActiveWorkflow() {
  const context = useContext(ActiveWorkflowContext);
  if (!context) {
    throw new Error("useActiveWorkflow must be used inside ActiveWorkflowProvider");
  }
  return context;
}
