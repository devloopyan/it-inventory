export const REQUEST_TYPES = [
  {
    id: "equipment_borrower",
    label: "IT Equipment Borrower",
    description: "Borrow available IT equipment from storage.",
    href: "/requests/new/equipment-borrower",
    enabled: true,
  },
  {
    id: "drone_borrower",
    label: "Drone Borrower",
    description: "Borrow an available drone kit for field work.",
    href: "/requests/new/drone-borrower",
    enabled: true,
  },
  {
    id: "it_incident",
    label: "IT Incident",
    description: "Report an issue that needs IT help.",
    href: "/requests/new/it-incident",
    enabled: true,
  },
  {
    id: "it_request",
    label: "IT Request",
    description: "Ask for general IT support or service.",
    enabled: false,
  },
  {
    id: "meeting_request",
    label: "Meeting Request",
    description: "Request meeting support, room setup, or equipment.",
    enabled: false,
  },
  {
    id: "it_exemption",
    label: "IT Exemption Form",
    description: "Request an exception from a normal IT rule or process.",
    enabled: false,
  },
  {
    id: "access_password",
    label: "IT Access/Password Request",
    description: "Request account access, permission changes, or password help.",
    enabled: false,
  },
] as const;
