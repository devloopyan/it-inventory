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

const HARDWARE_STATUS_ALIAS_MAP: Readonly<Record<string, HardwareStatus>> = {
  borrowed: "Borrowed",
  assigned: "Assigned",
  "for repair": "For Repair",
  repair: "For Repair",
  retired: "Retired",
  available: "Available",
  "in stock": "Available",
  "in storage": "Available",
  working: "Working",
  new: "NEW",
  "pre-owned": "Pre-owned",
  "pre owned": "Pre-owned",
  preowned: "Pre-owned",
};

export function normalizeHardwareStatusValue(status?: string | null): HardwareStatus | undefined {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return undefined;
  return HARDWARE_STATUS_ALIAS_MAP[normalized];
}

export function isHardwareStatus(status?: string | null): status is HardwareStatus {
  return normalizeHardwareStatusValue(status) !== undefined;
}
