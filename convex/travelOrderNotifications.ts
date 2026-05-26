import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

// ─── Internal helper ─────────────────────────────────────────────────────────

export async function sendTravelOrderNotification(
  ctx: MutationCtx,
  args: {
    ticketId: Id<"monitoringTickets">;
    ticketNumber: string;
    recipientName: string;
    recipientRole: string;
    event: string;
    message: string;
  },
) {
  await ctx.db.insert("travelOrderNotifications", {
    ticketId: args.ticketId,
    ticketNumber: args.ticketNumber,
    recipientName: args.recipientName,
    recipientRole: args.recipientRole,
    event: args.event,
    message: args.message,
    isRead: false,
    deliveryStatus: "delivered",
    createdAt: Date.now(),
  });
}

export async function logTravelOrderActivity(
  ctx: MutationCtx,
  args: {
    ticketId: Id<"monitoringTickets">;
    ticketNumber: string;
    event: string;
    description: string;
    actorName: string;
    actorRole?: string;
    metadata?: string;
  },
) {
  await ctx.db.insert("travelOrderActivityLog", {
    ticketId: args.ticketId,
    ticketNumber: args.ticketNumber,
    event: args.event,
    description: args.description,
    actorName: args.actorName,
    actorRole: args.actorRole,
    metadata: args.metadata,
    createdAt: Date.now(),
  });
}

// ─── Public mutations ─────────────────────────────────────────────────────────

export const markNotificationRead = mutation({
  args: {
    notificationId: v.id("travelOrderNotifications"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, {
      isRead: true,
      readAt: Date.now(),
    });
    return { success: true };
  },
});

export const markAllNotificationsRead = mutation({
  args: {
    recipientName: v.string(),
  },
  handler: async (ctx, args) => {
    const unread = await ctx.db
      .query("travelOrderNotifications")
      .withIndex("by_recipientName", (q) => q.eq("recipientName", args.recipientName))
      .filter((q) => q.eq(q.field("isRead"), false))
      .collect();

    const now = Date.now();
    await Promise.all(
      unread.map((n) => ctx.db.patch(n._id, { isRead: true, readAt: now })),
    );
    return { count: unread.length };
  },
});

// ─── Public queries ───────────────────────────────────────────────────────────

export const listNotifications = query({
  args: {
    recipientName: v.string(),
    unreadOnly: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const base = ctx.db
      .query("travelOrderNotifications")
      .withIndex("by_recipientName", (q) => q.eq("recipientName", args.recipientName))
      .order("desc");

    const results = await base.collect();
    const filtered = args.unreadOnly ? results.filter((n) => !n.isRead) : results;
    return filtered.slice(0, args.limit ?? 50);
  },
});

export const getUnreadCount = query({
  args: {
    recipientName: v.string(),
  },
  handler: async (ctx, args) => {
    const unread = await ctx.db
      .query("travelOrderNotifications")
      .withIndex("by_recipientName", (q) => q.eq("recipientName", args.recipientName))
      .filter((q) => q.eq(q.field("isRead"), false))
      .collect();

    return unread.length;
  },
});

export const listActivityLog = query({
  args: {
    ticketId: v.id("monitoringTickets"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("travelOrderActivityLog")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .collect();
  },
});

export const listNotificationsForTicket = query({
  args: {
    ticketId: v.id("monitoringTickets"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("travelOrderNotifications")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", args.ticketId))
      .order("desc")
      .collect();
  },
});
