import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";

const OPERATIONS_TASK_STATUSES = ["backlog", "todo", "inProgress", "done"] as const;
const OPERATIONS_TASK_PRIORITIES = ["low", "medium", "important", "urgent"] as const;

type OperationsTaskStatus = (typeof OPERATIONS_TASK_STATUSES)[number];
type OperationsTaskPriority = (typeof OPERATIONS_TASK_PRIORITIES)[number];
type OperationsTaskDoc = Doc<"operationsTasks">;

function normalizeRequired(value: string, label: string) {
  const next = value.trim();
  if (!next) {
    throw new Error(`${label} is required.`);
  }
  return next;
}

function normalizeOptional(value?: string) {
  const next = value?.trim();
  return next ? next : undefined;
}

function ensureTaskStatus(value: string): OperationsTaskStatus {
  if ((OPERATIONS_TASK_STATUSES as readonly string[]).includes(value)) {
    return value as OperationsTaskStatus;
  }
  throw new Error("Invalid task status.");
}

function ensureTaskPriority(value: string): OperationsTaskPriority {
  if (value === "high") {
    return "urgent";
  }
  if ((OPERATIONS_TASK_PRIORITIES as readonly string[]).includes(value)) {
    return value as OperationsTaskPriority;
  }
  throw new Error("Invalid task priority.");
}

function normalizeTags(tags?: string[]) {
  if (!tags?.length) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const tag of tags) {
    const next = tag.trim();
    if (!next) continue;
    const dedupeKey = next.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    normalized.push(next);
  }
  return normalized.slice(0, 6);
}

function matchesTaskSearch(task: OperationsTaskDoc, search?: string) {
  if (!search) return true;
  const term = search.trim().toLowerCase();
  if (!term) return true;

  return [
    task.title,
    task.description,
    task.owner,
    task.dueLabel,
    task.priority,
    ...task.tags,
  ].some((value) => String(value ?? "").toLowerCase().includes(term));
}

export const list = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("operationsTasks").withIndex("by_updatedAt").order("desc").collect();
    return rows.filter((row) => matchesTaskSearch(row, args.search));
  },
});

export const createTask = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    priority: v.string(),
    owner: v.optional(v.string()),
    dueLabel: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const title = normalizeRequired(args.title, "Task title");
    const description = normalizeOptional(args.description);
    const status = ensureTaskStatus(args.status ?? "backlog");
    const priority = ensureTaskPriority(args.priority);
    const owner = normalizeOptional(args.owner);
    const dueLabel = normalizeOptional(args.dueLabel);
    const tags = normalizeTags(args.tags);
    const now = Date.now();

    return await ctx.db.insert("operationsTasks", {
      title,
      description,
      status,
      priority,
      owner,
      dueLabel,
      tags,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTaskStatus = mutation({
  args: {
    taskId: v.id("operationsTasks"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task could not be found.");
    }

    await ctx.db.patch(task._id, {
      status: ensureTaskStatus(args.status),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const removeTask = mutation({
  args: {
    taskId: v.id("operationsTasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task could not be found.");
    }

    await ctx.db.delete(task._id);
    return { success: true };
  },
});

export const seedSampleTasks = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("operationsTasks").collect();
    if (existing.length) {
      return { inserted: 0 };
    }

    const now = Date.now();
    const rows: Array<{
      title: string;
      description?: string;
      status: OperationsTaskStatus;
      priority: OperationsTaskPriority;
      owner?: string;
      dueLabel?: string;
      tags: string[];
    }> = [
      {
        title: "Review backup rotation for field laptops",
        description: "Confirm the latest image schedule and flag devices missing backup coverage.",
        status: "backlog",
        priority: "medium",
        owner: "Leanne",
        dueLabel: "This week",
        tags: ["Backup", "Laptops"],
      },
      {
        title: "Prepare replacement checklist for damaged router",
        description: "Collect photos, vendor quote, and approval notes before procurement handoff.",
        status: "todo",
        priority: "important",
        owner: "Josef",
        dueLabel: "Apr 10",
        tags: ["Network", "Procurement"],
      },
      {
        title: "Set up meeting support kit for OSMD briefing",
        description: "Reserve projector, extension reels, and confirm room access an hour before call time.",
        status: "inProgress",
        priority: "urgent",
        owner: "Belle",
        dueLabel: "Today",
        tags: ["Meeting", "Support"],
      },
      {
        title: "Archive closed borrowing request attachments",
        description: "Move signed forms into the monthly records folder and cross-check filenames.",
        status: "done",
        priority: "low",
        owner: "Leanne",
        dueLabel: "Completed",
        tags: ["Records"],
      },
    ];

    for (const row of rows) {
      await ctx.db.insert("operationsTasks", {
        ...row,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { inserted: rows.length };
  },
});
