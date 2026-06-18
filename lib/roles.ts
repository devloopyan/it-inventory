import { SERVICE_GROUPS, type ServiceGroup } from "./serviceGroups";

// APO-style role set. Owner = super-admin above Admin.
export const USER_ROLES = ["owner", "admin", "reviewer", "team_lead", "member"] as const;

export type UserRole = (typeof USER_ROLES)[number];

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  reviewer: "Reviewer",
  team_lead: "Team Lead",
  member: "Member",
};

// Legacy roles map onto the new set so existing accounts keep working without a DB migration.
const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  requester: "member",
  approver: "member",
  manager: "reviewer",
  service_staff: "admin",
  it_staff: "admin",
};

const ADMIN_ROLES: readonly UserRole[] = ["owner", "admin"];
const STAFF_ROLES: readonly UserRole[] = ["owner", "admin"];

export function normalizeUserRole(role?: string): UserRole {
  if (USER_ROLES.includes(role as UserRole)) return role as UserRole;
  const mapped = role ? LEGACY_ROLE_MAP[role] : undefined;
  return mapped ?? "member";
}

export function formatUserRoleLabel(role?: string) {
  return ROLE_LABELS[normalizeUserRole(role)];
}

export function isAdminRole(role?: string) {
  return ADMIN_ROLES.includes(normalizeUserRole(role));
}

export function isServiceStaffRole(role?: string) {
  return ADMIN_ROLES.includes(normalizeUserRole(role));
}

export function normalizeServiceGroups(role?: string, serviceGroups?: readonly string[]): ServiceGroup[] {
  const normalizedRole = normalizeUserRole(role);
  if (ADMIN_ROLES.includes(normalizedRole)) return [...SERVICE_GROUPS];

  const validGroups = (serviceGroups ?? []).filter((group): group is ServiceGroup =>
    (SERVICE_GROUPS as readonly string[]).includes(group),
  );
  return Array.from(new Set(validGroups));
}

export function canAccessAppPath(role: string | undefined, pathname: string, serviceGroups?: readonly string[]) {
  const normalizedRole = normalizeUserRole(role);
  const normalizedServiceGroups = normalizeServiceGroups(normalizedRole, serviceGroups);

  if (pathname === "/users" || pathname.startsWith("/users/")) {
    return ADMIN_ROLES.includes(normalizedRole);
  }

  if (pathname === "/requests/my" || pathname.startsWith("/requests/my/") || pathname === "/requests/new" || pathname.startsWith("/requests/new/")) {
    return true;
  }

  if (
    pathname === "/assets" ||
    pathname.startsWith("/assets/") ||
    pathname === "/hardware-inventory" ||
    pathname.startsWith("/hardware-inventory/") ||
    pathname === "/digital-inventory" ||
    pathname.startsWith("/digital-inventory/") ||
    pathname === "/operations" ||
    pathname.startsWith("/operations/")
  ) {
    return STAFF_ROLES.includes(normalizedRole) && normalizedServiceGroups.includes("IT");
  }

  if (pathname === "/monitoring" || pathname.startsWith("/monitoring/")) {
    // Admins/owners, travel approvers (reviewer/team_lead are != member), and
    // anyone with a service group (IT/HR-Admin/OSMD) can reach Monitoring.
    return normalizedRole !== "member" || normalizedServiceGroups.length > 0;
  }

  return true;
}
