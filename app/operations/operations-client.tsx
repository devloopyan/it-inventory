"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

type TaskStatus = "backlog" | "todo" | "inProgress" | "done";
type TaskPriority = "urgent" | "important" | "medium" | "low";
type OperationsTask = Doc<"operationsTasks">;

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
  { key: "backlog", label: "(No Section)" },
  { key: "todo", label: "DEV" },
  { key: "inProgress", label: "IT" },
  { key: "done", label: "Added to IT Planner" },
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
    done: plannerColumns.find((column) => column.key === "done")?.label ?? "Done",
  };
}

function getTaskPriority(task: OperationsTask): TaskPriority {
  return priorityOptions.some((option) => option.value === task.priority)
    ? (task.priority as TaskPriority)
    : "medium";
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatDueDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
  }).format(date);
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(date);
}

function getNextWeekend(date: Date) {
  const day = date.getDay();
  const daysUntilSaturday = (6 - day + 7) % 7 || 7;
  return addDays(date, daysUntilSaturday);
}

function isSameDate(firstDate: Date, secondDate: Date) {
  return (
    firstDate.getFullYear() === secondDate.getFullYear() &&
    firstDate.getMonth() === secondDate.getMonth() &&
    firstDate.getDate() === secondDate.getDate()
  );
}

function getMonthCalendarDays(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const calendarStart = addDays(firstDay, -startOffset);

  return Array.from({ length: 35 }, (_, index) => {
    const calendarDate = addDays(calendarStart, index);
    return {
      date: calendarDate,
      isCurrentMonth: calendarDate.getMonth() === month,
    };
  });
}

function renderPriorityIcon(icon: "urgent" | "important" | "medium" | "low") {
  if (icon === "urgent") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M18 8A6 6 0 0 0 6 8C6 15 3 16.5 3 16.5H21C21 16.5 18 15 18 8Z"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M10.25 20A2 2 0 0 0 13.75 20"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (icon === "important" || icon === "medium" || icon === "low") {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M5.5 3.5V16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M6.25 4.25H15.5L13.85 7.25L15.5 10.25H6.25V4.25Z"
          fill="currentColor"
        />
      </svg>
    );
  }
}

export default function OperationsClient() {
  const [composerStatus, setComposerStatus] = useState<TaskStatus | null>(null);
  const [composerState, setComposerState] = useState(defaultComposerState);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [plannerTitles, setPlannerTitles] = useState<Record<TaskStatus, string>>(getDefaultPlannerTitles);
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [composerToolMenu, setComposerToolMenu] = useState<"due" | "owner" | null>(null);
  const [taskMenuId, setTaskMenuId] = useState<Id<"operationsTasks"> | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<Id<"operationsTasks"> | null>(null);
  const [editState, setEditState] = useState(defaultComposerState);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<Id<"operationsTasks"> | null>(null);
  const [duplicatingTaskId, setDuplicatingTaskId] = useState<Id<"operationsTasks"> | null>(null);
  const priorityMenuRef = useRef<HTMLDivElement | null>(null);
  const composerToolMenuRef = useRef<HTMLDivElement | null>(null);

  const createTask = useMutation(api.operations.createTask);
  const updateTask = useMutation(api.operations.updateTask);
  const removeTask = useMutation(api.operations.removeTask);
  const tasks = useQuery(api.operations.list, {});

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
        done: parsed.done?.trim() || current.done,
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

  useEffect(() => {
    if (!composerToolMenu) return;

    function handlePointerDown(event: MouseEvent) {
      if (!composerToolMenuRef.current?.contains(event.target as Node)) {
        setComposerToolMenu(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [composerToolMenu]);

  function openComposer(status: TaskStatus) {
    setComposerStatus(status);
    setComposerState(defaultComposerState);
    setEditingTaskId(null);
    setTaskMenuId(null);
    setErrorMessage(null);
    setPriorityMenuOpen(false);
    setComposerToolMenu(null);
  }

  function closeComposer() {
    setComposerStatus(null);
    setComposerState(defaultComposerState);
    setPriorityMenuOpen(false);
    setComposerToolMenu(null);
  }

  function openEditTask(task: OperationsTask) {
    setEditingTaskId(task._id);
    setEditState({
      title: task.title,
      description: task.description ?? "",
      owner: task.owner ?? "",
      dueLabel: task.dueLabel ?? "",
      priority: getTaskPriority(task),
      tags: task.tags.join(", "),
    });
    setComposerStatus(null);
    setTaskMenuId(null);
    setErrorMessage(null);
    setPriorityMenuOpen(false);
    setComposerToolMenu(null);
  }

  function closeEditTask() {
    setEditingTaskId(null);
    setEditState(defaultComposerState);
    setPriorityMenuOpen(false);
    setComposerToolMenu(null);
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

  function handleEditChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = event.target;
    setEditState((current) => ({
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

  function handleEditPrioritySelect(priority: TaskPriority) {
    setEditState((current) => ({
      ...current,
      priority,
    }));
  }

  function handleComposerDueSelect(dueLabel: string) {
    setComposerState((current) => ({
      ...current,
      dueLabel,
    }));
    setComposerToolMenu(null);
  }

  function handleEditDueSelect(dueLabel: string) {
    setEditState((current) => ({
      ...current,
      dueLabel,
    }));
    setComposerToolMenu(null);
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

  async function handleUpdateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTaskId) return;

    setIsUpdating(true);
    setErrorMessage(null);

    try {
      await updateTask({
        taskId: editingTaskId,
        title: editState.title,
        description: editState.description || undefined,
        owner: editState.owner || undefined,
        dueLabel: editState.dueLabel || undefined,
        priority: editState.priority,
        tags: splitTags(editState.tags),
      });
      closeEditTask();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update the task.");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDeleteTask(taskId: Id<"operationsTasks">) {
    setDeletingTaskId(taskId);
    setTaskMenuId(null);
    setErrorMessage(null);

    try {
      await removeTask({ taskId });
      if (editingTaskId === taskId) {
        closeEditTask();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete the task.");
    } finally {
      setDeletingTaskId(null);
    }
  }

  async function handleMenuPrioritySelect(task: OperationsTask, priority: TaskPriority) {
    setTaskMenuId(null);
    setErrorMessage(null);

    try {
      await updateTask({
        taskId: task._id,
        title: task.title,
        description: task.description || undefined,
        owner: task.owner || undefined,
        dueLabel: task.dueLabel || undefined,
        priority,
        tags: task.tags,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update the task priority.");
    }
  }

  async function handleDuplicateTask(task: OperationsTask) {
    setDuplicatingTaskId(task._id);
    setTaskMenuId(null);
    setErrorMessage(null);

    try {
      await createTask({
        title: `${task.title} copy`,
        description: task.description || undefined,
        owner: task.owner || undefined,
        dueLabel: task.dueLabel || undefined,
        priority: getTaskPriority(task),
        status: task.status,
        tags: task.tags,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to duplicate the task.");
    } finally {
      setDuplicatingTaskId(null);
    }
  }

  function renderDueMenu(
    dueLabel: string,
    onChange: (event: ChangeEvent<HTMLInputElement>) => void,
    onSelect: (dueLabel: string) => void,
  ) {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const nextWeek = addDays(today, 7);
    const nextWeekend = getNextWeekend(today);
    const monthDays = getMonthCalendarDays(today);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthDays = getMonthCalendarDays(nextMonth).slice(0, 14);
    const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];
    const quickOptions = [
      {
        label: "Today",
        value: "Today",
        hint: formatWeekday(today),
        icon: "today",
      },
      {
        label: "Tomorrow",
        value: "Tomorrow",
        hint: formatWeekday(tomorrow),
        icon: "tomorrow",
      },
      {
        label: "Next week",
        value: formatDueDate(nextWeek),
        hint: formatDueDate(nextWeek),
        icon: "nextWeek",
      },
      {
        label: "Next weekend",
        value: formatDueDate(nextWeekend),
        hint: formatDueDate(nextWeekend),
        icon: "weekend",
      },
    ];

    return (
      <div className="operations-due-menu" onWheel={(event) => event.stopPropagation()}>
        <input
          className="operations-due-search"
          name="dueLabel"
          value={dueLabel}
          onChange={onChange}
          placeholder="Type a date"
        />
        <div className="operations-due-quick-list">
          {quickOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              className="operations-due-quick-option"
              onClick={() => onSelect(option.value)}
            >
              <span className={`operations-due-quick-icon ${option.icon}`} aria-hidden="true">
                {option.icon === "today" ? (
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                    <rect x="3.5" y="4" width="13" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M3.5 7.5H16.5" stroke="currentColor" strokeWidth="1.3" />
                    <text x="10" y="14" textAnchor="middle" fontSize="6" fill="currentColor">17</text>
                  </svg>
                ) : null}
                {option.icon === "tomorrow" ? (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M10 2.5V4.5M10 15.5V17.5M17.5 10H15.5M4.5 10H2.5M15.3 4.7L13.9 6.1M6.1 13.9L4.7 15.3M15.3 15.3L13.9 13.9M6.1 6.1L4.7 4.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                ) : null}
                {option.icon === "nextWeek" ? (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <rect x="3.5" y="3.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M8 6.5L11.5 10L8 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
                {option.icon === "weekend" ? (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M4 11.5H16M5.5 8H14.5A2 2 0 0 1 16.5 10V14H3.5V10A2 2 0 0 1 5.5 8Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M6 14V16M14 14V16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                ) : null}
              </span>
              <span>{option.label}</span>
              <span className="operations-due-quick-hint">{option.hint}</span>
            </button>
          ))}
        </div>
        <div className="operations-due-calendar">
          <div className="operations-due-calendar-head">
            <strong>{formatMonthTitle(today)}</strong>
            <span aria-hidden="true">&lt; o &gt;</span>
          </div>
          <div className="operations-due-weekdays" aria-hidden="true">
            {weekdayLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
          <div className="operations-due-grid">
            {monthDays.map((day) => (
              <button
                key={day.date.toISOString()}
                type="button"
                className={`operations-due-day${day.isCurrentMonth ? "" : " muted"}${isSameDate(day.date, today) ? " today" : ""}`}
                onClick={() => onSelect(isSameDate(day.date, today) ? "Today" : formatDueDate(day.date))}
              >
                {day.date.getDate()}
              </button>
            ))}
          </div>
          <strong className="operations-due-next-month">{formatMonthTitle(nextMonth).replace(` ${nextMonth.getFullYear()}`, "")}</strong>
          <div className="operations-due-grid operations-due-grid-next">
            {nextMonthDays.map((day) => (
              <button
                key={day.date.toISOString()}
                type="button"
                className={`operations-due-day${day.isCurrentMonth ? "" : " muted"}`}
                onClick={() => onSelect(formatDueDate(day.date))}
              >
                {day.date.getDate()}
              </button>
            ))}
          </div>
        </div>
        <div className="operations-due-extra-actions">
          <button type="button">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M10 6.5V10.5L12.5 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Time
          </button>
          <button type="button">
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M15.5 8A5.5 5.5 0 0 0 5.8 5.2L4.5 6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4.5 3.5V6.5H7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4.5 12A5.5 5.5 0 0 0 14.2 14.8L15.5 13.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M15.5 16.5V13.5H12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Repeat
          </button>
        </div>
      </div>
    );
  }

  const activePriorityOption =
    priorityOptions.find((option) => option.value === composerState.priority) ?? priorityOptions[2];
  const visibleTasks = tasks ?? [];

  return (
    <div className="dashboard-page operations-page">
      <section className="panel dashboard-panel operations-simple-shell operations-planner-shell">
        <div className="operations-simple-header">
          <div className="operations-simple-header-copy">
            <h1 className="operations-simple-title">Inbox</h1>
            <p className="operations-simple-subtitle">
              A clean board for quick IT operations planning.
            </p>
          </div>
        </div>

        {errorMessage ? <div className="operations-simple-alert">{errorMessage}</div> : null}
        {tasks === undefined ? <div className="operations-simple-loading">Loading tasks...</div> : null}

        <div className="operations-simple-board operations-planner-board">
          {plannerColumns.map((column) => {
            const isComposerOpen = composerStatus === column.key;
            const columnTasks = visibleTasks.filter((task) => task.status === column.key);

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
                    <span className="operations-planner-column-count">{columnTasks.length}</span>
                    <span className="operations-planner-column-menu" aria-hidden="true">...</span>
                  </div>
                </div>

                <div className="operations-simple-task-list operations-planner-lane">
                  {columnTasks.map((task) => {
                    const priority = getTaskPriority(task);
                    const isEditing = editingTaskId === task._id;
                    return (
                      <article key={task._id} className={`operations-planner-card${isEditing ? " is-editing" : ""}`}>
                        {isEditing ? (
                          <form className="operations-planner-composer operations-planner-edit-form" onSubmit={handleUpdateTask}>
                            <input
                              className="operations-planner-composer-title"
                              name="title"
                              value={editState.title}
                              onChange={handleEditChange}
                              placeholder="Task name"
                              required
                            />
                            <textarea
                              className="operations-planner-composer-description"
                              name="description"
                              value={editState.description}
                              onChange={handleEditChange}
                              placeholder="Description"
                              rows={2}
                            />
                            <div className="operations-planner-composer-tools" ref={composerToolMenuRef} aria-label="Task options">
                              <div className="operations-tool-popover">
                                <button
                                  className={`operations-planner-tool-btn${composerToolMenu === "due" ? " open" : ""}`}
                                  type="button"
                                  aria-label="Due label"
                                  aria-expanded={composerToolMenu === "due"}
                                  onClick={() => {
                                    setPriorityMenuOpen(false);
                                    setComposerToolMenu((current) => (current === "due" ? null : "due"));
                                  }}
                                >
                                  <span aria-hidden="true">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                                      <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.7" />
                                      <path d="M8 3V7M16 3V7M4 10H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                                    </svg>
                                  </span>
                                </button>
                                {composerToolMenu === "due" ? (
                                  renderDueMenu(editState.dueLabel, handleEditChange, handleEditDueSelect)
                                ) : null}
                              </div>
                              <div className="operations-planner-edit-priority-group" aria-label="Priority">
                                {priorityOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    className={`operations-planner-edit-priority priority-${option.value}${editState.priority === option.value ? " active" : ""}`}
                                    onClick={() => {
                                      handleEditPrioritySelect(option.value);
                                      setComposerToolMenu(null);
                                    }}
                                    aria-label={`Set priority to ${option.label}`}
                                  >
                                    <span className={`operations-priority-icon priority-${option.value}`}>
                                      {renderPriorityIcon(option.icon)}
                                    </span>
                                    {editState.priority === option.value ? <span>P{priorityOptions.indexOf(option) + 1}</span> : null}
                                  </button>
                                ))}
                              </div>
                              <div className="operations-tool-popover">
                                <button
                                  className={`operations-planner-tool-btn${composerToolMenu === "owner" ? " open" : ""}`}
                                  type="button"
                                  aria-label="More task options"
                                  aria-expanded={composerToolMenu === "owner"}
                                  onClick={() => {
                                    setPriorityMenuOpen(false);
                                    setComposerToolMenu((current) => (current === "owner" ? null : "owner"));
                                  }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M5 12H5.01M12 12H12.01M19 12H19.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                                  </svg>
                                </button>
                                {composerToolMenu === "owner" ? (
                                  <div className="operations-tool-menu operations-tool-menu-right">
                                    <label>
                                      <span>Owner</span>
                                      <input
                                        className="operations-planner-detail-input"
                                        name="owner"
                                        value={editState.owner}
                                        onChange={handleEditChange}
                                        placeholder="Person responsible"
                                      />
                                    </label>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            <div className="operations-planner-composer-actions">
                              <span className="operations-planner-composer-location">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M4 6.5H20V18H4V6.5Z" stroke="currentColor" strokeWidth="1.7" />
                                  <path d="M8 10H16M8 14H13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                                </svg>
                                Inbox / {plannerTitles[column.key]}
                              </span>
                              <button
                                type="button"
                                className="operations-planner-composer-cancel"
                                onClick={closeEditTask}
                                disabled={isUpdating}
                                aria-label="Cancel edit"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                </svg>
                              </button>
                              <button
                                type="submit"
                                className="operations-planner-composer-submit"
                                disabled={isUpdating}
                                aria-label={isUpdating ? "Saving task" : "Save task"}
                              >
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path d="M5 12H19M13 6L19 12L13 18" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="operations-planner-card-title-row">
                              <span
                                className={`operations-planner-priority-dot priority-${priority}`}
                                aria-hidden="true"
                              />
                              <h2>{task.title}</h2>
                              <div className="operations-planner-card-menu-wrap">
                                <button
                                  type="button"
                                  className="operations-planner-card-menu-btn"
                                  aria-label={`Open actions for ${task.title}`}
                                  aria-expanded={taskMenuId === task._id}
                                  onClick={() => setTaskMenuId((current) => (current === task._id ? null : task._id))}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M12 5H12.01M12 12H12.01M12 19H12.01" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                                  </svg>
                                </button>
                                {taskMenuId === task._id ? (
                                  <div className="operations-planner-card-menu" role="menu">
                                    <button type="button" role="menuitem" onClick={() => openEditTask(task)}>
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M4 20H8L18.5 9.5A2.8 2.8 0 0 0 14.5 5.5L4 16V20Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                      Edit
                                    </button>
                                    <div className="operations-planner-card-menu-section">
                                      <span className="operations-planner-card-menu-label">Priority</span>
                                      <div className="operations-planner-card-menu-priorities" role="group" aria-label={`Priority for ${task.title}`}>
                                        {priorityOptions.map((option) => (
                                          <button
                                            key={option.value}
                                            type="button"
                                            className={`operations-planner-card-menu-priority priority-${option.value}${priority === option.value ? " active" : ""}`}
                                            onClick={() => handleMenuPrioritySelect(task, option.value)}
                                            aria-label={`Set priority to ${option.label}`}
                                          >
                                            <span className={`operations-priority-icon priority-${option.value}`}>
                                              {renderPriorityIcon(option.icon)}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      disabled={duplicatingTaskId === task._id}
                                      onClick={() => handleDuplicateTask(task)}
                                    >
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4H18.5A1.5 1.5 0 0 1 20 5.5V14.5A1.5 1.5 0 0 1 18.5 16H16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M4 9.5A1.5 1.5 0 0 1 5.5 8H14.5A1.5 1.5 0 0 1 16 9.5V18.5A1.5 1.5 0 0 1 14.5 20H5.5A1.5 1.5 0 0 1 4 18.5V9.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                      {duplicatingTaskId === task._id ? "Duplicating..." : "Duplicate"}
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="danger"
                                      disabled={deletingTaskId === task._id}
                                      onClick={() => handleDeleteTask(task._id)}
                                    >
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M5 7H19M10 11V17M14 11V17M9 7L10 4H14L15 7M7 7L8 20H16L17 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                                      </svg>
                                      {deletingTaskId === task._id ? "Deleting..." : "Delete"}
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            {task.description ? (
                              <p className="operations-planner-card-copy">{task.description}</p>
                            ) : null}
                            <div className="operations-planner-card-footer">
                              {task.dueLabel ? (
                                <span className="operations-planner-meta-pill is-due">{task.dueLabel}</span>
                              ) : null}
                              {task.owner ? (
                                <span className="operations-planner-meta-pill">{task.owner}</span>
                              ) : null}
                            </div>
                          </>
                        )}
                      </article>
                    );
                  })}
                  {isComposerOpen ? (
                    <form className="operations-planner-composer" onSubmit={handleCreateTask}>
                      <input
                        className="operations-planner-composer-title"
                        name="title"
                        value={composerState.title}
                        onChange={handleComposerChange}
                        placeholder="Task name"
                        required
                      />
                      <textarea
                        className="operations-planner-composer-description"
                        name="description"
                        value={composerState.description}
                        onChange={handleComposerChange}
                        placeholder="Description"
                        rows={2}
                      />
                      <div className="operations-planner-composer-tools" ref={composerToolMenuRef} aria-label="Task options">
                        <div className="operations-tool-popover">
                          <button
                            className={`operations-planner-tool-btn${composerToolMenu === "due" ? " open" : ""}`}
                            type="button"
                            aria-label="Due label"
                            aria-expanded={composerToolMenu === "due"}
                            onClick={() => {
                              setPriorityMenuOpen(false);
                              setComposerToolMenu((current) => (current === "due" ? null : "due"));
                            }}
                          >
                            <span aria-hidden="true">
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                                <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.7" />
                                <path d="M8 3V7M16 3V7M4 10H20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                              </svg>
                            </span>
                          </button>
                          {composerToolMenu === "due" ? (
                            renderDueMenu(composerState.dueLabel, handleComposerChange, handleComposerDueSelect)
                          ) : null}
                        </div>
                        <div className="operations-priority-picker" ref={priorityMenuRef}>
                          <button
                            type="button"
                            className={`operations-planner-tool-btn priority-${activePriorityOption.value}${priorityMenuOpen ? " open" : ""}`}
                            onClick={() => {
                              setComposerToolMenu(null);
                              setPriorityMenuOpen((current) => !current);
                            }}
                            aria-haspopup="listbox"
                            aria-expanded={priorityMenuOpen}
                            aria-label={`Priority: ${activePriorityOption.label}`}
                          >
                            <span className={`operations-priority-icon priority-${activePriorityOption.value}`}>
                              {renderPriorityIcon(activePriorityOption.icon)}
                            </span>
                          </button>

                          {priorityMenuOpen ? (
                            <div
                              className="operations-priority-menu"
                              role="listbox"
                              aria-label="Priority"
                              onWheel={(event) => event.stopPropagation()}
                              onTouchMove={(event) => event.stopPropagation()}
                            >
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
                        <div className="operations-tool-popover">
                          <button
                            className={`operations-planner-tool-btn${composerToolMenu === "owner" ? " open" : ""}`}
                            type="button"
                            aria-label="More task options"
                            aria-expanded={composerToolMenu === "owner"}
                            onClick={() => {
                              setPriorityMenuOpen(false);
                              setComposerToolMenu((current) => (current === "owner" ? null : "owner"));
                            }}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M5 12H5.01M12 12H12.01M19 12H19.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          </button>
                          {composerToolMenu === "owner" ? (
                            <div className="operations-tool-menu operations-tool-menu-right">
                              <label>
                                <span>Owner</span>
                                <input
                                  className="operations-planner-detail-input"
                                  name="owner"
                                  value={composerState.owner}
                                  onChange={handleComposerChange}
                                  placeholder="Person responsible"
                                />
                              </label>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="operations-planner-composer-actions">
                        <span className="operations-planner-composer-location">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M4 6.5H20V18H4V6.5Z" stroke="currentColor" strokeWidth="1.7" />
                            <path d="M8 10H16M8 14H13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                          </svg>
                          Inbox / {plannerTitles[column.key]}
                        </span>
                        <button
                          type="button"
                          className="operations-planner-composer-cancel"
                          onClick={closeComposer}
                          disabled={isSubmitting}
                          aria-label="Cancel task"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                        <button
                          type="submit"
                          className="operations-planner-composer-submit"
                          disabled={isSubmitting}
                          aria-label={isSubmitting ? "Adding task" : "Add task"}
                        >
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M5 12H19M13 6L19 12L13 18" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
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
