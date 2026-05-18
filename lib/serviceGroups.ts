export const SERVICE_GROUPS = ["IT", "HR/Admin"] as const;

export type ServiceGroup = (typeof SERVICE_GROUPS)[number];

const CATEGORY_SERVICE_GROUPS: Record<string, ServiceGroup> = {
  "Travel Order": "HR/Admin",
};

export function getServiceGroupForCategory(category?: string): ServiceGroup {
  return CATEGORY_SERVICE_GROUPS[category ?? ""] ?? "IT";
}
