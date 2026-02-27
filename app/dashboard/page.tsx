"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const chipStyle = {
  display: "inline-block",
  padding: "6px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

export default function DashboardPage() {
  const assets = useQuery(api.assets.list, {});

  const totalAssets = assets?.length ?? 0;
  const availableCount =
    assets?.filter((asset) => asset.status === "AVAILABLE").length ?? 0;
  const borrowedCount =
    assets?.filter((asset) => asset.status === "BORROWED").length ?? 0;

  const borrowedPercent =
    totalAssets > 0 ? Math.round((borrowedCount / totalAssets) * 100) : 0;
  const availablePercent = 100 - borrowedPercent;

  const ringStyle = {
    width: 188,
    height: 188,
    borderRadius: "50%",
    background: `conic-gradient(#7cb1f8 0% ${availablePercent}%, #2f3137 ${availablePercent}% 100%)`,
    position: "relative" as const,
    margin: "8px auto 12px",
  };

  return (
    <div>
      <div
        className="dashboard-grid"
        style={{
          display: "grid",
          gap: 16,
        }}
      >
        <section>
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 14 }}>Cards</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div
              style={{
                background: "#2f3137",
                color: "#fff",
                borderRadius: 22,
                padding: 20,
                minHeight: 150,
              }}
            >
              <div style={{ fontSize: 18, opacity: 0.8 }}>Total Assets</div>
              <div style={{ fontSize: 46, fontWeight: 800, marginTop: 4 }}>{totalAssets}</div>
              <div style={{ opacity: 0.7, marginTop: 18 }}>Inventory cards</div>
            </div>

            <div
              style={{
                background: "#fff",
                color: "#1f2127",
                borderRadius: 22,
                padding: 20,
                border: "1px solid #ececf1",
                minHeight: 150,
              }}
            >
              <div style={{ fontSize: 18, opacity: 0.8 }}>Borrowed Now</div>
              <div style={{ fontSize: 46, fontWeight: 800, marginTop: 4 }}>{borrowedCount}</div>
              <div style={{ opacity: 0.7, marginTop: 18 }}>In active use</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <div style={{ ...chipStyle, background: "#8fbaf7", color: "#fff" }}>Assets</div>
            <div style={{ ...chipStyle, background: "#f0f1f4", color: "#2c2d30" }}>
              Borrowers
            </div>
            <div style={{ ...chipStyle, background: "#f0f1f4", color: "#2c2d30" }}>Logs</div>
            <div style={{ ...chipStyle, background: "#f0f1f4", color: "#2c2d30" }}>Reports</div>
          </div>

          <div style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Recent Activity</h3>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 10px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0 10px" }}>Asset</th>
                  <th style={{ textAlign: "left", padding: "0 10px" }}>Category</th>
                  <th style={{ textAlign: "left", padding: "0 10px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(assets ?? []).slice(0, 5).map((asset) => (
                  <tr key={asset._id}>
                    <td
                      style={{
                        background: "#f7f7f9",
                        padding: 12,
                        borderTopLeftRadius: 12,
                        borderBottomLeftRadius: 12,
                      }}
                    >
                      {asset.assetTag}
                    </td>
                    <td style={{ background: "#f7f7f9", padding: 12 }}>{asset.category}</td>
                    <td
                      style={{
                        background: "#f7f7f9",
                        padding: 12,
                        borderTopRightRadius: 12,
                        borderBottomRightRadius: 12,
                      }}
                    >
                      <span
                        style={{
                          ...chipStyle,
                          background:
                            asset.status === "AVAILABLE" ? "rgba(70, 180, 93, 0.15)" : "#fce3ae",
                          color: asset.status === "AVAILABLE" ? "#198c30" : "#9a6400",
                        }}
                      >
                        {asset.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside
          style={{
            background: "#f7f7f9",
            borderRadius: 24,
            padding: 18,
            border: "1px solid #ececf1",
            height: "fit-content",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 30, fontWeight: 800 }}>Statistic</h3>
            <div style={{ ...chipStyle, background: "#fff", color: "#7c7f88" }}>This week</div>
          </div>

          <div style={ringStyle}>
            <div
              style={{
                position: "absolute",
                inset: 18,
                background: "#f7f7f9",
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                fontWeight: 700,
              }}
            >
              <div>
                <div style={{ fontSize: 15, color: "#7f838c" }}>Total</div>
                <div style={{ fontSize: 38, color: "#1f2127" }}>{totalAssets}</div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16, justifyContent: "center" }}>
            <div style={{ ...chipStyle, background: "#dce9ff", color: "#2e5ea7" }}>
              Available {availableCount}
            </div>
            <div style={{ ...chipStyle, background: "#ececf1", color: "#3a3b41" }}>
              Borrowed {borrowedCount}
            </div>
          </div>

          <div>
            {(assets ?? []).slice(0, 5).map((asset) => (
              <div
                key={asset._id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: "1px solid #ececf1",
                  fontSize: 13,
                }}
              >
                <span style={{ color: "#3a3b41" }}>{asset.assetTag}</span>
                <span style={{ color: "#7f838c" }}>{asset.status}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
