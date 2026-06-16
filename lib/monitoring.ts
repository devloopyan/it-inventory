export const MONITORING_WORK_TYPES = ["Incident", "Service Request"] as const;

export const MONITORING_WORKFLOW_TYPES = ["incident", "serviceRequest", "internetOutage"] as const;

export const MONITORING_CATEGORIES = [
  "Network & Connectivity",
  "Accounts & Access",
  "Microsoft 365",
  "Hardware & Peripherals",
  "Software & Applications",
  "Procurement & Replacement",
  "Security & Sensitive Access",
  "Meeting & Event Support",
  "Borrowing Requests",
  "Travel Order",
  "IT Exemption",
  "Other",
] as const;

export const MONITORING_MEETING_REQUEST_CATEGORY = "Meeting & Event Support";
export const MONITORING_BORROWING_REQUEST_CATEGORY = "Borrowing Requests";
export const MONITORING_TRAVEL_ORDER_CATEGORY = "Travel Order";
export const MONITORING_IT_EXEMPTION_CATEGORY = "IT Exemption";
export const MONITORING_TICKET_CATEGORIES = MONITORING_CATEGORIES.filter(
  (category) =>
    category !== MONITORING_MEETING_REQUEST_CATEGORY &&
    category !== MONITORING_BORROWING_REQUEST_CATEGORY &&
    category !== MONITORING_TRAVEL_ORDER_CATEGORY &&
    category !== MONITORING_IT_EXEMPTION_CATEGORY,
);

export const MONITORING_IMPACT_OPTIONS = [
  "Single User",
  "Specific Area or Team",
  "Multiple Areas or Teams",
  "Whole Office or Critical Service",
] as const;

export const MONITORING_URGENCY_OPTIONS = ["Can Wait", "Same Day", "Immediate"] as const;

export const MONITORING_MEETING_MODES = ["Onsite", "Online", "Hybrid"] as const;

export const MONITORING_BORROW_CONDITION_OPTIONS = [
  "Good Condition",
  "With Existing Issue",
  "Damaged",
  "Needs Inspection",
] as const;

export const MONITORING_PRIORITY_OPTIONS = ["P1", "P2", "P3", "P4"] as const;

export const INCIDENT_STATUSES = ["New", "Triage", "In Progress", "Pending", "Resolved", "Closed"] as const;

export const SERVICE_REQUEST_STATUSES = [
  "New",
  "Triage",
  "Pending Approval",
  "For Revision",
  "In Progress",
  "Assigned",
  "Pending",
  "Reserved",
  "Claimed",
  "Fulfilled",
  "Closed",
] as const;

export const MEETING_REQUEST_STATUSES = ["New", "Reserved", "Ready", "Done"] as const;

export const INTERNET_OUTAGE_STATUSES = [
  "Investigating",
  "Identified",
  "Monitoring",
  "Resolved",
] as const;

export const MONITORING_STATUS_OPTIONS = [
  ...INCIDENT_STATUSES,
  ...SERVICE_REQUEST_STATUSES,
  ...MEETING_REQUEST_STATUSES,
  ...INTERNET_OUTAGE_STATUSES,
] as const;

export const MONITORING_PENDING_REASONS = [
  "Waiting for User",
  "Waiting for Approval",
  "Waiting for Purchase",
  "Waiting for Replacement",
  "Waiting for Vendor/ISP",
  "Waiting for Schedule",
  "Waiting for Incident Report",
  "Other",
] as const;

export const MONITORING_APPROVAL_REFERENCES = [
  "Teams",
  "Email",
  "Verbal",
  "Signed Document",
  "Other",
] as const;

export const MONITORING_APPROVAL_STAGES = [
  "Not Required",
  "Not Submitted",
  "Pending IT Team Leader",
  "Pending OSMD Manager",
  "Pending Department Approver",
  "Pending HR/Admin Approver",
  // Travel Order role-based chain stages
  "Pending Team Leader",
  "Pending Manager",
  "Pending HR Fleet Manager",
  "Approved",
  "For Revision",
] as const;

export const MONITORING_APPROVAL_DECISIONS = [
  "Submitted",
  "Approved",
  "For Revision",
  "Resubmitted",
] as const;

export const MONITORING_APPROVERS = [
  "IT Team Leader",
  "OSMD Manager",
  "Department Approver",
  "HR/Admin Approver",
] as const;

export const MONITORING_CLOSE_REASONS = [
  "Duplicate",
  "Cancelled",
  "Invalid",
  "No User Response",
  "Other",
] as const;

export const MONITORING_ATTACHMENT_KINDS = [
  "General",
  "Screenshot",
  "Approval Proof",
  "ISP Advisory",
  "Incident Report",
  "Meeting Recording",
  "Reference",
] as const;

export const MONITORING_ISPS = ["RISE PH", "CONVERGE", "GLOBE"] as const;

export const MONITORING_AREAS = ["Main Office", "Mactan Office", "Foodland", "Warehouse"] as const;

export const MONITORING_REQUEST_SOURCE = "Teams Form / IT OPERATIONS GC";

export const OFFICE_TIMEZONE = "Asia/Manila";
export const OFFICE_DAY_START_HOUR = 8;
export const OFFICE_DAY_END_HOUR = 17;
export const UPTIME_IMPACT_MINUTES = 10;
export const AUTO_CLOSE_BUSINESS_DAYS = 3;

export const ISP_ROLE_BY_NAME = {
  "RISE PH": "Main",
  CONVERGE: "WiFi",
  GLOBE: "Backup/Landline",
} as const;

export type MonitoringWorkType = (typeof MONITORING_WORK_TYPES)[number];
export type MonitoringWorkflowType = (typeof MONITORING_WORKFLOW_TYPES)[number];
export type MonitoringCategory = (typeof MONITORING_CATEGORIES)[number];
export type MonitoringImpact = (typeof MONITORING_IMPACT_OPTIONS)[number];
export type MonitoringUrgency = (typeof MONITORING_URGENCY_OPTIONS)[number];
export type MonitoringMeetingMode = (typeof MONITORING_MEETING_MODES)[number];
export type MonitoringBorrowCondition = (typeof MONITORING_BORROW_CONDITION_OPTIONS)[number];
export type MonitoringPriority = (typeof MONITORING_PRIORITY_OPTIONS)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];
export type MeetingRequestStatus = (typeof MEETING_REQUEST_STATUSES)[number];
export type InternetOutageStatus = (typeof INTERNET_OUTAGE_STATUSES)[number];
export type MonitoringStatus = (typeof MONITORING_STATUS_OPTIONS)[number];
export type MonitoringPendingReason = (typeof MONITORING_PENDING_REASONS)[number];
export type MonitoringApprovalReference = (typeof MONITORING_APPROVAL_REFERENCES)[number];
export type MonitoringApprovalStage = (typeof MONITORING_APPROVAL_STAGES)[number];
export type MonitoringApprovalDecision = (typeof MONITORING_APPROVAL_DECISIONS)[number];
export type MonitoringApprover = (typeof MONITORING_APPROVERS)[number];
export type MonitoringCloseReason = (typeof MONITORING_CLOSE_REASONS)[number];
export type MonitoringAttachmentKind = (typeof MONITORING_ATTACHMENT_KINDS)[number];
export type MonitoringIsp = (typeof MONITORING_ISPS)[number];
export type MonitoringArea = (typeof MONITORING_AREAS)[number];
export type MeetingRequestStatusTone = "blue" | "amber" | "violet" | "green" | "gray";

const PRIORITY_MATRIX: Record<MonitoringImpact, Record<MonitoringUrgency, MonitoringPriority>> = {
  "Whole Office or Critical Service": {
    Immediate: "P1",
    "Same Day": "P1",
    "Can Wait": "P2",
  },
  "Multiple Areas or Teams": {
    Immediate: "P2",
    "Same Day": "P2",
    "Can Wait": "P3",
  },
  "Specific Area or Team": {
    Immediate: "P2",
    "Same Day": "P3",
    "Can Wait": "P4",
  },
  "Single User": {
    Immediate: "P3",
    "Same Day": "P4",
    "Can Wait": "P4",
  },
};

const DEFAULT_APPROVAL_ROUTE = {
  firstApprover: "IT Team Leader",
  secondApprover: "OSMD Manager",
  firstPendingStage: "Pending IT Team Leader",
  secondPendingStage: "Pending OSMD Manager",
} as const;

const TRAVEL_ORDER_APPROVAL_ROUTE = {
  firstApprover: "Department Approver",
  secondApprover: "HR/Admin Approver",
  firstPendingStage: "Pending Department Approver",
  secondPendingStage: "Pending HR/Admin Approver",
} as const;

export function getApprovalRouteForCategory(category?: string) {
  return category === MONITORING_TRAVEL_ORDER_CATEGORY
    ? TRAVEL_ORDER_APPROVAL_ROUTE
    : DEFAULT_APPROVAL_ROUTE;
}

export function isPendingApprovalStage(stage?: string) {
  return stage === DEFAULT_APPROVAL_ROUTE.firstPendingStage ||
    stage === DEFAULT_APPROVAL_ROUTE.secondPendingStage ||
    stage === TRAVEL_ORDER_APPROVAL_ROUTE.firstPendingStage ||
    stage === TRAVEL_ORDER_APPROVAL_ROUTE.secondPendingStage ||
    isTravelOrderPendingStage(stage);
}

// ── Travel Order role-based approval chain ──────────────────────────────────
// The chain routes a Travel Order: Team Leader → Manager → HR Fleet Manager.
// A requester who is already the Team Leader or Manager skips their own step.

export const TRAVEL_ORDER_APPROVAL_ROLES = ["Team Leader", "Manager", "HR Fleet Manager"] as const;
export type TravelOrderApprovalRole = (typeof TRAVEL_ORDER_APPROVAL_ROLES)[number];

// approvalScopes tag marking a user as a designated HR Fleet Manager.
export const TRAVEL_ORDER_FLEET_MANAGER_SCOPE = "travel_fleet_manager";

export type TravelOrderApprovalStep = {
  role: TravelOrderApprovalRole;
  // For Team Leader / Manager this is the specific approver. The HR Fleet Manager
  // step has no fixed person — any designated fleet manager may approve it.
  approverUsername?: string;
  status: string; // "Pending" | "Approved" | "For Revision"
  decidedByName?: string;
  decidedByUsername?: string;
  decidedAt?: number;
  reference?: string;
  note?: string;
};

export function travelOrderPendingStage(role: TravelOrderApprovalRole) {
  return `Pending ${role}`;
}

export function isTravelOrderPendingStage(stage?: string) {
  return TRAVEL_ORDER_APPROVAL_ROLES.some((role) => travelOrderPendingStage(role) === stage);
}

// Build the ordered approval chain for a travel order, skipping any step the
// requester themselves fills. The HR Fleet Manager step is always present.
export function buildTravelOrderApprovalChain(args: {
  requesterUsername?: string;
  teamLeaderUsername?: string;
  managerUsername?: string;
}): TravelOrderApprovalStep[] {
  const requester = args.requesterUsername?.trim() || undefined;
  const teamLeader = args.teamLeaderUsername?.trim() || undefined;
  const manager = args.managerUsername?.trim() || undefined;

  const steps: TravelOrderApprovalStep[] = [];
  if (teamLeader && teamLeader !== requester) {
    steps.push({ role: "Team Leader", approverUsername: teamLeader, status: "Pending" });
  }
  if (manager && manager !== requester) {
    steps.push({ role: "Manager", approverUsername: manager, status: "Pending" });
  }
  steps.push({ role: "HR Fleet Manager", status: "Pending" });
  return steps;
}

// Resolve the human-readable approval stage from the current chain state.
export function travelOrderStageForChain(chain?: TravelOrderApprovalStep[]): MonitoringApprovalStage {
  if (!chain || chain.length === 0) return "Not Submitted";
  if (chain.some((step) => step.status === "For Revision")) return "For Revision";
  const nextPending = chain.find((step) => step.status === "Pending");
  if (!nextPending) return "Approved";
  return travelOrderPendingStage(nextPending.role) as MonitoringApprovalStage;
}

export function getMonitoringStatusOptions(workflowType: MonitoringWorkflowType) {
  switch (workflowType) {
    case "serviceRequest":
      return SERVICE_REQUEST_STATUSES;
    case "internetOutage":
      return INTERNET_OUTAGE_STATUSES;
    case "incident":
    default:
      return INCIDENT_STATUSES;
  }
}

export function getMeetingRequestStatusOptions() {
  return MEETING_REQUEST_STATUSES;
}

export function normalizeMeetingRequestStatusValue(status?: string) {
  switch (status) {
    case "Pending Approval":
    case "For Revision":
    case "Triage":
      return "New";
    case "Pending":
    case "Assets Reserved":
      return "Reserved";
    case "In Progress":
    case "Setup Complete":
    case "Setup":
      return "Ready";
    case "Meeting Held":
    case "Fulfilled":
      return "Done";
    default:
      return status;
  }
}

export function getMeetingRequestStatusTone(status?: string): MeetingRequestStatusTone {
  switch (normalizeMeetingRequestStatusValue(status) ?? status) {
    case "New":
      return "blue";
    case "Reserved":
      return "amber";
    case "Ready":
      return "violet";
    case "Done":
      return "green";
    case "Closed":
    default:
      return "gray";
  }
}

export function getPriorityFromImpactUrgency(
  impact?: string,
  urgency?: string,
): MonitoringPriority {
  const safeImpact = (MONITORING_IMPACT_OPTIONS as readonly string[]).includes(impact ?? "")
    ? (impact as MonitoringImpact)
    : "Single User";
  const safeUrgency = (MONITORING_URGENCY_OPTIONS as readonly string[]).includes(urgency ?? "")
    ? (urgency as MonitoringUrgency)
    : "Can Wait";
  return PRIORITY_MATRIX[safeImpact][safeUrgency];
}

export function isApprovalRequired(flags: {
  requiresPurchase?: boolean;
  requiresReplacement?: boolean;
  requiresSensitiveAccess?: boolean;
}) {
  return Boolean(flags.requiresPurchase || flags.requiresReplacement || flags.requiresSensitiveAccess);
}

export function resolveApprovalStage(args: {
  approvalRequired: boolean;
  category?: string;
  teamLeaderApprovalStatus?: string;
  osmdManagerApprovalStatus?: string;
}) {
  if (!args.approvalRequired) return "Not Required" satisfies MonitoringApprovalStage;
  const route = getApprovalRouteForCategory(args.category);
  if (!args.teamLeaderApprovalStatus && !args.osmdManagerApprovalStatus) {
    return "Not Submitted" satisfies MonitoringApprovalStage;
  }
  if (args.teamLeaderApprovalStatus === "For Revision" || args.osmdManagerApprovalStatus === "For Revision") {
    return "For Revision" satisfies MonitoringApprovalStage;
  }
  if (args.teamLeaderApprovalStatus === "Approved" && args.osmdManagerApprovalStatus === "Approved") {
    return "Approved" satisfies MonitoringApprovalStage;
  }
  if (args.teamLeaderApprovalStatus === "Approved") {
    return route.secondPendingStage;
  }
  return route.firstPendingStage;
}

export function resolveTicketPrefix(workType: MonitoringWorkType, category?: string) {
  if (category === MONITORING_TRAVEL_ORDER_CATEGORY) {
    return "TO";
  }
  if (category === MONITORING_IT_EXEMPTION_CATEGORY) {
    return "EXM";
  }

  return workType === "Service Request" ? "SRQ" : "INC";
}

export function formatTicketNumber(prefix: string, year: number, sequence: number) {
  return `${prefix}-${year}-${String(sequence).padStart(4, "0")}`;
}

export function resolveConnectionRole(isp?: string) {
  if (!isp) return undefined;
  return ISP_ROLE_BY_NAME[isp as keyof typeof ISP_ROLE_BY_NAME];
}

export function buildInternetOutageTitle(args: { isp?: string; area?: string }) {
  const isp = args.isp?.trim() || "Office Internet";
  const area = args.area?.trim() || "Unspecified Area";
  return `${isp} outage - ${area}`;
}

export function isClosedMonitoringStatus(status?: string) {
  return status === "Closed" || status === "Resolved" || status === "Fulfilled" || status === "Meeting Held" || status === "Done";
}

export function isFinalMonitoringStatus(status?: string) {
  return status === "Closed" || status === "Resolved" || status === "Fulfilled" || status === "Meeting Held" || status === "Done";
}

export function isOpenMonitoringStatus(status?: string) {
  return !isClosedMonitoringStatus(status);
}

export function requiresPendingReason(status?: string) {
  return status === "Pending";
}

export function requiresCompletionNote(args: {
  workflowType: MonitoringWorkflowType;
  status?: string;
}) {
  if (args.workflowType === "serviceRequest") {
    return args.status === "Fulfilled" || args.status === "Meeting Held" || args.status === "Done";
  }
  if (args.workflowType === "internetOutage") {
    return args.status === "Resolved";
  }
  return args.status === "Resolved";
}

export function shouldImpactUptime(args: {
  operationsBlocked?: boolean;
  totalDowntimeMinutes?: number;
}) {
  return Boolean(args.operationsBlocked && (args.totalDowntimeMinutes ?? 0) >= UPTIME_IMPACT_MINUTES);
}

export function isMonitoringWorkflowType(value?: string): value is MonitoringWorkflowType {
  return (MONITORING_WORKFLOW_TYPES as readonly string[]).includes(value ?? "");
}

export function isMonitoringStatus(value?: string): value is MonitoringStatus {
  return (MONITORING_STATUS_OPTIONS as readonly string[]).includes(value ?? "");
}

export function isMonitoringCategory(value?: string): value is MonitoringCategory {
  return (MONITORING_CATEGORIES as readonly string[]).includes(value ?? "");
}

export function isMonitoringTicketCategory(value?: string): value is (typeof MONITORING_TICKET_CATEGORIES)[number] {
  return (MONITORING_TICKET_CATEGORIES as readonly string[]).includes(value ?? "");
}

export function isMonitoringImpact(value?: string): value is MonitoringImpact {
  return (MONITORING_IMPACT_OPTIONS as readonly string[]).includes(value ?? "");
}

export function isMonitoringUrgency(value?: string): value is MonitoringUrgency {
  return (MONITORING_URGENCY_OPTIONS as readonly string[]).includes(value ?? "");
}

export function isMonitoringMeetingMode(value?: string): value is MonitoringMeetingMode {
  return (MONITORING_MEETING_MODES as readonly string[]).includes(value ?? "");
}

export function isMonitoringBorrowCondition(value?: string): value is MonitoringBorrowCondition {
  return (MONITORING_BORROW_CONDITION_OPTIONS as readonly string[]).includes(value ?? "");
}

export function isMonitoringPendingReason(value?: string): value is MonitoringPendingReason {
  return (MONITORING_PENDING_REASONS as readonly string[]).includes(value ?? "");
}

export function isMonitoringApprovalReference(value?: string): value is MonitoringApprovalReference {
  return (MONITORING_APPROVAL_REFERENCES as readonly string[]).includes(value ?? "");
}

export function isMonitoringCloseReason(value?: string): value is MonitoringCloseReason {
  return (MONITORING_CLOSE_REASONS as readonly string[]).includes(value ?? "");
}

export function isMonitoringAttachmentKind(value?: string): value is MonitoringAttachmentKind {
  return (MONITORING_ATTACHMENT_KINDS as readonly string[]).includes(value ?? "");
}

export function isMonitoringIsp(value?: string): value is MonitoringIsp {
  return (MONITORING_ISPS as readonly string[]).includes(value ?? "");
}

export function isMonitoringArea(value?: string): value is MonitoringArea {
  return (MONITORING_AREAS as readonly string[]).includes(value ?? "");
}

// ─── Travel Order extended constants ────────────────────────────────────────

export const TRAVEL_ORDER_STATUSES = [
  "PENDING",
  "APPROVED",
  "DRIVER_ASSIGNED",
  "EN_ROUTE_TO_PICKUP",
  "PASSENGER_PICKED_UP",
  "IN_TRANSIT",
  "DROPPED_OFF",
  "COMPLETED",
  "DELAYED",
  "INCIDENT_REPORTED",
  "CANCELLED",
  "RESCHEDULED",
  "DRIVER_REPLACED",
  "VEHICLE_REPLACED",
] as const;

export const TRAVEL_ORDER_CANCELLATION_REASONS = [
  "No longer needed",
  "Schedule conflict",
  "Requester request",
  "Vehicle unavailable",
  "Driver unavailable",
  "Weather or road conditions",
  "Budget constraints",
  "Admin decision",
  "Other",
] as const;

export const TRAVEL_ORDER_INCIDENT_TYPES = ["MINOR", "MAJOR"] as const;

export const TRAVEL_ORDER_TRIP_MODES = [
  "PASSENGER_ONLY",
  "VEHICLE_ONLY",
  "BOTH",
] as const;

export const TRAVEL_ORDER_STOP_TYPES = ["PICKUP", "DROPOFF"] as const;

export const TRAVEL_ORDER_SHARED_ROLES = ["PRIMARY", "SHARED_RIDER"] as const;

export const LATE_DETECTION_THRESHOLD_MINUTES = 15;

export type TravelOrderStatus = (typeof TRAVEL_ORDER_STATUSES)[number];
export type TravelOrderCancellationReason = (typeof TRAVEL_ORDER_CANCELLATION_REASONS)[number];
export type TravelOrderIncidentType = (typeof TRAVEL_ORDER_INCIDENT_TYPES)[number];
export type TravelOrderTripMode = (typeof TRAVEL_ORDER_TRIP_MODES)[number];
export type TravelOrderStopType = (typeof TRAVEL_ORDER_STOP_TYPES)[number];
export type TravelOrderSharedRole = (typeof TRAVEL_ORDER_SHARED_ROLES)[number];

export function isTravelOrderStatus(value?: string): value is TravelOrderStatus {
  return (TRAVEL_ORDER_STATUSES as readonly string[]).includes(value ?? "");
}

export function getTravelOrderStatusTone(
  status?: string,
): "blue" | "amber" | "red" | "green" | "gray" | "violet" {
  switch (status) {
    case "PENDING":
    case "APPROVED":
    case "DRIVER_ASSIGNED":
      return "blue";
    case "EN_ROUTE_TO_PICKUP":
    case "PASSENGER_PICKED_UP":
    case "IN_TRANSIT":
      return "violet";
    case "DROPPED_OFF":
    case "COMPLETED":
      return "green";
    case "DELAYED":
    case "RESCHEDULED":
    case "DRIVER_REPLACED":
    case "VEHICLE_REPLACED":
      return "amber";
    case "INCIDENT_REPORTED":
    case "CANCELLED":
      return "red";
    default:
      return "gray";
  }
}

export function getTravelOrderStatusLabel(status?: string): string {
  switch (status) {
    case "PENDING": return "Pending";
    case "APPROVED": return "Approved";
    case "DRIVER_ASSIGNED": return "Driver Assigned";
    case "EN_ROUTE_TO_PICKUP": return "En Route to Pickup";
    case "PASSENGER_PICKED_UP": return "Passenger Picked Up";
    case "IN_TRANSIT": return "In Transit";
    case "DROPPED_OFF": return "Dropped Off";
    case "COMPLETED": return "Completed";
    case "DELAYED": return "Delayed";
    case "INCIDENT_REPORTED": return "Incident Reported";
    case "CANCELLED": return "Cancelled";
    case "RESCHEDULED": return "Rescheduled";
    case "DRIVER_REPLACED": return "Driver Replaced";
    case "VEHICLE_REPLACED": return "Vehicle Replaced";
    default: return status ?? "Unknown";
  }
}
