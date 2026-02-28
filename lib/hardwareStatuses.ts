export const HARDWARE_STATUSES = [
  "Borrowed",
  "Assigned",
  "For Repair",
  "Retired",
  "Available",
  "Working",
] as const;

export type HardwareStatus = (typeof HARDWARE_STATUSES)[number];
