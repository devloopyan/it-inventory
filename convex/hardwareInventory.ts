import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  normalizeHardwareStatusValue,
  type HardwareStatus,
} from "../lib/hardwareStatuses";
import { isHardwareBorrowCondition } from "../lib/hardwareBorrowConditions";

const RESERVATION_STATUS_OPTIONS = ["Reserved", "Claimed", "Cancelled", "Expired"] as const;

const DEFAULT_PAGE_SIZE = 10;
const WORKSTATION_TYPES = ["Laptop", "Desktop/PC"] as const;
const REGISTER_MODE_OPTIONS = ["general", "workstation", "droneKit"] as const;
const RESERVABLE_STATUS_OPTIONS = ["Available", "Working"] as const;

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

function ensureBorrowCondition(value: string, label: string) {
  const next = normalizeRequired(value, label);
  if (!isHardwareBorrowCondition(next)) {
    throw new Error(`${label} is invalid.`);
  }
  return next;
}

function resolveTurnoverTo(personAssigned?: string, fallbackTurnoverTo?: string) {
  return personAssigned ?? fallbackTurnoverTo ?? "Unassigned";
}

function ensureStatus(value: string) {
  const normalized = normalizeHardwareStatusValue(value);
  if (normalized) return normalized;
  throw new Error("Invalid status.");
}

function ensureReservationStatus(value: string) {
  if ((RESERVATION_STATUS_OPTIONS as readonly string[]).includes(value)) return;
  throw new Error("Invalid reservation status.");
}

function isActiveReservation(row: { reservationStatus?: string }) {
  return row.reservationStatus === "Reserved";
}

function isDroneAssetType(assetType?: string) {
  return (assetType ?? "").trim().toLowerCase() === "drone";
}

function isDroneRelatedAssetType(assetType?: string) {
  const normalized = (assetType ?? "").trim().toLowerCase();
  return (
    normalized === "drone" ||
    normalized === "drone battery" ||
    normalized === "drone propeller" ||
    normalized === "drone charger" ||
    normalized === "drone controller"
  );
}

function normalizeHardwareInventoryRow<T extends { status: string }>(row: T): T {
  const normalizedStatus = normalizeHardwareStatusValue(row.status);
  if (!normalizedStatus || normalizedStatus === row.status) return row;
  return { ...row, status: normalizedStatus };
}

function normalizeHardwareActivityRow<T extends { status?: string }>(row: T): T {
  if (!row.status) return row;
  const normalizedStatus = normalizeHardwareStatusValue(row.status);
  if (!normalizedStatus || normalizedStatus === row.status) return row;
  return { ...row, status: normalizedStatus };
}

function normalizeWorkstationComponents(
  components?: {
    assetTag: string;
    componentType: string;
    specifications: string;
    imageStorageId?: Id<"_storage">;
  }[],
) {
  if (!components?.length) return undefined;

  return components.map((component, index) => ({
    assetTag: normalizeRequired(component.assetTag, `Component ${index + 1} Asset Tag`),
    componentType: normalizeRequired(component.componentType, `Component ${index + 1} Type`),
    specifications: normalizeRequired(
      component.specifications,
      `Component ${index + 1} Specifications`,
    ),
    imageStorageId: component.imageStorageId,
  }));
}

type HardwareActivityInput = {
  inventoryId?: Id<"hardwareInventory">;
  assetTag: string;
  assetNameDescription?: string;
  eventType: string;
  message: string;
  relatedPerson?: string;
  location?: string;
  status?: string;
  actorName?: string;
};

async function logHardwareActivity(
  ctx: unknown,
  input: HardwareActivityInput,
) {
  const db = (ctx as {
    db: {
      insert: (table: "hardwareActivityEvents", value: unknown) => Promise<unknown>;
    };
  }).db;

  await db.insert(
    "hardwareActivityEvents",
    {
      inventoryId: input.inventoryId,
      assetTag: input.assetTag,
      assetNameDescription: input.assetNameDescription,
      eventType: input.eventType,
      message: input.message,
      relatedPerson: input.relatedPerson,
      location: input.location,
      status: input.status,
      actorName: input.actorName,
      createdAt: Date.now(),
    } as never,
  );
}

function assertReservableAsset(existing: {
  status: string;
  locationPersonAssigned?: string;
  location?: string;
  reservationStatus?: string;
}) {
  const existingStatus = normalizeHardwareStatusValue(existing.status) ?? existing.status;
  if ((existing.locationPersonAssigned ?? existing.location ?? "") !== "MAIN STORAGE") {
    throw new Error("Only MAIN STORAGE assets can be reserved.");
  }
  if (!(RESERVABLE_STATUS_OPTIONS as readonly string[]).includes(existingStatus)) {
    throw new Error("Only available storage assets can be reserved.");
  }
  if (isActiveReservation(existing)) {
    throw new Error("This asset is already reserved.");
  }
  return existingStatus;
}

async function reserveInventoryAsset(
  ctx: unknown,
  args: {
    inventoryId: Id<"hardwareInventory">;
    borrowerName: string;
    department: string;
    requestedDate: string;
    expectedPickupDate?: string;
    purpose?: string;
  },
) {
  const db = (ctx as {
    db: {
      get: (id: Id<"hardwareInventory">) => Promise<Record<string, unknown> | null>;
      patch: (id: Id<"hardwareInventory">, value: unknown) => Promise<unknown>;
    };
  }).db;

  const existing = await db.get(args.inventoryId);
  if (!existing) throw new Error("Hardware asset not found.");

  const borrowerName = normalizeRequired(args.borrowerName, "Borrower Name");
  const department = normalizeRequired(args.department, "Department");
  const requestedDate = normalizeRequired(args.requestedDate, "Requested Date");
  const expectedPickupDate = normalizeOptional(args.expectedPickupDate);
  const purpose = normalizeOptional(args.purpose);
  const existingStatus = assertReservableAsset({
    status: String(existing.status ?? ""),
    locationPersonAssigned: existing.locationPersonAssigned as string | undefined,
    location: existing.location as string | undefined,
    reservationStatus: existing.reservationStatus as string | undefined,
  });

  ensureReservationStatus("Reserved");

  await db.patch(
    args.inventoryId,
    {
      reservationBorrower: borrowerName,
      reservationDepartment: department,
      reservationRequestedDate: requestedDate,
      reservationPickupDate: expectedPickupDate,
      reservationSlipNote: purpose,
      reservationLoggedAt: Date.now(),
      reservationStatus: "Reserved",
      updatedAt: Date.now(),
    } as never,
  );

  await logHardwareActivity(ctx, {
    inventoryId: args.inventoryId,
    assetTag: String(existing.assetTag ?? ""),
    assetNameDescription: existing.assetNameDescription as string | undefined,
    eventType: "reservation_created",
    message: "Main storage reservation created.",
    relatedPerson: borrowerName,
    location: (existing.locationPersonAssigned as string | undefined) ?? (existing.location as string | undefined),
    status: existingStatus,
  });
}

function getStatusEventMeta(status: string) {
  switch (status) {
    case "Borrowed":
      return {
        eventType: "asset_borrowed",
        message: "Asset marked as borrowed.",
      };
    case "Assigned":
      return {
        eventType: "asset_assigned",
        message: "Asset assigned / turnover completed.",
      };
    case "For Repair":
      return {
        eventType: "asset_for_repair",
        message: "Asset marked for repair.",
      };
    case "Retired":
      return {
        eventType: "asset_retired",
        message: "Asset retired from service.",
      };
    default:
      return {
        eventType: "status_changed",
        message: `Status changed to ${status}.`,
      };
  }
}

function matchesSearch(row: { [key: string]: string | undefined }, search: string) {
  if (!search) return true;
  const term = search.toLowerCase();
  return [
    row.assetTag,
    row.serialNumber,
    row.assetNameDescription,
    row.location,
    row.assignedTo,
    row.turnoverTo,
    row.borrower,
  ].some((value) => String(value ?? "").toLowerCase().includes(term));
}

export const list = query({
  args: {
    search: v.optional(v.string()),
    assetType: v.optional(v.string()),
    status: v.optional(v.string()),
    location: v.optional(v.string()),
    sortKey: v.optional(v.string()),
    sortDir: v.optional(v.string()),
    page: v.optional(v.number()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rows = (await ctx.db.query("hardwareInventory").collect()).map(normalizeHardwareInventoryRow);
    const search = args.search?.trim().toLowerCase() ?? "";
    const assetType = args.assetType?.trim().toLowerCase();
    const status = args.status?.trim();
    const normalizedStatusFilter = status ? ensureStatus(status) : undefined;
    const location = args.location?.trim();
    const page = args.page && args.page > 0 ? args.page : 1;
    const pageSize =
      args.pageSize && args.pageSize > 0 ? args.pageSize : DEFAULT_PAGE_SIZE;
    const sortKey = args.sortKey ?? "assetTag";
    const sortDir = args.sortDir === "asc" ? "asc" : "desc";

    const filtered = rows
      .filter((row) =>
        assetType ? String(row.assetType ?? "").trim().toLowerCase() === assetType : true,
      )
      .filter((row) => (normalizedStatusFilter ? row.status === normalizedStatusFilter : true))
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
            return row.location ?? row.locationPersonAssigned ?? "";
          case "personAssigned":
            return row.assignedTo ?? "";
          case "department":
            return row.department ?? "";
          case "status":
            return row.status;
          case "turnoverTo":
            return row.turnoverTo ?? "";
          case "borrower":
            return row.borrower ?? "";
          case "assignedDate":
            return (
              ((row as Record<string, unknown>).turnoverDate as string | undefined) ??
              row.assignedDate ??
              ""
            );
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
    const rows = (await ctx.db.query("hardwareInventory").collect()).map(normalizeHardwareInventoryRow);
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getById = query({
  args: {
    inventoryId: v.id("hardwareInventory"),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.inventoryId);
    return row ? normalizeHardwareInventoryRow(row) : row;
  },
});

export const listRecentActivity = query({
  args: {
    limit: v.optional(v.number()),
    inventoryId: v.optional(v.id("hardwareInventory")),
  },
  handler: async (ctx, args) => {
    const limit = args.limit && args.limit > 0 ? args.limit : 8;
    const rows = (await ctx.db.query("hardwareActivityEvents").collect()).map(normalizeHardwareActivityRow);
    const filtered = args.inventoryId
      ? rows.filter((row) => row.inventoryId === args.inventoryId)
      : rows;
    return filtered.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  },
});

export const migrateLegacy = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("hardwareInventory").collect();
    let updated = 0;

    for (const row of rows) {
      const legacyDesktopMonitorSlot = (row as Record<string, unknown>).desktopMonitorSlot as
        | string
        | undefined;
      const currentDesktopMonitorSerialNumber = (row as Record<string, unknown>)
        .desktopMonitorSerialNumber as string | undefined;
      const needsMigration =
        !row.assetType ||
        !row.assetNameDescription ||
        !row.specifications ||
        !row.locationPersonAssigned ||
        !row.department ||
        !row.turnoverTo ||
        !row.warranty ||
        (!!normalizeHardwareStatusValue(row.status) && normalizeHardwareStatusValue(row.status) !== row.status) ||
        (!!legacyDesktopMonitorSlot && !currentDesktopMonitorSerialNumber);

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
        row.location ??
        legacy.location ??
        "Unknown";
      const location = row.location ?? legacy.location ?? locationPersonAssigned;
      const personAssigned = row.assignedTo ?? legacy.assignedTo;
      const department = row.department ?? "General";
      const turnoverTo = row.turnoverTo ?? legacy.assignedTo ?? "Unassigned";
      const borrower =
        row.borrower ??
        ((normalizeHardwareStatusValue(row.status) ?? row.status) === "Borrowed"
          ? turnoverTo
          : undefined);

      const legacyDate = legacy.dateAcquired
        ? new Date(legacy.dateAcquired).toISOString().slice(0, 10)
        : undefined;
      const assignedDate = row.assignedDate ?? legacyDate;
      const turnoverDate =
        ((row as Record<string, unknown>).turnoverDate as string | undefined) ??
        (assetType === "Desktop/PC" ? assignedDate : undefined);
      const purchaseDate = row.purchaseDate ?? legacyDate;
      const warranty = row.warranty ?? "Unknown";

      const normalizedStatus =
        normalizeHardwareStatusValue(legacy.status) ??
        normalizeHardwareStatusValue(row.status) ??
        row.status;

      await ctx.db.patch(row._id, {
        assetType,
        assetNameDescription,
        specifications,
        location,
        assignedTo: personAssigned,
        locationPersonAssigned,
        department,
        turnoverTo,
        borrower,
        desktopMonitorSerialNumber: currentDesktopMonitorSerialNumber ?? legacyDesktopMonitorSlot,
        assignedDate: assetType === "Desktop/PC" ? undefined : assignedDate,
        turnoverDate,
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
    assignedDate: v.optional(v.string()),
    turnoverDate: v.optional(v.string()),
    purchaseDate: v.optional(v.string()),
    warranty: v.string(),
    remarks: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    receivingFormStorageId: v.optional(v.id("_storage")),
    turnoverFormStorageId: v.optional(v.id("_storage")),
    droneFlightReportStorageId: v.optional(v.id("_storage")),
    borrower: v.optional(v.string()),
    personAssigned: v.optional(v.string()),
    registerMode: v.optional(v.string()),
    workstationType: v.optional(v.string()),
    specsTier: v.optional(v.string()),
    desktopMonitorAssetTag: v.optional(v.string()),
    desktopMonitorSerialNumber: v.optional(v.string()),
    desktopMonitorSpecs: v.optional(v.string()),
    desktopMonitorConsumables: v.optional(v.string()),
    desktopSystemUnitAssetTag: v.optional(v.string()),
    desktopSystemUnitSpecs: v.optional(v.string()),
    desktopMouseAssetTag: v.optional(v.string()),
    desktopMouseSerialNumber: v.optional(v.string()),
    desktopMouseSpecs: v.optional(v.string()),
    desktopKeyboardAssetTag: v.optional(v.string()),
    desktopKeyboardSerialNumber: v.optional(v.string()),
    desktopKeyboardSpecs: v.optional(v.string()),
    workstationComponents: v.optional(
      v.array(
        v.object({
          assetTag: v.string(),
          componentType: v.string(),
          specifications: v.string(),
          imageStorageId: v.optional(v.id("_storage")),
        }),
      ),
    ),
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
      "Location",
    );
    const department = normalizeRequired(args.department, "Department");
    const status = ensureStatus(normalizeRequired(args.status, "Status"));
    const assignedDate = normalizeOptional(args.assignedDate);
    const turnoverDate = normalizeOptional(args.turnoverDate);
    const purchaseDate = normalizeOptional(args.purchaseDate);
    const warranty = normalizeRequired(args.warranty, "Warranty");
    const remarks = normalizeOptional(args.remarks);
    const imageStorageId = args.imageStorageId;
    const receivingFormStorageId = args.receivingFormStorageId;
    const turnoverFormStorageId = args.turnoverFormStorageId;
    const droneFlightReportStorageId = args.droneFlightReportStorageId;
    const borrower = normalizeOptional(args.borrower);
    const personAssigned = normalizeOptional(args.personAssigned);
    const registerMode = normalizeOptional(args.registerMode);
    const workstationType = normalizeOptional(args.workstationType);
    const specsTier = normalizeOptional(args.specsTier);
    const desktopMonitorAssetTag = normalizeOptional(args.desktopMonitorAssetTag);
    const desktopMonitorSerialNumber = normalizeOptional(args.desktopMonitorSerialNumber);
    const desktopMonitorSpecs = normalizeOptional(args.desktopMonitorSpecs);
    const desktopMonitorConsumables = normalizeOptional(args.desktopMonitorConsumables);
    const desktopSystemUnitAssetTag = normalizeOptional(args.desktopSystemUnitAssetTag);
    const desktopSystemUnitSpecs = normalizeOptional(args.desktopSystemUnitSpecs);
    const desktopMouseAssetTag = normalizeOptional(args.desktopMouseAssetTag);
    const desktopMouseSerialNumber = normalizeOptional(args.desktopMouseSerialNumber);
    const desktopMouseSpecs = normalizeOptional(args.desktopMouseSpecs);
    const desktopKeyboardAssetTag = normalizeOptional(args.desktopKeyboardAssetTag);
    const desktopKeyboardSerialNumber = normalizeOptional(args.desktopKeyboardSerialNumber);
    const desktopKeyboardSpecs = normalizeOptional(args.desktopKeyboardSpecs);
    const workstationComponents = normalizeWorkstationComponents(args.workstationComponents);
    const turnoverTo = resolveTurnoverTo(personAssigned);
    const effectiveStatus: HardwareStatus = turnoverFormStorageId ? "Assigned" : status;
    const isDesktopAsset = assetType === "Desktop/PC";
    const effectiveAssignedDate = isDesktopAsset ? undefined : assignedDate;
    const effectiveTurnoverDate = isDesktopAsset ? turnoverDate ?? assignedDate : undefined;

    if (effectiveStatus === "Borrowed") {
      if (!borrower) {
        throw new Error("Borrower Name is required when status is Borrowed.");
      }
    }

    if (registerMode && !(REGISTER_MODE_OPTIONS as readonly string[]).includes(registerMode)) {
      throw new Error("Invalid register mode.");
    }
    if (workstationType && !(WORKSTATION_TYPES as readonly string[]).includes(workstationType)) {
      throw new Error("Invalid workstation type.");
    }
    if (registerMode === "workstation" && !workstationType) {
      throw new Error("Workstation type is required.");
    }

    if (workstationType === "Desktop/PC") {
      if (!desktopMonitorAssetTag) {
        throw new Error("Monitor Asset Tag is required.");
      }
      if (!desktopMonitorSerialNumber) {
        throw new Error("Monitor Serial Number is required.");
      }
      if (!desktopSystemUnitAssetTag) {
        throw new Error("System Unit Asset Tag is required.");
      }
      if (!desktopMouseAssetTag || !desktopMouseSpecs) {
        throw new Error("Mouse Asset Tag and Mouse Specs are required.");
      }
      if (!desktopKeyboardAssetTag || !desktopKeyboardSpecs) {
        throw new Error("Keyboard Asset Tag and Keyboard Specs are required.");
      }
    }

    const seen = new Set<string>([assetTag.toLowerCase()]);
    if (desktopMonitorAssetTag) {
      const normalizedMonitorTag = desktopMonitorAssetTag.toLowerCase();
      if (seen.has(normalizedMonitorTag)) {
        throw new Error("Monitor Asset Tag must be different from the main Asset Tag.");
      }
      seen.add(normalizedMonitorTag);
    }
    if (desktopSystemUnitAssetTag) {
      const normalizedSystemUnitTag = desktopSystemUnitAssetTag.toLowerCase();
      if (seen.has(normalizedSystemUnitTag)) {
        throw new Error("System Unit Asset Tag must be unique.");
      }
      seen.add(normalizedSystemUnitTag);
    }
    if (desktopMouseAssetTag) {
      const normalizedMouseTag = desktopMouseAssetTag.toLowerCase();
      if (seen.has(normalizedMouseTag)) {
        throw new Error("Mouse Asset Tag must be unique.");
      }
      seen.add(normalizedMouseTag);
    }
    if (desktopKeyboardAssetTag) {
      const normalizedKeyboardTag = desktopKeyboardAssetTag.toLowerCase();
      if (seen.has(normalizedKeyboardTag)) {
        throw new Error("Keyboard Asset Tag must be unique.");
      }
      seen.add(normalizedKeyboardTag);
    }
    if (workstationComponents?.length) {
      for (const component of workstationComponents) {
        const normalizedTag = component.assetTag.toLowerCase();
        if (seen.has(normalizedTag)) {
          throw new Error("Each component Asset Tag must be unique.");
        }
        seen.add(normalizedTag);

        const existingComponentTag = await ctx.db
          .query("hardwareInventory")
          .withIndex("by_assetTag", (q) => q.eq("assetTag", component.assetTag))
          .first();
        if (existingComponentTag) {
          throw new Error(`Component Asset Tag ${component.assetTag} already exists.`);
        }
      }
    }

    if (desktopMonitorAssetTag) {
      const existingMonitorTag = await ctx.db
        .query("hardwareInventory")
        .withIndex("by_assetTag", (q) => q.eq("assetTag", desktopMonitorAssetTag))
        .first();
      if (existingMonitorTag) {
        throw new Error(`Monitor Asset Tag ${desktopMonitorAssetTag} already exists.`);
      }
    }

    if (desktopSystemUnitAssetTag) {
      const existingSystemUnitTag = await ctx.db
        .query("hardwareInventory")
        .withIndex("by_assetTag", (q) => q.eq("assetTag", desktopSystemUnitAssetTag))
        .first();
      if (existingSystemUnitTag) {
        throw new Error(`System Unit Asset Tag ${desktopSystemUnitAssetTag} already exists.`);
      }
    }
    if (desktopMouseAssetTag) {
      const existingMouseTag = await ctx.db
        .query("hardwareInventory")
        .withIndex("by_assetTag", (q) => q.eq("assetTag", desktopMouseAssetTag))
        .first();
      if (existingMouseTag) {
        throw new Error(`Mouse Asset Tag ${desktopMouseAssetTag} already exists.`);
      }
    }
    if (desktopKeyboardAssetTag) {
      const existingKeyboardTag = await ctx.db
        .query("hardwareInventory")
        .withIndex("by_assetTag", (q) => q.eq("assetTag", desktopKeyboardAssetTag))
        .first();
      if (existingKeyboardTag) {
        throw new Error(`Keyboard Asset Tag ${desktopKeyboardAssetTag} already exists.`);
      }
    }

    const existingByTag = await ctx.db
      .query("hardwareInventory")
      .withIndex("by_assetTag", (q) => q.eq("assetTag", assetTag))
      .first();
    if (existingByTag) {
      throw new Error("Asset Tag already exists.");
    }

    const now = Date.now();
    const inventoryId = await ctx.db.insert("hardwareInventory", {
      assetTag,
      assetType,
      assetNameDescription,
      specifications,
      location: locationPersonAssigned,
      assignedTo: personAssigned,
      serialNumber,
      locationPersonAssigned,
      department,
        status: effectiveStatus,
        turnoverTo,
        borrower: effectiveStatus === "Borrowed" ? borrower : undefined,
        registerMode,
        workstationType,
        specsTier,
        desktopMonitorAssetTag,
        desktopMonitorSerialNumber,
        desktopMonitorSpecs,
        desktopMonitorConsumables,
        desktopSystemUnitAssetTag,
        desktopSystemUnitSpecs,
        desktopMouseAssetTag,
        desktopMouseSerialNumber,
        desktopMouseSpecs,
        desktopKeyboardAssetTag,
        desktopKeyboardSerialNumber,
        desktopKeyboardSpecs,
        workstationComponents,
        assignedDate: effectiveAssignedDate,
        turnoverDate: effectiveTurnoverDate,
        purchaseDate,
      warranty,
        remarks,
        imageStorageId,
        receivingFormStorageId,
         turnoverFormStorageId,
         droneFlightReportStorageId,
         createdAt: now,
         updatedAt: now,
        } as never);

    await logHardwareActivity(ctx, {
      inventoryId,
      assetTag,
      assetNameDescription,
      eventType: "asset_created",
      message: "Asset added to hardware inventory.",
      relatedPerson: turnoverTo !== "Unassigned" ? turnoverTo : undefined,
      location: locationPersonAssigned,
      status: effectiveStatus,
    });

    if (receivingFormStorageId) {
      await logHardwareActivity(ctx, {
        inventoryId,
        assetTag,
        assetNameDescription,
        eventType: "receiving_form_uploaded",
        message: "Receiving form attached.",
        location: locationPersonAssigned,
        status: effectiveStatus,
      });
    }

    if (turnoverFormStorageId) {
      await logHardwareActivity(ctx, {
        inventoryId,
        assetTag,
        assetNameDescription,
        eventType: "turnover_form_uploaded",
        message: "Signed turnover form attached.",
        relatedPerson: turnoverTo !== "Unassigned" ? turnoverTo : undefined,
        location: locationPersonAssigned,
        status: effectiveStatus,
      });
    }

    if (droneFlightReportStorageId) {
      await logHardwareActivity(ctx, {
        inventoryId,
        assetTag,
        assetNameDescription,
        eventType: "drone_flight_report_uploaded",
        message: "Drone flight report attached.",
        relatedPerson: turnoverTo !== "Unassigned" ? turnoverTo : undefined,
        location: locationPersonAssigned,
        status: effectiveStatus,
      });
    }

    return inventoryId;
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
    borrower: v.optional(v.string()),
    personAssigned: v.optional(v.string()),
    assignedDate: v.optional(v.string()),
    turnoverDate: v.optional(v.string()),
    purchaseDate: v.optional(v.string()),
    warranty: v.string(),
    remarks: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    receivingFormStorageId: v.optional(v.id("_storage")),
    turnoverFormStorageId: v.optional(v.id("_storage")),
    droneFlightReportStorageId: v.optional(v.id("_storage")),
    clearImage: v.optional(v.boolean()),
    clearReceivingForm: v.optional(v.boolean()),
    clearTurnoverForm: v.optional(v.boolean()),
    clearDroneFlightReport: v.optional(v.boolean()),
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
      "Location",
    );
    const department = normalizeRequired(args.department, "Department");
    const status = ensureStatus(normalizeRequired(args.status, "Status"));
    const fallbackTurnoverTo = normalizeOptional(args.turnoverTo);
    const borrower = normalizeOptional(args.borrower);
    const personAssigned = normalizeOptional(args.personAssigned);
    const turnoverTo = resolveTurnoverTo(personAssigned, fallbackTurnoverTo);
    const assignedDate = normalizeOptional(args.assignedDate);
    const turnoverDate = normalizeOptional(args.turnoverDate);
    const purchaseDate = normalizeOptional(args.purchaseDate);
    const warranty = normalizeRequired(args.warranty, "Warranty");
    const remarks = normalizeOptional(args.remarks);
    const imageStorageId = args.imageStorageId;
    const receivingFormStorageId = args.receivingFormStorageId;
    const turnoverFormStorageId = args.turnoverFormStorageId;
    const droneFlightReportStorageId = args.droneFlightReportStorageId;
    const clearImage = args.clearImage === true;
    const clearReceivingForm = args.clearReceivingForm === true;
    const clearTurnoverForm = args.clearTurnoverForm === true;
    const clearDroneFlightReport = args.clearDroneFlightReport === true;
    const effectiveStatus: HardwareStatus = turnoverFormStorageId !== undefined ? "Assigned" : status;
    const isDesktopAsset = assetType === "Desktop/PC";
    const isDroneAsset = isDroneAssetType(assetType);
    const effectiveAssignedDate = isDesktopAsset ? undefined : assignedDate;
    const effectiveTurnoverDate = isDesktopAsset ? turnoverDate ?? assignedDate : undefined;
    const previousStatus = normalizeHardwareStatusValue(existing.status) ?? existing.status;
    const previousReceivingFormStorageId = (existing as Record<string, unknown>)
      .receivingFormStorageId as typeof args.receivingFormStorageId | undefined;
    const previousTurnoverFormStorageId = existing.turnoverFormStorageId;
    const previousDroneFlightReportStorageId = (existing as Record<string, unknown>)
      .droneFlightReportStorageId as typeof args.droneFlightReportStorageId | undefined;
    const previousDroneMissingPartsNote = (existing as Record<string, unknown>)
      .droneMissingPartsNote as string | undefined;

    if (effectiveStatus === "Borrowed") {
      if (!borrower) {
        throw new Error("Borrower Name is required when status is Borrowed.");
      }
    }

    if (assetTag !== existing.assetTag) {
      throw new Error("Asset Tag cannot be changed.");
    }

    const existingByTag = await ctx.db
      .query("hardwareInventory")
      .withIndex("by_assetTag", (q) => q.eq("assetTag", assetTag))
      .first();
    if (existingByTag && existingByTag._id !== args.inventoryId) {
      throw new Error("Asset Tag already exists.");
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
      location: string;
      assignedDate: string | undefined;
      turnoverDate: string | undefined;
      purchaseDate: string | undefined;
      warranty: string;
      remarks: string | undefined;
      updatedAt: number;
      imageStorageId?: typeof args.imageStorageId;
      receivingFormStorageId?: typeof args.receivingFormStorageId;
      turnoverFormStorageId?: typeof args.turnoverFormStorageId;
      droneFlightReportStorageId?: typeof args.droneFlightReportStorageId;
      droneMissingPartsNote?: string | undefined;
      borrower?: string | undefined;
      assignedTo?: string | undefined;
    } = {
      assetTag,
      assetType,
      assetNameDescription,
      specifications,
      serialNumber,
      location: locationPersonAssigned,
      locationPersonAssigned,
      department,
      status: effectiveStatus,
      turnoverTo,
      assignedDate: effectiveAssignedDate,
      turnoverDate: effectiveTurnoverDate,
      purchaseDate,
      warranty,
      remarks,
      updatedAt: Date.now(),
    };

    if (args.borrower !== undefined) {
      patchData.borrower = borrower;
    }
    if (args.personAssigned !== undefined) {
      patchData.assignedTo = personAssigned;
    }

    let nextImageStorageId = existing.imageStorageId;
    if (clearImage) {
      nextImageStorageId = undefined;
    }
    if (imageStorageId !== undefined) {
      nextImageStorageId = imageStorageId;
    }
    if (nextImageStorageId !== existing.imageStorageId) {
      patchData.imageStorageId = nextImageStorageId;
      if (existing.imageStorageId) {
        await ctx.storage.delete(existing.imageStorageId);
      }
    }

    let nextReceivingFormStorageId = (existing as Record<string, unknown>).receivingFormStorageId as
      | typeof args.receivingFormStorageId
      | undefined;
    if (clearReceivingForm) {
      nextReceivingFormStorageId = undefined;
    }
    if (receivingFormStorageId !== undefined) {
      nextReceivingFormStorageId = receivingFormStorageId;
    }
    if (nextReceivingFormStorageId !== previousReceivingFormStorageId) {
      patchData.receivingFormStorageId = nextReceivingFormStorageId;
      if (previousReceivingFormStorageId) {
        await ctx.storage.delete(previousReceivingFormStorageId);
      }
    }

    let nextTurnoverFormStorageId = existing.turnoverFormStorageId;
    if (clearTurnoverForm) {
      nextTurnoverFormStorageId = undefined;
    }
    if (turnoverFormStorageId !== undefined) {
      nextTurnoverFormStorageId = turnoverFormStorageId;
    }
    if (nextTurnoverFormStorageId !== previousTurnoverFormStorageId) {
      patchData.turnoverFormStorageId = nextTurnoverFormStorageId;
      if (previousTurnoverFormStorageId) {
        await ctx.storage.delete(previousTurnoverFormStorageId);
      }
    }

    let nextDroneFlightReportStorageId = (existing as Record<string, unknown>)
      .droneFlightReportStorageId as typeof args.droneFlightReportStorageId | undefined;
    if (clearDroneFlightReport) {
      nextDroneFlightReportStorageId = undefined;
    }
    if (droneFlightReportStorageId !== undefined) {
      nextDroneFlightReportStorageId = droneFlightReportStorageId;
    }
    if (isDroneAsset && previousStatus !== "Borrowed" && effectiveStatus === "Borrowed") {
      nextDroneFlightReportStorageId = undefined;
      patchData.droneMissingPartsNote = undefined;
    }
    if (nextDroneFlightReportStorageId !== previousDroneFlightReportStorageId) {
      patchData.droneFlightReportStorageId = nextDroneFlightReportStorageId;
      if (previousDroneFlightReportStorageId) {
        await ctx.storage.delete(previousDroneFlightReportStorageId);
      }
    }
    if (isDroneAsset && previousStatus === "Borrowed" && effectiveStatus !== "Borrowed") {
      if (!nextDroneFlightReportStorageId) {
        throw new Error("Drone flight report is required when returning a borrowed drone.");
      }
      patchData.droneMissingPartsNote = undefined;
    }
    if (
      isDroneAsset &&
      patchData.droneMissingPartsNote === undefined &&
      previousDroneMissingPartsNote !== undefined &&
      effectiveStatus !== "Borrowed"
    ) {
      patchData.droneMissingPartsNote = undefined;
    }

    if (effectiveStatus === "Borrowed") {
      patchData.borrower = borrower;
    } else {
      patchData.borrower = undefined;
    }

    await ctx.db.patch(args.inventoryId, patchData as never);

    const statusChanged = previousStatus !== effectiveStatus;
    const receivingFormAttached =
      nextReceivingFormStorageId !== previousReceivingFormStorageId && Boolean(nextReceivingFormStorageId);
    const turnoverFormAttached =
      nextTurnoverFormStorageId !== previousTurnoverFormStorageId && Boolean(nextTurnoverFormStorageId);
    const droneFlightReportAttached =
      nextDroneFlightReportStorageId !== previousDroneFlightReportStorageId &&
      Boolean(nextDroneFlightReportStorageId);

    if (statusChanged) {
      const statusEvent = getStatusEventMeta(effectiveStatus);
      await logHardwareActivity(ctx, {
        inventoryId: args.inventoryId,
        assetTag,
        assetNameDescription,
        eventType: statusEvent.eventType,
        message: statusEvent.message,
        relatedPerson: effectiveStatus === "Borrowed" ? borrower : turnoverTo,
        location: locationPersonAssigned,
        status: effectiveStatus,
      });
    }

    if (receivingFormAttached) {
      await logHardwareActivity(ctx, {
        inventoryId: args.inventoryId,
        assetTag,
        assetNameDescription,
        eventType: "receiving_form_uploaded",
        message: "Receiving form attached.",
        location: locationPersonAssigned,
        status: effectiveStatus,
      });
    }

    if (turnoverFormAttached) {
      await logHardwareActivity(ctx, {
        inventoryId: args.inventoryId,
        assetTag,
        assetNameDescription,
        eventType: "turnover_form_uploaded",
        message: "Signed turnover form attached.",
        relatedPerson: turnoverTo !== "Unassigned" ? turnoverTo : undefined,
        location: locationPersonAssigned,
        status: effectiveStatus,
      });
    }

    if (droneFlightReportAttached) {
      await logHardwareActivity(ctx, {
        inventoryId: args.inventoryId,
        assetTag,
        assetNameDescription,
        eventType: "drone_flight_report_uploaded",
        message: "Drone flight report attached.",
        relatedPerson: turnoverTo !== "Unassigned" ? turnoverTo : undefined,
        location: locationPersonAssigned,
        status: effectiveStatus,
      });
    }

    if (!statusChanged && !receivingFormAttached && !turnoverFormAttached && !droneFlightReportAttached) {
      await logHardwareActivity(ctx, {
        inventoryId: args.inventoryId,
        assetTag,
        assetNameDescription,
        eventType: "asset_updated",
        message: "Asset details updated.",
        relatedPerson: turnoverTo !== "Unassigned" ? turnoverTo : undefined,
        location: locationPersonAssigned,
        status: effectiveStatus,
      });
    }
  },
});

export const reserveAsset = mutation({
  args: {
    inventoryId: v.id("hardwareInventory"),
    borrowerName: v.string(),
    department: v.string(),
    requestedDate: v.string(),
    expectedPickupDate: v.optional(v.string()),
    purpose: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await reserveInventoryAsset(ctx, args);
  },
});

export const reserveAssets = mutation({
  args: {
    inventoryIds: v.array(v.id("hardwareInventory")),
    borrowerName: v.string(),
    department: v.string(),
    requestedDate: v.string(),
    expectedPickupDate: v.optional(v.string()),
    purpose: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const uniqueInventoryIds = [...new Set(args.inventoryIds.map((id) => String(id)))];
    if (!uniqueInventoryIds.length) {
      throw new Error("Select at least one asset to reserve.");
    }
    if (uniqueInventoryIds.length !== args.inventoryIds.length) {
      throw new Error("Each asset can only be selected once.");
    }

    for (const inventoryId of args.inventoryIds) {
      await reserveInventoryAsset(ctx, {
        inventoryId,
        borrowerName: args.borrowerName,
        department: args.department,
        requestedDate: args.requestedDate,
        expectedPickupDate: args.expectedPickupDate,
        purpose: args.purpose,
      });
    }
  },
});

export const cancelReservation = mutation({
  args: {
    inventoryId: v.id("hardwareInventory"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.inventoryId);
    if (!existing) throw new Error("Hardware asset not found.");
    if (!isActiveReservation(existing)) {
      throw new Error("There is no active reservation to cancel.");
    }

    ensureReservationStatus("Cancelled");

    await ctx.db.patch(
      args.inventoryId,
      {
        reservationBorrower: undefined,
        reservationDepartment: undefined,
        reservationRequestedDate: undefined,
        reservationPickupDate: undefined,
        reservationSlipNote: undefined,
        reservationLoggedAt: undefined,
        reservationStatus: "Cancelled",
        updatedAt: Date.now(),
      } as never,
    );

    await logHardwareActivity(ctx, {
      inventoryId: args.inventoryId,
      assetTag: existing.assetTag,
      assetNameDescription: existing.assetNameDescription,
      eventType: "reservation_cancelled",
      message: "Reservation cancelled and asset released.",
      relatedPerson:
        ((existing as Record<string, unknown>).reservationBorrower as string | undefined) ?? undefined,
      location: existing.locationPersonAssigned ?? existing.location,
      status: existing.status,
    });
  },
});

export const claimReservation = mutation({
  args: {
    inventoryId: v.id("hardwareInventory"),
    releaseCondition: v.string(),
    missingPartsNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.inventoryId);
    if (!existing) throw new Error("Hardware asset not found.");
    if (!isActiveReservation(existing)) {
      throw new Error("There is no active reservation to claim.");
    }

    const borrowerName = normalizeRequired(
      ((existing as Record<string, unknown>).reservationBorrower as string | undefined) ?? "",
      "Reserved Borrower",
    );
    const reservationDepartment = normalizeOptional(
      (existing as Record<string, unknown>).reservationDepartment as string | undefined,
    );
    const releaseCondition = ensureBorrowCondition(args.releaseCondition, "Release condition");
    const missingPartsNote = normalizeOptional(args.missingPartsNote);
    const previousDroneFlightReportStorageId = (existing as Record<string, unknown>)
      .droneFlightReportStorageId as Id<"_storage"> | undefined;
    const nextTurnoverTo =
      existing.turnoverTo && existing.turnoverTo.trim().toLowerCase() !== "unassigned"
        ? existing.turnoverTo
        : borrowerName;
    const shouldResetDroneFlightReport = isDroneAssetType(existing.assetType);

    ensureReservationStatus("Claimed");

    const now = Date.now();
    const patchData: {
      status: string;
      borrower: string;
      department: string | undefined;
      turnoverTo: string;
      reservationStatus: "Claimed";
      borrowedAt: number;
      borrowReleaseCondition: string;
      borrowReleaseConditionCheckedAt: number;
      borrowReturnCondition?: undefined;
      borrowReturnConditionCheckedAt?: undefined;
      updatedAt: number;
      droneFlightReportStorageId?: undefined;
      droneMissingPartsNote?: string | undefined;
    } = {
      status: "Borrowed",
      borrower: borrowerName,
      department: reservationDepartment ?? existing.department,
      turnoverTo: nextTurnoverTo,
      reservationStatus: "Claimed",
      borrowedAt: now,
      borrowReleaseCondition: releaseCondition,
      borrowReleaseConditionCheckedAt: now,
      borrowReturnCondition: undefined,
      borrowReturnConditionCheckedAt: undefined,
      updatedAt: now,
    };
    if (shouldResetDroneFlightReport) {
      patchData.droneFlightReportStorageId = undefined;
      patchData.droneMissingPartsNote = missingPartsNote;
    }

    await ctx.db.patch(args.inventoryId, patchData as never);

    if (shouldResetDroneFlightReport && previousDroneFlightReportStorageId) {
      await ctx.storage.delete(previousDroneFlightReportStorageId);
    }

    await logHardwareActivity(ctx, {
      inventoryId: args.inventoryId,
      assetTag: existing.assetTag,
      assetNameDescription: existing.assetNameDescription,
      eventType: "reservation_claimed",
      message: `Reservation claimed and converted to borrowed. Release condition: ${releaseCondition}.`,
      relatedPerson: borrowerName,
      location: existing.locationPersonAssigned ?? existing.location,
      status: "Borrowed",
    });
  },
});

export const returnDronePackage = mutation({
  args: {
    inventoryIds: v.array(v.id("hardwareInventory")),
    reportTargetInventoryId: v.id("hardwareInventory"),
    droneFlightReportStorageId: v.id("_storage"),
    returnCondition: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.inventoryIds.length) {
      throw new Error("No drone assets selected for return.");
    }

    const uniqueInventoryIds = [...new Set(args.inventoryIds)];
    if (!uniqueInventoryIds.includes(args.reportTargetInventoryId)) {
      throw new Error("Report target asset must be included in the return package.");
    }

    const returnCondition = ensureBorrowCondition(args.returnCondition, "Returned condition");

    const rows = await Promise.all(uniqueInventoryIds.map((inventoryId) => ctx.db.get(inventoryId)));
    const packageRows = rows.filter(Boolean);
    if (packageRows.length !== uniqueInventoryIds.length) {
      throw new Error("One or more drone assets were not found.");
    }

    const reportTargetRow = packageRows.find((row) => row!._id === args.reportTargetInventoryId);
    if (!reportTargetRow) {
      throw new Error("Report target asset was not found.");
    }
    if (!isDroneAssetType(reportTargetRow.assetType)) {
      throw new Error("Flight report must be attached to a Drone unit asset.");
    }

    for (const row of packageRows) {
      if (!isDroneRelatedAssetType(row!.assetType)) {
        throw new Error(`Asset ${row!.assetTag} is not a drone-related asset.`);
      }
      if (row!.status !== "Borrowed") {
        throw new Error(`Asset ${row!.assetTag} is not currently borrowed.`);
      }
    }

    const now = Date.now();

    for (const row of packageRows) {
      const existingDroneFlightReportStorageId = (row as Record<string, unknown>)
        .droneFlightReportStorageId as Id<"_storage"> | undefined;
      const isReportTarget = row!._id === args.reportTargetInventoryId;
      const patchData: {
        status: string;
        location: string;
        locationPersonAssigned: string;
        borrower: undefined;
        borrowReturnCondition: string;
        borrowReturnConditionCheckedAt: number;
        updatedAt: number;
        droneFlightReportStorageId?: Id<"_storage"> | undefined;
        droneMissingPartsNote?: undefined;
      } = {
        status: "Available",
        location: "MAIN STORAGE",
        locationPersonAssigned: "MAIN STORAGE",
        borrower: undefined,
        borrowReturnCondition: returnCondition,
        borrowReturnConditionCheckedAt: now,
        droneMissingPartsNote: undefined,
        updatedAt: now,
      };

      if (isReportTarget) {
        patchData.droneFlightReportStorageId = args.droneFlightReportStorageId;
      } else if (isDroneAssetType(row!.assetType)) {
        patchData.droneFlightReportStorageId = undefined;
      }

      await ctx.db.patch(row!._id, patchData as never);

      if (
        existingDroneFlightReportStorageId &&
        (!isReportTarget || existingDroneFlightReportStorageId !== args.droneFlightReportStorageId)
      ) {
        await ctx.storage.delete(existingDroneFlightReportStorageId);
      }

      await logHardwareActivity(ctx, {
        inventoryId: row!._id,
        assetTag: row!.assetTag,
        assetNameDescription: row!.assetNameDescription,
        eventType: "asset_returned",
        message: `Drone asset returned to main storage. Returned condition: ${returnCondition}.`,
        relatedPerson: row!.borrower ?? row!.turnoverTo ?? undefined,
        location: "MAIN STORAGE",
        status: "Available",
      });

      if (isReportTarget) {
        await logHardwareActivity(ctx, {
          inventoryId: row!._id,
          assetTag: row!.assetTag,
          assetNameDescription: row!.assetNameDescription,
          eventType: "drone_flight_report_uploaded",
          message: "Drone flight report attached on return.",
          relatedPerson: row!.borrower ?? row!.turnoverTo ?? undefined,
          location: "MAIN STORAGE",
          status: "Available",
        });
      }
    }

    return { returned: packageRows.length };
  },
});

export const returnBorrowedAsset = mutation({
  args: {
    inventoryId: v.id("hardwareInventory"),
    returnCondition: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.inventoryId);
    if (!existing) {
      throw new Error("Hardware asset not found.");
    }
    if (existing.status !== "Borrowed") {
      throw new Error("Asset is not currently borrowed.");
    }
    if (isDroneRelatedAssetType(existing.assetType)) {
      throw new Error("Drone assets must be returned through the drone return workflow with a flight report.");
    }

    const returnCondition = ensureBorrowCondition(args.returnCondition, "Returned condition");
    const now = Date.now();

    await ctx.db.patch(
      args.inventoryId,
      {
        status: "Available",
        location: "MAIN STORAGE",
        locationPersonAssigned: "MAIN STORAGE",
        borrower: undefined,
        borrowReturnCondition: returnCondition,
        borrowReturnConditionCheckedAt: now,
        updatedAt: now,
      } as never,
    );

    await logHardwareActivity(ctx, {
      inventoryId: args.inventoryId,
      assetTag: existing.assetTag,
      assetNameDescription: existing.assetNameDescription,
      eventType: "asset_returned",
      message: `Asset returned to main storage. Returned condition: ${returnCondition}.`,
      relatedPerson: existing.borrower ?? existing.turnoverTo ?? undefined,
      location: "MAIN STORAGE",
      status: "Available",
    });
  },
});

export const remove = mutation({
  args: {
    inventoryId: v.id("hardwareInventory"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.inventoryId);
    if (!existing) return;
    await logHardwareActivity(ctx, {
      inventoryId: args.inventoryId,
      assetTag: existing.assetTag,
      assetNameDescription: existing.assetNameDescription,
      eventType: "asset_deleted",
      message: "Asset removed from hardware inventory.",
      relatedPerson: existing.turnoverTo ?? existing.assignedTo,
      location: existing.locationPersonAssigned ?? existing.location,
      status: existing.status,
    });
    if (existing.imageStorageId) {
      await ctx.storage.delete(existing.imageStorageId);
    }
    const receivingFormStorageId = (existing as Record<string, unknown>).receivingFormStorageId;
    if (receivingFormStorageId) {
      await ctx.storage.delete(receivingFormStorageId as never);
    }
    if (existing.turnoverFormStorageId) {
      await ctx.storage.delete(existing.turnoverFormStorageId);
    }
    const droneFlightReportStorageId = (existing as Record<string, unknown>)
      .droneFlightReportStorageId as Id<"_storage"> | undefined;
    if (droneFlightReportStorageId) {
      await ctx.storage.delete(droneFlightReportStorageId);
    }
    const workstationComponentImageStorageIds =
      existing.workstationComponents
        ?.flatMap((component) => (component.imageStorageId ? [component.imageStorageId] : [])) ?? [];
    for (const storageId of workstationComponentImageStorageIds) {
      await ctx.storage.delete(storageId);
    }
    await ctx.db.delete(args.inventoryId);
  },
});
