import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  DIGITAL_INVENTORY_CURRENCIES,
  OFFICE_SOFTWARE_STATUSES,
  ACCESS_ACCOUNT_STATUSES,
  SUBSCRIPTION_BILLING_CYCLES,
  SUBSCRIPTION_STATUSES,
  isAccessAccountStatus,
  isDigitalInventoryCurrency,
  isOfficeSoftwareStatus,
  isSubscriptionBillingCycle,
  isSubscriptionStatus,
} from "../lib/digitalInventory";

type OfficeSoftwareDoc = Doc<"officeSoftwareInventory">;
type AccessAccountDoc = Doc<"accessAccountsInventory">;
type SubscriptionDoc = Doc<"subscriptionsInventory">;

function normalizeRequired(value: string, label: string) {
  const next = value.trim();
  if (!next) {
    throw new Error(`${label} is required.`);
  }
  return next;
}

function normalizeOptional(value?: string) {
  const next = value?.trim();
  return next ? next : undefined;
}

function normalizeOptionalNumber(value?: number) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Number fields must be zero or higher.");
  }
  return value;
}

function ensureOfficeSoftwareStatus(value?: string) {
  const status = value?.trim() || OFFICE_SOFTWARE_STATUSES[0];
  if (!isOfficeSoftwareStatus(status)) {
    throw new Error("Invalid office software status.");
  }
  return status;
}

function ensureAccessAccountStatus(value?: string) {
  const status = value?.trim() || ACCESS_ACCOUNT_STATUSES[0];
  if (!isAccessAccountStatus(status)) {
    throw new Error("Invalid access account status.");
  }
  return status;
}

function ensureSubscriptionStatus(value?: string) {
  const status = value?.trim() || SUBSCRIPTION_STATUSES[0];
  if (!isSubscriptionStatus(status)) {
    throw new Error("Invalid subscription status.");
  }
  return status;
}

function ensureBillingCycle(value?: string) {
  const billingCycle = value?.trim() || SUBSCRIPTION_BILLING_CYCLES[0];
  if (!isSubscriptionBillingCycle(billingCycle)) {
    throw new Error("Invalid billing cycle.");
  }
  return billingCycle;
}

function ensureCurrency(value?: string) {
  const currency = value?.trim() || DIGITAL_INVENTORY_CURRENCIES[0];
  if (!isDigitalInventoryCurrency(currency)) {
    throw new Error("Invalid currency.");
  }
  return currency;
}

function matchesSearch(values: Array<string | number | boolean | undefined>, search?: string) {
  const term = search?.trim().toLowerCase();
  if (!term) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(term));
}

function matchesOfficeSoftwareSearch(row: OfficeSoftwareDoc, search?: string) {
  return matchesSearch(
    [
      row.softwareName,
      row.vendor,
      row.version,
      row.licenseType,
      row.seatCount,
      row.assignedTo,
      row.department,
      row.renewalDate,
      row.status,
      row.notes,
    ],
    search,
  );
}

function matchesAccessAccountSearch(row: AccessAccountDoc, search?: string) {
  return matchesSearch(
    [
      row.systemName,
      row.accountName,
      row.accountType,
      row.ownerName,
      row.department,
      row.accessLevel,
      row.mfaEnabled ? "mfa yes enabled" : "mfa no disabled",
      row.lastReviewedDate,
      row.status,
      row.vaultReference,
      row.notes,
    ],
    search,
  );
}

function matchesSubscriptionSearch(row: SubscriptionDoc, search?: string) {
  return matchesSearch(
    [
      row.serviceName,
      row.vendor,
      row.planName,
      row.billingCycle,
      row.cost,
      row.currency,
      row.seatCount,
      row.ownerName,
      row.department,
      row.renewalDate,
      row.status,
      row.notes,
    ],
    search,
  );
}

export const listOfficeSoftware = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("officeSoftwareInventory").withIndex("by_updatedAt").order("desc").collect();
    return rows.filter((row) => matchesOfficeSoftwareSearch(row, args.search));
  },
});

export const createOfficeSoftware = mutation({
  args: {
    softwareName: v.string(),
    vendor: v.optional(v.string()),
    version: v.optional(v.string()),
    licenseType: v.optional(v.string()),
    seatCount: v.optional(v.number()),
    assignedTo: v.optional(v.string()),
    department: v.optional(v.string()),
    purchaseDate: v.optional(v.string()),
    renewalDate: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("officeSoftwareInventory", {
      softwareName: normalizeRequired(args.softwareName, "Software name"),
      vendor: normalizeOptional(args.vendor),
      version: normalizeOptional(args.version),
      licenseType: normalizeOptional(args.licenseType),
      seatCount: normalizeOptionalNumber(args.seatCount),
      assignedTo: normalizeOptional(args.assignedTo),
      department: normalizeOptional(args.department),
      purchaseDate: normalizeOptional(args.purchaseDate),
      renewalDate: normalizeOptional(args.renewalDate),
      status: ensureOfficeSoftwareStatus(args.status),
      notes: normalizeOptional(args.notes),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateOfficeSoftware = mutation({
  args: {
    recordId: v.id("officeSoftwareInventory"),
    softwareName: v.string(),
    vendor: v.optional(v.string()),
    version: v.optional(v.string()),
    licenseType: v.optional(v.string()),
    seatCount: v.optional(v.number()),
    assignedTo: v.optional(v.string()),
    department: v.optional(v.string()),
    purchaseDate: v.optional(v.string()),
    renewalDate: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.recordId, {
      softwareName: normalizeRequired(args.softwareName, "Software name"),
      vendor: normalizeOptional(args.vendor),
      version: normalizeOptional(args.version),
      licenseType: normalizeOptional(args.licenseType),
      seatCount: normalizeOptionalNumber(args.seatCount),
      assignedTo: normalizeOptional(args.assignedTo),
      department: normalizeOptional(args.department),
      purchaseDate: normalizeOptional(args.purchaseDate),
      renewalDate: normalizeOptional(args.renewalDate),
      status: ensureOfficeSoftwareStatus(args.status),
      notes: normalizeOptional(args.notes),
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const removeOfficeSoftware = mutation({
  args: {
    recordId: v.id("officeSoftwareInventory"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.recordId);
    return { success: true };
  },
});

export const listAccessAccounts = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("accessAccountsInventory").withIndex("by_updatedAt").order("desc").collect();
    return rows.filter((row) => matchesAccessAccountSearch(row, args.search));
  },
});

export const createAccessAccount = mutation({
  args: {
    systemName: v.string(),
    accountName: v.string(),
    accountType: v.optional(v.string()),
    ownerName: v.optional(v.string()),
    department: v.optional(v.string()),
    accessLevel: v.optional(v.string()),
    mfaEnabled: v.boolean(),
    lastReviewedDate: v.optional(v.string()),
    status: v.optional(v.string()),
    vaultReference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("accessAccountsInventory", {
      systemName: normalizeRequired(args.systemName, "System name"),
      accountName: normalizeRequired(args.accountName, "Account name"),
      accountType: normalizeOptional(args.accountType),
      ownerName: normalizeOptional(args.ownerName),
      department: normalizeOptional(args.department),
      accessLevel: normalizeOptional(args.accessLevel),
      mfaEnabled: args.mfaEnabled,
      lastReviewedDate: normalizeOptional(args.lastReviewedDate),
      status: ensureAccessAccountStatus(args.status),
      vaultReference: normalizeOptional(args.vaultReference),
      notes: normalizeOptional(args.notes),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateAccessAccount = mutation({
  args: {
    recordId: v.id("accessAccountsInventory"),
    systemName: v.string(),
    accountName: v.string(),
    accountType: v.optional(v.string()),
    ownerName: v.optional(v.string()),
    department: v.optional(v.string()),
    accessLevel: v.optional(v.string()),
    mfaEnabled: v.boolean(),
    lastReviewedDate: v.optional(v.string()),
    status: v.optional(v.string()),
    vaultReference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.recordId, {
      systemName: normalizeRequired(args.systemName, "System name"),
      accountName: normalizeRequired(args.accountName, "Account name"),
      accountType: normalizeOptional(args.accountType),
      ownerName: normalizeOptional(args.ownerName),
      department: normalizeOptional(args.department),
      accessLevel: normalizeOptional(args.accessLevel),
      mfaEnabled: args.mfaEnabled,
      lastReviewedDate: normalizeOptional(args.lastReviewedDate),
      status: ensureAccessAccountStatus(args.status),
      vaultReference: normalizeOptional(args.vaultReference),
      notes: normalizeOptional(args.notes),
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const removeAccessAccount = mutation({
  args: {
    recordId: v.id("accessAccountsInventory"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.recordId);
    return { success: true };
  },
});

export const listSubscriptions = query({
  args: {
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("subscriptionsInventory").withIndex("by_updatedAt").order("desc").collect();
    return rows.filter((row) => matchesSubscriptionSearch(row, args.search));
  },
});

export const createSubscription = mutation({
  args: {
    serviceName: v.string(),
    vendor: v.optional(v.string()),
    planName: v.optional(v.string()),
    billingCycle: v.optional(v.string()),
    cost: v.optional(v.number()),
    currency: v.optional(v.string()),
    seatCount: v.optional(v.number()),
    ownerName: v.optional(v.string()),
    department: v.optional(v.string()),
    startDate: v.optional(v.string()),
    renewalDate: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("subscriptionsInventory", {
      serviceName: normalizeRequired(args.serviceName, "Service name"),
      vendor: normalizeOptional(args.vendor),
      planName: normalizeOptional(args.planName),
      billingCycle: ensureBillingCycle(args.billingCycle),
      cost: normalizeOptionalNumber(args.cost),
      currency: ensureCurrency(args.currency),
      seatCount: normalizeOptionalNumber(args.seatCount),
      ownerName: normalizeOptional(args.ownerName),
      department: normalizeOptional(args.department),
      startDate: normalizeOptional(args.startDate),
      renewalDate: normalizeOptional(args.renewalDate),
      status: ensureSubscriptionStatus(args.status),
      notes: normalizeOptional(args.notes),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateSubscription = mutation({
  args: {
    recordId: v.id("subscriptionsInventory"),
    serviceName: v.string(),
    vendor: v.optional(v.string()),
    planName: v.optional(v.string()),
    billingCycle: v.optional(v.string()),
    cost: v.optional(v.number()),
    currency: v.optional(v.string()),
    seatCount: v.optional(v.number()),
    ownerName: v.optional(v.string()),
    department: v.optional(v.string()),
    startDate: v.optional(v.string()),
    renewalDate: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.recordId, {
      serviceName: normalizeRequired(args.serviceName, "Service name"),
      vendor: normalizeOptional(args.vendor),
      planName: normalizeOptional(args.planName),
      billingCycle: ensureBillingCycle(args.billingCycle),
      cost: normalizeOptionalNumber(args.cost),
      currency: ensureCurrency(args.currency),
      seatCount: normalizeOptionalNumber(args.seatCount),
      ownerName: normalizeOptional(args.ownerName),
      department: normalizeOptional(args.department),
      startDate: normalizeOptional(args.startDate),
      renewalDate: normalizeOptional(args.renewalDate),
      status: ensureSubscriptionStatus(args.status),
      notes: normalizeOptional(args.notes),
      updatedAt: Date.now(),
    });
    return { success: true };
  },
});

export const removeSubscription = mutation({
  args: {
    recordId: v.id("subscriptionsInventory"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.recordId);
    return { success: true };
  },
});
