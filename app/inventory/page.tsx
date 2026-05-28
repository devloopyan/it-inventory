"use client";

import { Suspense, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import HardwareInventoryPage from "../hardware-inventory/page";
import DigitalInventoryClient from "../digital-inventory/digital-inventory-client";

const INVENTORY_TABS = [
  {
    key: "hardware",
    label: "Hardware",
    description: "Physical IT assets and equipment.",
  },
  {
    key: "digital",
    label: "Digital",
    description: "Software, licenses, and subscriptions.",
  },
] as const;

type InventoryTabKey = (typeof INVENTORY_TABS)[number]["key"];

function isInventoryTabKey(value: string | null): value is InventoryTabKey {
  return INVENTORY_TABS.some((tab) => tab.key === value);
}

function InventoryTabsInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPathname = pathname ?? "/inventory";
  const tabParam = searchParams?.get("tab") ?? null;
  const activeTab: InventoryTabKey = isInventoryTabKey(tabParam) ? tabParam : "hardware";

  const setActiveTab = useCallback(
    (key: InventoryTabKey) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      if (key === "hardware") {
        params.delete("tab");
      } else {
        params.set("tab", key);
      }
      const query = params.toString();
      router.replace(query ? `${currentPathname}?${query}` : currentPathname);
    },
    [currentPathname, router, searchParams],
  );

  return (
    <div className="dashboard-page">
      <section
        style={{
          padding: "14px 18px 4px",
          display: "grid",
          gap: 14,
          border: "none",
          boxShadow: "none",
          borderRadius: 0,
          background: "transparent",
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="type-page-title">Inventory</h1>
          <div className="type-page-subtitle">
            Hardware assets and digital software in one place.
          </div>
        </div>
      </section>

      <section
        style={{
          padding: "0 16px",
          border: "none",
          boxShadow: "none",
          borderRadius: 0,
          background: "transparent",
        }}
      >
        <div
          className="monitoring-tab-strip"
          role="tablist"
          aria-label="Inventory sections"
        >
          {INVENTORY_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`monitoring-tab-btn${activeTab === tab.key ? " active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="monitoring-tab-copy">
                <span className="monitoring-tab-label-row">
                  <span className="monitoring-tab-label">{tab.label}</span>
                </span>
                <span className="monitoring-tab-description">{tab.description}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {activeTab === "hardware" ? (
        <HardwareInventoryPage />
      ) : (
        <DigitalInventoryClient />
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={null}>
      <InventoryTabsInner />
    </Suspense>
  );
}
