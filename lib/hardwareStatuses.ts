export const HARDWARE_STATUSES = [
  "Borrowed",
  "Assigned",
  "For Repair",
  "Retired",
  "Available",
  "Working",
  "NEW",
  "Pre-owned",
] as const;

export type HardwareStatus = (typeof HARDWARE_STATUSES)[number];
