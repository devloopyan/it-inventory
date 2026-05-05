export const USER_ROLES = ["admin", "it_staff", "approver", "requester"] as const;

export type UserRole = (typeof USER_ROLES)[number];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  it_staff: "IT Staff",
  approver: "Approver",
  requester: "Requester",
};

const STAFF_ROLES: readonly UserRole[] = ["admin", "it_staff"];

export function normalizeUserRole(role?: string): UserRole {
  return USER_ROLES.includes(role as UserRole) ? (role as UserRole) : "requester";
}

export function formatUserRoleLabel(role?: string) {
  return ROLE_LABELS[normalizeUserRole(role)];
}

export function canAccessAppPath(role: string | undefined, pathname: string) {
  const normalizedRole = normalizeUserRole(role);

  if (pathname === "/users" || pathname.startsWith("/users/")) {
    return normalizedRole === "admin";
  }

  if (pathname === "/requests/my" || pathname.startsWith("/requests/my/") || pathname === "/requests/new" || pathname.startsWith("/requests/new/")) {
    return normalizedRole === "admin" || normalizedRole === "requester";
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
    return STAFF_ROLES.includes(normalizedRole);
  }

  if (pathname === "/monitoring" || pathname.startsWith("/monitoring/")) {
    return normalizedRole !== "requester";
  }

  return true;
}
