export const SERVICE_GROUPS = ["IT", "HR/Admin", "OSMD"] as const;

export type ServiceGroup = (typeof SERVICE_GROUPS)[number];

const CATEGORY_SERVICE_GROUPS: Record<string, string> = {
  "Travel Order": "HR/Admin",
  "Meeting & Event Support": "OSMD",
};

export function getServiceGroupForCategory(category?: string): string {
  return CATEGORY_SERVICE_GROUPS[category ?? ""] ?? "IT";
}
