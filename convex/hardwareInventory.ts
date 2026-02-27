import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

type CreateArgs = {
  assetNumber: string;
  assetType: string;
  assetNameDescription: string;
  specifications?: string;
  serialNumber?: string;
  location?: string;
  personAssigned?: string;
  department?: string;
  status?: string;
  turnoverAssignedDate?: number;
  purchaseDate?: string;
  warrantyNotesRemarks?: string;
  sourceSheet?: string;
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("hardwareInventory").collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const create = mutation({
  args: {
    assetNumber: v.string(),
    assetType: v.string(),
    assetNameDescription: v.string(),
    specifications: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    location: v.optional(v.string()),
    personAssigned: v.optional(v.string()),
    department: v.optional(v.string()),
    status: v.optional(v.string()),
    turnoverAssignedDate: v.optional(v.number()),
    purchaseDate: v.optional(v.string()),
    warrantyNotesRemarks: v.optional(v.string()),
    sourceSheet: v.optional(v.string()),
  },
  handler: async (ctx, args: CreateArgs) => {
    const existingRegisterRow = await ctx.db
      .query("hardwareInventory")
      .withIndex("by_assetNumber", (q) => q.eq("assetNumber", args.assetNumber))
      .first();

    if (existingRegisterRow) {
      throw new Error("Asset Number already exists in Hardware Inventory.");
    }

    const now = Date.now();
    const normalizedStatus = args.status ?? "AVAILABLE";

    let assetId: Id<"assets">;
    const existingAsset = await ctx.db
      .query("assets")
      .withIndex("by_assetTag", (q) => q.eq("assetTag", args.assetNumber))
      .first();

    if (existingAsset) {
      assetId = existingAsset._id;
      await ctx.db.patch(existingAsset._id, {
        category: args.assetType,
        status: normalizedStatus,
      });
    } else {
      assetId = await ctx.db.insert("assets", {
        assetTag: args.assetNumber,
        category: args.assetType,
        status: normalizedStatus,
        createdAt: now,
      });
    }

    return await ctx.db.insert("hardwareInventory", {
      assetId,
      assetNumber: args.assetNumber,
      assetType: args.assetType,
      assetNameDescription: args.assetNameDescription,
      specifications: args.specifications,
      serialNumber: args.serialNumber,
      location: args.location,
      personAssigned: args.personAssigned,
      department: args.department,
      status: normalizedStatus,
      turnoverAssignedDate: args.turnoverAssignedDate,
      purchaseDate: args.purchaseDate,
      warrantyNotesRemarks: args.warrantyNotesRemarks,
      sourceSheet: args.sourceSheet,
      createdAt: now,
      updatedAt: now,
    });
  },
});

type RemoveArgs = {
  inventoryId: Id<"hardwareInventory">;
};

export const remove = mutation({
  args: {
    inventoryId: v.id("hardwareInventory"),
  },
  handler: async (ctx, args: RemoveArgs) => {
    const row = await ctx.db.get(args.inventoryId);
    if (!row) return;

    const logs = await ctx.db
      .query("assetLogs")
      .withIndex("by_assetId", (q) => q.eq("assetId", row.assetId))
      .collect();

    for (const log of logs) {
      await ctx.db.delete(log._id);
    }

    const linkedAsset = await ctx.db.get(row.assetId);
    if (linkedAsset) {
      await ctx.db.delete(row.assetId);
    }
    await ctx.db.delete(args.inventoryId);
  },
});
