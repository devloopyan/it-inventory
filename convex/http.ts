import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { MONITORING_BORROWING_REQUEST_CATEGORY } from "../lib/monitoring";

const http = httpRouter();
const MANILA_OFFSET_HOURS = 8;
const BORROWING_REQUEST_TYPE = "IT Equipment Borrower Request";

type RequestPayload = Record<string, unknown>;

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const next = value.trim();
  return next ? next : undefined;
}

function pickString(payload: RequestPayload, keys: string[]) {
  for (const key of keys) {
    const next = normalizeOptionalString(payload[key]);
    if (next) return next;
  }
  return undefined;
}

function requireString(payload: RequestPayload, keys: string[], label: string) {
  const value = pickString(payload, keys);
  if (!value) {
    throw new Error(`${label} is required.`);
  }
  return value;
}

function parseMicrosoftDate(value: string, defaultHour: number) {
  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, monthRaw, dayRaw, yearRaw] = slashMatch;
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    const year = Number(yearRaw);
    return Date.UTC(year, month - 1, day, defaultHour - MANILA_OFFSET_HOURS, 0, 0, 0);
  }

  const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateMatch) {
    const [, yearRaw, monthRaw, dayRaw] = isoDateMatch;
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    return Date.UTC(year, month - 1, day, defaultHour - MANILA_OFFSET_HOURS, 0, 0, 0);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return parsed.getTime();
}

function buildBorrowingRequestDetails(args: {
  requestedItemsText: string;
  purpose: string;
  requestedBorrowDate: string;
  requestedReturnDate: string;
  requesterDepartment: string;
}) {
  return [
    `Requested item(s): ${args.requestedItemsText}.`,
    `Purpose: ${args.purpose}.`,
    `Planned borrow date: ${args.requestedBorrowDate}.`,
    `Expected return date: ${args.requestedReturnDate}.`,
    `Requester department: ${args.requesterDepartment}.`,
    "Submitted via Microsoft Forms.",
  ].join("\n");
}

function buildBorrowingRequestSnapshot(payload: RequestPayload, args: {
  requesterName: string;
  requesterDepartment: string;
  requestedItemsText: string;
  purpose: string;
  requestedBorrowDate: string;
  requestedReturnDate: string;
}) {
  const responderEmail = pickString(payload, [
    "Responder Email",
    "Responder email",
    "Email",
    "email",
    "requesterEmail",
  ]);
  const submittedAt = pickString(payload, [
    "Submitted At",
    "submittedAt",
    "Submission Time",
    "submissionTime",
  ]);

  return [
    `Type of Request: ${BORROWING_REQUEST_TYPE}`,
    `Requester Name: ${args.requesterName}`,
    `Requester Department: ${args.requesterDepartment}`,
    `Item / Equipment: ${args.requestedItemsText}`,
    `Purpose: ${args.purpose}`,
    `Date Borrowed: ${args.requestedBorrowDate}`,
    `Date Return: ${args.requestedReturnDate}`,
    responderEmail ? `Responder Email: ${responderEmail}` : undefined,
    submittedAt ? `Submitted At: ${submittedAt}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

http.route({
  path: "/teams/forms/borrowing",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    let payload: RequestPayload;

    try {
      payload = (await request.json()) as RequestPayload;
    } catch {
      return jsonResponse({ ok: false, error: "Invalid JSON payload." }, { status: 400 });
    }

    const configuredSecret = normalizeOptionalString(process.env.TEAMS_FORMS_WEBHOOK_SECRET);
    if (!configuredSecret) {
      return jsonResponse({ ok: false, error: "TEAMS_FORMS_WEBHOOK_SECRET is not configured." }, { status: 500 });
    }

    const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    const payloadSecret = pickString(payload, ["secret", "webhookSecret"]);
    const providedSecret = payloadSecret ?? bearerToken;

    if (!providedSecret || providedSecret !== configuredSecret) {
      return jsonResponse({ ok: false, error: "Unauthorized request." }, { status: 401 });
    }

    try {
      const typeOfRequest = pickString(payload, ["Type of Request", "typeOfRequest"]);
      if (typeOfRequest && typeOfRequest !== BORROWING_REQUEST_TYPE) {
        throw new Error(`This endpoint only accepts "${BORROWING_REQUEST_TYPE}" submissions.`);
      }

      const requesterName = requireString(
        payload,
        ["ITEBR-Requestor Name", "requesterName", "requestorName"],
        "Requester name",
      );
      const requesterDepartment = requireString(
        payload,
        ["ITEBR-Requestor Department", "requesterDepartment", "requestorDepartment"],
        "Requester department",
      );
      const requestedItemsText = requireString(
        payload,
        ["ITEBR-Item Borrowed", "requestedItemsText", "itemBorrowed"],
        "Requested item or equipment",
      );
      const purpose = requireString(payload, ["ITEBR-Purpose", "purpose"], "Purpose");
      const requestedBorrowDateInput = requireString(
        payload,
        ["ITEBR-Date Borrowed", "requestedBorrowDate", "dateBorrowed"],
        "Date borrowed",
      );
      const requestedReturnDateInput = requireString(
        payload,
        ["ITEBR-Date Return", "requestedReturnDate", "dateReturn"],
        "Date return",
      );
      const requesterSection = pickString(
        payload,
        ["ITEBR-Requestor Section", "requesterSection", "requestorSection"],
      );
      const requestReceivedAtInput = pickString(payload, [
        "Submitted At",
        "submittedAt",
        "Submission Time",
        "submissionTime",
      ]);

      const requestedBorrowDate = parseMicrosoftDate(requestedBorrowDateInput, 8);
      const expectedReturnAt = parseMicrosoftDate(requestedReturnDateInput, 17);
      if (expectedReturnAt < requestedBorrowDate) {
        throw new Error("Date return must be after the borrow date.");
      }

      let requestReceivedAt: number | undefined;
      if (requestReceivedAtInput) {
        try {
          requestReceivedAt = parseMicrosoftDate(requestReceivedAtInput, 8);
        } catch {
          requestReceivedAt = undefined;
        }
      }

      const ticketId = await ctx.runMutation(api.monitoring.createTicket, {
        workType: "Service Request",
        workflowType: "serviceRequest",
        category: MONITORING_BORROWING_REQUEST_CATEGORY,
        requestDetails: buildBorrowingRequestDetails({
          requestedItemsText,
          purpose,
          requestedBorrowDate: requestedBorrowDateInput,
          requestedReturnDate: requestedReturnDateInput,
          requesterDepartment,
        }),
        requestSnapshot: buildBorrowingRequestSnapshot(payload, {
          requesterName,
          requesterDepartment,
          requestedItemsText,
          purpose,
          requestedBorrowDate: requestedBorrowDateInput,
          requestedReturnDate: requestedReturnDateInput,
        }),
        requestSource: "Microsoft Forms",
        requesterName,
        requesterSection,
        requesterDepartment,
        requestReceivedAt,
        requestedItemsText,
        requestedBorrowDate,
        expectedReturnAt,
        createdBy: "Teams Automation",
        status: "New",
      });

      return jsonResponse({
        ok: true,
        ticketId,
      });
    } catch (error) {
      return jsonResponse(
        {
          ok: false,
          error: error instanceof Error ? error.message : "Borrowing request import failed.",
        },
        { status: 400 },
      );
    }
  }),
});

export default http;
