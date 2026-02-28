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
    // Legacy fields kept temporarily for migration compatibility.
    assetTag: v.string(),
    brand: v.optional(v.string()),
    category: v.optional(v.string()),
    assignedTo: v.optional(v.string()),
    location: v.optional(v.string()),
    model: v.optional(v.string()),
    notes: v.optional(v.string()),
    dateAcquired: v.optional(v.number()),
    assetType: v.optional(v.string()),
    assetNameDescription: v.optional(v.string()),
    specifications: v.optional(v.string()),
    serialNumber: v.string(),
    locationPersonAssigned: v.optional(v.string()),
    department: v.optional(v.string()),
    status: v.string(),
    turnoverTo: v.optional(v.string()),
    assignedDate: v.optional(v.string()),
    purchaseDate: v.optional(v.string()),
    warranty: v.optional(v.string()),
    remarks: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_assetTag", ["assetTag"])
    .index("by_serialNumber", ["serialNumber"])
    .index("by_status", ["status"])
    .index("by_locationPersonAssigned", ["locationPersonAssigned"])
    .index("by_turnoverTo", ["turnoverTo"]),
});
