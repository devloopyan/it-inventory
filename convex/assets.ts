import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

type AssignBorrowerArgs = {
  assetId: Id<"assets">;
  borrowerId: Id<"borrowers">;
};

type ReturnAssetArgs = {
  assetId: Id<"assets">;
};

type RemoveAssetArgs = {
  assetId: Id<"assets">;
};

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

    return assetId;
  },
});

export const assignBorrower = mutation({
  args: {
    assetId: v.id("assets"),
    borrowerId: v.id("borrowers"),
  },
  handler: async (ctx, args: AssignBorrowerArgs) => {
    const now = Date.now();
    await ctx.db.patch(args.assetId, {
      borrowerId: args.borrowerId,
      status: "BORROWED",
    });

    await ctx.db.insert("assetLogs", {
      assetId: args.assetId,
      action: "ASSIGN",
      borrowerId: args.borrowerId,
      message: "Assigned to borrower",
      createdAt: now,
    });
  },
});

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

    await ctx.db.insert("assetLogs", {
      assetId: args.assetId,
      action: "RETURN",
      borrowerId: asset?.borrowerId,
      message: "Returned to inventory",
      createdAt: now,
    });
  },
});

export const remove = mutation({
  args: {
    assetId: v.id("assets"),
  },
  handler: async (ctx, args: RemoveAssetArgs) => {
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
