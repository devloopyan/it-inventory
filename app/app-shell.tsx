"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import TopbarActivityMenu from "./topbar-activity-menu";

type AppShellProps = {
  children: React.ReactNode;
};

type ThemeMode = "light" | "dark";
type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  matchPrefixes?: readonly string[];
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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 3H10V10H3V3Z" stroke="currentColor" strokeWidth="2" />
            <path d="M14 3H21V7H14V3Z" stroke="currentColor" strokeWidth="2" />
            <path d="M14 11H21V21H14V11Z" stroke="currentColor" strokeWidth="2" />
            <path d="M3 14H10V21H3V14Z" stroke="currentColor" strokeWidth="2" />
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
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 16L8.5 10.5L12 14L16 6L20 10" stroke="currentColor" strokeWidth="2" />
            <path d="M4 20H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        href: "/assets",
        label: "Assets",
        matchPrefixes: ["/assets", "/hardware-inventory"],
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M8 21H16" stroke="currentColor" strokeWidth="2" />
            <path d="M12 17V21" stroke="currentColor" strokeWidth="2" />
          </svg>
        ),
      },
      {
        href: "/operations",
        label: "Operations",
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
            <path d="M12 2V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 19V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M2 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M19 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ),
      },
      {
        href: "/reports",
        label: "Reports",
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M7 20V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 20V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M17 20V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/admin",
        label: "Admin",
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 3L14.4 5.2L17.7 5.5L18.5 8.7L21 11L18.5 13.3L17.7 16.5L14.4 16.8L12 19L9.6 16.8L6.3 16.5L5.5 13.3L3 11L5.5 8.7L6.3 5.5L9.6 5.2L12 3Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.7" />
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
  reports: "Reports",
  admin: "Admin",
  assets: "Assets",
  "hardware-inventory": "Hardware Inventory",
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

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(resolveInitialTheme);
  const [accountMenuPath, setAccountMenuPath] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const showAppChrome = pathname !== "/login";
  const pathnameSegments = pathname?.split("/").filter(Boolean) ?? [];
  const accountMenuOpen = Boolean(pathname && accountMenuPath === pathname);
  const breadcrumbs = [
    { href: "/", label: "Home", isCurrent: pathnameSegments.length === 0 },
    ...pathnameSegments.map((segment, index) => ({
      href: `/${pathnameSegments.slice(0, index + 1).join("/")}`,
      label: formatBreadcrumbLabel(segment, index, pathnameSegments),
      isCurrent: index === pathnameSegments.length - 1,
    })),
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

  if (!showAppChrome) {
    return <div className="auth-shell">{children}</div>;
  }

  return (
    <div className="app-bg">
      <div className="app-shell">
        <aside className={`app-sidebar ${sidebarOpen ? "open" : ""}`}>
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
          {navSections.map((section) => (
            <div key={section.label} className="sidebar-section">
              <div className="sidebar-section-label">{section.label}</div>
              <nav className="side-nav" aria-label={`${section.label} navigation`}>
                {section.items.map((item) => {
                  const active = isNavItemActive(item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`side-link ${active ? "active" : ""}`}
                      aria-label={item.label}
                      onClick={() => setSidebarOpen(false)}
                    >
                      {item.icon}
                      <span>{item.label}</span>
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
                    <div className="avatar-dot account-dropdown-avatar">IT</div>
                    <div className="avatar-copy">
                      <div className="avatar-text">IT Operations</div>
                      <div className="avatar-subtext">Hub Console</div>
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
                <span className="avatar-dot sidebar-account-avatar">IT</span>
                <span className="sidebar-account-copy">
                  <span className="sidebar-account-name">IT Operations</span>
                  <span className="sidebar-account-role">Hub Console</span>
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

        <div className="app-main">
          <header className="app-topbar">
            <div className="topbar-left">
              <button
                className="mobile-menu-btn"
                onClick={() => setSidebarOpen((prev) => !prev)}
                aria-label="Toggle sidebar"
                type="button"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 7H20" stroke="currentColor" strokeWidth="2" />
                  <path d="M4 12H20" stroke="currentColor" strokeWidth="2" />
                  <path d="M4 17H20" stroke="currentColor" strokeWidth="2" />
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
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M4 10.5L12 4L20 10.5V20H14.5V14H9.5V20H4V10.5Z"
                              stroke="currentColor"
                              strokeWidth="1.9"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
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
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M4 10.5L12 4L20 10.5V20H14.5V14H9.5V20H4V10.5Z"
                              stroke="currentColor"
                              strokeWidth="1.9"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
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

          <main className="app-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
