"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type AppShellProps = {
  children: React.ReactNode;
};

type ThemeMode = "light" | "dark";

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

const navItems = [
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
  {
    href: "/hardware-inventory",
    label: "Hardware Inventory",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 21H16" stroke="currentColor" strokeWidth="2" />
        <path d="M12 17V21" stroke="currentColor" strokeWidth="2" />
      </svg>
    ),
  },
] as const;

const routeLabelMap: Record<string, string> = {
  dashboard: "Dashboard",
  "hardware-inventory": "Hardware Inventory",
  assets: "Assets",
  borrowers: "Borrowers",
};

function formatBreadcrumbLabel(segment: string, index: number, segments: string[]) {
  if (routeLabelMap[segment]) return routeLabelMap[segment];
  if (segments[index - 1] === "hardware-inventory") return "Asset Details";
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const themeRef = useRef<ThemeMode>("light");
  const pathnameSegments = pathname.split("/").filter(Boolean);
  const breadcrumbs = [
    { href: "/", label: "Home", isCurrent: pathnameSegments.length === 0 },
    ...pathnameSegments.map((segment, index) => ({
      href: `/${pathnameSegments.slice(0, index + 1).join("/")}`,
      label: formatBreadcrumbLabel(segment, index, pathnameSegments),
      isCurrent: index === pathnameSegments.length - 1,
    })),
  ];

  useEffect(() => {
    const initialTheme = resolveInitialTheme();
    themeRef.current = initialTheme;
    applyTheme(initialTheme);
  }, []);

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
              <span>IT Inventory</span>
              <small>Asset Desk</small>
            </div>
          </div>
          <nav className="side-nav">
            {navItems.map((item) => {
              const active = pathname === item.href;
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
              <button className="top-icon-btn top-notify-btn" type="button" aria-label="Notifications">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M15 17H9M18 17H20L18.6 15.6C18.2 15.2 18 14.7 18 14.2V11C18 7.7 15.8 5 12.7 4.3C12.3 3.5 11.7 3 11 3C10.3 3 9.7 3.5 9.3 4.3C6.2 5 4 7.7 4 11V14.2C4 14.7 3.8 15.2 3.4 15.6L2 17H4M15 17C15 19.2 13.2 21 11 21C8.8 21 7 19.2 7 17"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="notify-badge">2</span>
              </button>
              <button
                className="top-icon-btn theme-toggle"
                type="button"
                onClick={() => {
                  const nextTheme = themeRef.current === "dark" ? "light" : "dark";
                  themeRef.current = nextTheme;
                  applyTheme(nextTheme);
                }}
                aria-label="Toggle dark mode"
                title="Toggle dark mode"
              >
                <svg
                  className="theme-icon theme-icon-moon"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M21 12.79A9 9 0 1 1 11.21 3C11.39 3 11.57 3.01 11.75 3.03A7 7 0 0 0 21 12.79Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <svg
                  className="theme-icon theme-icon-sun"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12 4V2M12 22V20M4 12H2M22 12H20M18.364 5.636L16.95 7.05M7.05 16.95L5.636 18.364M18.364 18.364L16.95 16.95M7.05 7.05L5.636 5.636M12 17A5 5 0 1 0 12 7A5 5 0 0 0 12 17Z"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <div className="avatar-chip">
                <div className="avatar-dot">IT</div>
                <div className="avatar-copy">
                  <div className="avatar-text">IT Operations</div>
                  <div className="avatar-subtext">Admin Console</div>
                </div>
              </div>
            </div>
          </header>

          <main className="app-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
