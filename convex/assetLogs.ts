import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

type ListByAssetArgs = {
  assetId: Id<"assets">;
};

export const listByAsset = query({
  args: {
    assetId: v.id("assets"),
  },
  handler: async (ctx, args: ListByAssetArgs) => {
    return await ctx.db
      .query("assetLogs")
      .withIndex("by_assetId", (q) => q.eq("assetId", args.assetId))
      .order("desc")
      .collect();
  },
});
