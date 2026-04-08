"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

type TaskStatus = "backlog" | "todo" | "inProgress";
type TaskPriority = "urgent" | "important" | "medium" | "low";

type ComposerState = {
  title: string;
  description: string;
  owner: string;
  dueLabel: string;
  priority: TaskPriority;
  tags: string;
};

const plannerColumns: Array<{
  key: TaskStatus;
  label: string;
}> = [
  { key: "backlog", label: "Backlog" },
  { key: "todo", label: "To do" },
  { key: "inProgress", label: "In progress" },
];

const plannerTitleStorageKey = "operations-planner-titles-v1";
const priorityOptions: Array<{ value: TaskPriority; label: string; icon: "urgent" | "important" | "medium" | "low" }> = [
  { value: "urgent", label: "Urgent", icon: "urgent" },
  { value: "important", label: "Important", icon: "important" },
  { value: "medium", label: "Medium", icon: "medium" },
  { value: "low", label: "Low", icon: "low" },
];

const defaultComposerState: ComposerState = {
  title: "",
  description: "",
  owner: "",
  dueLabel: "",
  priority: "medium",
  tags: "",
};

function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getDefaultPlannerTitles(): Record<TaskStatus, string> {
  return {
    backlog: plannerColumns.find((column) => column.key === "backlog")?.label ?? "Backlog",
    todo: plannerColumns.find((column) => column.key === "todo")?.label ?? "To do",
    inProgress: plannerColumns.find((column) => column.key === "inProgress")?.label ?? "In progress",
  };
}

function renderPriorityIcon(icon: "urgent" | "important" | "medium" | "low") {
  if (icon === "urgent") {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d="M7.1 2.7c.6-.34 1.35-.1 1.66.52l4.56 9.12a3.2 3.2 0 0 1-1.43 4.27l-2.02 1.01"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.1 4.8a3.2 3.2 0 0 0-1.43 4.28l2.83 5.67a3.2 3.2 0 0 0 4.28 1.43l.66-.33"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12.9 3.1l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "important") {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M10 3.2v8.1" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="10" cy="15.2" r="1.7" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "medium") {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="4" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 11.5l6 5.5 6-5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function OperationsClient() {
  const [composerStatus, setComposerStatus] = useState<TaskStatus | null>(null);
  const [composerState, setComposerState] = useState(defaultComposerState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [plannerTitles, setPlannerTitles] = useState<Record<TaskStatus, string>>(getDefaultPlannerTitles);
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const priorityMenuRef = useRef<HTMLDivElement | null>(null);

  const createTask = useMutation(api.operations.createTask);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTitles = window.localStorage.getItem(plannerTitleStorageKey);
    if (!savedTitles) return;

    try {
      const parsed = JSON.parse(savedTitles) as Partial<Record<TaskStatus, string>>;
      setPlannerTitles((current) => ({
        backlog: parsed.backlog?.trim() || current.backlog,
        todo: parsed.todo?.trim() || current.todo,
        inProgress: parsed.inProgress?.trim() || current.inProgress,
      }));
    } catch {
      window.localStorage.removeItem(plannerTitleStorageKey);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(plannerTitleStorageKey, JSON.stringify(plannerTitles));
  }, [plannerTitles]);

  useEffect(() => {
    if (!priorityMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!priorityMenuRef.current?.contains(event.target as Node)) {
        setPriorityMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [priorityMenuOpen]);

  function openComposer(status: TaskStatus) {
    setComposerStatus(status);
    setComposerState(defaultComposerState);
    setErrorMessage(null);
    setPriorityMenuOpen(false);
  }

  function closeComposer() {
    setComposerStatus(null);
    setComposerState(defaultComposerState);
    setPriorityMenuOpen(false);
  }

  function handleComposerChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;
    setComposerState((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handlePlannerTitleChange(status: TaskStatus, value: string) {
    setPlannerTitles((current) => ({
      ...current,
      [status]: value,
    }));
  }

  function handlePlannerTitleBlur(status: TaskStatus) {
    setPlannerTitles((current) => {
      const trimmed = current[status].trim();
      return {
        ...current,
        [status]: trimmed || getDefaultPlannerTitles()[status],
      };
    });
  }

  function handlePrioritySelect(priority: TaskPriority) {
    setComposerState((current) => ({
      ...current,
      priority,
    }));
    setPriorityMenuOpen(false);
  }

  async function handleCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!composerStatus) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await createTask({
        title: composerState.title,
        description: composerState.description || undefined,
        owner: composerState.owner || undefined,
        dueLabel: composerState.dueLabel || undefined,
        priority: composerState.priority,
        status: composerStatus,
        tags: splitTags(composerState.tags),
      });
      closeComposer();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create the task.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const activePriorityOption =
    priorityOptions.find((option) => option.value === composerState.priority) ?? priorityOptions[2];

  return (
    <div className="dashboard-page operations-page">
      <section className="panel dashboard-panel operations-simple-shell operations-planner-shell">
        <div className="operations-simple-header">
          <div className="operations-simple-header-copy">
            <h1 className="operations-simple-title">Planner Board</h1>
            <p className="operations-simple-subtitle">
              A clean operations board with quick-add lanes for planning work.
            </p>
          </div>
        </div>

        {errorMessage ? <div className="operations-simple-alert">{errorMessage}</div> : null}

        <div className="operations-simple-board operations-planner-board">
          {plannerColumns.map((column) => {
            const isComposerOpen = composerStatus === column.key;

            return (
              <section key={column.key} className="operations-simple-column operations-planner-column">
                <div className="operations-simple-column-head operations-planner-column-head">
                  <div className="operations-simple-column-title-row">
                    <input
                      className="operations-planner-title-input"
                      type="text"
                      value={plannerTitles[column.key]}
                      onChange={(event) => handlePlannerTitleChange(column.key, event.target.value)}
                      onBlur={() => handlePlannerTitleBlur(column.key)}
                      aria-label={`${column.label} column title`}
                    />
                  </div>
                </div>

                <div className="operations-simple-task-list operations-planner-lane">
                  {isComposerOpen ? (
                    <form className="operations-planner-composer" onSubmit={handleCreateTask}>
                      <input
                        className="input-base"
                        name="title"
                        value={composerState.title}
                        onChange={handleComposerChange}
                        placeholder="Task title"
                        required
                      />
                      <textarea
                        className="operations-simple-textarea"
                        name="description"
                        value={composerState.description}
                        onChange={handleComposerChange}
                        placeholder="Notes or checklist details"
                        rows={3}
                      />
                      <div className="operations-planner-composer-grid">
                        <input
                          className="input-base"
                          name="owner"
                          value={composerState.owner}
                          onChange={handleComposerChange}
                          placeholder="Owner"
                        />
                        <input
                          className="input-base"
                          name="dueLabel"
                          value={composerState.dueLabel}
                          onChange={handleComposerChange}
                          placeholder="Due label"
                        />
                        <div className="operations-priority-picker" ref={priorityMenuRef}>
                          <button
                            type="button"
                            className={`operations-priority-trigger priority-${activePriorityOption.value}${priorityMenuOpen ? " open" : ""}`}
                            onClick={() => setPriorityMenuOpen((current) => !current)}
                            aria-haspopup="listbox"
                            aria-expanded={priorityMenuOpen}
                          >
                            <span className={`operations-priority-icon priority-${activePriorityOption.value}`}>
                              {renderPriorityIcon(activePriorityOption.icon)}
                            </span>
                            <span className="operations-priority-label">{activePriorityOption.label}</span>
                            <span className="operations-priority-chevron" aria-hidden="true">
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                <path d="M3.25 5.5L7 9.25L10.75 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </span>
                          </button>

                          {priorityMenuOpen ? (
                            <div className="operations-priority-menu" role="listbox" aria-label="Priority">
                              {priorityOptions.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={`operations-priority-option${option.value === composerState.priority ? " selected" : ""}`}
                                  onClick={() => handlePrioritySelect(option.value)}
                                  role="option"
                                  aria-selected={option.value === composerState.priority}
                                >
                                  <span className={`operations-priority-icon priority-${option.value}`}>
                                    {renderPriorityIcon(option.icon)}
                                  </span>
                                  <span>{option.label}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <input
                        className="input-base"
                        name="tags"
                        value={composerState.tags}
                        onChange={handleComposerChange}
                        placeholder="Tags separated by commas"
                      />
                      <div className="operations-planner-composer-actions">
                        <button type="submit" className="btn-primary" disabled={isSubmitting}>
                          {isSubmitting ? "Adding..." : "Add Task"}
                        </button>
                        <button type="button" className="btn-secondary" onClick={closeComposer} disabled={isSubmitting}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="operations-planner-add-btn"
                      onClick={() => openComposer(column.key)}
                    >
                      <span className="operations-planner-add-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <path d="M12 5V19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          <path d="M5 12H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      </span>
                      <span>Add task</span>
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
