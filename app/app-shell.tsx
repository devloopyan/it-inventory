"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type AppShellProps = {
  children: React.ReactNode;
};

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

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-bg">
      <div className="app-shell">
        <aside className={`app-sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="logo-box">IT Inventory</div>
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
              <div>
                <div className="greet-title">IT Inventory System</div>
                <div className="greet-subtitle">Manage hardware inventory operations</div>
              </div>
            </div>

            <div className="topbar-right">
              <div className="top-search-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                  <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" />
                </svg>
                <input
                  className="top-search"
                  placeholder="Search hardware assets..."
                  aria-label="Global search"
                />
              </div>
              <div className="avatar-chip">
                <div className="avatar-dot">IT</div>
                <div className="avatar-text">IT Operations</div>
              </div>
            </div>
          </header>

          <main className="app-content">{children}</main>
        </div>
      </div>
    </div>
  );
}
