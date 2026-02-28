import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

type RemoveBorrowerArgs = {
  borrowerId: Id<"borrowers">;
};

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("borrowers").collect();
  },
});

export const create = mutation({
  args: {
    fullName: v.string(),
    department: v.string(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("borrowers", {
      fullName: args.fullName,
      department: args.department,
      createdAt: args.createdAt,
    });
  },
});

export const remove = mutation({
  args: {
    borrowerId: v.id("borrowers"),
  },
  handler: async (ctx, args: RemoveBorrowerArgs) => {
    const now = Date.now();
    const assets = await ctx.db.query("assets").collect();
    const assignedAssets = assets.filter(
      (asset) => asset.borrowerId === args.borrowerId,
    );

    for (const asset of assignedAssets) {
      await ctx.db.patch(asset._id, {
        status: "AVAILABLE",
        borrowerId: undefined,
      });

      await ctx.db.insert("assetLogs", {
        assetId: asset._id,
        action: "RETURN",
        borrowerId: args.borrowerId,
        message: "Borrower deleted; returned to inventory",
        createdAt: now,
      });
    }

    await ctx.db.delete(args.borrowerId);
  },
});
