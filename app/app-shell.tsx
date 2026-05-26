"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  MONITORING_BORROWING_REQUEST_CATEGORY,
  MONITORING_MEETING_REQUEST_CATEGORY,
} from "@/lib/monitoring";
import {
  formatUserRoleLabel,
  normalizeServiceGroups,
  normalizeUserRole,
  type UserRole,
} from "@/lib/roles";
import { getServiceGroupForCategory } from "@/lib/serviceGroups";
import type { ServiceGroup } from "@/lib/serviceGroups";
import { CurrentUserProvider, type CurrentUser } from "./current-user-context";
import TopbarActivityMenu from "./topbar-activity-menu";
import { ActiveWorkflowProvider } from "./active-workflow-context";
import ActiveWorkflowBanner from "./active-workflow-banner";

type AppShellProps = {
  children: React.ReactNode;
  currentUser: AppShellUser | null;
};

type ThemeMode = "light" | "dark";
type AppShellUser = CurrentUser;

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  matchPrefixes?: readonly string[];
  allowedRoles?: readonly UserRole[];
  requiredServiceGroups?: readonly ServiceGroup[];
};

const THEME_STORAGE_KEY = "it-inventory-theme";

function resolveInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(nextTheme: ThemeMode) {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;
  window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
}

const navSections: ReadonlyArray<{ label: string; items: readonly NavItem[] }> = [
  {
    label: "Core",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7,0H4A4,4,0,0,0,0,4V7a4,4,0,0,0,4,4H7a4,4,0,0,0,4-4V4A4,4,0,0,0,7,0ZM9,7A2,2,0,0,1,7,9H4A2,2,0,0,1,2,7V4A2,2,0,0,1,4,2H7A2,2,0,0,1,9,4Z"/>
            <path d="M20,0H17a4,4,0,0,0-4,4V7a4,4,0,0,0,4,4h3a4,4,0,0,0,4-4V4A4,4,0,0,0,20,0Zm2,7a2,2,0,0,1-2,2H17a2,2,0,0,1-2-2V4a2,2,0,0,1,2-2h3a2,2,0,0,1,2,2Z"/>
            <path d="M7,13H4a4,4,0,0,0-4,4v3a4,4,0,0,0,4,4H7a4,4,0,0,0,4-4V17A4,4,0,0,0,7,13Zm2,7a2,2,0,0,1-2,2H4a2,2,0,0,1-2-2V17a2,2,0,0,1,2-2H7a2,2,0,0,1,2,2Z"/>
            <path d="M20,13H17a4,4,0,0,0-4,4v3a4,4,0,0,0,4,4h3a4,4,0,0,0,4-4V17A4,4,0,0,0,20,13Zm2,7a2,2,0,0,1-2,2H17a2,2,0,0,1-2-2V17a2,2,0,0,1,2-2h3a2,2,0,0,1,2,2Z"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: "Workspaces",
    items: [
      {
        href: "/monitoring",
        label: "Monitoring",
        allowedRoles: ["admin", "service_staff", "it_staff", "approver"],
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M23,22H3a1,1,0,0,1-1-1V1A1,1,0,0,0,0,1V21a3,3,0,0,0,3,3H23a1,1,0,0,0,0-2Z"/>
            <path d="M15,20a1,1,0,0,0,1-1V12a1,1,0,0,0-2,0v7A1,1,0,0,0,15,20Z"/>
            <path d="M7,20a1,1,0,0,0,1-1V12a1,1,0,0,0-2,0v7A1,1,0,0,0,7,20Z"/>
            <path d="M19,20a1,1,0,0,0,1-1V7a1,1,0,0,0-2,0V19A1,1,0,0,0,19,20Z"/>
            <path d="M11,20a1,1,0,0,0,1-1V7a1,1,0,0,0-2,0V19A1,1,0,0,0,11,20Z"/>
          </svg>
        ),
      },
      {
        href: "/requests/new",
        label: "New Request",
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M23,11H13V1a1,1,0,0,0-1-1h0a1,1,0,0,0-1,1V11H1a1,1,0,0,0-1,1H0a1,1,0,0,0,1,1H11V23a1,1,0,0,0,1,1h0a1,1,0,0,0,1-1V13H23a1,1,0,0,0,1-1h0A1,1,0,0,0,23,11Z"/>
          </svg>
        ),
      },
      {
        href: "/requests/my",
        label: "My Requests",
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="m4 6a2.982 2.982 0 0 1 -2.122-.879l-1.544-1.374a1 1 0 0 1 1.332-1.494l1.585 1.414a1 1 0 0 0 1.456.04l3.604-3.431a1 1 0 0 1 1.378 1.448l-3.589 3.414a2.964 2.964 0 0 1 -2.1.862zm20-2a1 1 0 0 0 -1-1h-10a1 1 0 0 0 0 2h10a1 1 0 0 0 1-1zm-17.9 9.138 3.589-3.414a1 1 0 1 0 -1.378-1.448l-3.6 3.431a1.023 1.023 0 0 1 -1.414 0l-1.59-1.585a1 1 0 0 0 -1.414 1.414l1.585 1.585a3 3 0 0 0 4.226.017zm17.9-1.138a1 1 0 0 0 -1-1h-10a1 1 0 0 0 0 2h10a1 1 0 0 0 1-1zm-17.9 9.138 3.585-3.414a1 1 0 1 0 -1.378-1.448l-3.6 3.431a1 1 0 0 1 -1.456-.04l-1.585-1.414a1 1 0 0 0 -1.332 1.494l1.544 1.374a3 3 0 0 0 4.226.017zm17.9-1.138a1 1 0 0 0 -1-1h-10a1 1 0 0 0 0 2h10a1 1 0 0 0 1-1z"/>
          </svg>
        ),
      },
      {
        href: "/assets",
        label: "Assets",
        matchPrefixes: ["/assets", "/hardware-inventory"],
        allowedRoles: ["admin", "service_staff", "it_staff"],
        requiredServiceGroups: ["IT"],
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M19,1H5A5.006,5.006,0,0,0,0,6v8a5.006,5.006,0,0,0,5,5h6v2H7a1,1,0,0,0,0,2H17a1,1,0,0,0,0-2H13V19h6a5.006,5.006,0,0,0,5-5V6A5.006,5.006,0,0,0,19,1ZM5,3H19a3,3,0,0,1,3,3v7H2V6A3,3,0,0,1,5,3ZM19,17H5a3,3,0,0,1-2.816-2H21.816A3,3,0,0,1,19,17Z"/>
          </svg>
        ),
      },
      {
        href: "/digital-inventory",
        label: "Digital Inventory",
        allowedRoles: ["admin", "service_staff", "it_staff"],
        requiredServiceGroups: ["IT"],
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="m17 14a1 1 0 0 1 -1 1h-8a1 1 0 0 1 0-2h8a1 1 0 0 1 1 1zm-4 3h-5a1 1 0 0 0 0 2h5a1 1 0 0 0 0-2zm9-6.515v8.515a5.006 5.006 0 0 1 -5 5h-10a5.006 5.006 0 0 1 -5-5v-14a5.006 5.006 0 0 1 5-5h4.515a6.958 6.958 0 0 1 4.95 2.05l3.484 3.486a6.951 6.951 0 0 1 2.051 4.949zm-6.949-7.021a5.01 5.01 0 0 0 -1.051-.78v4.316a1 1 0 0 0 1 1h4.316a4.983 4.983 0 0 0 -.781-1.05zm4.949 7.021c0-.165-.032-.323-.047-.485h-4.953a3 3 0 0 1 -3-3v-4.953c-.162-.015-.321-.047-.485-.047h-4.515a3 3 0 0 0 -3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3z"/>
          </svg>
        ),
      },
      {
        href: "/operations",
        label: "Operations",
        allowedRoles: ["admin", "service_staff", "it_staff"],
        requiredServiceGroups: ["IT"],
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12,0A12,12,0,1,0,24,12,12.013,12.013,0,0,0,12,0Zm0,22A10,10,0,1,1,22,12,10.011,10.011,0,0,1,12,22Z"/>
            <path d="M12,6a1,1,0,0,0-1,1v4.325L7.629,13.437a1,1,0,0,0,1.062,1.7l3.84-2.4A1,1,0,0,0,13,11.879V7A1,1,0,0,0,12,6Z"/>
          </svg>
        ),
      },
    ],
  },
  {
    label: "Admin",
    items: [
      {
        href: "/users",
        label: "Users",
        allowedRoles: ["admin"],
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M23,11H21V9a1,1,0,0,0-2,0v2H17a1,1,0,0,0,0,2h2v2a1,1,0,0,0,2,0V13h2a1,1,0,0,0,0-2Z"/>
            <path d="M9,12A6,6,0,1,0,3,6,6.006,6.006,0,0,0,9,12ZM9,2A4,4,0,1,1,5,6,4,4,0,0,1,9,2Z"/>
            <path d="M9,14a9.01,9.01,0,0,0-9,9,1,1,0,0,0,2,0,7,7,0,0,1,14,0,1,1,0,0,0,2,0A9.01,9.01,0,0,0,9,14Z"/>
          </svg>
        ),
      },
    ],
  },
] as const;

const routeLabelMap: Record<string, string> = {
  dashboard: "Dashboard",
  monitoring: "Monitoring",
  operations: "Operations",
  assets: "Assets",
  "digital-inventory": "Digital Inventory",
  "hardware-inventory": "Hardware Inventory",
  users: "Users",
  requests: "Requests",
  new: "New Request",
  my: "My Requests",
};

function formatBreadcrumbLabel(segment: string, index: number, segments: string[]) {
  if (routeLabelMap[segment]) return routeLabelMap[segment];
  if (segments[index - 1] === "hardware-inventory") return "Asset Details";
  if (segments[index - 1] === "monitoring") return "Ticket Details";
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word.charAt(0).toUpperCase()).join("");
  return initials || "IT";
}

function canShowNavItem(role: UserRole, serviceGroups: readonly string[] | undefined, item: NavItem) {
  if (item.allowedRoles && !item.allowedRoles.includes(role)) return false;
  if (!item.requiredServiceGroups) return true;

  const normalizedServiceGroups = normalizeServiceGroups(role, serviceGroups);
  return item.requiredServiceGroups.some((group) => normalizedServiceGroups.includes(group));
}

export default function AppShell({ children, currentUser }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(resolveInitialTheme);
  const [accountMenuPath, setAccountMenuPath] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const showAppChrome = pathname !== "/login";
  const currentRole = normalizeUserRole(currentUser?.role);
  const currentServiceGroups = normalizeServiceGroups(currentRole, currentUser?.serviceGroups);
  const canSeeItMonitoring =
    currentRole === "admin" || currentServiceGroups.includes("IT");
  const canSeeHrAdminMonitoring =
    currentRole === "admin" || currentServiceGroups.includes("HR/Admin");
  const canSeeMonitoringNotifications = showAppChrome && currentRole !== "requester";
  const monitoringNotificationRows = useQuery(
    api.monitoring.list,
    canSeeMonitoringNotifications ? { view: "issues", showClosed: true } : "skip",
  );
  const monitoringNotificationCount = (monitoringNotificationRows ?? []).filter((row) => {
    if (row.status !== "New") return false;

    const serviceGroup = getServiceGroupForCategory(row.category);
    if ((row.notificationSeenByGroups ?? []).includes(serviceGroup)) return false;

    if (serviceGroup === "HR/Admin") {
      return canSeeHrAdminMonitoring;
    }

    if (row.category === MONITORING_MEETING_REQUEST_CATEGORY || row.category === MONITORING_BORROWING_REQUEST_CATEGORY) {
      return canSeeItMonitoring;
    }

    return canSeeItMonitoring;
  }).length;
  const accountName = currentUser?.displayName || "IT Operations";
  const accountUsername = currentUser?.username ? `@${currentUser.username}` : "Hub Console";
  const accountRoleLabel = formatUserRoleLabel(currentRole);
  const accountInitials = getInitials(accountName);
  const visibleNavSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canShowNavItem(currentRole, currentUser?.serviceGroups, item)),
    }))
    .filter((section) => section.items.length > 0);
  const pathnameSegments = pathname?.split("/").filter(Boolean) ?? [];
  const accountMenuOpen = Boolean(pathname && accountMenuPath === pathname);
  const breadcrumbs = [
    { href: "/dashboard", label: "Dashboard", isCurrent: pathname === "/dashboard" || pathnameSegments.length === 0 },
    ...pathnameSegments
      .map((segment, index) => ({
        href: `/${pathnameSegments.slice(0, index + 1).join("/")}`,
        label: formatBreadcrumbLabel(segment, index, pathnameSegments),
        isCurrent: index === pathnameSegments.length - 1,
      }))
      .filter((crumb) => crumb.href !== "/dashboard"),
  ];

  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuPath(null);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuPath(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [accountMenuOpen]);

  function handleThemeChange(nextTheme: ThemeMode) {
    setThemeMode(nextTheme);
  }

  function isNavItemActive(item: NavItem) {
    if (!pathname) return false;
    const prefixes = item.matchPrefixes ?? [item.href];
    return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  }

  function handleSidebarToggle() {
    setAccountMenuPath(null);

    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches) {
      setSidebarOpen((prev) => !prev);
      return;
    }

    setSidebarCollapsed((prev) => !prev);
  }

  if (!showAppChrome) {
    return <div className="auth-shell">{children}</div>;
  }

  return (
    <CurrentUserProvider currentUser={currentUser}>
      <ActiveWorkflowProvider>
      <div className="app-bg">
        <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <aside className={`app-sidebar${sidebarOpen ? " open" : ""}${sidebarCollapsed ? " collapsed" : ""}`}>
          <div className="logo-box">
            <div className="logo-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2L20 6.5V17.5L12 22L4 17.5V6.5L12 2Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path d="M12 7V12L16 14.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <div className="logo-copy">
              <span>IT Operations</span>
              <small>Hub Console</small>
            </div>
          </div>
          {visibleNavSections.map((section) => (
            <div key={section.label} className="sidebar-section">
              <div className="sidebar-section-label">{section.label}</div>
              <nav className="side-nav" aria-label={`${section.label} navigation`}>
                {section.items.map((item) => {
                  const active = isNavItemActive(item);
                  const badgeCount = item.href === "/monitoring" ? monitoringNotificationCount : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`side-link ${active ? "active" : ""}${badgeCount > 0 ? " has-badge" : ""}`}
                      aria-label={item.label}
                      title={sidebarCollapsed ? item.label : undefined}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <span className="side-link-icon-wrap">
                        {item.icon}
                        {badgeCount > 0 ? (
                          <span className="side-link-badge" aria-label={`${badgeCount} new monitoring requests`}>
                            {badgeCount}
                          </span>
                        ) : null}
                      </span>
                      <span className="side-link-label">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
          <div className="sidebar-spacer" />
          <div className="sidebar-footer">
            <div className="sidebar-account-wrap" ref={accountMenuRef}>
              {accountMenuOpen ? (
                <div className="account-dropdown sidebar-account-dropdown" role="menu" aria-label="Account menu">
                  <div className="account-dropdown-summary">
                    <div className="avatar-dot account-dropdown-avatar">{accountInitials}</div>
                    <div className="avatar-copy">
                      <div className="avatar-text">{accountName}</div>
                      <div className="avatar-subtext">{accountUsername}</div>
                    </div>
                  </div>

                  <div className="account-dropdown-divider" />

                  <div className="account-dropdown-row" role="group" aria-label="Appearance">
                    <div className="account-dropdown-row-copy">
                      <span className="account-dropdown-row-title">Appearance</span>
                      <span className="account-dropdown-row-subtitle">Light or dark</span>
                    </div>

                    <div className="theme-switcher" aria-label="Theme switcher">
                      <button
                        type="button"
                        className={`theme-switcher-btn${themeMode === "light" ? " active" : ""}`}
                        aria-label="Use light theme"
                        onClick={() => handleThemeChange("light")}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M12 4V2M12 22V20M4 12H2M22 12H20M18.364 5.636L16.95 7.05M7.05 16.95L5.636 18.364M18.364 18.364L16.95 16.95M7.05 7.05L5.636 5.636M12 17A5 5 0 1 0 12 7A5 5 0 0 0 12 17Z"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`theme-switcher-btn${themeMode === "dark" ? " active" : ""}`}
                        aria-label="Use dark theme"
                        onClick={() => handleThemeChange("dark")}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path
                            d="M21 12.79A9 9 0 1 1 11.21 3C11.39 3 11.57 3.01 11.75 3.03A7 7 0 0 0 21 12.79Z"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="account-dropdown-divider" />

                    <Link
                      href="/logout"
                      className="account-signout-link"
                      role="menuitem"
                      onClick={() => setAccountMenuPath(null)}
                    >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M10 17L5 12L10 7"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M5 12H15"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                      />
                      <path
                        d="M15 5H18C19.1046 5 20 5.89543 20 7V17C20 18.1046 19.1046 19 18 19H15"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span>Sign out</span>
                  </Link>
                </div>
              ) : null}

              <button
                className={`sidebar-account-card${accountMenuOpen ? " open" : ""}`}
                type="button"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                aria-label="Open account menu"
                onClick={() =>
                  setAccountMenuPath((prev) => (pathname && prev !== pathname ? pathname : null))
                }
              >
                <span className="avatar-dot sidebar-account-avatar">{accountInitials}</span>
                <span className="sidebar-account-copy">
                  <span className="sidebar-account-name">{accountName}</span>
                  <span className="sidebar-account-role">{accountRoleLabel}</span>
                </span>
                <span className="sidebar-account-chevron" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M8 10L12 14L16 10"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </aside>

        <div className={`app-main${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
          <header className={`app-topbar${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
            <div className="topbar-left">
              <button
                className="sidebar-toggle-btn"
                onClick={handleSidebarToggle}
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-pressed={sidebarCollapsed}
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect
                    x="4"
                    y="5"
                    width="16"
                    height="14"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path d="M9 5V19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>
              <nav className="top-breadcrumbs" aria-label="Breadcrumb">
                {breadcrumbs.map((crumb, index) => (
                  <div key={crumb.href} className="top-breadcrumb-item">
                    {index > 0 ? (
                      <span className="top-breadcrumb-separator" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <path
                            d="M9 6L15 12L9 18"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    ) : null}
                    {crumb.isCurrent ? (
                      <span
                        className={
                          index === 0
                            ? "top-breadcrumb-current top-breadcrumb-home"
                            : "top-breadcrumb-current"
                        }
                        aria-label={index === 0 ? crumb.label : undefined}
                      >
                        {index === 0 ? (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M13.338.833a2,2,0,0,0-2.676,0L0,10.429v10.4a3.2,3.2,0,0,0,3.2,3.2H20.8a3.2,3.2,0,0,0,3.2-3.2v-10.4ZM15,22.026H9V17a3,3,0,0,1,6,0Zm7-1.2a1.2,1.2,0,0,1-1.2,1.2H17V17A5,5,0,0,0,7,17v5.026H3.2a1.2,1.2,0,0,1-1.2-1.2V11.319l10-9,10,9Z"/>
                          </svg>
                        ) : (
                          crumb.label
                        )}
                      </span>
                    ) : (
                      <Link
                        href={crumb.href}
                        className={
                          index === 0
                            ? "top-breadcrumb-link top-breadcrumb-home"
                            : "top-breadcrumb-link"
                        }
                        aria-label={index === 0 ? crumb.label : undefined}
                        title={index === 0 ? crumb.label : undefined}
                      >
                        {index === 0 ? (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M13.338.833a2,2,0,0,0-2.676,0L0,10.429v10.4a3.2,3.2,0,0,0,3.2,3.2H20.8a3.2,3.2,0,0,0,3.2-3.2v-10.4ZM15,22.026H9V17a3,3,0,0,1,6,0Zm7-1.2a1.2,1.2,0,0,1-1.2,1.2H17V17A5,5,0,0,0,7,17v5.026H3.2a1.2,1.2,0,0,1-1.2-1.2V11.319l10-9,10,9Z"/>
                          </svg>
                        ) : (
                          crumb.label
                        )}
                      </Link>
                    )}
                  </div>
                ))}
              </nav>
            </div>
            <div className="topbar-right">
              <TopbarActivityMenu />
            </div>
          </header>

          <main className="app-content">
            <ActiveWorkflowBanner />
            {children}
          </main>
        </div>
      </div>
    </div>
      </ActiveWorkflowProvider>
    </CurrentUserProvider>
  );
}
