import { SERVICE_GROUPS, type ServiceGroup } from "./serviceGroups";

export const USER_ROLES = ["admin", "service_staff", "it_staff", "approver", "requester"] as const;

export type UserRole = (typeof USER_ROLES)[number];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  service_staff: "Service Staff",
  it_staff: "IT Staff",
  approver: "Approver",
  requester: "Requester",
};

const STAFF_ROLES: readonly UserRole[] = ["admin", "service_staff", "it_staff"];

export function normalizeUserRole(role?: string): UserRole {
  return USER_ROLES.includes(role as UserRole) ? (role as UserRole) : "requester";
}

export function formatUserRoleLabel(role?: string) {
  return ROLE_LABELS[normalizeUserRole(role)];
}

export function isAdminRole(role?: string) {
  return normalizeUserRole(role) === "admin";
}

export function isServiceStaffRole(role?: string) {
  const normalizedRole = normalizeUserRole(role);
  return normalizedRole === "admin" || normalizedRole === "service_staff" || normalizedRole === "it_staff";
}

export function normalizeServiceGroups(role?: string, serviceGroups?: readonly string[]): ServiceGroup[] {
  const normalizedRole = normalizeUserRole(role);
  if (normalizedRole === "admin") return [...SERVICE_GROUPS];

  const validGroups = (serviceGroups ?? []).filter((group): group is ServiceGroup =>
    (SERVICE_GROUPS as readonly string[]).includes(group),
  );
  const uniqueGroups = Array.from(new Set(validGroups));

  if (uniqueGroups.length > 0) return uniqueGroups;
  if (normalizedRole === "service_staff" || normalizedRole === "it_staff") return ["IT"];

  return [];
}


export function canAccessAppPath(role: string | undefined, pathname: string, serviceGroups?: readonly string[]) {
  const normalizedRole = normalizeUserRole(role);
  const normalizedServiceGroups = normalizeServiceGroups(normalizedRole, serviceGroups);

  if (pathname === "/users" || pathname.startsWith("/users/")) {
    return normalizedRole === "admin";
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
    return normalizedRole !== "requester";
  }

  return true;
}
