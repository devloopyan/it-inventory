import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("departments")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    return rows.map((row) => row.name).sort();
  },
});

// Full department records (including Team Leader / Manager), for admin screens.
// Kept separate from `list` so existing name-only consumers are unaffected.
export const listDetailed = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("departments")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();
    return rows
      .map((row) => ({
        name: row.name,
        teamLeaderUsername: row.teamLeaderUsername,
        managerUsername: row.managerUsername,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  },
});

// Set the Team Leader and/or Manager for a department. Used by approval
// processes (Travel Orders today, more later). Pass an empty string to clear.
export const setApprovers = mutation({
  args: {
    name: v.string(),
    teamLeaderUsername: v.optional(v.string()),
    managerUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Department name cannot be empty.");

    const row = await ctx.db
      .query("departments")
      .filter((q) => q.eq(q.field("name"), name))
      .first();
    if (!row) throw new Error(`Department "${name}" not found.`);

    const teamLeader = args.teamLeaderUsername?.trim();
    const manager = args.managerUsername?.trim();

    // A person cannot be both the Team Leader and Manager of the same team —
    // that would let them approve their own request's first two steps.
    if (teamLeader && manager && teamLeader === manager) {
      throw new Error("Team Leader and Manager must be two different people.");
    }

    await ctx.db.patch(row._id, {
      teamLeaderUsername: teamLeader ? teamLeader : undefined,
      managerUsername: manager ? manager : undefined,
    });
  },
});

export const add = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Department name cannot be empty.");
    const existing = await ctx.db
      .query("departments")
      .filter((q) => q.eq(q.field("name"), name))
      .first();
    if (existing) {
      if (!existing.active) {
        await ctx.db.patch(existing._id, { active: true });
        return existing._id;
      }
      throw new Error(`Department "${name}" already exists.`);
    }
    return await ctx.db.insert("departments", {
      name,
      active: true,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("departments")
      .filter((q) => q.eq(q.field("name"), args.name))
      .first();
    if (!row) throw new Error(`Department "${args.name}" not found.`);
    await ctx.db.patch(row._id, { active: false });
  },
});

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const defaults = ["IT", "HR/Admin", "OSMD"];
    for (const name of defaults) {
      const existing = await ctx.db
        .query("departments")
        .filter((q) => q.eq(q.field("name"), name))
        .first();
      if (!existing) {
        await ctx.db.insert("departments", {
          name,
          active: true,
          createdAt: Date.now(),
        });
      }
    }
  },
});
