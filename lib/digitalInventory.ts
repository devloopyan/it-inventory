export const OFFICE_SOFTWARE_STATUSES = [
  "Active",
  "For Renewal",
  "Expired",
  "Unused",
  "Retired",
] as const;

export const ACCESS_ACCOUNT_STATUSES = [
  "Active",
  "Pending Review",
  "Disabled",
  "For Removal",
  "Removed",
] as const;

export const SUBSCRIPTION_STATUSES = [
  "Active",
  "For Renewal",
  "Cancelled",
  "Expired",
  "Unused",
] as const;

export const SUBSCRIPTION_BILLING_CYCLES = [
  "Monthly",
  "Quarterly",
  "Yearly",
  "One-time",
] as const;

export const DIGITAL_INVENTORY_CURRENCIES = ["PHP", "USD"] as const;

export type OfficeSoftwareStatus = (typeof OFFICE_SOFTWARE_STATUSES)[number];
export type AccessAccountStatus = (typeof ACCESS_ACCOUNT_STATUSES)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type SubscriptionBillingCycle = (typeof SUBSCRIPTION_BILLING_CYCLES)[number];
export type DigitalInventoryCurrency = (typeof DIGITAL_INVENTORY_CURRENCIES)[number];

export function isOfficeSoftwareStatus(value: string): value is OfficeSoftwareStatus {
  return (OFFICE_SOFTWARE_STATUSES as readonly string[]).includes(value);
}

export function isAccessAccountStatus(value: string): value is AccessAccountStatus {
  return (ACCESS_ACCOUNT_STATUSES as readonly string[]).includes(value);
}

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(value);
}

export function isSubscriptionBillingCycle(value: string): value is SubscriptionBillingCycle {
  return (SUBSCRIPTION_BILLING_CYCLES as readonly string[]).includes(value);
}

export function isDigitalInventoryCurrency(value: string): value is DigitalInventoryCurrency {
  return (DIGITAL_INVENTORY_CURRENCIES as readonly string[]).includes(value);
}
