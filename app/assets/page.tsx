"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Fragment, useState } from "react";

const inputStyle = {
  marginRight: 10,
  padding: "9px 10px",
  border: "1px solid #d9dbe2",
  borderRadius: 10,
  background: "#f4f5f8",
  color: "#22242a",
};

const selectStyle = {
  marginRight: 10,
  padding: "9px 10px",
  border: "1px solid #d9dbe2",
  borderRadius: 10,
  background: "#f4f5f8",
  color: "#22242a",
};

const buttonStyle = {
  padding: "8px 12px",
  border: "1px solid #2a2b31",
  borderRadius: 10,
  background: "#2f3137",
  color: "#fff",
  cursor: "pointer",
};

const mutedButtonStyle = {
  padding: "8px 12px",
  border: "1px solid #d6d8de",
  borderRadius: 10,
  background: "#ebedf1",
  color: "#2d2f36",
  cursor: "pointer",
};

const dangerButtonStyle = {
  padding: "8px 12px",
  border: "1px solid #7e1f2a",
  borderRadius: 10,
  background: "#9a2232",
  color: "#fff",
  cursor: "pointer",
};

function AssetHistory({
  assetId,
  borrowerById,
}: {
  assetId: Id<"assets">;
  borrowerById: Map<Id<"borrowers">, string>;
}) {
  const logs = useQuery(api.assetLogs.listByAsset, { assetId });

  return (
    <div style={{ padding: "8px 0" }}>
      {logs?.length ? (
        logs.map((log) => (
          <div key={log._id} style={{ fontSize: 14, marginBottom: 4 }}>
            {new Date(log.createdAt).toLocaleString()} - {log.action}
            {log.borrowerId
              ? ` - ${borrowerById.get(log.borrowerId) ?? "Unknown borrower"}`
              : ""}{" "}
            - {log.message}
          </div>
        ))
      ) : (
        <div style={{ fontSize: 14 }}>No history found.</div>
      )}
    </div>
  );
}

export default function AssetsPage() {
  const assets = useQuery(api.assets.list, {});
  const borrowers = useQuery(api.borrowers.list, {});
  const createAsset = useMutation(api.assets.create);
  const assignBorrower = useMutation(api.assets.assignBorrower);
  const returnAsset = useMutation(api.assets.returnAsset);
  const removeAsset = useMutation(api.assets.remove);

  const [assetTag, setAssetTag] = useState("");
  const [category, setCategory] = useState("");
  const [selectedBorrowers, setSelectedBorrowers] = useState<
    Record<string, Id<"borrowers"> | "">
  >({});
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>(
    {},
  );

  async function handleAdd() {
    if (!assetTag || !category) return;

    await createAsset({
      assetTag,
      category,
    });

    setAssetTag("");
    setCategory("");
  }

  async function handleAssign(assetId: Id<"assets">) {
    const borrowerId = selectedBorrowers[assetId];
    if (!borrowerId) return;

    await assignBorrower({
      assetId,
      borrowerId,
    });
  }

  async function handleReturn(assetId: Id<"assets">) {
    await returnAsset({ assetId });
  }

  async function handleDelete(assetId: Id<"assets">, assetTag: string) {
    const confirmed = window.confirm(
      `Delete asset "${assetTag}"? This will also remove its history logs.`,
    );
    if (!confirmed) return;

    await removeAsset({ assetId });
  }

  const borrowerById = new Map(
    (borrowers ?? []).map((borrower) => [borrower._id, borrower.fullName]),
  );

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Assets</h1>

      <div style={{ marginTop: 20 }}>
        <input
          placeholder="Asset Tag"
          value={assetTag}
          onChange={(e) => setAssetTag(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          style={inputStyle}
        />
        <button onClick={handleAdd} style={buttonStyle}>
          Add Asset
        </button>
      </div>

      <div style={{ marginTop: 30 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Asset Tag
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Category
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Status
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Borrower
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {assets?.map((asset) => (
              <Fragment key={asset._id}>
                <tr>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{asset.assetTag}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{asset.category}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{asset.status}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                    {asset.borrowerId
                      ? borrowerById.get(asset.borrowerId) ?? "Assigned"
                      : "-"}
                  </td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                    {asset.status === "BORROWED" ? (
                      <button onClick={() => handleReturn(asset._id)} style={buttonStyle}>
                        Return
                      </button>
                    ) : (
                      <>
                        <select
                          value={selectedBorrowers[asset._id] ?? ""}
                          onChange={(e) =>
                            setSelectedBorrowers((prev) => ({
                              ...prev,
                              [asset._id]: e.target.value as Id<"borrowers"> | "",
                            }))
                          }
                          style={selectStyle}
                        >
                          <option value="">Select borrower</option>
                          {borrowers?.map((borrower) => (
                            <option key={borrower._id} value={borrower._id}>
                              {borrower.fullName}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => handleAssign(asset._id)} style={buttonStyle}>
                          Assign
                        </button>
                      </>
                    )}
                    <button
                      onClick={() =>
                        setExpandedHistory((prev) => ({
                          ...prev,
                          [asset._id]: !prev[asset._id],
                        }))
                      }
                      style={{ ...mutedButtonStyle, marginLeft: 10 }}
                    >
                      {expandedHistory[asset._id] ? "Hide History" : "View History"}
                    </button>
                    <button
                      onClick={() => handleDelete(asset._id, asset.assetTag)}
                      style={{ ...dangerButtonStyle, marginLeft: 10 }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
                {expandedHistory[asset._id] ? (
                  <tr>
                    <td colSpan={5} style={{ borderBottom: "1px solid #eee", padding: "0 8px" }}>
                      <AssetHistory assetId={asset._id} borrowerById={borrowerById} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
