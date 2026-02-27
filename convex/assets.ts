import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("assets").collect();
  },
});

export const create = mutation({
  args: {
    assetTag: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existingAsset = await ctx.db
      .query("assets")
      .withIndex("by_assetTag", (q) => q.eq("assetTag", args.assetTag))
      .first();

    let assetId: Id<"assets">;

    if (existingAsset) {
      assetId = existingAsset._id;
      await ctx.db.patch(existingAsset._id, {
        category: args.category,
      });
    } else {
      assetId = await ctx.db.insert("assets", {
        assetTag: args.assetTag,
        category: args.category,
        status: "AVAILABLE",
        createdAt: now,
      });
    }

    const existingInventory = await ctx.db
      .query("hardwareInventory")
      .withIndex("by_assetNumber", (q) => q.eq("assetNumber", args.assetTag))
      .first();

    if (existingInventory) {
      await ctx.db.patch(existingInventory._id, {
        assetId,
        assetType: args.category,
        status: "AVAILABLE",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("hardwareInventory", {
        assetId,
        assetNumber: args.assetTag,
        assetType: args.category,
        assetNameDescription: args.assetTag,
        status: "AVAILABLE",
        sourceSheet: "Assets Page",
        createdAt: now,
        updatedAt: now,
      });
    }

    return assetId;
  },
});

type AssignBorrowerArgs = {
  assetId: Id<"assets">;
  borrowerId: Id<"borrowers">;
};

export const assignBorrower = mutation({
  args: {
    assetId: v.id("assets"),
    borrowerId: v.id("borrowers"),
  },
  handler: async (ctx, args: AssignBorrowerArgs) => {
    const borrower = await ctx.db.get(args.borrowerId);
    const now = Date.now();

    await ctx.db.patch(args.assetId, {
      borrowerId: args.borrowerId,
      status: "BORROWED",
    });

    const inventory = await ctx.db
      .query("hardwareInventory")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .first();

    if (inventory) {
      await ctx.db.patch(inventory._id, {
        status: "BORROWED",
        personAssigned: borrower?.fullName,
        department: borrower?.department,
        turnoverAssignedDate: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("assetLogs", {
      assetId: args.assetId,
      action: "ASSIGN",
      borrowerId: args.borrowerId,
      message: "Assigned to borrower",
      createdAt: now,
    });
  },
});

type ReturnAssetArgs = {
  assetId: Id<"assets">;
};

export const returnAsset = mutation({
  args: {
    assetId: v.id("assets"),
  },
  handler: async (ctx, args: ReturnAssetArgs) => {
    const now = Date.now();
    const asset = await ctx.db.get(args.assetId);

    await ctx.db.patch(args.assetId, {
      status: "AVAILABLE",
      borrowerId: undefined,
    });

    const inventory = await ctx.db
      .query("hardwareInventory")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .first();

    if (inventory) {
      await ctx.db.patch(inventory._id, {
        status: "AVAILABLE",
        personAssigned: undefined,
        department: undefined,
        turnoverAssignedDate: undefined,
        updatedAt: now,
      });
    }

    await ctx.db.insert("assetLogs", {
      assetId: args.assetId,
      action: "RETURN",
      borrowerId: asset?.borrowerId,
      message: "Returned to inventory",
      createdAt: now,
    });
  },
});

type RemoveAssetArgs = {
  assetId: Id<"assets">;
};

export const remove = mutation({
  args: {
    assetId: v.id("assets"),
  },
  handler: async (ctx, args: RemoveAssetArgs) => {
    const inventory = await ctx.db
      .query("hardwareInventory")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .first();

    if (inventory) {
      await ctx.db.delete(inventory._id);
    }

    const logs = await ctx.db
      .query("assetLogs")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .collect();

    for (const log of logs) {
      await ctx.db.delete(log._id);
    }

    await ctx.db.delete(args.assetId);
  },
});
