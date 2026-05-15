import type { ServiceGroup } from "./serviceGroups";

type RequestType = {
  id: string;
  label: string;
  serviceGroup: ServiceGroup;
  description: string;
  href?: string;
  enabled: boolean;
  examples: string[];
};

export const REQUEST_TYPES: readonly RequestType[] = [
  {
    id: "equipment_borrower",
    label: "IT Equipment Borrower",
    serviceGroup: "IT",
    description: "Borrow available IT equipment from storage.",
    href: "/requests/new/equipment-borrower",
    enabled: true,
    examples: ["Laptop", "Monitor", "Accessories"],
  },
  {
    id: "drone_borrower",
    label: "Drone Borrower",
    serviceGroup: "IT",
    description: "Borrow an available drone kit for field work.",
    href: "/requests/new/drone-borrower",
    enabled: true,
    examples: ["Drone kit", "Field work", "Flight activity"],
  },
  {
    id: "it_incident",
    label: "IT Support",
    serviceGroup: "IT",
    description: "Something is broken, blocked, or not working normally.",
    href: "/requests/new/it-support",
    enabled: true,
    examples: ["Forgot password", "Cannot log in", "System error"],
  },
  {
    id: "it_request",
    label: "IT Request",
    serviceGroup: "IT",
    description: "Ask IT to create, change, retrieve, grant, or set up something.",
    href: "/requests/new/it-request",
    enabled: true,
    examples: ["System access", "Data or recording", "Software setup"],
  },
  {
    id: "travel_order",
    label: "Travel Order",
    serviceGroup: "HR/Admin",
    description: "Submit an official travel request for HR/Admin processing.",
    href: "/requests/new/travel-order",
    enabled: true,
    examples: ["Destination", "Travel dates", "Purpose"],
  },
  {
    id: "meeting_request",
    label: "Meeting Request",
    serviceGroup: "IT",
    description: "Request meeting support, room setup, or equipment.",
    href: "/requests/new/meeting-request",
    enabled: true,
    examples: ["Room setup", "Meeting equipment", "Hybrid support"],
  },
  {
    id: "it_exemption",
    label: "IT Exemption Form",
    serviceGroup: "IT",
    description: "Request an exception from a normal IT rule or process.",
    href: "/requests/new/it-exemption",
    enabled: true,
    examples: ["Policy exception", "Temporary approval", "Special case"],
  },
] as const;
