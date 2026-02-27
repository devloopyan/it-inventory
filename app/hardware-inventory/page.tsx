"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const assetTypes = [
  "Laptop",
  "Desktop/PC",
  "Mobile Device",
  "Tablet",
  "Peripheral",
  "Network Device",
  "Storage Device",
  "IT Consumables",
  "Audio Visual Equipment",
  "Other IT Assets",
  "Others",
];

const inputStyle = {
  padding: "9px 10px",
  border: "1px solid #d9dbe2",
  borderRadius: 10,
  background: "#f4f5f8",
  color: "#22242a",
  width: "100%",
};

const buttonStyle = {
  padding: "8px 12px",
  border: "1px solid #2a2b31",
  borderRadius: 10,
  background: "#2f3137",
  color: "#fff",
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

export default function HardwareInventoryPage() {
  const rows = useQuery(api.hardwareInventory.list, {});
  const createRow = useMutation(api.hardwareInventory.create);
  const removeRow = useMutation(api.hardwareInventory.remove);

  const [form, setForm] = useState({
    assetNumber: "",
    assetType: "Laptop",
    assetNameDescription: "",
    specifications: "",
    serialNumber: "",
    location: "",
    personAssigned: "",
    department: "",
    status: "AVAILABLE",
    turnoverAssignedDate: "",
    purchaseDate: "",
    warrantyNotesRemarks: "",
    sourceSheet: "",
  });

  async function handleAdd() {
    if (!form.assetNumber || !form.assetType || !form.assetNameDescription) return;

    await createRow({
      ...form,
      turnoverAssignedDate: form.turnoverAssignedDate
        ? new Date(form.turnoverAssignedDate).getTime()
        : undefined,
      specifications: form.specifications || undefined,
      serialNumber: form.serialNumber || undefined,
      location: form.location || undefined,
      personAssigned: form.personAssigned || undefined,
      department: form.department || undefined,
      purchaseDate: form.purchaseDate || undefined,
      warrantyNotesRemarks: form.warrantyNotesRemarks || undefined,
      sourceSheet: form.sourceSheet || undefined,
    });

    setForm({
      assetNumber: "",
      assetType: "Laptop",
      assetNameDescription: "",
      specifications: "",
      serialNumber: "",
      location: "",
      personAssigned: "",
      department: "",
      status: "AVAILABLE",
      turnoverAssignedDate: "",
      purchaseDate: "",
      warrantyNotesRemarks: "",
      sourceSheet: "",
    });
  }

  async function handleDelete(inventoryId: Id<"hardwareInventory">, assetNumber: string) {
    const confirmed = window.confirm(
      `Delete hardware record "${assetNumber}"? Linked asset and logs will be removed.`,
    );
    if (!confirmed) return;
    await removeRow({ inventoryId });
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Hardware Asset Register</h1>

      <div
        style={{
          marginTop: 16,
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
          gap: 10,
        }}
      >
        <input
          placeholder="Asset Number"
          value={form.assetNumber}
          onChange={(e) => setForm((prev) => ({ ...prev, assetNumber: e.target.value }))}
          style={inputStyle}
        />
        <select
          value={form.assetType}
          onChange={(e) => setForm((prev) => ({ ...prev, assetType: e.target.value }))}
          style={inputStyle}
        >
          {assetTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
        <input
          placeholder="Asset Name/Description"
          value={form.assetNameDescription}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, assetNameDescription: e.target.value }))
          }
          style={inputStyle}
        />
        <input
          placeholder="Specifications"
          value={form.specifications}
          onChange={(e) => setForm((prev) => ({ ...prev, specifications: e.target.value }))}
          style={inputStyle}
        />
        <input
          placeholder="Serial Number"
          value={form.serialNumber}
          onChange={(e) => setForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
          style={inputStyle}
        />
        <input
          placeholder="Location"
          value={form.location}
          onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
          style={inputStyle}
        />
        <input
          placeholder="Person Assigned"
          value={form.personAssigned}
          onChange={(e) => setForm((prev) => ({ ...prev, personAssigned: e.target.value }))}
          style={inputStyle}
        />
        <input
          placeholder="Department"
          value={form.department}
          onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
          style={inputStyle}
        />
        <select
          value={form.status}
          onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
          style={inputStyle}
        >
          <option value="AVAILABLE">AVAILABLE</option>
          <option value="BORROWED">BORROWED</option>
        </select>
        <input
          type="date"
          value={form.turnoverAssignedDate}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, turnoverAssignedDate: e.target.value }))
          }
          style={inputStyle}
        />
        <input
          type="date"
          value={form.purchaseDate}
          onChange={(e) => setForm((prev) => ({ ...prev, purchaseDate: e.target.value }))}
          style={inputStyle}
        />
        <input
          placeholder="Source Sheet"
          value={form.sourceSheet}
          onChange={(e) => setForm((prev) => ({ ...prev, sourceSheet: e.target.value }))}
          style={inputStyle}
        />
        <input
          placeholder="Warranty / Notes / Remarks"
          value={form.warrantyNotesRemarks}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, warrantyNotesRemarks: e.target.value }))
          }
          style={{ ...inputStyle, gridColumn: "span 3" }}
        />
        <button onClick={handleAdd} style={buttonStyle}>
          Add Hardware Record
        </button>
      </div>

      <div style={{ marginTop: 20, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1600 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Asset Number
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Asset Type
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Asset Name/Description
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Specifications
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Serial Number
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Location
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Person Assigned
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Department
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Status
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Turnover / Assigned Date
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Purchase Date
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Warranty / Notes / Remarks
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Source Sheet
              </th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((row) => (
              <tr key={row._id}>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{row.assetNumber}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{row.assetType}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  {row.assetNameDescription}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  {row.specifications ?? "-"}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  {row.serialNumber ?? "-"}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{row.location ?? "-"}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  {row.personAssigned ?? "-"}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{row.department ?? "-"}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{row.status}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  {row.turnoverAssignedDate
                    ? new Date(row.turnoverAssignedDate).toLocaleDateString()
                    : "-"}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  {row.purchaseDate ?? "-"}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  {row.warrantyNotesRemarks ?? "-"}
                </td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>{row.sourceSheet ?? "-"}</td>
                <td style={{ borderBottom: "1px solid #eee", padding: 8 }}>
                  <button
                    onClick={() => handleDelete(row._id, row.assetNumber)}
                    style={dangerButtonStyle}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
