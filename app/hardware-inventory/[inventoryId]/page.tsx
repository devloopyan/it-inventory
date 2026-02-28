"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { HARDWARE_STATUSES, type HardwareStatus } from "@/lib/hardwareStatuses";

const statuses = HARDWARE_STATUSES;
const locationOptions = ["MAIN", "MAIN STORAGE", "FOODLAND", "WAREHOUSE", "HYBRID"] as const;

type FormState = {
  assetTag: string;
  assetType: string;
  assetNameDescription: string;
  specifications: string;
  serialNumber: string;
  locationPersonAssigned: string;
  department: string;
  status: HardwareStatus;
  turnoverTo: string;
  assignedDate: string;
  purchaseDate: string;
  warranty: string;
  remarks: string;
};

const statusColors: Record<HardwareStatus, { bg: string; text: string; border: string }> = {
  Available: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
  Working: { bg: "#dbeafe", text: "#1d4ed8", border: "#93c5fd" },
  Borrowed: { bg: "#ffedd5", text: "#c2410c", border: "#fdba74" },
  Assigned: { bg: "#e0f2fe", text: "#0369a1", border: "#7dd3fc" },
  "For Repair": { bg: "#fee2e2", text: "#b91c1c", border: "#fca5a5" },
  Retired: { bg: "#e5e7eb", text: "#374151", border: "#d1d5db" },
};

function formatDate(value?: number) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatText(value?: string) {
  return value && value.trim() ? value : "-";
}

function StatusChip({ status }: { status: HardwareStatus }) {
  const style = statusColors[status] ?? statusColors.Available;
  return (
    <span
      style={{
        border: `1px solid ${style.border}`,
        background: style.bg,
        color: style.text,
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      {status}
    </span>
  );
}

function DetailItem({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value?: string;
  multiline?: boolean;
}) {
  return (
    <div className="saas-card" style={{ padding: 12, minHeight: multiline ? 84 : undefined }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
        {formatText(value)}
      </div>
    </div>
  );
}

export default function HardwareInventoryDetailPage() {
  const params = useParams<{ inventoryId: string }>();
  const router = useRouter();
  const inventoryId = params.inventoryId as Id<"hardwareInventory">;

  const row = useQuery(api.hardwareInventory.getById, { inventoryId });
  const updateAsset = useMutation(api.hardwareInventory.update);
  const imageUrl = useQuery(
    api.hardwareInventory.getImageUrl,
    row && row.imageStorageId ? { storageId: row.imageStorageId } : "skip",
  );

  const [isEditing, setIsEditing] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    assetTag: "",
    assetType: "",
    assetNameDescription: "",
    specifications: "",
    serialNumber: "",
    locationPersonAssigned: "",
    department: "",
    status: "Available" as HardwareStatus,
    turnoverTo: "",
    assignedDate: "",
    purchaseDate: "",
    warranty: "",
    remarks: "",
  });

  if (row === undefined) {
    return <div className="panel" style={{ padding: 16 }}>Loading asset details...</div>;
  }

  if (row === null) {
    return (
      <div className="panel" style={{ padding: 16 }}>
        <p style={{ marginBottom: 12 }}>Hardware asset not found.</p>
        <Link href="/hardware-inventory" className="btn-secondary">
          Back to Hardware Inventory
        </Link>
      </div>
    );
  }

  const asset = row;
  const assetStatus = (asset.status as HardwareStatus) ?? "Available";

  function openEditor() {
    setForm({
      assetTag: asset.assetTag,
      assetType: asset.assetType ?? "",
      assetNameDescription: asset.assetNameDescription ?? "",
      specifications: asset.specifications ?? "",
      serialNumber: asset.serialNumber,
      locationPersonAssigned: asset.locationPersonAssigned ?? "",
      department: asset.department ?? "",
      status: asset.status as HardwareStatus,
      turnoverTo: asset.turnoverTo ?? "",
      assignedDate: asset.assignedDate ?? "",
      purchaseDate: asset.purchaseDate ?? "",
      warranty: asset.warranty ?? "",
      remarks: asset.remarks ?? "",
    });
    setFormError("");
    setIsEditing(true);
  }

  async function handleSave() {
    setFormError("");
    if (
      !form.assetTag ||
      !form.assetType ||
      !form.assetNameDescription ||
      !form.specifications ||
      !form.serialNumber ||
      !form.locationPersonAssigned ||
      !form.department ||
      !form.status ||
      !form.turnoverTo ||
      !form.assignedDate ||
      !form.purchaseDate ||
      !form.warranty
    ) {
      setFormError("All fields are required except Remarks.");
      return;
    }

    try {
      setIsSaving(true);
      await updateAsset({
        inventoryId,
        assetTag: form.assetTag,
        assetType: form.assetType,
        assetNameDescription: form.assetNameDescription,
        specifications: form.specifications,
        serialNumber: form.serialNumber,
        locationPersonAssigned: form.locationPersonAssigned,
        department: form.department,
        status: form.status,
        turnoverTo: form.turnoverTo,
        assignedDate: form.assignedDate,
        purchaseDate: form.purchaseDate,
        warranty: form.warranty,
        remarks: form.remarks || undefined,
      });
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to update asset.");
    } finally {
      setIsSaving(false);
    }
  }

  const selectedLocationInOptions = locationOptions.includes(
    form.locationPersonAssigned as (typeof locationOptions)[number],
  );

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <section className="panel saas-card-hover" style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>
              Hardware Inventory / Asset Details
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
              {asset.assetTag}
            </h1>
            <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 14 }}>
              {formatText(asset.assetNameDescription)}
            </div>
            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
              <StatusChip status={assetStatus} />
              <span style={{ color: "var(--muted)", fontSize: 13 }}>
                Updated {formatDate(asset.updatedAt)}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/hardware-inventory" className="btn-secondary">
              Back
            </Link>
            {!isEditing ? (
              <button className="btn-primary" onClick={openEditor} type="button">
                Edit
              </button>
            ) : (
              <button className="btn-secondary" onClick={() => setIsEditing(false)} type="button">
                Cancel Editing
              </button>
            )}
          </div>
        </div>
      </section>

      {!isEditing ? (
        <div style={{ display: "grid", gap: 12 }}>
          <section className="panel" style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>Asset Image</div>
            {asset.imageStorageId ? (
              imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt={`${asset.assetTag} asset image`}
                  style={{
                    width: "100%",
                    maxWidth: 360,
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div style={{ color: "var(--muted)" }}>Loading image...</div>
              )
            ) : (
              <div style={{ color: "var(--muted)" }}>No image uploaded.</div>
            )}
          </section>

          <section
            className="panel"
            style={{
              padding: 14,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            <DetailItem label="Asset Type" value={asset.assetType} />
            <DetailItem label="Asset Name / Description" value={asset.assetNameDescription} />
            <DetailItem label="Serial Number" value={asset.serialNumber} />
            <DetailItem label="Specifications" value={asset.specifications} multiline />
            <DetailItem label="Location / Person Assigned" value={asset.locationPersonAssigned} />
            <DetailItem label="Department" value={asset.department} />
            <DetailItem label="Turnover To / Borrower" value={asset.turnoverTo} />
            <DetailItem label="Assigned Date" value={asset.assignedDate} />
            <DetailItem label="Purchase Date" value={asset.purchaseDate} />
            <DetailItem label="Warranty" value={asset.warranty} />
            <DetailItem label="Remarks" value={asset.remarks} multiline />
          </section>

          <section className="panel" style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>System Metadata</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 8,
              }}
            >
              <DetailItem label="Created At" value={formatDate(asset.createdAt)} />
              <DetailItem label="Updated At" value={formatDate(asset.updatedAt)} />
            </div>
          </section>
        </div>
      ) : (
        <section
          className="panel"
          style={{
            padding: 16,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>Edit Hardware Asset</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 8,
            }}
          >
            <input
              className="input-base"
              value={form.assetTag}
              onChange={(e) => setForm((prev) => ({ ...prev, assetTag: e.target.value }))}
              placeholder="Asset Tag"
            />
            <input
              className="input-base"
              value={form.assetType}
              onChange={(e) => setForm((prev) => ({ ...prev, assetType: e.target.value }))}
              placeholder="Asset Type"
            />
            <input
              className="input-base"
              value={form.assetNameDescription}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, assetNameDescription: e.target.value }))
              }
              placeholder="Asset Name or Description"
            />
            <input
              className="input-base"
              value={form.specifications}
              onChange={(e) => setForm((prev) => ({ ...prev, specifications: e.target.value }))}
              placeholder="Specifications"
            />
            <input
              className="input-base"
              value={form.serialNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
              placeholder="Serial Number"
            />
            <select
              className="input-base"
              value={form.locationPersonAssigned}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, locationPersonAssigned: e.target.value }))
              }
            >
              {!selectedLocationInOptions && form.locationPersonAssigned ? (
                <option value={form.locationPersonAssigned}>{form.locationPersonAssigned}</option>
              ) : null}
              <option value="">Select Location / Person Assigned</option>
              {locationOptions.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
            <input
              className="input-base"
              value={form.department}
              onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
              placeholder="Department"
            />
            <select
              className="input-base"
              value={form.status}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, status: e.target.value as HardwareStatus }))
              }
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <input
              className="input-base"
              value={form.turnoverTo}
              onChange={(e) => setForm((prev) => ({ ...prev, turnoverTo: e.target.value }))}
              placeholder="Turnover to / Borrower"
            />
            <input
              className="input-base"
              type="date"
              value={form.assignedDate}
              onChange={(e) => setForm((prev) => ({ ...prev, assignedDate: e.target.value }))}
              placeholder="Assigned Date"
            />
            <input
              className="input-base"
              type="date"
              value={form.purchaseDate}
              onChange={(e) => setForm((prev) => ({ ...prev, purchaseDate: e.target.value }))}
              placeholder="Purchase Date"
            />
            <input
              className="input-base"
              value={form.warranty}
              onChange={(e) => setForm((prev) => ({ ...prev, warranty: e.target.value }))}
              placeholder="Warranty"
            />
            <input
              className="input-base"
              value={form.remarks}
              onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
              placeholder="Remarks (optional)"
            />
          </div>

          {formError ? <p style={{ color: "#b91c1c", margin: 0 }}>{formError}</p> : null}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn-secondary" onClick={() => setIsEditing(false)} type="button">
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={isSaving} type="button">
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
