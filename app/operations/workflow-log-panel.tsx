"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getWorkflowById } from "@/lib/workflows";

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(startedAt: number, completedAt: number) {
  const ms = Math.max(0, completedAt - startedAt);
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remMinutes}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

export default function WorkflowLogPanel() {
  const runs = useQuery(api.workflowRuns.list, {});

  return (
    <section className="panel dashboard-panel operations-simple-shell">
      <div className="operations-simple-header">
        <div className="operations-simple-header-copy">
          <h1 className="operations-simple-title">Workflow Log</h1>
          <p className="operations-simple-subtitle">
            Audit record of completed and cancelled workflows.
          </p>
        </div>
      </div>

      {runs === undefined ? (
        <div className="operations-simple-loading">Loading log...</div>
      ) : runs.length === 0 ? (
        <div className="operations-simple-loading">No workflows recorded yet.</div>
      ) : (
        <div className="workflow-log-table-wrap">
          <table className="workflow-log-table">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>Employee</th>
                <th>Started by</th>
                <th>Started</th>
                <th>Completed</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Steps</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const workflow = getWorkflowById(run.workflowId);
                const totalSteps = workflow?.steps.length ?? 0;
                const doneCount = run.completedStepIds.length;
                const skippedCount = run.skippedStepIds.length;
                return (
                  <tr key={run._id}>
                    <td>{workflow?.label ?? run.workflowId}</td>
                    <td>{run.employeeName}</td>
                    <td>{run.startedBy}</td>
                    <td>{formatDateTime(run.startedAt)}</td>
                    <td>{formatDateTime(run.completedAt)}</td>
                    <td>{formatDuration(run.startedAt, run.completedAt)}</td>
                    <td>
                      <span className={`workflow-log-status status-${run.status}`}>
                        {run.status}
                      </span>
                    </td>
                    <td>
                      {doneCount} done
                      {skippedCount > 0 ? ` · ${skippedCount} skipped` : ""}
                      {totalSteps > 0 ? ` / ${totalSteps}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
