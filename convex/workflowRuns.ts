import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const record = mutation({
  args: {
    workflowId: v.string(),
    employeeId: v.id("users"),
    employeeName: v.string(),
    startedBy: v.string(),
    startedAt: v.number(),
    status: v.string(),
    completedStepIds: v.array(v.string()),
    skippedStepIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("workflowRuns", {
      ...args,
      completedAt: Date.now(),
    });
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("workflowRuns")
      .withIndex("by_startedAt")
      .order("desc")
      .collect();
  },
});
