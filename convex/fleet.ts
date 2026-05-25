import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const DRIVER_STATUSES = ["Available", "Assigned", "Unavailable"] as const;
const VEHICLE_STATUSES = ["Available", "Assigned", "Maintenance", "Unavailable"] as const;

function normalizeRequired(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function normalizeOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeCapacity(value?: number) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 1) {
    throw new Error("Capacity must be at least 1.");
  }
  return value;
}

function ensureDriverStatus(value?: string) {
  const status = value?.trim() || DRIVER_STATUSES[0];
  if (!DRIVER_STATUSES.includes(status as (typeof DRIVER_STATUSES)[number])) {
    throw new Error("Invalid driver status.");
  }
  return status;
}

function ensureVehicleStatus(value?: string) {
  const status = value?.trim() || VEHICLE_STATUSES[0];
  if (!VEHICLE_STATUSES.includes(status as (typeof VEHICLE_STATUSES)[number])) {
    throw new Error("Invalid vehicle status.");
  }
  return status;
}

export const listAvailability = query({
  args: {
    includeUnavailable: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const drivers = await ctx.db.query("fleetDrivers").withIndex("by_updatedAt").order("desc").collect();
    const vehicles = await ctx.db.query("fleetVehicles").withIndex("by_updatedAt").order("desc").collect();

    return {
      drivers: drivers.filter((driver) => args.includeUnavailable || driver.status === "Available"),
      vehicles: vehicles.filter((vehicle) => args.includeUnavailable || vehicle.status === "Available"),
    };
  },
});

export const createDriver = mutation({
  args: {
    name: v.string(),
    position: v.optional(v.string()),
    contactNumber: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("fleetDrivers", {
      name: normalizeRequired(args.name, "Driver name"),
      position: normalizeOptional(args.position),
      contactNumber: normalizeOptional(args.contactNumber),
      status: ensureDriverStatus(args.status),
      notes: normalizeOptional(args.notes),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateDriver = mutation({
  args: {
    driverId: v.id("fleetDrivers"),
    name: v.string(),
    position: v.optional(v.string()),
    contactNumber: v.optional(v.string()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.driverId, {
      name: normalizeRequired(args.name, "Driver name"),
      position: normalizeOptional(args.position),
      contactNumber: normalizeOptional(args.contactNumber),
      status: ensureDriverStatus(args.status),
      notes: normalizeOptional(args.notes),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const deleteDriver = mutation({
  args: {
    driverId: v.id("fleetDrivers"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.driverId);
    return { success: true };
  },
});

export const createVehicle = mutation({
  args: {
    name: v.string(),
    plateNumber: v.string(),
    vehicleType: v.string(),
    capacity: v.optional(v.number()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("fleetVehicles", {
      name: normalizeRequired(args.name, "Vehicle name"),
      plateNumber: normalizeRequired(args.plateNumber, "Plate number"),
      vehicleType: normalizeRequired(args.vehicleType, "Vehicle type"),
      capacity: normalizeCapacity(args.capacity),
      status: ensureVehicleStatus(args.status),
      notes: normalizeOptional(args.notes),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateVehicle = mutation({
  args: {
    vehicleId: v.id("fleetVehicles"),
    name: v.string(),
    plateNumber: v.string(),
    vehicleType: v.string(),
    capacity: v.optional(v.number()),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.vehicleId, {
      name: normalizeRequired(args.name, "Vehicle name"),
      plateNumber: normalizeRequired(args.plateNumber, "Plate number"),
      vehicleType: normalizeRequired(args.vehicleType, "Vehicle type"),
      capacity: normalizeCapacity(args.capacity),
      status: ensureVehicleStatus(args.status),
      notes: normalizeOptional(args.notes),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const deleteVehicle = mutation({
  args: {
    vehicleId: v.id("fleetVehicles"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.vehicleId);
    return { success: true };
  },
});

export const assignTravelOrderFleet = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    driverId: v.id("fleetDrivers"),
    vehicleId: v.id("fleetVehicles"),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Travel order could not be found.");
    }
    if (ticket.category !== "Travel Order") {
      throw new Error("Fleet assignment is only available for Travel Orders.");
    }

    const driver = await ctx.db.get(args.driverId);
    if (!driver) {
      throw new Error("Driver could not be found.");
    }

    const vehicle = await ctx.db.get(args.vehicleId);
    if (!vehicle) {
      throw new Error("Vehicle could not be found.");
    }

    const replacingDriver = ticket.fleetDriverId && ticket.fleetDriverId !== args.driverId;
    const replacingVehicle = ticket.fleetVehicleId && ticket.fleetVehicleId !== args.vehicleId;

    if (driver.status !== "Available" && ticket.fleetDriverId !== args.driverId) {
      throw new Error(`${driver.name} is not available for assignment.`);
    }
    if (vehicle.status !== "Available" && ticket.fleetVehicleId !== args.vehicleId) {
      throw new Error(`${vehicle.name} is not available for assignment.`);
    }

    const now = Date.now();
    const actorName = normalizeRequired(args.actorName, "Actor name");

    if (replacingDriver && ticket.fleetDriverId) {
      const previousDriver = await ctx.db.get(ticket.fleetDriverId);
      if (previousDriver) {
        await ctx.db.patch(ticket.fleetDriverId, {
          status: "Available",
          updatedAt: now,
        });
      }
    }

    if (replacingVehicle && ticket.fleetVehicleId) {
      const previousVehicle = await ctx.db.get(ticket.fleetVehicleId);
      if (previousVehicle) {
        await ctx.db.patch(ticket.fleetVehicleId, {
          status: "Available",
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(args.driverId, {
      status: "Assigned",
      updatedAt: now,
    });

    await ctx.db.patch(args.vehicleId, {
      status: "Assigned",
      updatedAt: now,
    });

    await ctx.db.patch(args.ticketId, {
      fleetDriverId: args.driverId,
      fleetDriverName: driver.name,
      fleetVehicleId: args.vehicleId,
      fleetVehicleName: vehicle.name,
      fleetVehiclePlateNumber: vehicle.plateNumber,
      fleetAssignedAt: now,
      fleetAssignedBy: actorName,
      status: "Assigned",
      updatedAt: now,
      updatedBy: actorName,
    });

    return { success: true };
  },
});

export const markTravelOrderDone = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Travel order could not be found.");
    }
    if (ticket.category !== "Travel Order") {
      throw new Error("This action is only available for Travel Orders.");
    }

    const now = Date.now();
    const actorName = normalizeRequired(args.actorName, "Actor name");

    if (ticket.fleetDriverId) {
      const driver = await ctx.db.get(ticket.fleetDriverId);
      if (driver) {
        await ctx.db.patch(ticket.fleetDriverId, {
          status: "Available",
          updatedAt: now,
        });
      }
    }

    if (ticket.fleetVehicleId) {
      const vehicle = await ctx.db.get(ticket.fleetVehicleId);
      if (vehicle) {
        await ctx.db.patch(ticket.fleetVehicleId, {
          status: "Available",
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(args.ticketId, {
      status: "Fulfilled",
      fulfillmentNote: ticket.fulfillmentNote ?? "Travel marked done by HR/Admin.",
      fulfilledAt: now,
      updatedAt: now,
      updatedBy: actorName,
    });

    return { success: true };
  },
});

export const cancelTravelOrder = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Travel order could not be found.");
    }
    if (ticket.category !== "Travel Order") {
      throw new Error("Only travel orders can be cancelled from the fleet view.");
    }

    const now = Date.now();
    const actorName = normalizeRequired(args.actorName, "Actor name");

    if (ticket.fleetDriverId) {
      const driver = await ctx.db.get(ticket.fleetDriverId);
      if (driver) {
        await ctx.db.patch(ticket.fleetDriverId, { status: "Available", updatedAt: now });
      }
    }

    if (ticket.fleetVehicleId) {
      const vehicle = await ctx.db.get(ticket.fleetVehicleId);
      if (vehicle) {
        await ctx.db.patch(ticket.fleetVehicleId, { status: "Available", updatedAt: now });
      }
    }

    await ctx.db.patch(args.ticketId, {
      status: "Closed",
      closeReason: "Cancelled",
      closureNote: "Travel order cancelled by HR/Admin.",
      closedAt: now,
      updatedAt: now,
      updatedBy: actorName,
    });

    return { success: true };
  },
});

export const reopenTravelOrder = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Travel order could not be found.");
    }
    if (ticket.category !== "Travel Order") {
      throw new Error("Only travel orders can be reopened from the fleet view.");
    }

    const now = Date.now();
    const actorName = normalizeRequired(args.actorName, "Actor name");
    const hasAssignedFleet = Boolean(ticket.fleetDriverId && ticket.fleetVehicleId);

    if (hasAssignedFleet && ticket.fleetDriverId && ticket.fleetVehicleId) {
      const driver = await ctx.db.get(ticket.fleetDriverId);
      const vehicle = await ctx.db.get(ticket.fleetVehicleId);
      if (!driver) {
        throw new Error("The assigned driver record could not be found.");
      }
      if (!vehicle) {
        throw new Error("The assigned vehicle record could not be found.");
      }
      if (driver.status !== "Available") {
        throw new Error(`${driver.name} is not available. Choose a new driver after reopening.`);
      }
      if (vehicle.status !== "Available") {
        throw new Error(`${vehicle.name} is not available. Choose a new vehicle after reopening.`);
      }

      await ctx.db.patch(ticket.fleetDriverId, {
        status: "Assigned",
        updatedAt: now,
      });
      await ctx.db.patch(ticket.fleetVehicleId, {
        status: "Assigned",
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.ticketId, {
      status: hasAssignedFleet ? "Assigned" : "New",
      fulfillmentNote: undefined,
      fulfilledAt: undefined,
      closeReason: undefined,
      closureNote: undefined,
      closedAt: undefined,
      updatedAt: now,
      updatedBy: actorName,
    });

    return { success: true };
  },
});

export const seedSampleData = mutation({
  args: {},
  handler: async (ctx) => {
    const existingDrivers = await ctx.db.query("fleetDrivers").take(1);
    const existingVehicles = await ctx.db.query("fleetVehicles").take(1);
    const now = Date.now();

    if (!existingDrivers.length) {
      await ctx.db.insert("fleetDrivers", {
        name: "Juan Dela Cruz",
        position: "Company Driver",
        contactNumber: "0917 000 0001",
        status: "Available",
        notes: "Default sample record for testing.",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("fleetDrivers", {
        name: "Pedro Santos",
        position: "Company Driver",
        contactNumber: "0917 000 0002",
        status: "Available",
        notes: "Default sample record for testing.",
        createdAt: now,
        updatedAt: now,
      });
    }

    if (!existingVehicles.length) {
      await ctx.db.insert("fleetVehicles", {
        name: "Toyota Hiace",
        plateNumber: "ABC 1234",
        vehicleType: "Van",
        capacity: 12,
        status: "Available",
        notes: "Default sample record for testing.",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("fleetVehicles", {
        name: "Toyota Vios",
        plateNumber: "XYZ 5678",
        vehicleType: "Sedan",
        capacity: 4,
        status: "Available",
        notes: "Default sample record for testing.",
        createdAt: now,
        updatedAt: now,
      });
    }

    return { success: true };
  },
});
