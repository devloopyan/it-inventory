import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  sendTravelOrderNotification,
  logTravelOrderActivity,
} from "./travelOrderNotifications";

const DRIVER_STATUSES = ["Available", "Assigned", "Unavailable"] as const;
const VEHICLE_STATUSES = ["Available", "Assigned", "Maintenance", "Unavailable"] as const;

const LATE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes in milliseconds

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

// ─── Queries ──────────────────────────────────────────────────────────────────

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

/**
 * Checks whether a driver or vehicle is already committed to an active travel
 * order that overlaps with the requested time window. Returns any conflicting
 * tickets so the dispatcher can make an informed decision.
 */
export const checkFleetConflict = query({
  args: {
    driverId: v.optional(v.id("fleetDrivers")),
    vehicleId: v.optional(v.id("fleetVehicles")),
    excludeTicketId: v.optional(v.id("monitoringTickets")),
  },
  handler: async (ctx, args) => {
    const ACTIVE_STATUSES = new Set([
      "New", "Triage", "In Progress", "Assigned", "Pending", "PENDING",
      "APPROVED", "DRIVER_ASSIGNED", "EN_ROUTE_TO_PICKUP",
      "PASSENGER_PICKED_UP", "IN_TRANSIT", "DELAYED", "RESCHEDULED",
    ]);

    const activeTravelOrders = await ctx.db
      .query("monitoringTickets")
      .withIndex("by_status")
      .collect()
      .then((tickets) =>
        tickets.filter(
          (t) =>
            t.category === "Travel Order" &&
            ACTIVE_STATUSES.has(t.status) &&
            t._id !== args.excludeTicketId,
        ),
      );

    const driverConflicts = args.driverId
      ? activeTravelOrders.filter((t) => t.fleetDriverId === args.driverId)
      : [];

    const vehicleConflicts = args.vehicleId
      ? activeTravelOrders.filter((t) => t.fleetVehicleId === args.vehicleId)
      : [];

    return {
      hasConflict: driverConflicts.length > 0 || vehicleConflicts.length > 0,
      driverConflicts: driverConflicts.map((t) => ({
        _id: t._id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        status: t.travelOrderStatus ?? t.status,
        requesterName: t.requesterName,
        requesterDepartment: t.requesterDepartment,
        fleetDriverName: t.fleetDriverName,
        fleetVehicleName: t.fleetVehicleName,
      })),
      vehicleConflicts: vehicleConflicts.map((t) => ({
        _id: t._id,
        ticketNumber: t.ticketNumber,
        title: t.title,
        status: t.travelOrderStatus ?? t.status,
        requesterName: t.requesterName,
        requesterDepartment: t.requesterDepartment,
        fleetDriverName: t.fleetDriverName,
        fleetVehicleName: t.fleetVehicleName,
      })),
    };
  },
});

// Parse the scheduled departure timestamp from a travel order's request details
// ("Departure: <date>"), as a fallback for older orders saved before travelDepartAt existed.
function parseDepartureMs(requestDetails?: string): number | undefined {
  const line = (requestDetails ?? "")
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => /^Departure:/i.test(entry));
  if (!line) return undefined;
  const ms = new Date(line.replace(/^Departure:\s*/i, "").trim()).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * For a chosen [from, to] window, returns each driver and vehicle with whether it is
 * available — i.e. not out of service and not already booked on an overlapping travel order.
 * Lets managers/team leaders see what's bookable for a planned trip date/time.
 */
export const getFleetAvailability = query({
  args: {
    from: v.number(),
    to: v.number(),
  },
  handler: async (ctx, { from, to }) => {
    const drivers = await ctx.db.query("fleetDrivers").withIndex("by_updatedAt").order("desc").collect();
    const vehicles = await ctx.db.query("fleetVehicles").withIndex("by_updatedAt").order("desc").collect();
    const tickets = await ctx.db.query("monitoringTickets").collect();

    const CANCELLED = new Set(["Cancelled", "Canceled"]);
    // Travel orders with a fleet assignment whose departure→return window overlaps [from, to].
    const overlapping = tickets.filter((t) => {
      if (t.category !== "Travel Order") return false;
      if (!t.fleetDriverId && !t.fleetVehicleId) return false;
      if (CANCELLED.has(t.status) || t.travelOrderStatus === "CANCELLED") return false;
      const start = t.travelDepartAt ?? parseDepartureMs(t.requestDetails);
      if (start === undefined) return false;
      const end = t.travelReturnAt ?? start;
      return start <= to && end >= from;
    });

    return {
      drivers: drivers.map((d) => {
        const outOfService = d.status === "Unavailable";
        const trip = outOfService ? undefined : overlapping.find((t) => t.fleetDriverId === d._id);
        return {
          _id: d._id,
          name: d.name,
          status: d.status,
          available: !outOfService && !trip,
          outOfService,
          conflict: trip ? { ticketNumber: trip.ticketNumber, title: trip.title } : null,
        };
      }),
      vehicles: vehicles.map((vh) => {
        const outOfService = vh.status === "Unavailable" || vh.status === "Maintenance";
        const trip = outOfService ? undefined : overlapping.find((t) => t.fleetVehicleId === vh._id);
        return {
          _id: vh._id,
          name: vh.name,
          plateNumber: vh.plateNumber,
          status: vh.status,
          available: !outOfService && !trip,
          outOfService,
          conflict: trip ? { ticketNumber: trip.ticketNumber, title: trip.title } : null,
        };
      }),
    };
  },
});

// ─── Driver CRUD ──────────────────────────────────────────────────────────────

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

// ─── Vehicle CRUD ─────────────────────────────────────────────────────────────

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

// ─── Fleet assignment (with conflict detection) ───────────────────────────────

export const assignTravelOrderFleet = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    driverId: v.id("fleetDrivers"),
    vehicleId: v.id("fleetVehicles"),
    actorName: v.string(),
    // When true the caller has acknowledged a conflict and wishes to proceed
    overrideConflict: v.optional(v.boolean()),
    overrideReason: v.optional(v.string()),
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

    // Conflict detection: check active travel orders for this driver/vehicle
    const ACTIVE_STATUSES = new Set([
      "New", "Triage", "In Progress", "Assigned", "Pending", "PENDING",
      "APPROVED", "DRIVER_ASSIGNED", "EN_ROUTE_TO_PICKUP",
      "PASSENGER_PICKED_UP", "IN_TRANSIT", "DELAYED", "RESCHEDULED",
    ]);
    const allActive = await ctx.db
      .query("monitoringTickets")
      .withIndex("by_status")
      .collect()
      .then((tickets) =>
        tickets.filter(
          (t) =>
            t.category === "Travel Order" &&
            ACTIVE_STATUSES.has(t.status) &&
            t._id !== args.ticketId,
        ),
      );

    const driverConflicts = allActive.filter((t) => t.fleetDriverId === args.driverId);
    const vehicleConflicts = allActive.filter((t) => t.fleetVehicleId === args.vehicleId);
    const hasConflict = driverConflicts.length > 0 || vehicleConflicts.length > 0;

    if (hasConflict && !args.overrideConflict) {
      throw new Error(
        `CONFLICT_DETECTED:${driverConflicts.map((t) => t.ticketNumber).join(",")}|${vehicleConflicts.map((t) => t.ticketNumber).join(",")}`,
      );
    }

    const now = Date.now();
    const actorName = normalizeRequired(args.actorName, "Actor name");

    if (replacingDriver && ticket.fleetDriverId) {
      const previousDriver = await ctx.db.get(ticket.fleetDriverId);
      if (previousDriver) {
        await ctx.db.patch(ticket.fleetDriverId, { status: "Available", updatedAt: now });
      }
    }

    if (replacingVehicle && ticket.fleetVehicleId) {
      const previousVehicle = await ctx.db.get(ticket.fleetVehicleId);
      if (previousVehicle) {
        await ctx.db.patch(ticket.fleetVehicleId, { status: "Available", updatedAt: now });
      }
    }

    await ctx.db.patch(args.driverId, { status: "Assigned", updatedAt: now });
    await ctx.db.patch(args.vehicleId, { status: "Assigned", updatedAt: now });

    const isReplacement = replacingDriver || replacingVehicle;
    const newTravelStatus = isReplacement
      ? (replacingDriver ? "DRIVER_REPLACED" : "VEHICLE_REPLACED")
      : "DRIVER_ASSIGNED";

    await ctx.db.patch(args.ticketId, {
      fleetDriverId: args.driverId,
      fleetDriverName: driver.name,
      fleetDriverContactNumber: driver.contactNumber,
      fleetVehicleId: args.vehicleId,
      fleetVehicleName: vehicle.name,
      fleetVehiclePlateNumber: vehicle.plateNumber,
      fleetVehicleType: vehicle.vehicleType,
      fleetAssignedAt: ticket.fleetAssignedAt ?? now,
      fleetAssignedBy: actorName,
      travelOrderStatus: newTravelStatus,
      status: "Assigned",
      updatedAt: now,
      updatedBy: actorName,
      ...(hasConflict && args.overrideConflict
        ? {
            conflictOverrideReason: normalizeOptional(args.overrideReason) ?? "Override approved by dispatcher.",
            conflictOverrideBy: actorName,
          }
        : {}),
    });

    // Notify requestee of assignment or replacement
    const eventLabel = isReplacement
      ? (replacingDriver ? "Driver Replaced" : "Vehicle Replaced")
      : "Driver Assigned";
    const message = isReplacement
      ? replacingDriver
        ? `Your travel order (${ticket.ticketNumber}) has been updated. New driver: ${driver.name}${driver.contactNumber ? ` (${driver.contactNumber})` : ""}. Vehicle: ${vehicle.name} (${vehicle.plateNumber}).`
        : `Your travel order (${ticket.ticketNumber}) has been updated. New vehicle: ${vehicle.name} (${vehicle.plateNumber}) — ${vehicle.vehicleType}.`
      : `A driver has been assigned to your travel order (${ticket.ticketNumber}). Driver: ${driver.name}${driver.contactNumber ? ` (${driver.contactNumber})` : ""}. Vehicle: ${vehicle.name} (${vehicle.plateNumber}).`;

    await sendTravelOrderNotification(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      recipientName: ticket.requesterName,
      recipientRole: "requester",
      event: isReplacement ? (replacingDriver ? "DRIVER_REPLACED" : "VEHICLE_REPLACED") : "DRIVER_ASSIGNED",
      message,
    });

    // Notify the driver
    await sendTravelOrderNotification(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      recipientName: driver.name,
      recipientRole: "driver",
      event: isReplacement ? (replacingDriver ? "DRIVER_REPLACED" : "VEHICLE_REPLACED") : "DRIVER_ASSIGNED",
      message: `You have been assigned to travel order ${ticket.ticketNumber} for ${ticket.requesterName}. Vehicle: ${vehicle.name} (${vehicle.plateNumber}).`,
    });

    if (hasConflict && args.overrideConflict) {
      await sendTravelOrderNotification(ctx, {
        ticketId: args.ticketId,
        ticketNumber: ticket.ticketNumber,
        recipientName: actorName,
        recipientRole: "admin",
        event: "CONFLICT_OVERRIDE",
        message: `Conflict override recorded on ${ticket.ticketNumber} by ${actorName}. Reason: ${args.overrideReason ?? "Not provided"}.`,
      });
    }

    await logTravelOrderActivity(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      event: eventLabel.toUpperCase().replace(/ /g, "_"),
      description: `${eventLabel}: ${driver.name} / ${vehicle.name} (${vehicle.plateNumber}) assigned by ${actorName}.`,
      actorName,
      actorRole: "dispatcher",
      metadata: JSON.stringify({
        driverId: args.driverId,
        vehicleId: args.vehicleId,
        overrideConflict: args.overrideConflict,
        overrideReason: args.overrideReason,
      }),
    });

    return { success: true };
  },
});

// ─── ETA update ───────────────────────────────────────────────────────────────

export const updateDriverETA = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    estimatedArrivalTime: v.number(),
    delayReason: v.optional(v.string()),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Travel order could not be found.");
    }
    if (ticket.category !== "Travel Order") {
      throw new Error("ETA update is only available for Travel Orders.");
    }

    const actorName = normalizeRequired(args.actorName, "Actor name");
    const now = Date.now();

    // Parse scheduled departure from requestDetails (stored as text)
    const departureLine = ticket.requestDetails
      ?.split(/\r?\n/)
      .find((line) => /^Departure:/i.test(line.trim()));
    const departureText = departureLine?.replace(/^Departure:\s*/i, "").trim();
    const scheduledPickupTime = departureText ? new Date(departureText).getTime() : null;

    const isLate =
      scheduledPickupTime !== null &&
      args.estimatedArrivalTime > scheduledPickupTime + LATE_THRESHOLD_MS;

    const newTravelStatus = isLate ? "DELAYED" : (ticket.travelOrderStatus ?? "DRIVER_ASSIGNED");

    await ctx.db.patch(args.ticketId, {
      estimatedArrivalTime: args.estimatedArrivalTime,
      etaUpdatedAt: now,
      etaUpdatedBy: actorName,
      delayReason: normalizeOptional(args.delayReason),
      travelOrderStatus: newTravelStatus,
      updatedAt: now,
      updatedBy: actorName,
    });

    // Notify requestee
    const etaFormatted = new Date(args.estimatedArrivalTime).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    const baseMessage = isLate
      ? `Your travel order (${ticket.ticketNumber}) is delayed. New ETA: ${etaFormatted}.${args.delayReason ? ` Reason: ${args.delayReason}` : ""}`
      : `Your travel order (${ticket.ticketNumber}) ETA has been updated to ${etaFormatted}.`;

    await sendTravelOrderNotification(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      recipientName: ticket.requesterName,
      recipientRole: "requester",
      event: isLate ? "DRIVER_DELAYED" : "ETA_UPDATED",
      message: baseMessage,
    });

    // Escalate to admin if delayed
    if (isLate) {
      await sendTravelOrderNotification(ctx, {
        ticketId: args.ticketId,
        ticketNumber: ticket.ticketNumber,
        recipientName: "admin",
        recipientRole: "admin",
        event: "DRIVER_DELAYED",
        message: `Travel order ${ticket.ticketNumber} (${ticket.requesterName}) is delayed. Driver ETA: ${etaFormatted}.${args.delayReason ? ` Reason: ${args.delayReason}` : ""}`,
      });
    }

    await logTravelOrderActivity(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      event: isLate ? "DELAYED" : "ETA_UPDATED",
      description: `ETA updated to ${etaFormatted} by ${actorName}.${isLate ? " Marked as DELAYED." : ""}${args.delayReason ? ` Reason: ${args.delayReason}` : ""}`,
      actorName,
      actorRole: "driver",
    });

    return { success: true, isLate };
  },
});

// ─── Status update (dispatcher / driver) ─────────────────────────────────────

export const updateTravelOrderStatus = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    travelOrderStatus: v.string(),
    actorName: v.string(),
    actorRole: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Travel order could not be found.");
    }
    if (ticket.category !== "Travel Order") {
      throw new Error("Status update is only available for Travel Orders.");
    }

    const actorName = normalizeRequired(args.actorName, "Actor name");
    const now = Date.now();

    await ctx.db.patch(args.ticketId, {
      travelOrderStatus: args.travelOrderStatus,
      updatedAt: now,
      updatedBy: actorName,
    });

    await logTravelOrderActivity(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      event: "STATUS_UPDATED",
      description: `Status changed to ${args.travelOrderStatus}${args.note ? `: ${args.note}` : ""} by ${actorName}.`,
      actorName,
      actorRole: args.actorRole,
    });

    // Notify requestee of relevant status changes
    const NOTIFY_REQUESTEE = new Set(["EN_ROUTE_TO_PICKUP", "PASSENGER_PICKED_UP", "IN_TRANSIT", "DROPPED_OFF", "COMPLETED"]);
    if (NOTIFY_REQUESTEE.has(args.travelOrderStatus)) {
      const labels: Record<string, string> = {
        EN_ROUTE_TO_PICKUP: "Your driver is on the way to the pickup point.",
        PASSENGER_PICKED_UP: "You have been picked up. The trip is starting.",
        IN_TRANSIT: "Your trip is now in transit.",
        DROPPED_OFF: "You have been dropped off at your destination.",
        COMPLETED: `Your travel order (${ticket.ticketNumber}) is now complete.`,
      };
      await sendTravelOrderNotification(ctx, {
        ticketId: args.ticketId,
        ticketNumber: ticket.ticketNumber,
        recipientName: ticket.requesterName,
        recipientRole: "requester",
        event: args.travelOrderStatus,
        message: labels[args.travelOrderStatus] ?? `Travel order status: ${args.travelOrderStatus}.`,
      });
    }

    return { success: true };
  },
});

// ─── Cancellation ─────────────────────────────────────────────────────────────

export const cancelTravelOrderWithReason = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    cancellationReason: v.string(),
    cancellationReasonDetail: v.optional(v.string()),
    actorName: v.string(),
    actorRole: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Travel order could not be found.");
    }
    if (ticket.category !== "Travel Order") {
      throw new Error("Only travel orders can be cancelled from the fleet view.");
    }
    if (ticket.travelOrderStatus === "CANCELLED") {
      throw new Error("This travel order is already cancelled.");
    }

    const TERMINAL_STATUSES = new Set(["COMPLETED", "DROPPED_OFF"]);
    if (ticket.travelOrderStatus && TERMINAL_STATUSES.has(ticket.travelOrderStatus)) {
      throw new Error("Completed travel orders cannot be cancelled.");
    }

    const actorName = normalizeRequired(args.actorName, "Actor name");
    const now = Date.now();
    const wasEnRoute = ticket.travelOrderStatus === "EN_ROUTE_TO_PICKUP" ||
      ticket.travelOrderStatus === "IN_TRANSIT" ||
      ticket.travelOrderStatus === "PASSENGER_PICKED_UP";

    // Release driver and vehicle
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
      travelOrderStatus: "CANCELLED",
      status: "Closed",
      cancellationReason: normalizeRequired(args.cancellationReason, "Cancellation reason"),
      cancellationReasonDetail: normalizeOptional(args.cancellationReasonDetail),
      cancelledBy: actorName,
      cancelledByRole: normalizeRequired(args.actorRole, "Actor role"),
      cancelledAt: now,
      closeReason: "Cancelled",
      closureNote: `Cancelled by ${actorName} (${args.actorRole}). Reason: ${args.cancellationReason}${args.cancellationReasonDetail ? ` — ${args.cancellationReasonDetail}` : ""}.`,
      closedAt: now,
      updatedAt: now,
      updatedBy: actorName,
    });

    const cancelMsg = `Your travel order (${ticket.ticketNumber}) has been cancelled by ${actorName} (${args.actorRole}). Reason: ${args.cancellationReason}${args.cancellationReasonDetail ? ` — ${args.cancellationReasonDetail}` : ""}.`;

    // Notify requestee
    await sendTravelOrderNotification(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      recipientName: ticket.requesterName,
      recipientRole: "requester",
      event: "CANCELLED",
      message: cancelMsg,
    });

    // Notify driver if they were en route
    if (wasEnRoute && ticket.fleetDriverName) {
      await sendTravelOrderNotification(ctx, {
        ticketId: args.ticketId,
        ticketNumber: ticket.ticketNumber,
        recipientName: ticket.fleetDriverName,
        recipientRole: "driver",
        event: "CANCELLED",
        message: `Travel order ${ticket.ticketNumber} has been cancelled. Please return to base. Reason: ${args.cancellationReason}.`,
      });
    }

    // Notify admin
    await sendTravelOrderNotification(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      recipientName: "admin",
      recipientRole: "admin",
      event: "CANCELLED",
      message: `Travel order ${ticket.ticketNumber} cancelled by ${actorName} (${args.actorRole}). Reason: ${args.cancellationReason}.`,
    });

    // If this is the primary of a shared trip, flag the linked order for manual billing review
    if (ticket.sharedTripRole === "PRIMARY" && ticket.sharedTripLinkedTicketId) {
      const linked = await ctx.db.get(ticket.sharedTripLinkedTicketId);
      if (linked) {
        await ctx.db.patch(ticket.sharedTripLinkedTicketId, {
          updatedAt: now,
          updatedBy: actorName,
          // TODO: Confirm with client — billing dispute flag field may need to be added
        });
        await sendTravelOrderNotification(ctx, {
          ticketId: ticket.sharedTripLinkedTicketId,
          ticketNumber: linked.ticketNumber,
          recipientName: "admin",
          recipientRole: "admin",
          event: "SHARED_TRIP_PRIMARY_CANCELLED",
          message: `Primary travel order ${ticket.ticketNumber} of shared trip was cancelled. Linked order ${linked.ticketNumber} requires manual billing review.`,
        });
        await sendTravelOrderNotification(ctx, {
          ticketId: ticket.sharedTripLinkedTicketId,
          ticketNumber: linked.ticketNumber,
          recipientName: linked.requesterName,
          recipientRole: "requester",
          event: "SHARED_TRIP_PRIMARY_CANCELLED",
          message: `The primary travel order of your shared trip (${ticket.ticketNumber}) has been cancelled. Your billing arrangement requires admin review. Please contact HR/Admin.`,
        });
      }
    }

    await logTravelOrderActivity(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      event: "CANCELLED",
      description: `Travel order cancelled by ${actorName} (${args.actorRole}). Reason: ${args.cancellationReason}${args.cancellationReasonDetail ? ` — ${args.cancellationReasonDetail}` : ""}.`,
      actorName,
      actorRole: args.actorRole,
      metadata: JSON.stringify({
        reason: args.cancellationReason,
        detail: args.cancellationReasonDetail,
        wasEnRoute,
      }),
    });

    return { success: true };
  },
});

// ─── Incident reporting ───────────────────────────────────────────────────────

export const reportIncident = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    incidentType: v.string(),
    incidentDescription: v.string(),
    incidentLocation: v.optional(v.string()),
    actorName: v.string(),
    actorRole: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Travel order could not be found.");
    }
    if (ticket.category !== "Travel Order") {
      throw new Error("Incident reporting is only available for Travel Orders.");
    }
    if (!["MINOR", "MAJOR"].includes(args.incidentType)) {
      throw new Error("Incident type must be MINOR or MAJOR.");
    }

    const actorName = normalizeRequired(args.actorName, "Actor name");
    const now = Date.now();

    await ctx.db.patch(args.ticketId, {
      travelOrderStatus: "INCIDENT_REPORTED",
      incidentType: args.incidentType,
      incidentDescription: normalizeRequired(args.incidentDescription, "Incident description"),
      incidentLocation: normalizeOptional(args.incidentLocation),
      incidentReportedAt: now,
      incidentReportedBy: actorName,
      updatedAt: now,
      updatedBy: actorName,
    });

    // Notify requestee
    const nextSteps =
      args.incidentType === "MINOR"
        ? "The trip may continue with a delay. HR/Admin has been notified."
        : "The trip has been halted. Admin action is required. You will be contacted shortly.";

    await sendTravelOrderNotification(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      recipientName: ticket.requesterName,
      recipientRole: "requester",
      event: "INCIDENT_REPORTED",
      message: `An incident has been reported on your travel order (${ticket.ticketNumber}). Type: ${args.incidentType}. ${nextSteps}`,
    });

    // Always notify admin
    await sendTravelOrderNotification(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      recipientName: "admin",
      recipientRole: "admin",
      event: "INCIDENT_REPORTED",
      message: `${args.incidentType} incident reported on travel order ${ticket.ticketNumber} by ${actorName}. Description: ${args.incidentDescription}.${args.incidentLocation ? ` Location: ${args.incidentLocation}.` : ""}`,
    });

    await logTravelOrderActivity(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      event: "INCIDENT_REPORTED",
      description: `${args.incidentType} incident reported by ${actorName}. ${args.incidentDescription}${args.incidentLocation ? ` @ ${args.incidentLocation}` : ""}.`,
      actorName,
      actorRole: args.actorRole ?? "driver",
      metadata: JSON.stringify({
        incidentType: args.incidentType,
        incidentLocation: args.incidentLocation,
      }),
    });

    return { success: true };
  },
});

export const resolveIncident = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    resolutionNote: v.string(),
    nextTravelStatus: v.string(),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Travel order could not be found.");
    }
    if (ticket.travelOrderStatus !== "INCIDENT_REPORTED") {
      throw new Error("No active incident to resolve on this travel order.");
    }

    const actorName = normalizeRequired(args.actorName, "Actor name");
    const now = Date.now();

    await ctx.db.patch(args.ticketId, {
      travelOrderStatus: args.nextTravelStatus,
      incidentResolvedAt: now,
      incidentResolvedBy: actorName,
      incidentResolutionNote: normalizeRequired(args.resolutionNote, "Resolution note"),
      updatedAt: now,
      updatedBy: actorName,
    });

    await sendTravelOrderNotification(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      recipientName: ticket.requesterName,
      recipientRole: "requester",
      event: "INCIDENT_RESOLVED",
      message: `The incident on your travel order (${ticket.ticketNumber}) has been resolved by ${actorName}. Note: ${args.resolutionNote}.`,
    });

    await logTravelOrderActivity(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      event: "INCIDENT_RESOLVED",
      description: `Incident resolved by ${actorName}. Resolution: ${args.resolutionNote}. Status → ${args.nextTravelStatus}.`,
      actorName,
      actorRole: "admin",
    });

    return { success: true };
  },
});

// ─── Shared trip assignment ───────────────────────────────────────────────────

export const assignSharedTrip = mutation({
  args: {
    primaryTicketId: v.id("monitoringTickets"),
    secondaryTicketId: v.id("monitoringTickets"),
    actorName: v.string(),
    actorRole: v.optional(v.string()),
    // TODO: Confirm with client — consent mechanism for both requestees
  },
  handler: async (ctx, args) => {
    const primary = await ctx.db.get(args.primaryTicketId);
    const secondary = await ctx.db.get(args.secondaryTicketId);

    if (!primary || !secondary) {
      throw new Error("One or both travel orders could not be found.");
    }
    if (primary.category !== "Travel Order" || secondary.category !== "Travel Order") {
      throw new Error("Shared trip is only available for Travel Orders.");
    }
    if (!primary.fleetDriverId || !primary.fleetVehicleId || !primary.fleetAssignedAt) {
      throw new Error("The primary travel order must have a driver and vehicle assigned before combining.");
    }

    const actorName = normalizeRequired(args.actorName, "Actor name");
    const now = Date.now();

    // Billing party is determined by fleet_assigned_at — earliest wins
    let billingTicketId = args.primaryTicketId;
    let riderTicketId = args.secondaryTicketId;

    if (secondary.fleetAssignedAt && secondary.fleetAssignedAt < primary.fleetAssignedAt) {
      billingTicketId = args.secondaryTicketId;
      riderTicketId = args.primaryTicketId;
    }

    // Handle same timestamp — admin must designate manually
    const sameTsFlag =
      primary.fleetAssignedAt !== undefined &&
      secondary.fleetAssignedAt !== undefined &&
      primary.fleetAssignedAt === secondary.fleetAssignedAt;

    if (sameTsFlag) {
      throw new Error(
        "Both travel orders have the same fleet assignment timestamp. Admin must manually designate the billing party.",
      );
    }

    const sharedTripId = `shared-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const billingTicket = billingTicketId === args.primaryTicketId ? primary : secondary;
    const riderTicket = riderTicketId === args.primaryTicketId ? primary : secondary;

    // Release the rider's existing fleet if it differs from the billing ticket's fleet
    if (riderTicket.fleetDriverId && riderTicket.fleetDriverId !== billingTicket.fleetDriverId) {
      await ctx.db.patch(riderTicket.fleetDriverId, { status: "Available", updatedAt: now });
    }
    if (riderTicket.fleetVehicleId && riderTicket.fleetVehicleId !== billingTicket.fleetVehicleId) {
      await ctx.db.patch(riderTicket.fleetVehicleId, { status: "Available", updatedAt: now });
    }

    await ctx.db.patch(billingTicketId, {
      sharedTripId,
      sharedTripRole: "PRIMARY",
      sharedTripLinkedTicketId: riderTicketId,
      sharedTripCost: undefined,
      billingDepartment: billingTicket.requesterDepartment,
      updatedAt: now,
      updatedBy: actorName,
    });

    // Rider gets the same driver and vehicle as the billing ticket
    await ctx.db.patch(riderTicketId, {
      sharedTripId,
      sharedTripRole: "SHARED_RIDER",
      sharedTripLinkedTicketId: billingTicketId,
      sharedTripCost: 0,
      fleetDriverId: billingTicket.fleetDriverId,
      fleetDriverName: billingTicket.fleetDriverName,
      fleetDriverContactNumber: billingTicket.fleetDriverContactNumber,
      fleetVehicleId: billingTicket.fleetVehicleId,
      fleetVehicleName: billingTicket.fleetVehicleName,
      fleetVehiclePlateNumber: billingTicket.fleetVehiclePlateNumber,
      fleetVehicleType: billingTicket.fleetVehicleType,
      fleetAssignedAt: billingTicket.fleetAssignedAt,
      fleetAssignedBy: actorName,
      status: "Assigned",
      travelOrderStatus: "DRIVER_ASSIGNED",
      updatedAt: now,
      updatedBy: actorName,
    });

    // Notify both requestees
    const billingNote = `Full trip cost will be charged to ${billingTicket.requesterDepartment ?? "the billing team"} (order ${billingTicket.ticketNumber}).`;

    await sendTravelOrderNotification(ctx, {
      ticketId: billingTicketId,
      ticketNumber: billingTicket.ticketNumber,
      recipientName: billingTicket.requesterName,
      recipientRole: "requester",
      event: "SHARED_TRIP_CREATED",
      message: `Your travel order (${billingTicket.ticketNumber}) has been merged into a shared trip with ${riderTicket.ticketNumber}. Your team is the billing party. ${billingNote}`,
    });

    await sendTravelOrderNotification(ctx, {
      ticketId: riderTicketId,
      ticketNumber: riderTicket.ticketNumber,
      recipientName: riderTicket.requesterName,
      recipientRole: "requester",
      event: "SHARED_TRIP_CREATED",
      message: `Your travel order (${riderTicket.ticketNumber}) has been merged into a shared trip with ${billingTicket.ticketNumber}. No cost will be charged to your team. ${billingNote}`,
    });

    // Notify driver
    if (billingTicket.fleetDriverName) {
      await sendTravelOrderNotification(ctx, {
        ticketId: billingTicketId,
        ticketNumber: billingTicket.ticketNumber,
        recipientName: billingTicket.fleetDriverName,
        recipientRole: "driver",
        event: "SHARED_TRIP_CREATED",
        message: `Travel orders ${billingTicket.ticketNumber} and ${riderTicket.ticketNumber} have been merged into a shared trip.`,
      });
    }

    // Notify admin/finance
    await sendTravelOrderNotification(ctx, {
      ticketId: billingTicketId,
      ticketNumber: billingTicket.ticketNumber,
      recipientName: "admin",
      recipientRole: "admin",
      event: "SHARED_TRIP_CREATED",
      message: `Shared trip created: ${billingTicket.ticketNumber} (PRIMARY — ${billingTicket.requesterDepartment ?? "billing team"}) and ${riderTicket.ticketNumber} (SHARED_RIDER). Billing party: ${billingTicket.requesterDepartment ?? "N/A"}.`,
    });

    await logTravelOrderActivity(ctx, {
      ticketId: billingTicketId,
      ticketNumber: billingTicket.ticketNumber,
      event: "SHARED_TRIP_CREATED",
      description: `Shared trip created (ID: ${sharedTripId}). PRIMARY: ${billingTicket.ticketNumber}, SHARED_RIDER: ${riderTicket.ticketNumber}. Billing: ${billingTicket.requesterDepartment ?? "N/A"}.`,
      actorName,
      actorRole: args.actorRole ?? "admin",
      metadata: JSON.stringify({ sharedTripId, primaryTicketId: billingTicketId, riderTicketId }),
    });

    return { success: true, sharedTripId, billingTicketId, riderTicketId };
  },
});

// ─── Mark done / reopen / cancel (legacy — kept for backward compat) ──────────

export const markTravelOrderDone = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    actorName: v.string(),
    odometerStart: v.optional(v.number()),
    odometerEnd: v.optional(v.number()),
    odometerStartPhotoId: v.optional(v.id("_storage")),
    odometerEndPhotoId: v.optional(v.id("_storage")),
    arrivalTime: v.optional(v.number()),
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
      travelOrderStatus: "COMPLETED",
      status: "Fulfilled",
      fulfillmentNote: ticket.fulfillmentNote ?? "Travel marked done by HR/Admin.",
      fulfilledAt: now,
      updatedAt: now,
      updatedBy: actorName,
      odometerStart: args.odometerStart,
      odometerEnd: args.odometerEnd,
      odometerStartPhotoId: args.odometerStartPhotoId,
      odometerEndPhotoId: args.odometerEndPhotoId,
      actualArrivalTime: args.arrivalTime,
    });

    await sendTravelOrderNotification(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      recipientName: ticket.requesterName,
      recipientRole: "requester",
      event: "COMPLETED",
      message: `Your travel order (${ticket.ticketNumber}) has been marked complete.`,
    });

    // Shared trip completion — notify finance
    if (ticket.sharedTripRole) {
      await sendTravelOrderNotification(ctx, {
        ticketId: args.ticketId,
        ticketNumber: ticket.ticketNumber,
        recipientName: "admin",
        recipientRole: "admin",
        event: "SHARED_TRIP_COMPLETED",
        message: `Shared trip order ${ticket.ticketNumber} (role: ${ticket.sharedTripRole}) marked complete. Billing summary required for shared trip ${ticket.sharedTripId ?? "N/A"}.`,
      });
    }

    await logTravelOrderActivity(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      event: "COMPLETED",
      description: `Travel order marked complete by ${actorName}.${args.arrivalTime ? " Arrival time recorded." : ""}`,
      actorName,
      actorRole: "admin",
    });

    return { success: true };
  },
});

// Record the actual time the trip departed (its own step before completion).
export const markTravelOrderDeparted = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    actorName: v.string(),
    departureTime: v.number(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Travel order could not be found.");
    }
    if (ticket.category !== "Travel Order") {
      throw new Error("This action is only available for Travel Orders.");
    }
    if (["Fulfilled", "Closed", "Done"].includes(ticket.status)) {
      throw new Error("Cannot mark a completed or closed travel order as departed.");
    }

    const now = Date.now();
    const actorName = normalizeRequired(args.actorName, "Actor name");

    await ctx.db.patch(args.ticketId, {
      actualDepartureTime: args.departureTime,
      updatedAt: now,
      updatedBy: actorName,
    });

    await logTravelOrderActivity(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      event: "DEPARTED",
      description: `Travel order marked as departed by ${actorName}.`,
      actorName,
      actorRole: "admin",
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
      travelOrderStatus: "CANCELLED",
      status: "Closed",
      closeReason: "Cancelled",
      closureNote: "Travel order cancelled by HR/Admin.",
      cancelledBy: actorName,
      cancelledByRole: "admin",
      cancelledAt: now,
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

      await ctx.db.patch(ticket.fleetDriverId, { status: "Assigned", updatedAt: now });
      await ctx.db.patch(ticket.fleetVehicleId, { status: "Assigned", updatedAt: now });
    }

    await ctx.db.patch(args.ticketId, {
      travelOrderStatus: hasAssignedFleet ? "DRIVER_ASSIGNED" : "PENDING",
      status: hasAssignedFleet ? "Assigned" : "New",
      fulfillmentNote: undefined,
      fulfilledAt: undefined,
      closeReason: undefined,
      closureNote: undefined,
      closedAt: undefined,
      cancellationReason: undefined,
      cancellationReasonDetail: undefined,
      cancelledBy: undefined,
      cancelledByRole: undefined,
      cancelledAt: undefined,
      incidentType: undefined,
      incidentDescription: undefined,
      incidentLocation: undefined,
      incidentReportedAt: undefined,
      incidentReportedBy: undefined,
      incidentResolvedAt: undefined,
      incidentResolvedBy: undefined,
      incidentResolutionNote: undefined,
      updatedAt: now,
      updatedBy: actorName,
    });

    await logTravelOrderActivity(ctx, {
      ticketId: args.ticketId,
      ticketNumber: ticket.ticketNumber,
      event: "REOPENED",
      description: `Travel order reopened by ${actorName}.`,
      actorName,
      actorRole: "admin",
    });

    return { success: true };
  },
});

// ─── Extend travel order ──────────────────────────────────────────────────────

export const extendTravelOrder = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    newReturnAt: v.number(),
    reason: v.optional(v.string()),
    actorName: v.string(),
  },
  handler: async (ctx, { ticketId, newReturnAt, reason, actorName }) => {
    const ticket = await ctx.db.get(ticketId);
    if (!ticket) throw new Error("Travel order not found.");
    if (ticket.category !== "Travel Order") throw new Error("Only travel orders can be extended.");

    const doneStatuses = ["Fulfilled", "Closed", "Done"];
    if (doneStatuses.includes(ticket.status)) {
      throw new Error("Cannot extend a travel order that is already completed or closed.");
    }

    const now = Date.now();
    const actor = normalizeRequired(actorName, "Actor name");

    const fmt = (ts: number) =>
      new Date(ts).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit",
      });

    const newReturnDate = fmt(newReturnAt);
    const oldReturnDate = ticket.travelReturnAt ? fmt(ticket.travelReturnAt) : "unknown";

    const updatedDetails = (ticket.requestDetails ?? "")
      .split("\n")
      .map((line) => (/^Return:/i.test(line.trim()) ? `Return: ${newReturnDate}` : line))
      .join("\n");

    const extensionNote = `[Extended by ${actor} on ${fmt(now)}]: Was due ${oldReturnDate}, new return ${newReturnDate}${reason ? ` — ${reason}` : ""}.`;

    await ctx.db.patch(ticketId, {
      travelReturnAt: newReturnAt,
      travelReturnExtendedAt: now,
      requestDetails: updatedDetails + "\n" + extensionNote,
      updatedAt: now,
      updatedBy: actor,
    });

    await logTravelOrderActivity(ctx, {
      ticketId,
      ticketNumber: ticket.ticketNumber,
      event: "EXTENDED",
      description: extensionNote,
      actorName: actor,
      actorRole: "admin",
    });

    return { success: true };
  },
});

// ─── Seed ─────────────────────────────────────────────────────────────────────

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
