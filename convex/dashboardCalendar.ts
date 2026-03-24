import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function normalizeRequired(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function normalizeOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const listSupportEvents = query({
  args: {
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("dashboardCalendarEvents").withIndex("by_startAt").collect();

    return rows
      .filter((row) => {
        const eventEnd = row.endAt ?? row.startAt;
        return row.startAt <= args.rangeEnd && eventEnd >= args.rangeStart;
      })
      .map((row) => ({
        _id: String(row._id),
        ticketNumber: "",
        title: row.title,
        requesterName: row.requestedBy ?? "IT Support Request",
        requesterSection: undefined,
        requesterDepartment: undefined,
        meetingMode: undefined,
        meetingLocation: row.location,
        workflowType: "serviceRequest",
        category: "IT Staff Support",
        eventKind: "support" as const,
        eventStartAt: row.startAt,
        eventEndAt: row.endAt,
        status: row.assignedStaff.length ? "Assigned" : "Open",
        relatedAssetsCount: 0,
        contextLine: [row.location, row.neededItems].filter(Boolean).join(" · ") || "IT staff support event",
        referenceLabel: row.assignedStaff.join(", "),
        assignedStaff: row.assignedStaff,
        neededItems: row.neededItems,
        notes: row.notes,
      }))
      .sort((left, right) => left.eventStartAt - right.eventStartAt);
  },
});

export const createSupportEvent = mutation({
  args: {
    title: v.string(),
    requestedBy: v.optional(v.string()),
    assignedStaff: v.array(v.string()),
    neededItems: v.string(),
    location: v.optional(v.string()),
    notes: v.optional(v.string()),
    startAt: v.number(),
    endAt: v.optional(v.number()),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const title = normalizeRequired(args.title, "Event title");
    const neededItems = normalizeRequired(args.neededItems, "Needed items");
    const assignedStaff = args.assignedStaff.map((value) => value.trim()).filter(Boolean);

    if (!assignedStaff.length) {
      throw new Error("Assigned IT staff is required.");
    }
    if (args.endAt && args.endAt <= args.startAt) {
      throw new Error("End time must be after the start time.");
    }

    const now = Date.now();

    return await ctx.db.insert("dashboardCalendarEvents", {
      title,
      requestedBy: normalizeOptional(args.requestedBy),
      assignedStaff,
      neededItems,
      location: normalizeOptional(args.location),
      notes: normalizeOptional(args.notes),
      startAt: args.startAt,
      endAt: args.endAt,
      createdAt: now,
      updatedAt: now,
      createdBy: normalizeOptional(args.createdBy),
    });
  },
});
