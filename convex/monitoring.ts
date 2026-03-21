import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  AUTO_CLOSE_BUSINESS_DAYS,
  buildInternetOutageTitle,
  formatTicketNumber,
  getMeetingRequestStatusOptions,
  getMonitoringStatusOptions,
  getPriorityFromImpactUrgency,
  INCIDENT_STATUSES,
  INTERNET_OUTAGE_STATUSES,
  isApprovalRequired,
  isMonitoringApprovalReference,
  isMonitoringArea,
  isMonitoringAttachmentKind,
  isMonitoringBorrowCondition,
  isMonitoringCategory,
  isMonitoringTicketCategory,
  isMonitoringCloseReason,
  isMonitoringImpact,
  isMonitoringIsp,
  isMonitoringMeetingMode,
  isMonitoringPendingReason,
  isMonitoringWorkflowType,
  isMonitoringUrgency,
  isOpenMonitoringStatus,
  MONITORING_MEETING_REQUEST_CATEGORY,
  MONITORING_BORROWING_REQUEST_CATEGORY,
  MONITORING_APPROVAL_DECISIONS,
  MONITORING_APPROVERS,
  MONITORING_WORK_TYPES,
  MONITORING_REQUEST_SOURCE,
  normalizeMeetingRequestStatusValue,
  OFFICE_DAY_END_HOUR,
  OFFICE_DAY_START_HOUR,
  SERVICE_REQUEST_STATUSES,
  requiresCompletionNote,
  requiresPendingReason,
  resolveApprovalStage,
  resolveConnectionRole,
  resolveTicketPrefix,
  shouldImpactUptime,
  type MonitoringWorkType,
  type MonitoringWorkflowType,
} from "../lib/monitoring";

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

type MonitoringTicketDoc = Doc<"monitoringTickets">;

type BorrowingItemInput = {
  assetId: Id<"hardwareInventory">;
  releaseCondition: string;
  returnCondition?: string;
  returnedAt?: number;
};

type MeetingAssetItem = {
  assetId: Id<"hardwareInventory">;
  assetTag: string;
  assetLabel: string;
};

const RESERVABLE_MEETING_ASSET_STATUSES = ["Available", "Working"] as const;

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
  if (!isMonitoringBorrowCondition(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

async function resolveBorrowingItems(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  items: BorrowingItemInput[] | undefined,
) {
  if (!items?.length) return [];

  const seen = new Set<string>();
  const borrowingItems: Array<{
    assetId: Id<"hardwareInventory">;
    assetTag: string;
    assetLabel: string;
    releaseCondition: string;
    returnCondition?: string;
    returnedAt?: number;
  }> = [];

  for (const [index, item] of items.entries()) {
    const duplicateKey = String(item.assetId);
    if (seen.has(duplicateKey)) {
      throw new Error("Each borrowed asset can only be added once per request.");
    }
    seen.add(duplicateKey);

    const asset = await ctx.db.get(item.assetId);
    if (!asset) {
      throw new Error(`Linked asset ${index + 1} could not be found.`);
    }

    const releaseCondition = normalizeRequired(item.releaseCondition, `Release condition ${index + 1}`);
    ensureBorrowCondition(releaseCondition, `release condition ${index + 1}`);

    const returnCondition = normalizeOptional(item.returnCondition);
    if (returnCondition) {
      ensureBorrowCondition(returnCondition, `returned condition ${index + 1}`);
    }

    borrowingItems.push({
      assetId: asset._id,
      assetTag: asset.assetTag,
      assetLabel: asset.assetNameDescription ?? asset.assetType ?? asset.assetTag,
      releaseCondition,
      returnCondition,
      returnedAt: item.returnedAt,
    });
  }

  return borrowingItems;
}

async function resolveMeetingAssetItems(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  assetIds: Id<"hardwareInventory">[] | undefined,
) {
  if (!assetIds?.length) return [];

  const seen = new Set<string>();
  const meetingAssetItems: MeetingAssetItem[] = [];

  for (const [index, assetId] of assetIds.entries()) {
    const duplicateKey = String(assetId);
    if (seen.has(duplicateKey)) {
      throw new Error("Each reserved asset can only be added once per meeting request.");
    }
    seen.add(duplicateKey);

    const asset = await ctx.db.get(assetId);
    if (!asset) {
      throw new Error(`Reserved asset ${index + 1} could not be found.`);
    }

    meetingAssetItems.push({
      assetId: asset._id,
      assetTag: asset.assetTag,
      assetLabel: asset.assetNameDescription ?? asset.assetType ?? asset.assetTag,
    });
  }

  return meetingAssetItems;
}

async function logHardwareActivity(
  ctx: Pick<MutationCtx, "db">,
  input: HardwareActivityInput,
) {
  await ctx.db.insert(
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

async function reserveMeetingAssetItems(
  ctx: MutationCtx,
  args: {
    meetingAssetItems: MeetingAssetItem[];
    requesterName: string;
    requesterDepartment?: string;
    requestedAt: number;
    meetingStartAt?: number;
    slipNote?: string;
    actorName: string;
  },
) {
  for (const item of args.meetingAssetItems) {
    const asset = await ctx.db.get(item.assetId);
    if (!asset) {
      throw new Error(`Reserved asset ${item.assetTag} could not be found.`);
    }

    const assetLocation = asset.locationPersonAssigned ?? asset.location ?? "";
    if (assetLocation !== "MAIN STORAGE") {
      throw new Error(`${asset.assetTag} must be in MAIN STORAGE before it can be reserved for a meeting request.`);
    }
    if (!(RESERVABLE_MEETING_ASSET_STATUSES as readonly string[]).includes(asset.status)) {
      throw new Error(`${asset.assetTag} is not available for reservation.`);
    }
    if (asset.reservationStatus === "Reserved") {
      throw new Error(`${asset.assetTag} is already reserved.`);
    }

    await ctx.db.patch(
      asset._id,
      {
        reservationBorrower: args.requesterName,
        reservationDepartment: args.requesterDepartment ?? asset.department,
        reservationRequestedDate: getOfficeDateKey(args.requestedAt),
        reservationPickupDate: args.meetingStartAt ? getOfficeDateKey(args.meetingStartAt) : undefined,
        reservationSlipNote: normalizeOptional(args.slipNote),
        reservationStatus: "Reserved",
        updatedAt: Date.now(),
      } as never,
    );

    await logHardwareActivity(ctx, {
      inventoryId: asset._id,
      assetTag: asset.assetTag,
      assetNameDescription: asset.assetNameDescription,
      eventType: "reservation_created",
      message: "Reserved for meeting request support.",
      relatedPerson: args.requesterName,
      location: assetLocation,
      status: asset.status,
      actorName: args.actorName,
    });
  }
}

async function releaseMeetingAssetItems(
  ctx: MutationCtx,
  args: {
    meetingAssetItems: MeetingAssetItem[];
    actorName: string;
    reason: string;
  },
) {
  for (const item of args.meetingAssetItems) {
    const asset = await ctx.db.get(item.assetId);
    if (!asset || asset.reservationStatus !== "Reserved") {
      continue;
    }

    await ctx.db.patch(
      asset._id,
      {
        reservationStatus: "Cancelled",
        updatedAt: Date.now(),
      } as never,
    );

    await logHardwareActivity(ctx, {
      inventoryId: asset._id,
      assetTag: asset.assetTag,
      assetNameDescription: asset.assetNameDescription,
      eventType: "reservation_cancelled",
      message: args.reason,
      relatedPerson: asset.reservationBorrower,
      location: asset.locationPersonAssigned ?? asset.location,
      status: asset.status,
      actorName: args.actorName,
    });
  }
}

function buildBorrowingTitle(requesterName: string, items: Array<{ assetTag: string }>) {
  if (!items.length) {
    return `Borrowing Request - ${requesterName}`;
  }
  if (items.length === 1) {
    return `Borrowing Request - ${requesterName} - ${items[0].assetTag}`;
  }
  return `Borrowing Request - ${requesterName} - ${items[0].assetTag} +${items.length - 1} more`;
}

function ensureCategory(value: string) {
  if (!isMonitoringCategory(value)) {
    throw new Error("Invalid category.");
  }
}

function ensureTicketCategory(value: string) {
  if (!isMonitoringTicketCategory(value)) {
    throw new Error("Use a ticket category for regular monitoring tickets.");
  }
}

function ensureImpact(value: string) {
  if (!isMonitoringImpact(value)) {
    throw new Error("Invalid impact.");
  }
}

function ensureUrgency(value: string) {
  if (!isMonitoringUrgency(value)) {
    throw new Error("Invalid urgency.");
  }
}

function ensureMeetingMode(value: string) {
  if (!isMonitoringMeetingMode(value)) {
    throw new Error("Invalid meeting mode.");
  }
}

function ensureStatusForWorkflow(
  workflowType: MonitoringWorkflowType,
  status: string,
  options?: { isMeetingRequest?: boolean },
) {
  if (options?.isMeetingRequest) {
    const meetingStatus = normalizeMeetingRequestStatusValue(status) ?? status;
    if ((getMeetingRequestStatusOptions() as readonly string[]).includes(meetingStatus) || meetingStatus === "Closed") {
      return;
    }
  }
  const workflowOptions = getMonitoringStatusOptions(workflowType);
  if ((workflowOptions as readonly string[]).includes(status)) return;
  throw new Error("Invalid status for this workflow.");
}

function ensurePendingReason(value: string) {
  if (!isMonitoringPendingReason(value)) {
    throw new Error("Invalid pending reason.");
  }
}

function ensureApprovalReference(value: string) {
  if (!isMonitoringApprovalReference(value)) {
    throw new Error("Invalid approval reference.");
  }
}

function ensureCloseReason(value: string) {
  if (!isMonitoringCloseReason(value)) {
    throw new Error("Invalid close reason.");
  }
}

function ensureIsp(value: string) {
  if (!isMonitoringIsp(value)) {
    throw new Error("Invalid ISP.");
  }
}

function ensureArea(value: string) {
  if (!isMonitoringArea(value)) {
    throw new Error("Invalid area.");
  }
}

function ensureAttachmentKind(value: string) {
  if (!isMonitoringAttachmentKind(value)) {
    throw new Error("Invalid attachment kind.");
  }
}

function toOfficeDate(timestamp: number) {
  return new Date(timestamp + MANILA_OFFSET_MS);
}

function padNumber(value: number) {
  return String(value).padStart(2, "0");
}

function getOfficeDateParts(timestamp: number) {
  const date = toOfficeDate(timestamp);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  };
}

function getOfficeDateKey(timestamp: number) {
  const { year, month, day } = getOfficeDateParts(timestamp);
  return `${year}-${padNumber(month)}-${padNumber(day)}`;
}

function officeDateToTimestamp(year: number, month: number, day: number, hour: number, minute: number) {
  return Date.UTC(year, month - 1, day, hour, minute) - MANILA_OFFSET_MS;
}

function parseOfficeDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return { year, month, day };
}

function getNextOfficeDateKey(dateKey: string) {
  const { year, month, day } = parseOfficeDateKey(dateKey);
  return getOfficeDateKey(officeDateToTimestamp(year, month, day + 1, 0, 0));
}

function isOfficeBusinessDay(dateKey: string, holidaySet: Set<string>) {
  if (holidaySet.has(dateKey)) return false;
  const { year, month, day } = parseOfficeDateKey(dateKey);
  const weekday = toOfficeDate(officeDateToTimestamp(year, month, day, 0, 0)).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

function computeTotalDowntimeMinutes(timeDetected?: number, timeRestored?: number) {
  if (!timeDetected || !timeRestored || timeRestored <= timeDetected) {
    return undefined;
  }
  return Math.max(0, Math.round((timeRestored - timeDetected) / 60000));
}

function buildOperatingIntervals(args: { start: number; end: number; holidaySet: Set<string> }) {
  const intervals: Array<{ start: number; end: number }> = [];
  let cursorKey = getOfficeDateKey(args.start);
  const endKey = getOfficeDateKey(args.end);

  while (true) {
    if (isOfficeBusinessDay(cursorKey, args.holidaySet)) {
      const { year, month, day } = parseOfficeDateKey(cursorKey);
      const dayStart = officeDateToTimestamp(year, month, day, OFFICE_DAY_START_HOUR, 0);
      const dayEnd = officeDateToTimestamp(year, month, day, OFFICE_DAY_END_HOUR, 0);
      const overlapStart = Math.max(args.start, dayStart);
      const overlapEnd = Math.min(args.end, dayEnd);
      if (overlapEnd > overlapStart) {
        intervals.push({ start: overlapStart, end: overlapEnd });
      }
    }

    if (cursorKey === endKey) break;
    cursorKey = getNextOfficeDateKey(cursorKey);
  }

  return intervals;
}

function mergeIntervals(intervals: Array<{ start: number; end: number }>) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((left, right) => left.start - right.start);
  const merged = [{ ...sorted[0] }];

  for (const interval of sorted.slice(1)) {
    const previous = merged[merged.length - 1];
    if (interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
      continue;
    }
    merged.push({ ...interval });
  }

  return merged;
}

function sumIntervalMinutes(intervals: Array<{ start: number; end: number }>) {
  return intervals.reduce((total, interval) => total + (interval.end - interval.start) / 60000, 0);
}

function addBusinessDaysDeadline(startAt: number, businessDays: number, holidaySet: Set<string>) {
  let cursorKey = getOfficeDateKey(startAt);
  let counted = 0;
  while (counted < businessDays) {
    cursorKey = getNextOfficeDateKey(cursorKey);
    if (isOfficeBusinessDay(cursorKey, holidaySet)) {
      counted += 1;
    }
  }

  const { year, month, day } = parseOfficeDateKey(cursorKey);
  return officeDateToTimestamp(year, month, day, OFFICE_DAY_END_HOUR, 0);
}

function matchesTicketSearch(ticket: MonitoringTicketDoc, search: string) {
  if (!search) return true;
  const term = search.toLowerCase();
  const borrowingSearchValues = (ticket.borrowingItems ?? []).flatMap((item) => [
    item.assetTag,
    item.assetLabel,
    item.releaseCondition,
    item.returnCondition,
  ]);
  const meetingAssetSearchValues = (ticket.meetingAssetItems ?? []).flatMap((item) => [item.assetTag, item.assetLabel]);
  return [
    ticket.ticketNumber,
    ticket.requesterName,
    ticket.title,
    ticket.requestDetails,
    ticket.requestSnapshot,
    ticket.category,
    ticket.requestSource,
    ticket.assetTag,
    ticket.isp,
    ticket.outageArea,
    ticket.meetingLocation,
    ticket.meetingEquipmentSummary,
    ticket.meetingAttendeeCount,
    ticket.expectedReturnAt ? new Date(ticket.expectedReturnAt).toISOString() : undefined,
    ...borrowingSearchValues,
    ...meetingAssetSearchValues,
  ].some((value) => String(value ?? "").toLowerCase().includes(term));
}

async function getHolidaySet(ctx: Pick<QueryCtx | MutationCtx, "db">) {
  const rows = await ctx.db.query("officeCalendar").collect();
  return new Set(rows.filter((row) => row.active).map((row) => row.holidayDate));
}

async function generateNextTicketNumber(ctx: MutationCtx, workType: MonitoringWorkType) {
  const prefix = resolveTicketPrefix(workType);
  const year = getOfficeDateParts(Date.now()).year;
  const existing = await ctx.db
    .query("monitoringSequences")
    .withIndex("by_prefix_year", (q) => q.eq("prefix", prefix).eq("year", year))
    .first();

  let nextNumber = 1;
  if (existing) {
    nextNumber = existing.nextNumber;
    await ctx.db.patch(existing._id, {
      nextNumber: existing.nextNumber + 1,
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("monitoringSequences", {
      prefix,
      year,
      nextNumber: 2,
      updatedAt: Date.now(),
    });
  }

  return formatTicketNumber(prefix, year, nextNumber);
}

function buildAttachmentEntries(
  attachments:
    | Array<{
        kind: string;
        label: string;
        fileName: string;
        contentType?: string;
        storageId: Id<"_storage">;
        uploadedBy: string;
      }>
    | undefined,
) {
  if (!attachments?.length) return [];

  return attachments.map((attachment) => {
    ensureAttachmentKind(attachment.kind);
    return {
      kind: attachment.kind,
      label: normalizeRequired(attachment.label, "Attachment label"),
      fileName: normalizeRequired(attachment.fileName, "Attachment file name"),
      contentType: normalizeOptional(attachment.contentType),
      storageId: attachment.storageId,
      uploadedAt: Date.now(),
      uploadedBy: normalizeRequired(attachment.uploadedBy, "Attachment uploader"),
    };
  });
}

function resolveWorkflowStatus(args: {
  workflowType: MonitoringWorkflowType;
  status?: string;
  approvalRequired: boolean;
}) {
  if (args.status) {
    ensureStatusForWorkflow(args.workflowType, args.status);
    return args.status;
  }

  if (args.workflowType === "internetOutage") {
    return INTERNET_OUTAGE_STATUSES[0];
  }

  if (args.workflowType === "serviceRequest" && args.approvalRequired) {
    return SERVICE_REQUEST_STATUSES[0];
  }

  return INCIDENT_STATUSES[0];
}

function normalizeMeetingRequestTicketForRead(ticket: MonitoringTicketDoc): MonitoringTicketDoc {
  if (ticket.category !== MONITORING_MEETING_REQUEST_CATEGORY) {
    return ticket;
  }

  return {
    ...ticket,
    requiresPurchase: false,
    requiresReplacement: false,
    requiresSensitiveAccess: false,
    approvalRequired: false,
    approvalStage: "Not Required",
    majorIncident: false,
    incidentReportRequired: false,
    status: normalizeMeetingRequestStatusValue(ticket.status) ?? ticket.status,
  };
}

async function enrichTicketForDetail(
  ctx: QueryCtx,
  ticket: MonitoringTicketDoc,
) {
  const normalizedTicket = normalizeMeetingRequestTicketForRead(ticket);
  const approvalHistory = await ctx.db
    .query("monitoringApprovalHistory")
    .withIndex("by_ticketId", (q) => q.eq("ticketId", ticket._id))
    .collect();
  const asset = normalizedTicket.assetId ? await ctx.db.get(normalizedTicket.assetId) : null;
  const attachments = await Promise.all(
    normalizedTicket.attachments.map(async (attachment) => {
      const [url, metadata] = await Promise.all([
        ctx.storage.getUrl(attachment.storageId),
        ctx.storage.getMetadata(attachment.storageId),
      ]);

      return {
        ...attachment,
        contentType: attachment.contentType ?? metadata?.contentType ?? undefined,
        size: metadata?.size,
        url,
      };
    }),
  );
  const incidentReportUrl = normalizedTicket.incidentReportStorageId
    ? await ctx.storage.getUrl(normalizedTicket.incidentReportStorageId)
    : null;

  return {
    ticket: normalizedTicket,
    asset,
    approvalHistory: approvalHistory.sort((left, right) => right.createdAt - left.createdAt),
    attachments,
    incidentReportUrl,
  };
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getAttachmentUrl = query({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});

export const list = query({
  args: {
    view: v.string(),
    search: v.optional(v.string()),
    showClosed: v.optional(v.boolean()),
    status: v.optional(v.string()),
    needsApproval: v.optional(v.boolean()),
    missingIncidentReport: v.optional(v.boolean()),
    forRevision: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const search = args.search?.trim().toLowerCase() ?? "";
    const showClosed = Boolean(args.showClosed);
    const rows = (await ctx.db.query("monitoringTickets").collect()).map(normalizeMeetingRequestTicketForRead);

    const filtered = rows
      .filter((row) => {
        if (args.view === "internet") {
          return row.workflowType === "internetOutage";
        }
        return row.workflowType === "incident" || row.workflowType === "serviceRequest";
      })
      .filter((row) => (showClosed ? true : isOpenMonitoringStatus(row.status)))
      .filter((row) => (args.status ? row.status === args.status : true))
      .filter((row) => (args.needsApproval ? row.approvalRequired && row.approvalStage !== "Approved" : true))
      .filter((row) => (args.missingIncidentReport ? row.incidentReportRequired && !row.incidentReportAttached : true))
      .filter((row) => (args.forRevision ? row.status === "For Revision" : true))
      .filter((row) => matchesTicketSearch(row, search))
      .sort((left, right) => right.updatedAt - left.updatedAt);

    return filtered;
  },
});

export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const [tickets, holidaySet] = await Promise.all([
      ctx.db.query("monitoringTickets").collect().then((rows) => rows.map(normalizeMeetingRequestTicketForRead)),
      getHolidaySet(ctx),
    ]);

    const openTickets = tickets.filter(
      (ticket) =>
        (ticket.workflowType === "incident" || ticket.workflowType === "serviceRequest") &&
        isOpenMonitoringStatus(ticket.status),
    ).length;
    const pendingApprovals = tickets.filter(
      (ticket) =>
        ticket.approvalStage === "Pending IT Team Leader" || ticket.approvalStage === "Pending OSMD Manager",
    ).length;
    const activeInternetOutages = tickets.filter(
      (ticket) => ticket.workflowType === "internetOutage" && ticket.status !== "Resolved",
    ).length;

    const rangeStart = officeDateToTimestamp(getOfficeDateParts(now).year, getOfficeDateParts(now).month, 1, 0, 0);
    const scheduledMinutes = sumIntervalMinutes(buildOperatingIntervals({ start: rangeStart, end: now, holidaySet }));
    const impactedIntervals = mergeIntervals(
      tickets
        .filter((ticket) => ticket.workflowType === "internetOutage" && ticket.impactedUptime && ticket.timeDetected)
        .flatMap((ticket) =>
          buildOperatingIntervals({
            start: ticket.timeDetected!,
            end: ticket.timeRestored ?? now,
            holidaySet,
          }),
        ),
    );
    const downtimeMinutes = sumIntervalMinutes(impactedIntervals);
    const monthlyUptime =
      scheduledMinutes <= 0
        ? 100
        : Math.max(0, Math.min(100, ((scheduledMinutes - downtimeMinutes) / scheduledMinutes) * 100));

    return {
      openTickets,
      pendingApprovals,
      activeInternetOutages,
      monthlyUptime,
      holidaysConfigured: holidaySet.size,
    };
  },
});

export const getMeetingCalendar = query({
  args: {
    rangeStart: v.number(),
    rangeEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const rows = (await ctx.db.query("monitoringTickets").collect()).map(normalizeMeetingRequestTicketForRead);

    return rows
      .filter((row) => {
        const isMeetingRequest =
          row.category === MONITORING_MEETING_REQUEST_CATEGORY || Boolean(row.meetingStartAt || row.meetingLocation);
        const isBorrowingRequest =
          row.category === MONITORING_BORROWING_REQUEST_CATEGORY || Boolean(row.borrowingItems?.length);
        const eventStart = isMeetingRequest
          ? row.meetingStartAt
          : row.workflowType === "internetOutage"
            ? row.timeDetected
            : row.requestReceivedAt ?? row.createdAt;
        if (!eventStart) return false;

        const eventEnd = isMeetingRequest
          ? row.meetingEndAt ?? row.meetingStartAt
          : row.workflowType === "internetOutage"
            ? row.timeRestored ?? row.timeDetected
            : eventStart;
        if (!eventEnd) return false;
        return eventStart <= args.rangeEnd && eventEnd >= args.rangeStart;
      })
      .map((row) => {
        const isMeetingRequest =
          row.category === MONITORING_MEETING_REQUEST_CATEGORY || Boolean(row.meetingStartAt || row.meetingLocation);
        const isBorrowingRequest =
          row.category === MONITORING_BORROWING_REQUEST_CATEGORY || Boolean(row.borrowingItems?.length);
        const eventKind = isMeetingRequest
          ? "meeting"
          : row.workflowType === "internetOutage"
            ? "internet"
            : isBorrowingRequest
              ? "borrowing"
              : "ticket";
        const eventStartAt = isMeetingRequest
          ? row.meetingStartAt!
          : row.workflowType === "internetOutage"
            ? row.timeDetected!
            : row.requestReceivedAt ?? row.createdAt;
        const eventEndAt = isMeetingRequest
          ? row.meetingEndAt ?? row.meetingStartAt
          : row.workflowType === "internetOutage"
            ? row.timeRestored ?? row.timeDetected
            : undefined;
        const relatedAssetsCount = isMeetingRequest
          ? row.meetingAssetItems?.length ?? 0
          : isBorrowingRequest
            ? row.borrowingItems?.length ?? 0
            : row.assetId
              ? 1
              : 0;
        const contextLine = isMeetingRequest
          ? [row.meetingMode, row.meetingLocation].filter(Boolean).join(" / ") || "No location or platform set"
          : row.workflowType === "internetOutage"
            ? [row.isp, row.outageArea].filter(Boolean).join(" / ") || "Internet outage"
            : isBorrowingRequest
              ? row.borrowingItems?.length
                ? `${row.borrowingItems.length} linked asset${row.borrowingItems.length === 1 ? "" : "s"}`
                : "No linked assets"
              : row.category;

        return {
          _id: row._id,
          ticketNumber: row.ticketNumber,
          title: row.title,
          requesterName: row.requesterName,
          requesterSection: row.requesterSection,
          requesterDepartment: row.requesterDepartment,
          meetingMode: row.meetingMode,
          meetingLocation: row.meetingLocation,
          status: row.status,
          eventKind,
          workflowType: row.workflowType,
          category: row.category,
          eventStartAt,
          eventEndAt,
          relatedAssetsCount,
          contextLine,
        };
      })
      .sort((left, right) => left.eventStartAt - right.eventStartAt);
  },
});

export const getById = query({
  args: {
    ticketId: v.id("monitoringTickets"),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) return null;
    return await enrichTicketForDetail(ctx, ticket);
  },
});

export const createTicket = mutation({
  args: {
    workType: v.string(),
    workflowType: v.string(),
    category: v.string(),
    title: v.optional(v.string()),
    requestDetails: v.string(),
    requestSnapshot: v.string(),
    requestSource: v.optional(v.string()),
    requesterName: v.string(),
    requesterSection: v.optional(v.string()),
    requesterDepartment: v.optional(v.string()),
    requestReceivedAt: v.optional(v.number()),
    assetId: v.optional(v.id("hardwareInventory")),
    impact: v.optional(v.string()),
    urgency: v.optional(v.string()),
    requiresPurchase: v.optional(v.boolean()),
    requiresReplacement: v.optional(v.boolean()),
    requiresSensitiveAccess: v.optional(v.boolean()),
    majorIncident: v.optional(v.boolean()),
    incidentReportStorageId: v.optional(v.id("_storage")),
    attachments: v.optional(
      v.array(
        v.object({
          kind: v.string(),
          label: v.string(),
          fileName: v.string(),
          contentType: v.optional(v.string()),
          storageId: v.id("_storage"),
          uploadedBy: v.string(),
        }),
      ),
    ),
    isp: v.optional(v.string()),
    outageArea: v.optional(v.string()),
    timeDetected: v.optional(v.number()),
    timeRestored: v.optional(v.number()),
    operationsBlocked: v.optional(v.boolean()),
    causeActionTaken: v.optional(v.string()),
    meetingMode: v.optional(v.string()),
    meetingLocation: v.optional(v.string()),
    meetingStartAt: v.optional(v.number()),
    meetingEndAt: v.optional(v.number()),
    meetingAttendeeCount: v.optional(v.string()),
    meetingEquipmentSummary: v.optional(v.string()),
    meetingAssetIds: v.optional(v.array(v.id("hardwareInventory"))),
    expectedReturnAt: v.optional(v.number()),
    borrowingItems: v.optional(
      v.array(
        v.object({
          assetId: v.id("hardwareInventory"),
          releaseCondition: v.string(),
          returnCondition: v.optional(v.string()),
          returnedAt: v.optional(v.number()),
        }),
      ),
    ),
    createdBy: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(MONITORING_WORK_TYPES as readonly string[]).includes(args.workType)) {
      throw new Error("Invalid work type.");
    }

    const workType = args.workType as MonitoringWorkType;
    const rawWorkflowType = normalizeRequired(args.workflowType, "Workflow type");
    if (!isMonitoringWorkflowType(rawWorkflowType)) {
      throw new Error("Invalid workflow type.");
    }
    const workflowType = rawWorkflowType;
    const isMeetingRequest = args.category === MONITORING_MEETING_REQUEST_CATEGORY;
    const isBorrowingRequest = args.category === MONITORING_BORROWING_REQUEST_CATEGORY;
    const requestSource = normalizeOptional(args.requestSource) ?? MONITORING_REQUEST_SOURCE;
    const requestDetailsInput = normalizeOptional(args.requestDetails);
    const requestSnapshotInput = normalizeOptional(args.requestSnapshot);
    const requesterName = normalizeRequired(args.requesterName, "Requester name");
    const requesterSection = normalizeOptional(args.requesterSection);
    const requesterDepartment = normalizeOptional(args.requesterDepartment);
    const createdBy = normalizeRequired(args.createdBy, "Created by");

    ensureCategory(args.category);
    if (!isMeetingRequest && !isBorrowingRequest) {
      ensureTicketCategory(args.category);
    }
    const requiresPurchase = isMeetingRequest ? false : Boolean(args.requiresPurchase);
    const requiresReplacement = isMeetingRequest ? false : Boolean(args.requiresReplacement);
    const requiresSensitiveAccess = isMeetingRequest ? false : Boolean(args.requiresSensitiveAccess);
    const approvalRequired =
      workflowType === "serviceRequest" &&
      !isMeetingRequest &&
      isApprovalRequired({
        requiresPurchase,
        requiresReplacement,
        requiresSensitiveAccess,
      });
    const status = resolveWorkflowStatus({
      workflowType,
      status: normalizeOptional(args.status),
      approvalRequired,
    });
    const impact = isMeetingRequest || isBorrowingRequest
      ? undefined
      : workflowType === "internetOutage"
        ? "Specific Area or Team"
        : normalizeRequired(args.impact ?? "Single User", "Impact");
    const urgency = isMeetingRequest || isBorrowingRequest
      ? undefined
      : workflowType === "internetOutage"
        ? "Immediate"
        : normalizeRequired(args.urgency ?? "Can Wait", "Urgency");
    if (impact) ensureImpact(impact);
    if (urgency) ensureUrgency(urgency);
    ensureStatusForWorkflow(workflowType, status);

    let title =
      workflowType === "internetOutage"
        ? buildInternetOutageTitle({
            isp: normalizeOptional(args.isp),
            area: normalizeOptional(args.outageArea),
          })
        : isBorrowingRequest
          ? ""
          : normalizeRequired(args.title ?? "", "Concern summary");

    const majorIncident = isMeetingRequest ? false : Boolean(args.majorIncident);
    const incidentReportStorageId = isMeetingRequest ? undefined : args.incidentReportStorageId;
    const incidentReportAttached = Boolean(incidentReportStorageId);
    const incidentReportRequired = majorIncident;
    const attachments = buildAttachmentEntries(args.attachments);
    const now = Date.now();
    const requestReceivedAt = args.requestReceivedAt ?? now;

    let assetId = args.assetId;
    let assetTag: string | undefined;
    if (!isBorrowingRequest && args.assetId) {
      const asset = await ctx.db.get(args.assetId);
      if (!asset) {
        throw new Error("Linked asset could not be found.");
      }
      assetTag = asset.assetTag;
    }

    let isp = normalizeOptional(args.isp);
    let outageArea = normalizeOptional(args.outageArea);
    let timeDetected = args.timeDetected;
    let timeRestored = args.timeRestored;
    let operationsBlocked = args.operationsBlocked;
    let causeActionTaken = normalizeOptional(args.causeActionTaken);
    let connectionRole = resolveConnectionRole(isp);
    let meetingMode = normalizeOptional(args.meetingMode);
    let meetingLocation = normalizeOptional(args.meetingLocation);
    let meetingStartAt = args.meetingStartAt;
    let meetingEndAt = args.meetingEndAt;
    let meetingAttendeeCount = normalizeOptional(args.meetingAttendeeCount);
    let meetingEquipmentSummary = normalizeOptional(args.meetingEquipmentSummary);
    let meetingAssetItems = await resolveMeetingAssetItems(ctx, args.meetingAssetIds);
    let expectedReturnAt = args.expectedReturnAt;
    let borrowingItems = await resolveBorrowingItems(ctx, args.borrowingItems);

    if (workflowType === "internetOutage") {
      if (workType !== "Incident") {
        throw new Error("Internet outages must use the Incident work type.");
      }
      if (!isp) {
        throw new Error("ISP is required for internet outages.");
      }
      ensureIsp(isp);
      if (!outageArea) {
        throw new Error("Area is required for internet outages.");
      }
      ensureArea(outageArea);
      if (!timeDetected) {
        throw new Error("Time detected is required for internet outages.");
      }
      if (timeRestored && timeRestored <= timeDetected) {
        throw new Error("Time restored must be after time detected.");
      }
      title = buildInternetOutageTitle({ isp, area: outageArea });
      if (status === "Resolved") {
        if (!timeRestored) {
          throw new Error("Time restored is required when resolving an outage.");
        }
        causeActionTaken = normalizeRequired(args.causeActionTaken ?? "", "Cause / action taken");
      }
    } else {
      isp = undefined;
      outageArea = undefined;
      timeDetected = undefined;
      timeRestored = undefined;
      operationsBlocked = undefined;
      causeActionTaken = undefined;
      connectionRole = undefined;
    }

    if (args.category === MONITORING_MEETING_REQUEST_CATEGORY) {
      if (workType !== "Service Request" || workflowType !== "serviceRequest") {
        throw new Error("Meeting requests must use the Service Request workflow.");
      }
      if (!meetingStartAt) {
        throw new Error("Meeting start is required.");
      }
      if (meetingEndAt && meetingEndAt <= meetingStartAt) {
        throw new Error("Meeting end must be after the meeting start.");
      }
      meetingMode = normalizeRequired(args.meetingMode ?? "", "Meeting mode");
      ensureMeetingMode(meetingMode);
      meetingLocation = normalizeRequired(args.meetingLocation ?? "", "Meeting location");
      meetingAttendeeCount = normalizeRequired(args.meetingAttendeeCount ?? "", "Expected attendees");
      meetingEquipmentSummary = undefined;
      if (meetingAssetItems.length) {
        await reserveMeetingAssetItems(ctx, {
          meetingAssetItems,
          requesterName,
          requesterDepartment,
          requestedAt: requestReceivedAt,
          meetingStartAt,
          slipNote: title,
          actorName: createdBy,
        });
      }
    } else {
      meetingMode = undefined;
      meetingLocation = undefined;
      meetingStartAt = undefined;
      meetingEndAt = undefined;
      meetingAttendeeCount = undefined;
      meetingEquipmentSummary = undefined;
      meetingAssetItems = [];
    }

    if (isBorrowingRequest) {
      if (workType !== "Service Request" || workflowType !== "serviceRequest") {
        throw new Error("Borrowing requests must use the Service Request workflow.");
      }
      if (!expectedReturnAt) {
        throw new Error("Expected return date and time is required.");
      }
      if (!borrowingItems.length) {
        throw new Error("Add at least one linked asset to the borrowing request.");
      }
      assetId = borrowingItems[0].assetId;
      assetTag = borrowingItems[0].assetTag;
      title = buildBorrowingTitle(requesterName, borrowingItems);
    } else {
      expectedReturnAt = undefined;
      borrowingItems = [];
    }

    const requestDetails =
      workflowType === "internetOutage"
        ? requestDetailsInput ?? `${isp ?? "Office internet"} outage affecting ${outageArea ?? "the office"}.`
        : normalizeRequired(args.requestDetails, "Request details");
    const requestSnapshot =
      workflowType === "internetOutage"
        ? requestSnapshotInput ??
          [
            `ISP: ${isp ?? "Unknown"}`,
            `AREA: ${outageArea ?? "Unknown"}`,
            `STATUS: ${status}`,
            `OPERATIONS BLOCKED: ${operationsBlocked ? "YES" : "NO"}`,
          ].join("\n")
        : normalizeRequired(args.requestSnapshot, "Request snapshot");

    const totalDowntimeMinutes =
      workflowType === "internetOutage"
        ? computeTotalDowntimeMinutes(timeDetected, timeRestored ?? now)
        : undefined;
    const impactedUptime =
      workflowType === "internetOutage"
        ? shouldImpactUptime({
            operationsBlocked,
            totalDowntimeMinutes,
          })
        : undefined;

    const ticketNumber = await generateNextTicketNumber(ctx, workType);

    return await ctx.db.insert("monitoringTickets", {
      ticketNumber,
      workType,
      workflowType,
      category: args.category,
      status,
      impact,
      urgency,
      priority: impact && urgency ? getPriorityFromImpactUrgency(impact, urgency) : undefined,
      title,
      requestDetails,
      requestSnapshot,
      requestSource,
      requesterName,
      requesterSection,
      requesterDepartment,
      requestReceivedAt,
      assetId,
      assetTag,
      requiresPurchase,
      requiresReplacement,
      requiresSensitiveAccess,
      approvalRequired,
      approvalStage: resolveApprovalStage({
        approvalRequired,
      }),
      teamLeaderApprovalStatus: undefined,
      teamLeaderApprovalDate: undefined,
      teamLeaderApprovalReference: undefined,
      teamLeaderApprovalNote: undefined,
      osmdManagerApprovalStatus: undefined,
      osmdManagerApprovalDate: undefined,
      osmdManagerApprovalReference: undefined,
      osmdManagerApprovalNote: undefined,
      revisionReason: undefined,
      pendingReason: undefined,
      closeReason: undefined,
      majorIncident,
      incidentReportRequired,
      incidentReportAttached,
      incidentReportStorageId,
      resolutionNote: undefined,
      fulfillmentNote: undefined,
      causeActionTaken,
      closureNote: undefined,
      attachments,
      isp,
      connectionRole,
      outageArea,
      timeDetected,
      timeRestored,
      totalDowntimeMinutes,
      operationsBlocked,
      impactedUptime,
      meetingMode,
      meetingLocation,
      meetingStartAt,
      meetingEndAt,
      meetingAttendeeCount,
      meetingEquipmentSummary,
      meetingAssetItems: meetingAssetItems.length ? meetingAssetItems : undefined,
      expectedReturnAt,
      borrowingItems: borrowingItems.length ? borrowingItems : undefined,
      createdAt: now,
      updatedAt: now,
      createdBy,
      updatedBy: createdBy,
      resolvedAt: workflowType !== "serviceRequest" && status === "Resolved" ? now : undefined,
      fulfilledAt:
        workflowType === "serviceRequest" && (status === "Fulfilled" || status === "Meeting Held" || status === "Done")
          ? now
          : undefined,
      closedAt: status === "Closed" ? now : undefined,
    });
  },
});

export const updateTicket = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    actorName: v.string(),
    category: v.optional(v.string()),
    title: v.optional(v.string()),
    requestDetails: v.optional(v.string()),
    requestSnapshot: v.optional(v.string()),
    requesterName: v.optional(v.string()),
    requesterSection: v.optional(v.string()),
    requesterDepartment: v.optional(v.string()),
    meetingMode: v.optional(v.string()),
    meetingLocation: v.optional(v.string()),
    meetingStartAt: v.optional(v.number()),
    meetingEndAt: v.optional(v.number()),
    meetingAttendeeCount: v.optional(v.string()),
    assetId: v.optional(v.id("hardwareInventory")),
    clearAssetLink: v.optional(v.boolean()),
    impact: v.optional(v.string()),
    urgency: v.optional(v.string()),
    status: v.optional(v.string()),
    pendingReason: v.optional(v.string()),
    closeReason: v.optional(v.string()),
    resolutionNote: v.optional(v.string()),
    fulfillmentNote: v.optional(v.string()),
    causeActionTaken: v.optional(v.string()),
    majorIncident: v.optional(v.boolean()),
    incidentReportStorageId: v.optional(v.id("_storage")),
    requiresPurchase: v.optional(v.boolean()),
    requiresReplacement: v.optional(v.boolean()),
    requiresSensitiveAccess: v.optional(v.boolean()),
    revisionReason: v.optional(v.string()),
    closureNote: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          kind: v.string(),
          label: v.string(),
          fileName: v.string(),
          contentType: v.optional(v.string()),
          storageId: v.id("_storage"),
          uploadedBy: v.string(),
        }),
      ),
    ),
    isp: v.optional(v.string()),
    outageArea: v.optional(v.string()),
    timeDetected: v.optional(v.number()),
    timeRestored: v.optional(v.number()),
    operationsBlocked: v.optional(v.boolean()),
    meetingAssetIds: v.optional(v.array(v.id("hardwareInventory"))),
    expectedReturnAt: v.optional(v.number()),
    borrowingItems: v.optional(
      v.array(
        v.object({
          assetId: v.id("hardwareInventory"),
          releaseCondition: v.string(),
          returnCondition: v.optional(v.string()),
          returnedAt: v.optional(v.number()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Ticket could not be found.");
    }

    const actorName = normalizeRequired(args.actorName, "Actor name");
    if (!isMonitoringWorkflowType(ticket.workflowType)) {
      throw new Error("Invalid workflow type on ticket.");
    }
    const workflowType = ticket.workflowType;
    const nextCategory = args.category ? normalizeRequired(args.category, "Category") : ticket.category;
    if (args.category) ensureCategory(nextCategory);
    const ticketIsMeetingRequest =
      ticket.category === MONITORING_MEETING_REQUEST_CATEGORY || Boolean(ticket.meetingStartAt || ticket.meetingLocation);
    const ticketIsBorrowingRequest =
      ticket.category === MONITORING_BORROWING_REQUEST_CATEGORY || Boolean(ticket.borrowingItems?.length);
    if (ticketIsMeetingRequest && nextCategory !== MONITORING_MEETING_REQUEST_CATEGORY) {
      throw new Error("Meeting requests must stay under Meeting & Event Support.");
    }
    if (ticketIsBorrowingRequest && nextCategory !== MONITORING_BORROWING_REQUEST_CATEGORY) {
      throw new Error("Borrowing requests must stay under Borrowing Requests.");
    }
    if (!ticketIsMeetingRequest && !ticketIsBorrowingRequest) {
      ensureTicketCategory(nextCategory);
    }
    const isMeetingRequest = ticketIsMeetingRequest;
    const isBorrowingRequest = ticketIsBorrowingRequest;

    let nextStatus = args.status ? normalizeRequired(args.status, "Status") : ticket.status;
    if (isMeetingRequest) {
      nextStatus = normalizeMeetingRequestStatusValue(nextStatus) ?? nextStatus;
    }
    ensureStatusForWorkflow(workflowType, nextStatus, { isMeetingRequest });

    const nextPendingReason = normalizeOptional(args.pendingReason);
    if (requiresPendingReason(nextStatus)) {
      if (!nextPendingReason) {
        throw new Error("Pending reason is required when status is Pending.");
      }
      ensurePendingReason(nextPendingReason);
    }

    const nextCloseReason = normalizeOptional(args.closeReason);
    const currentTicketStatus = isMeetingRequest ? normalizeMeetingRequestStatusValue(ticket.status) ?? ticket.status : ticket.status;
    if (
      nextStatus === "Closed" &&
      currentTicketStatus !== "Resolved" &&
      currentTicketStatus !== "Fulfilled" &&
      currentTicketStatus !== "Meeting Held" &&
      currentTicketStatus !== "Done" &&
      !nextCloseReason
    ) {
      throw new Error("Close reason is required when closing without normal completion.");
    }
    if (nextCloseReason) ensureCloseReason(nextCloseReason);

    const nextResolutionNote = normalizeOptional(args.resolutionNote) ?? ticket.resolutionNote;
    const nextFulfillmentNote = normalizeOptional(args.fulfillmentNote) ?? ticket.fulfillmentNote;
    let nextCauseActionTaken = normalizeOptional(args.causeActionTaken) ?? ticket.causeActionTaken;
    const nextMajorIncident = isMeetingRequest ? false : args.majorIncident ?? ticket.majorIncident;
    const incidentReportStorageId = args.incidentReportStorageId ?? ticket.incidentReportStorageId;
    const incidentReportAttached = Boolean(incidentReportStorageId);
    const nextRequiresPurchase = isMeetingRequest ? false : args.requiresPurchase ?? ticket.requiresPurchase;
    const nextRequiresReplacement = isMeetingRequest ? false : args.requiresReplacement ?? ticket.requiresReplacement;
    const nextRequiresSensitiveAccess = isMeetingRequest ? false : args.requiresSensitiveAccess ?? ticket.requiresSensitiveAccess;
    const nextApprovalRequired =
      workflowType === "serviceRequest" &&
      !isMeetingRequest &&
      isApprovalRequired({
        requiresPurchase: nextRequiresPurchase,
        requiresReplacement: nextRequiresReplacement,
        requiresSensitiveAccess: nextRequiresSensitiveAccess,
      });

    let assetId = ticket.assetId;
    let assetTag = ticket.assetTag;
    if (!isBorrowingRequest) {
      if (args.clearAssetLink) {
        assetId = undefined;
        assetTag = undefined;
      } else if (args.assetId) {
        const asset = await ctx.db.get(args.assetId);
        if (!asset) {
          throw new Error("Linked asset could not be found.");
        }
        assetId = asset._id;
        assetTag = asset.assetTag;
      }
    }

    let title = normalizeOptional(args.title) ?? ticket.title;
    const requestDetails = normalizeOptional(args.requestDetails) ?? ticket.requestDetails;
    const requestSnapshot = normalizeOptional(args.requestSnapshot) ?? ticket.requestSnapshot;
    const requesterName = normalizeOptional(args.requesterName) ?? ticket.requesterName;
    const requesterSection = normalizeOptional(args.requesterSection) ?? ticket.requesterSection;
    const requesterDepartment = normalizeOptional(args.requesterDepartment) ?? ticket.requesterDepartment;
    let meetingMode = normalizeOptional(args.meetingMode) ?? ticket.meetingMode;
    let meetingLocation = normalizeOptional(args.meetingLocation) ?? ticket.meetingLocation;
    let meetingStartAt = args.meetingStartAt ?? ticket.meetingStartAt;
    let meetingEndAt = args.meetingEndAt ?? ticket.meetingEndAt;
    let meetingAttendeeCount = normalizeOptional(args.meetingAttendeeCount) ?? ticket.meetingAttendeeCount;

    const isp = normalizeOptional(args.isp) ?? ticket.isp;
    const outageArea = normalizeOptional(args.outageArea) ?? ticket.outageArea;
    const timeDetected = args.timeDetected ?? ticket.timeDetected;
    const timeRestored = args.timeRestored ?? ticket.timeRestored;
    const operationsBlocked = args.operationsBlocked ?? ticket.operationsBlocked;
    const connectionRole = resolveConnectionRole(isp);
    let meetingAssetItems =
      args.meetingAssetIds !== undefined
        ? await resolveMeetingAssetItems(ctx, args.meetingAssetIds)
        : (ticket.meetingAssetItems ?? []);
    let expectedReturnAt = args.expectedReturnAt ?? ticket.expectedReturnAt;
    let borrowingItems =
      args.borrowingItems !== undefined
        ? await resolveBorrowingItems(ctx, args.borrowingItems)
        : (ticket.borrowingItems ?? []);

    if (workflowType === "internetOutage") {
      if (!isp) throw new Error("ISP is required for internet outages.");
      ensureIsp(isp);
      if (!outageArea) throw new Error("Area is required for internet outages.");
      ensureArea(outageArea);
      if (!timeDetected) throw new Error("Time detected is required for internet outages.");
      if (timeRestored && timeRestored <= timeDetected) {
        throw new Error("Time restored must be after time detected.");
      }
      title = buildInternetOutageTitle({ isp, area: outageArea });
      if (nextStatus === "Resolved") {
        if (!timeRestored) {
          throw new Error("Time restored is required when resolving an outage.");
        }
        nextCauseActionTaken = normalizeRequired(nextCauseActionTaken ?? "", "Cause / action taken");
      }
    }

    if (
      requiresCompletionNote({
        workflowType,
        status: nextStatus,
      })
    ) {
      if (workflowType === "serviceRequest" && !nextFulfillmentNote) {
        throw new Error("Fulfillment note is required before marking a request fulfilled.");
      }
      if (workflowType === "internetOutage" && !nextCauseActionTaken) {
        throw new Error("Cause / action taken is required before resolving an outage.");
      }
      if (workflowType === "incident" && !nextResolutionNote) {
        throw new Error("Resolution / action taken is required before resolving an incident.");
      }
    }

    const attachmentEntries = args.attachments ? buildAttachmentEntries(args.attachments) : [];
    const nextAttachments = [...ticket.attachments, ...attachmentEntries];
    const totalDowntimeMinutes =
      workflowType === "internetOutage"
        ? computeTotalDowntimeMinutes(timeDetected, timeRestored ?? Date.now())
        : ticket.totalDowntimeMinutes;
    const impactedUptime =
      workflowType === "internetOutage"
        ? shouldImpactUptime({
            operationsBlocked,
            totalDowntimeMinutes,
          })
        : ticket.impactedUptime;

    let approvalStage = ticket.approvalStage;
    if (!nextApprovalRequired) {
      approvalStage = "Not Required";
    } else if (ticket.approvalStage === "Not Required") {
      approvalStage = "Not Submitted";
    }

    let nextImpact: string | undefined;
    let nextUrgency: string | undefined;

    if (!isMeetingRequest && !isBorrowingRequest) {
      nextImpact = args.impact
        ? normalizeRequired(args.impact, "Impact")
        : ticket.impact ?? (workflowType === "internetOutage" ? "Specific Area or Team" : "Single User");
      nextUrgency = args.urgency
        ? normalizeRequired(args.urgency, "Urgency")
        : ticket.urgency ?? (workflowType === "internetOutage" ? "Immediate" : "Can Wait");
      ensureImpact(nextImpact);
      ensureUrgency(nextUrgency);
    }

    if (isBorrowingRequest) {
      if (args.borrowingItems !== undefined && !borrowingItems.length) {
        throw new Error("Add at least one linked asset to the borrowing request.");
      }
      if (borrowingItems.length) {
        assetId = borrowingItems[0].assetId;
        assetTag = borrowingItems[0].assetTag;
        title = buildBorrowingTitle(requesterName, borrowingItems);
      }
      if ((args.expectedReturnAt !== undefined || ticket.expectedReturnAt !== undefined) && !expectedReturnAt) {
        throw new Error("Expected return date and time is required.");
      }
    } else {
      expectedReturnAt = undefined;
      borrowingItems = [];
    }

    if (!isMeetingRequest) {
      meetingMode = undefined;
      meetingLocation = undefined;
      meetingStartAt = undefined;
      meetingEndAt = undefined;
      meetingAttendeeCount = undefined;
      meetingAssetItems = [];
    } else {
      if (!meetingStartAt) {
        throw new Error("Meeting start is required.");
      }
      if (meetingEndAt && meetingEndAt <= meetingStartAt) {
        throw new Error("Meeting end must be after the meeting start.");
      }
      meetingMode = normalizeRequired(meetingMode ?? "", "Meeting mode");
      ensureMeetingMode(meetingMode);
      meetingLocation = normalizeRequired(meetingLocation ?? "", "Meeting location");
      meetingAttendeeCount = normalizeRequired(meetingAttendeeCount ?? "", "Expected attendees");
    }

    if (isMeetingRequest && nextStatus === "Done") {
      const hasMeetingRecording = nextAttachments.some((attachment) => attachment.kind === "Meeting Recording");
      if (!hasMeetingRecording) {
        throw new Error("Attach the meeting recording before marking the meeting done.");
      }
    }

    if (isMeetingRequest) {
      const existingMeetingAssetItems = ticket.meetingAssetItems ?? [];
      const meetingRequestCompleted = nextStatus === "Done" || nextStatus === "Meeting Held" || nextStatus === "Closed";
      const meetingReservationDetailsChanged =
        title !== ticket.title ||
        requesterName !== ticket.requesterName ||
        requesterDepartment !== ticket.requesterDepartment ||
        meetingStartAt !== ticket.meetingStartAt;
      const shouldRefreshMeetingReservations = args.meetingAssetIds !== undefined || meetingReservationDetailsChanged;

      if (meetingRequestCompleted) {
        await releaseMeetingAssetItems(ctx, {
          meetingAssetItems: existingMeetingAssetItems,
          actorName,
          reason: "Meeting request completed and reserved assets released.",
        });
      } else if (shouldRefreshMeetingReservations) {
        if (existingMeetingAssetItems.length) {
          await releaseMeetingAssetItems(ctx, {
            meetingAssetItems: existingMeetingAssetItems,
            actorName,
            reason: meetingReservationDetailsChanged
              ? "Meeting request details updated and reservations refreshed."
              : "Meeting request assets updated and reservation released.",
          });
        }

        if (meetingAssetItems.length) {
          await reserveMeetingAssetItems(ctx, {
            meetingAssetItems,
            requesterName,
            requesterDepartment,
            requestedAt: ticket.requestReceivedAt,
            meetingStartAt,
            slipNote: title,
            actorName,
          });
        }
      }
    }

    const now = Date.now();
    await ctx.db.patch(ticket._id, {
      category: nextCategory,
      title,
      requestDetails,
      requestSnapshot,
      requesterName,
      requesterSection,
      requesterDepartment,
      assetId,
      assetTag,
      impact: nextImpact,
      urgency: nextUrgency,
      priority: nextImpact && nextUrgency ? getPriorityFromImpactUrgency(nextImpact, nextUrgency) : undefined,
      status: nextStatus,
      pendingReason: requiresPendingReason(nextStatus) ? nextPendingReason : undefined,
      closeReason: nextCloseReason,
      resolutionNote: nextResolutionNote,
      fulfillmentNote: nextFulfillmentNote,
      causeActionTaken: nextCauseActionTaken,
      majorIncident: nextMajorIncident,
      incidentReportRequired: nextMajorIncident,
      incidentReportAttached: incidentReportAttached,
      incidentReportStorageId,
      requiresPurchase: nextRequiresPurchase,
      requiresReplacement: nextRequiresReplacement,
      requiresSensitiveAccess: nextRequiresSensitiveAccess,
      approvalRequired: nextApprovalRequired,
      approvalStage,
      revisionReason: normalizeOptional(args.revisionReason) ?? ticket.revisionReason,
      closureNote: normalizeOptional(args.closureNote) ?? ticket.closureNote,
      attachments: nextAttachments,
      isp,
      connectionRole,
      outageArea,
      timeDetected,
      timeRestored,
      totalDowntimeMinutes,
      operationsBlocked,
      impactedUptime,
      meetingMode,
      meetingLocation,
      meetingStartAt,
      meetingEndAt,
      meetingAttendeeCount,
      meetingAssetItems: meetingAssetItems.length ? meetingAssetItems : undefined,
      expectedReturnAt,
      borrowingItems: borrowingItems.length ? borrowingItems : undefined,
      updatedAt: now,
      updatedBy: actorName,
      resolvedAt: nextStatus === "Resolved" ? (ticket.resolvedAt ?? now) : undefined,
      fulfilledAt:
        nextStatus === "Fulfilled" || nextStatus === "Meeting Held" || nextStatus === "Done"
          ? (ticket.fulfilledAt ?? now)
          : undefined,
      closedAt: nextStatus === "Closed" ? (ticket.closedAt ?? now) : undefined,
    });

    return { success: true };
  },
});

export const clearMeetingRequestPriorityFields = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("monitoringTickets").collect();
    let updated = 0;

    for (const row of rows) {
      const isMeetingRequest =
        row.category === MONITORING_MEETING_REQUEST_CATEGORY || Boolean(row.meetingStartAt || row.meetingLocation);
      if (!isMeetingRequest) continue;
      if (row.impact === undefined && row.urgency === undefined && row.priority === undefined) continue;

      await ctx.db.patch(row._id, {
        impact: undefined,
        urgency: undefined,
        priority: undefined,
      });
      updated += 1;
    }

    return { updated };
  },
});

export const deleteTicket = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Ticket could not be found.");
    }

    normalizeRequired(args.actorName, "Actor name");

    const isMeetingRequest =
      ticket.category === MONITORING_MEETING_REQUEST_CATEGORY || Boolean(ticket.meetingStartAt || ticket.meetingLocation);
    if (!isMeetingRequest) {
      throw new Error("Only meeting requests can be deleted from this view.");
    }

    const approvalHistory = await ctx.db
      .query("monitoringApprovalHistory")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", ticket._id))
      .collect();

    for (const entry of approvalHistory) {
      await ctx.db.delete(entry._id);
    }

    await ctx.db.delete(ticket._id);

    return { success: true };
  },
});

export const removeTicketAttachment = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    storageId: v.id("_storage"),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Ticket could not be found.");
    }

    normalizeRequired(args.actorName, "Actor name");

    const attachmentIndex = ticket.attachments.findIndex((attachment) => attachment.storageId === args.storageId);
    if (attachmentIndex < 0) {
      throw new Error("Attachment could not be found.");
    }

    const attachment = ticket.attachments[attachmentIndex];
    const isMeetingRequest =
      ticket.category === MONITORING_MEETING_REQUEST_CATEGORY || Boolean(ticket.meetingStartAt || ticket.meetingLocation);
    const normalizedStatus = isMeetingRequest ? normalizeMeetingRequestStatusValue(ticket.status) ?? ticket.status : ticket.status;

    if (isMeetingRequest && attachment.kind === "Meeting Recording" && normalizedStatus === "Done") {
      throw new Error("Change the meeting status before removing the meeting recording.");
    }

    await ctx.storage.delete(args.storageId);

    const nextAttachments = ticket.attachments.filter((entry) => entry.storageId !== args.storageId);
    await ctx.db.patch(ticket._id, {
      attachments: nextAttachments,
      updatedAt: Date.now(),
      updatedBy: args.actorName,
    });

    return { success: true };
  },
});

export const submitForApproval = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Ticket could not be found.");
    }
    if (ticket.category === MONITORING_MEETING_REQUEST_CATEGORY) {
      throw new Error("Meeting requests do not use the approval workflow.");
    }
    if (ticket.workflowType !== "serviceRequest" || !ticket.approvalRequired) {
      throw new Error("This ticket does not require approval.");
    }

    const actorName = normalizeRequired(args.actorName, "Actor name");
    const history = await ctx.db
      .query("monitoringApprovalHistory")
      .withIndex("by_ticketId", (q) => q.eq("ticketId", ticket._id))
      .collect();
    const decision = history.length ? "Resubmitted" : "Submitted";
    const now = Date.now();

    await ctx.db.patch(ticket._id, {
      status: "Pending Approval",
      approvalStage: "Pending IT Team Leader",
      teamLeaderApprovalStatus: undefined,
      teamLeaderApprovalDate: undefined,
      teamLeaderApprovalReference: undefined,
      teamLeaderApprovalNote: undefined,
      osmdManagerApprovalStatus: undefined,
      osmdManagerApprovalDate: undefined,
      osmdManagerApprovalReference: undefined,
      osmdManagerApprovalNote: undefined,
      revisionReason: undefined,
      updatedAt: now,
      updatedBy: actorName,
    });

    await ctx.db.insert("monitoringApprovalHistory", {
      ticketId: ticket._id,
      approver: "IT Team Leader",
      decision,
      reference: undefined,
      note: decision === "Submitted" ? "Submitted for approval." : "Resubmitted after revision.",
      recordedBy: actorName,
      createdAt: now,
    });

    return { success: true };
  },
});

export const recordApprovalDecision = mutation({
  args: {
    ticketId: v.id("monitoringTickets"),
    approver: v.string(),
    decision: v.string(),
    reference: v.string(),
    note: v.string(),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const ticket = await ctx.db.get(args.ticketId);
    if (!ticket) {
      throw new Error("Ticket could not be found.");
    }
    if (ticket.category === MONITORING_MEETING_REQUEST_CATEGORY) {
      throw new Error("Meeting requests do not use the approval workflow.");
    }
    if (ticket.workflowType !== "serviceRequest" || !ticket.approvalRequired) {
      throw new Error("This ticket does not use the approval workflow.");
    }
    if (!(MONITORING_APPROVERS as readonly string[]).includes(args.approver)) {
      throw new Error("Invalid approver.");
    }
    if (!(MONITORING_APPROVAL_DECISIONS as readonly string[]).includes(args.decision)) {
      throw new Error("Invalid approval decision.");
    }

    const reference = normalizeRequired(args.reference, "Approval reference");
    const note = normalizeRequired(args.note, "Approval note");
    const actorName = normalizeRequired(args.actorName, "Actor name");
    ensureApprovalReference(reference);

    const now = Date.now();
    if (args.approver === "IT Team Leader") {
      if (args.decision === "Approved") {
        await ctx.db.patch(ticket._id, {
          teamLeaderApprovalStatus: "Approved",
          teamLeaderApprovalDate: now,
          teamLeaderApprovalReference: reference,
          teamLeaderApprovalNote: note,
          approvalStage: "Pending OSMD Manager",
          status: "Pending Approval",
          updatedAt: now,
          updatedBy: actorName,
        });
      } else if (args.decision === "For Revision") {
        await ctx.db.patch(ticket._id, {
          teamLeaderApprovalStatus: "For Revision",
          teamLeaderApprovalDate: now,
          teamLeaderApprovalReference: reference,
          teamLeaderApprovalNote: note,
          approvalStage: "For Revision",
          status: "For Revision",
          revisionReason: note,
          updatedAt: now,
          updatedBy: actorName,
        });
      } else {
        throw new Error("Unsupported team leader decision.");
      }
    } else {
      if (ticket.teamLeaderApprovalStatus !== "Approved") {
        throw new Error("IT Team Leader approval must be recorded first.");
      }
      if (args.decision === "Approved") {
        await ctx.db.patch(ticket._id, {
          osmdManagerApprovalStatus: "Approved",
          osmdManagerApprovalDate: now,
          osmdManagerApprovalReference: reference,
          osmdManagerApprovalNote: note,
          approvalStage: "Approved",
          status: "In Progress",
          updatedAt: now,
          updatedBy: actorName,
        });
      } else if (args.decision === "For Revision") {
        await ctx.db.patch(ticket._id, {
          osmdManagerApprovalStatus: "For Revision",
          osmdManagerApprovalDate: now,
          osmdManagerApprovalReference: reference,
          osmdManagerApprovalNote: note,
          approvalStage: "For Revision",
          status: "For Revision",
          revisionReason: note,
          updatedAt: now,
          updatedBy: actorName,
        });
      } else {
        throw new Error("Unsupported OSMD Manager decision.");
      }
    }

    await ctx.db.insert("monitoringApprovalHistory", {
      ticketId: ticket._id,
      approver: args.approver,
      decision: args.decision,
      reference,
      note,
      recordedBy: actorName,
      createdAt: now,
    });

    return { success: true };
  },
});

export const syncAutoClose = mutation({
  args: {},
  handler: async (ctx) => {
    const [tickets, holidaySet] = await Promise.all([
      ctx.db.query("monitoringTickets").collect(),
      getHolidaySet(ctx),
    ]);
    const now = Date.now();
    let closed = 0;

    for (const ticket of tickets) {
      const completedAt =
        ticket.status === "Resolved"
          ? ticket.resolvedAt
          : ticket.status === "Fulfilled" || ticket.status === "Meeting Held" || ticket.status === "Done"
            ? ticket.fulfilledAt
            : undefined;
      if (!completedAt) continue;

      const deadline = addBusinessDaysDeadline(completedAt, AUTO_CLOSE_BUSINESS_DAYS, holidaySet);
      if (now < deadline) continue;

      await ctx.db.patch(ticket._id, {
        status: "Closed",
        closeReason: "No User Response",
        closureNote: "Auto-closed after 3 business days with no user reply.",
        closedAt: now,
        updatedAt: now,
        updatedBy: "System",
      });
      closed += 1;
    }

    return { closed };
  },
});
