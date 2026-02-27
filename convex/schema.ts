import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  assets: defineTable({
    assetTag: v.string(),
    category: v.string(),
    status: v.string(),
    createdAt: v.number(),
    borrowerId: v.optional(v.id("borrowers")),
  }).index("by_assetTag", ["assetTag"]),
  borrowers: defineTable({
    fullName: v.string(),
    department: v.string(),
    createdAt: v.number(),
  }),
  assetLogs: defineTable({
    assetId: v.id("assets"),
    action: v.string(),
    borrowerId: v.optional(v.id("borrowers")),
    message: v.string(),
    createdAt: v.number(),
  }).index("by_assetId", ["assetId"]),
  hardwareInventory: defineTable({
    assetId: v.id("assets"),
    assetNumber: v.string(),
    assetType: v.string(),
    assetNameDescription: v.string(),
    specifications: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    location: v.optional(v.string()),
    personAssigned: v.optional(v.string()),
    department: v.optional(v.string()),
    status: v.string(),
    turnoverAssignedDate: v.optional(v.number()),
    purchaseDate: v.optional(v.string()),
    warrantyNotesRemarks: v.optional(v.string()),
    sourceSheet: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_assetId", ["assetId"])
    .index("by_assetNumber", ["assetNumber"]),
});
