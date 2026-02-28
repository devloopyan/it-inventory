import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const STATUS_OPTIONS = [
  "Borrowed",
  "Assigned",
  "For Repair",
  "Retired",
  "Available",
  "Working",
] as const;

const DEFAULT_PAGE_SIZE = 10;

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

function ensureStatus(value: string) {
  if ((STATUS_OPTIONS as readonly string[]).includes(value)) return;
  throw new Error("Invalid status.");
}

function matchesSearch(row: { [key: string]: string | undefined }, search: string) {
  if (!search) return true;
  const term = search.toLowerCase();
  return [
    row.assetTag,
    row.serialNumber,
    row.assetNameDescription,
    row.turnoverTo,
  ].some((value) => String(value ?? "").toLowerCase().includes(term));
}

export const list = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(v.string()),
    location: v.optional(v.string()),
    sortKey: v.optional(v.string()),
    sortDir: v.optional(v.string()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("hardwareInventory").collect();
    const search = args.search?.trim().toLowerCase() ?? "";
    const status = args.status?.trim();
    const location = args.location?.trim();
    const page = args.page && args.page > 0 ? args.page : 1;
    const pageSize =
      args.pageSize && args.pageSize > 0 ? args.pageSize : DEFAULT_PAGE_SIZE;
    const sortKey = args.sortKey ?? "assetTag";
    const sortDir = args.sortDir === "asc" ? "asc" : "desc";

    const filtered = rows
      .filter((row) => (status ? row.status === status : true))
      .filter((row) =>
        location
          ? String(row.locationPersonAssigned ?? "")
              .toLowerCase()
              .includes(location.toLowerCase())
          : true,
      )
      .filter((row) =>
        matchesSearch(row as unknown as { [key: string]: string | undefined }, search),
      );

    const sorted = [...filtered].sort((a, b) => {
      const getValue = (row: typeof a) => {
        switch (sortKey) {
          case "assetType":
            return row.assetType ?? "";
          case "assetNameDescription":
            return row.assetNameDescription ?? "";
          case "specifications":
            return row.specifications ?? "";
          case "serialNumber":
            return row.serialNumber;
          case "locationPersonAssigned":
            return row.locationPersonAssigned ?? "";
          case "department":
            return row.department ?? "";
          case "status":
            return row.status;
          case "turnoverTo":
            return row.turnoverTo ?? "";
          case "assignedDate":
            return row.assignedDate ?? "";
          case "purchaseDate":
            return row.purchaseDate ?? "";
          case "warranty":
            return row.warranty ?? "";
          case "remarks":
            return row.remarks ?? "";
          case "assetTag":
          default:
            return row.assetTag;
        }
      };

      const leftText = String(getValue(a) ?? "").toLowerCase();
      const rightText = String(getValue(b) ?? "").toLowerCase();

      if (leftText === rightText) return 0;
      if (sortDir === "asc") return leftText > rightText ? 1 : -1;
      return leftText < rightText ? 1 : -1;
    });

    const total = sorted.length;
    const start = (page - 1) * pageSize;
    const items = sorted.slice(start, start + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getImageUrl = query({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("hardwareInventory").collect();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getById = query({
  args: {
    inventoryId: v.id("hardwareInventory"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.inventoryId);
  },
});

export const migrateLegacy = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("hardwareInventory").collect();
    let updated = 0;

    for (const row of rows) {
      const needsMigration =
        !row.assetType ||
        !row.assetNameDescription ||
        !row.specifications ||
        !row.locationPersonAssigned ||
        !row.department ||
        !row.turnoverTo ||
        !row.assignedDate ||
        !row.purchaseDate ||
        !row.warranty;

      if (!needsMigration) continue;

      const legacy = row as unknown as {
        brand?: string;
        model?: string;
        assignedTo?: string;
        location?: string;
        category?: string;
        dateAcquired?: number;
        status?: string;
      };

      const assetType = row.assetType ?? legacy.category ?? "Unknown";
      const assetNameDescription =
        row.assetNameDescription ??
        [legacy.brand, legacy.model].filter(Boolean).join(" ") ??
        row.assetTag;
      const specifications = row.specifications ?? "N/A";
      const locationPersonAssigned =
        row.locationPersonAssigned ??
        [legacy.location, legacy.assignedTo].filter(Boolean).join(" / ") ??
        legacy.location ??
        legacy.assignedTo ??
        "Unknown";
      const department = row.department ?? "General";
      const turnoverTo = row.turnoverTo ?? legacy.assignedTo ?? "Unassigned";

      const legacyDate = legacy.dateAcquired
        ? new Date(legacy.dateAcquired).toISOString().slice(0, 10)
        : undefined;
      const assignedDate = row.assignedDate ?? legacyDate ?? "Unknown";
      const purchaseDate = row.purchaseDate ?? legacyDate ?? "Unknown";
      const warranty = row.warranty ?? "Unknown";

      const normalizedStatus = (() => {
        switch (legacy.status) {
          case "In Stock":
          case "In Storage":
            return "Available";
          case "Borrowed":
            return "Borrowed";
          case "Assigned":
            return "Assigned";
          case "For Repair":
            return "For Repair";
          case "Retired":
            return "Retired";
          default:
            return row.status;
        }
      })();

      await ctx.db.patch(row._id, {
        assetType,
        assetNameDescription,
        specifications,
        locationPersonAssigned,
        department,
        turnoverTo,
        assignedDate,
        purchaseDate,
        warranty,
        status: normalizedStatus,
        updatedAt: Date.now(),
      });
      updated += 1;
    }

    return { updated };
  },
});

export const create = mutation({
  args: {
    assetTag: v.string(),
    assetType: v.string(),
    assetNameDescription: v.string(),
    specifications: v.string(),
    serialNumber: v.string(),
    locationPersonAssigned: v.string(),
    department: v.string(),
    status: v.string(),
    assignedDate: v.string(),
    purchaseDate: v.string(),
    warranty: v.string(),
    remarks: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const assetTag = normalizeRequired(args.assetTag, "Asset Tag");
    const assetType = normalizeRequired(args.assetType, "Asset Type");
    const assetNameDescription = normalizeRequired(
      args.assetNameDescription,
      "Asset Name or Description",
    );
    const specifications = normalizeRequired(args.specifications, "Specifications");
    const serialNumber = normalizeRequired(args.serialNumber, "Serial Number");
    const locationPersonAssigned = normalizeRequired(
      args.locationPersonAssigned,
      "Location / Person Assigned",
    );
    const department = normalizeRequired(args.department, "Department");
    const status = normalizeRequired(args.status, "Status");
    const assignedDate = normalizeRequired(args.assignedDate, "Assigned Date");
    const purchaseDate = normalizeRequired(args.purchaseDate, "Purchase Date");
    const warranty = normalizeRequired(args.warranty, "Warranty");
    const remarks = normalizeOptional(args.remarks);
    const imageStorageId = args.imageStorageId;

    ensureStatus(status);

    const existingByTag = await ctx.db
      .query("hardwareInventory")
      .withIndex("by_assetTag", (q) => q.eq("assetTag", assetTag))
      .first();
    if (existingByTag) {
      throw new Error("Asset Tag already exists.");
    }

    const existingBySerial = await ctx.db
      .query("hardwareInventory")
      .withIndex("by_serialNumber", (q) => q.eq("serialNumber", serialNumber))
      .first();
    if (existingBySerial) {
      throw new Error("Serial Number already exists.");
    }

    const now = Date.now();
    return await ctx.db.insert("hardwareInventory", {
      assetTag,
      assetType,
      assetNameDescription,
      specifications,
      serialNumber,
      locationPersonAssigned,
      department,
      status,
      turnoverTo: "Unassigned",
      assignedDate,
      purchaseDate,
      warranty,
      remarks,
      imageStorageId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    inventoryId: v.id("hardwareInventory"),
    assetTag: v.string(),
    assetType: v.string(),
    assetNameDescription: v.string(),
    specifications: v.string(),
    serialNumber: v.string(),
    locationPersonAssigned: v.string(),
    department: v.string(),
    status: v.string(),
    turnoverTo: v.string(),
    assignedDate: v.string(),
    purchaseDate: v.string(),
    warranty: v.string(),
    remarks: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.inventoryId);
    if (!existing) throw new Error("Hardware asset not found.");

    const assetTag = normalizeRequired(args.assetTag, "Asset Tag");
    const assetType = normalizeRequired(args.assetType, "Asset Type");
    const assetNameDescription = normalizeRequired(
      args.assetNameDescription,
      "Asset Name or Description",
    );
    const specifications = normalizeRequired(args.specifications, "Specifications");
    const serialNumber = normalizeRequired(args.serialNumber, "Serial Number");
    const locationPersonAssigned = normalizeRequired(
      args.locationPersonAssigned,
      "Location / Person Assigned",
    );
    const department = normalizeRequired(args.department, "Department");
    const status = normalizeRequired(args.status, "Status");
    const turnoverTo = normalizeRequired(args.turnoverTo, "Turnover to / Borrower");
    const assignedDate = normalizeRequired(args.assignedDate, "Assigned Date");
    const purchaseDate = normalizeRequired(args.purchaseDate, "Purchase Date");
    const warranty = normalizeRequired(args.warranty, "Warranty");
    const remarks = normalizeOptional(args.remarks);

    ensureStatus(status);

    const existingByTag = await ctx.db
      .query("hardwareInventory")
      .withIndex("by_assetTag", (q) => q.eq("assetTag", assetTag))
      .first();
    if (existingByTag && existingByTag._id !== args.inventoryId) {
      throw new Error("Asset Tag already exists.");
    }

    const existingBySerial = await ctx.db
      .query("hardwareInventory")
      .withIndex("by_serialNumber", (q) => q.eq("serialNumber", serialNumber))
      .first();
    if (existingBySerial && existingBySerial._id !== args.inventoryId) {
      throw new Error("Serial Number already exists.");
    }

    const patchData: {
      assetTag: string;
      assetType: string;
      assetNameDescription: string;
      specifications: string;
      serialNumber: string;
      locationPersonAssigned: string;
      department: string;
      status: string;
      turnoverTo: string;
      assignedDate: string;
      purchaseDate: string;
      warranty: string;
      remarks: string | undefined;
      updatedAt: number;
      imageStorageId?: typeof args.imageStorageId;
    } = {
      assetTag,
      assetType,
      assetNameDescription,
      specifications,
      serialNumber,
      locationPersonAssigned,
      department,
      status,
      turnoverTo,
      assignedDate,
      purchaseDate,
      warranty,
      remarks,
      updatedAt: Date.now(),
    };

    if (args.imageStorageId !== undefined) {
      patchData.imageStorageId = args.imageStorageId;
    }

    await ctx.db.patch(args.inventoryId, patchData);
  },
});

export const remove = mutation({
  args: {
    inventoryId: v.id("hardwareInventory"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.inventoryId);
    if (!existing) return;
    if (existing.imageStorageId) {
      await ctx.storage.delete(existing.imageStorageId);
    }
    await ctx.db.delete(args.inventoryId);
  },
});
