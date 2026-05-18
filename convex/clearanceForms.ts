import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const ACCOUNTS_ACCESS_DEFAULTS = [
  { item: "outlook", label: "Outlook" },
  { item: "oneDrive", label: "OneDrive" },
  { item: "adminPortal", label: "Admin Portal" },
  { item: "googleAccounts", label: "Company-related Google Accounts" },
  { item: "pcPassword", label: "PC/Laptop User Account Password" },
  { item: "files", label: "Company-related Files (if applicable)" },
];

const IT_EQUIPMENT_DEFAULTS = [
  { item: "systemUnit", label: "System Unit" },
  { item: "mouse", label: "Mouse" },
  { item: "keyboard", label: "Keyboard" },
  { item: "monitor", label: "Monitor" },
  { item: "accessories", label: "Accessories" },
];

const checklistItemValidator = v.object({
  item: v.string(),
  label: v.string(),
  checked: v.boolean(),
  remarks: v.string(),
});

function categorizeAsset(asset: Doc<"hardwareInventory">): string {
  const text = `${asset.category ?? ""} ${asset.assetType ?? ""} ${asset.assetNameDescription ?? ""}`.toLowerCase();
  if (/system unit|desktop|laptop|cpu|computer|workstation|\bpc\b/.test(text)) return "systemUnit";
  if (text.includes("mouse")) return "mouse";
  if (text.includes("keyboard")) return "keyboard";
  if (/monitor|screen|display/.test(text)) return "monitor";
  return "accessories";
}

export const create = mutation({
  args: {
    employeeId: v.id("users"),
    filledBy: v.string(),
    filledByUsername: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.employeeId);
    if (!user) throw new Error("Employee not found.");

    const employeeKey = user.displayName.trim().toLowerCase();
    const allHardware = await ctx.db.query("hardwareInventory").collect();
    const assigned = allHardware.filter((asset) => {
      const candidates = [
        asset.locationPersonAssigned,
        asset.assignedTo,
        asset.borrower,
        asset.turnoverTo,
      ];
      return candidates.some(
        (field) => field?.trim().toLowerCase() === employeeKey,
      );
    });

    const itEquipment = IT_EQUIPMENT_DEFAULTS.map((option) => {
      const tags = assigned
        .filter((asset) => categorizeAsset(asset) === option.item)
        .map((asset) => asset.assetTag)
        .filter(Boolean);
      return {
        ...option,
        checked: false,
        remarks: tags.join(", "),
      };
    });

    const accountsAccess = ACCOUNTS_ACCESS_DEFAULTS.map((option) => ({
      ...option,
      checked: false,
      remarks: "",
    }));

    const now = Date.now();
    return await ctx.db.insert("clearanceForms", {
      employeeId: args.employeeId,
      employeeName: user.displayName,
      section: user.section,
      division: user.department,
      formDate: new Date().toISOString().slice(0, 10),
      accountsAccess,
      itEquipment,
      remarks: "",
      recommendation: "",
      checkedByName: "Lordwin Crisologo",
      checkedByRole: "IT Operations Team Lead",
      preApprovedByName: "Lordwin Crisologo",
      preApprovedByRole: "IT Operations Team Lead",
      approvedByName: "ENGR. CHRISTOPHER PATRICK ALMADEN",
      approvedByRole: "COO, Concurrent Manager, Operations and System Management",
      filledBy: args.filledBy,
      filledByUsername: args.filledByUsername,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    formId: v.id("clearanceForms"),
    section: v.optional(v.string()),
    division: v.optional(v.string()),
    formDate: v.string(),
    accountsAccess: v.array(checklistItemValidator),
    itEquipment: v.array(checklistItemValidator),
    remarks: v.string(),
    recommendation: v.string(),
    checkedByName: v.string(),
    checkedByRole: v.string(),
    preApprovedByName: v.string(),
    preApprovedByRole: v.string(),
    approvedByName: v.string(),
    approvedByRole: v.string(),
  },
  handler: async (ctx, args) => {
    const form = await ctx.db.get(args.formId);
    if (!form) throw new Error("Clearance form not found.");
    await ctx.db.patch(args.formId, {
      section: args.section,
      division: args.division,
      formDate: args.formDate,
      accountsAccess: args.accountsAccess,
      itEquipment: args.itEquipment,
      remarks: args.remarks,
      recommendation: args.recommendation,
      checkedByName: args.checkedByName,
      checkedByRole: args.checkedByRole,
      preApprovedByName: args.preApprovedByName,
      preApprovedByRole: args.preApprovedByRole,
      approvedByName: args.approvedByName,
      approvedByRole: args.approvedByRole,
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const get = query({
  args: { formId: v.id("clearanceForms") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.formId);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("clearanceForms")
      .withIndex("by_updatedAt")
      .order("desc")
      .collect();
  },
});

export const remove = mutation({
  args: { formId: v.id("clearanceForms") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.formId);
    return { success: true };
  },
});
