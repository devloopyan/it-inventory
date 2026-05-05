import {
  MONITORING_BORROWING_REQUEST_CATEGORY,
  MONITORING_MEETING_REQUEST_CATEGORY,
} from "@/lib/monitoring";

type BorrowingItemSummary = {
  assetTag?: string;
  assetLabel?: string;
};

type RequestTypeSummary = {
  category: string;
  title?: string;
  requestDetails?: string;
  requestSnapshot?: string;
  borrowingItems?: BorrowingItemSummary[];
};

function hasDroneSignal(request: RequestTypeSummary) {
  const values = [
    request.title,
    request.requestDetails,
    request.requestSnapshot,
    ...(request.borrowingItems ?? []).flatMap((item) => [item.assetTag, item.assetLabel]),
  ];

  return values.some((value) => {
    const normalized = value?.toLowerCase() ?? "";
    return normalized.includes("drone") || normalized.includes("-drn-");
  });
}

export function formatRequesterRequestType(request: RequestTypeSummary) {
  if (request.category === MONITORING_BORROWING_REQUEST_CATEGORY) {
    return hasDroneSignal(request) ? "Drone Borrowing" : "Equipment Borrowing";
  }

  if (request.category === MONITORING_MEETING_REQUEST_CATEGORY) return "Meeting Request";

  return request.category;
}

export function formatRequesterAssetLabel(request: RequestTypeSummary) {
  if (request.category === MONITORING_BORROWING_REQUEST_CATEGORY && hasDroneSignal(request)) {
    return "Drone Kit";
  }

  return "Equipment";
}
