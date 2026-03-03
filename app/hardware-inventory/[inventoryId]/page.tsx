"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import FileUploadCard from "../file-upload-card";
import { HARDWARE_STATUSES, type HardwareStatus } from "@/lib/hardwareStatuses";
import { HARDWARE_ASSET_TYPES } from "@/lib/hardwareAssetTypes";
import { HARDWARE_DEPARTMENTS } from "@/lib/hardwareDepartments";

const statuses = HARDWARE_STATUSES;
const assetTypeOptions = HARDWARE_ASSET_TYPES;
const departmentOptions = HARDWARE_DEPARTMENTS;
const locationOptions = ["MAIN", "MAIN STORAGE", "FOODLAND", "WAREHOUSE", "HYBRID"] as const;

type FormState = {
  assetTag: string;
  assetType: string;
  assetNameDescription: string;
  specifications: string;
  serialNumber: string;
  locationPersonAssigned: string;
  personAssigned: string;
  department: string;
  status: HardwareStatus;
  turnoverTo: string;
  borrower: string;
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
  NEW: { bg: "#ede9fe", text: "#6d28d9", border: "#c4b5fd" },
  "Pre-owned": { bg: "#fef3c7", text: "#b45309", border: "#fcd34d" },
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
  const removeAsset = useMutation(api.hardwareInventory.remove);
  const generateUploadUrl = useMutation(api.hardwareInventory.generateUploadUrl);
  const imageUrl = useQuery(
    api.hardwareInventory.getImageUrl,
    row && row.imageStorageId ? { storageId: row.imageStorageId } : "skip",
  );
  const turnoverFormUrl = useQuery(
    api.hardwareInventory.getImageUrl,
    row && row.turnoverFormStorageId ? { storageId: row.turnoverFormStorageId } : "skip",
  );
  const receivingFormStorageId = (row as Record<string, unknown> | undefined)?.receivingFormStorageId as
    | Id<"_storage">
    | undefined;
  const receivingFormUrl = useQuery(
    api.hardwareInventory.getImageUrl,
    row && receivingFormStorageId ? { storageId: receivingFormStorageId } : "skip",
  );

  const [isEditing, setIsEditing] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [clearImage, setClearImage] = useState(false);
  const [selectedReceivingFormFile, setSelectedReceivingFormFile] = useState<File | null>(null);
  const [clearReceivingForm, setClearReceivingForm] = useState(false);
  const [selectedTurnoverFormFile, setSelectedTurnoverFormFile] = useState<File | null>(null);
  const [clearTurnoverForm, setClearTurnoverForm] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const receivingFormInputRef = useRef<HTMLInputElement | null>(null);
  const turnoverFormInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<FormState>({
    assetTag: "",
    assetType: "",
    assetNameDescription: "",
    specifications: "",
    serialNumber: "",
    locationPersonAssigned: "",
    personAssigned: "",
    department: "",
    status: "Available" as HardwareStatus,
    turnoverTo: "",
    borrower: "",
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
  const isDesktopAsset = asset.assetType === "Desktop/PC";

  function openEditor() {
    setForm({
      assetTag: asset.assetTag,
      assetType: asset.assetType ?? "",
      assetNameDescription: asset.assetNameDescription ?? "",
      specifications: asset.specifications ?? "",
      serialNumber: asset.serialNumber,
      locationPersonAssigned: asset.location ?? asset.locationPersonAssigned ?? "",
      personAssigned: asset.assignedTo ?? "",
      department: asset.department ?? "",
      status: asset.status as HardwareStatus,
      turnoverTo: asset.assignedTo ?? asset.turnoverTo ?? "Unassigned",
      borrower: asset.borrower ?? "",
      assignedDate:
        isDesktopAsset
          ? (((asset as Record<string, unknown>).turnoverDate as string | undefined) ??
            asset.assignedDate ??
            "")
          : (asset.assignedDate ?? ""),
      purchaseDate: asset.purchaseDate ?? "",
      warranty: asset.warranty ?? "",
      remarks: asset.remarks ?? "",
    });
    setFormError("");
    setSelectedImageFile(null);
    setClearImage(false);
    setSelectedReceivingFormFile(null);
    setClearReceivingForm(false);
    setSelectedTurnoverFormFile(null);
    setClearTurnoverForm(false);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    if (receivingFormInputRef.current) {
      receivingFormInputRef.current.value = "";
    }
    if (turnoverFormInputRef.current) {
      turnoverFormInputRef.current.value = "";
    }
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
      !form.warranty
    ) {
      setFormError(
        `Required fields are missing. ${
          isDesktopAsset ? "Turnover Date" : "Assigned Date"
        }, Purchase Date, and Remarks are optional.`,
      );
      return;
    }

    try {
      setIsSaving(true);
      let imageStorageId: Id<"_storage"> | undefined;
      if (selectedImageFile) {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": selectedImageFile.type || "application/octet-stream",
          },
          body: selectedImageFile,
        });
        if (!uploadResult.ok) {
          throw new Error("Asset image upload failed.");
        }

        const uploadData = (await uploadResult.json()) as { storageId?: Id<"_storage"> };
        if (!uploadData.storageId) {
          throw new Error("Asset image upload failed.");
        }
        imageStorageId = uploadData.storageId;
      }
      let receivingFormStorageIdToSave: Id<"_storage"> | undefined;
      if (selectedReceivingFormFile) {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": selectedReceivingFormFile.type || "application/octet-stream",
          },
          body: selectedReceivingFormFile,
        });
        if (!uploadResult.ok) {
          throw new Error("Receiving form upload failed.");
        }

        const uploadData = (await uploadResult.json()) as { storageId?: Id<"_storage"> };
        if (!uploadData.storageId) {
          throw new Error("Receiving form upload failed.");
        }
        receivingFormStorageIdToSave = uploadData.storageId;
      }
      let turnoverFormStorageId: Id<"_storage"> | undefined;
      if (selectedTurnoverFormFile) {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": selectedTurnoverFormFile.type || "application/octet-stream",
          },
          body: selectedTurnoverFormFile,
        });
        if (!uploadResult.ok) {
          throw new Error("Signed turnover form upload failed.");
        }

        const uploadData = (await uploadResult.json()) as { storageId?: Id<"_storage"> };
        if (!uploadData.storageId) {
          throw new Error("Signed turnover form upload failed.");
        }
        turnoverFormStorageId = uploadData.storageId;
      }
      await updateAsset({
        inventoryId,
        assetTag: form.assetTag,
        assetType: form.assetType,
        assetNameDescription: form.assetNameDescription,
        specifications: form.specifications,
        serialNumber: form.serialNumber,
        locationPersonAssigned: form.locationPersonAssigned,
        personAssigned: form.personAssigned || undefined,
        department: form.department,
        status: form.status,
        turnoverTo: form.personAssigned || "Unassigned",
        borrower: form.borrower || undefined,
        assignedDate: isDesktopAsset ? undefined : form.assignedDate,
        turnoverDate: isDesktopAsset ? form.assignedDate || undefined : undefined,
        purchaseDate: form.purchaseDate,
        warranty: form.warranty,
        remarks: form.remarks || undefined,
        imageStorageId,
        receivingFormStorageId: receivingFormStorageIdToSave,
        turnoverFormStorageId,
        clearImage,
        clearReceivingForm,
        clearTurnoverForm,
      });
      setSelectedImageFile(null);
      setClearImage(false);
      setSelectedReceivingFormFile(null);
      setClearReceivingForm(false);
      setSelectedTurnoverFormFile(null);
      setClearTurnoverForm(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
      if (receivingFormInputRef.current) {
        receivingFormInputRef.current.value = "";
      }
      if (turnoverFormInputRef.current) {
        turnoverFormInputRef.current.value = "";
      }
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to update asset.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (isDeleting || isSaving) {
      return;
    }

    const confirmed = window.confirm(
      `Delete hardware asset ${asset.assetTag}? This action cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    try {
      setIsDeleting(true);
      await removeAsset({ inventoryId });
      router.push("/hardware-inventory");
    } catch (error) {
      console.error(error);
      window.alert("Delete failed. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  const selectedLocationInOptions = locationOptions.includes(
    form.locationPersonAssigned as (typeof locationOptions)[number],
  );
  const selectedAssetTypeInOptions = assetTypeOptions.includes(
    form.assetType as (typeof assetTypeOptions)[number],
  );
  const selectedDepartmentInOptions = departmentOptions.includes(
    form.department as (typeof departmentOptions)[number],
  );
  const canEditBorrower = form.status === "Borrowed";

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
            <Link
              href="/hardware-inventory"
              className="asset-action-btn"
              aria-label="Back to Hardware Inventory"
              title="Back to Hardware Inventory"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M15 6L9 12L15 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            {!isEditing ? (
              <button
                className="asset-action-btn asset-action-btn-primary"
                onClick={openEditor}
                type="button"
                aria-label="Edit Asset"
                title="Edit Asset"
                disabled={isDeleting}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M12 20H21"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M16.5 3.5C17.3284 2.67157 18.6716 2.67157 19.5 3.5C20.3284 4.32843 20.3284 5.67157 19.5 6.5L7 19L3 20L4 16L16.5 3.5Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : (
              <button
                className="asset-action-btn"
                onClick={() => setIsEditing(false)}
                type="button"
                aria-label="Cancel Editing"
                title="Cancel Editing"
                disabled={isDeleting}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M6 6L18 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
            <button
              className="asset-action-btn asset-action-btn-danger"
              onClick={handleDelete}
              type="button"
              aria-label={isDeleting ? "Deleting Asset" : "Delete Asset"}
              title={isDeleting ? "Deleting Asset" : "Delete Asset"}
              disabled={isDeleting || isSaving}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M4 7H20"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M10 11V17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M14 11V17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M6 7L7 19C7.05 19.59 7.52 20 8.11 20H15.89C16.48 20 16.95 19.59 17 19L18 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 7V5C9 4.45 9.45 4 10 4H14C14.55 4 15 4.45 15 5V7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
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
          <section className="panel" style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>
              Receiving Form (Admin)
            </div>
            {receivingFormStorageId ? (
              receivingFormUrl ? (
                <a
                  href={receivingFormUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ display: "inline-block", textDecoration: "none" }}
                >
                  Open Receiving Form
                </a>
              ) : (
                <div style={{ color: "var(--muted)" }}>Loading form...</div>
              )
            ) : (
              <div style={{ color: "var(--muted)" }}>No receiving form attached.</div>
            )}
          </section>
          <section className="panel" style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>
              Signed Turnover/Acknowledgment Form
            </div>
            {asset.turnoverFormStorageId ? (
              turnoverFormUrl ? (
                <a
                  href={turnoverFormUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary"
                  style={{ display: "inline-block", textDecoration: "none" }}
                >
                  Open Signed Form
                </a>
              ) : (
                <div style={{ color: "var(--muted)" }}>Loading form...</div>
              )
            ) : (
              <div style={{ color: "var(--muted)" }}>No signed turnover form attached.</div>
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
            <DetailItem label="Location" value={asset.location ?? asset.locationPersonAssigned} />
            <DetailItem label="Department" value={asset.department} />
            <DetailItem label="Turnover To" value={asset.assignedTo ?? asset.turnoverTo} />
            <DetailItem label="Borrower" value={asset.borrower} />
            <DetailItem
              label={isDesktopAsset ? "Turnover Date" : "Assigned Date"}
              value={
                isDesktopAsset
                  ? ((asset as Record<string, unknown>).turnoverDate as string | undefined) ??
                    asset.assignedDate
                  : asset.assignedDate
              }
            />
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
            <select
              className="input-base"
              value={form.assetType}
              onChange={(e) => setForm((prev) => ({ ...prev, assetType: e.target.value }))}
            >
              {!selectedAssetTypeInOptions && form.assetType ? (
                <option value={form.assetType}>{form.assetType}</option>
              ) : null}
              <option value="">Select asset type</option>
              {assetTypeOptions.map((assetType) => (
                <option key={assetType} value={assetType}>
                  {assetType}
                </option>
              ))}
            </select>
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
              <option value="">Select Location</option>
              {locationOptions.map((location) => (
                <option key={location} value={location}>
                  {location}
                </option>
              ))}
            </select>
            <input
              className="input-base"
              value={form.personAssigned}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  personAssigned: e.target.value,
                  turnoverTo: e.target.value.trim() ? e.target.value : "Unassigned",
                }))
              }
              placeholder="Turnover To (optional)"
            />
            <select
              className="input-base"
              value={form.department}
              onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
            >
              {!selectedDepartmentInOptions && form.department ? (
                <option value={form.department}>{form.department}</option>
              ) : null}
              <option value="">Select department</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
              <select
                className="input-base status-select"
                style={{
                  background: statusColors[form.status]?.bg ?? "#ffffff",
                  color: statusColors[form.status]?.text ?? "var(--foreground)",
                  borderColor: statusColors[form.status]?.border ?? "#e8eff9",
                  fontWeight: 600,
                }}
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, status: e.target.value as HardwareStatus }))
                }
              >
                {statuses.map((status) => (
                  <option
                    key={status}
                    value={status}
                    style={{
                      backgroundColor: "#ffffff",
                      color: statusColors[status]?.text ?? "var(--foreground)",
                    }}
                  >
                    {status}
                  </option>
                ))}
              </select>
            <input
              className="input-base"
              value={canEditBorrower ? form.borrower : "none"}
              onChange={(e) => setForm((prev) => ({ ...prev, borrower: e.target.value }))}
              placeholder="Borrower"
              disabled={!canEditBorrower}
              style={
                canEditBorrower
                  ? undefined
                  : { background: "#f8fafc", color: "#94a3b8", cursor: "not-allowed" }
              }
            />
            <input
              className="input-base"
              type="date"
              value={form.assignedDate}
              onChange={(e) => setForm((prev) => ({ ...prev, assignedDate: e.target.value }))}
              placeholder={isDesktopAsset ? "Turnover Date (optional)" : "Assigned Date (optional)"}
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
            <div style={{ display: "grid", gap: 6 }}>
              <FileUploadCard
                label="Asset Image"
                inputRef={imageInputRef}
                accept="image/*"
                onFileChange={(file) => {
                  setSelectedImageFile(file);
                  if (file) {
                    setClearImage(false);
                  }
                }}
                hasAttachment={Boolean(selectedImageFile || (asset.imageStorageId && !clearImage))}
                displayName={
                  selectedImageFile
                    ? selectedImageFile.name
                    : asset.imageStorageId && !clearImage
                      ? "Current asset image"
                      : "Asset image"
                }
                helperText={
                  selectedImageFile
                    ? "New image selected. Save to replace the current image."
                    : asset.imageStorageId && !clearImage
                      ? "An asset image is already attached."
                      : "No image attached."
                }
                badge="IMG"
                ariaLabel="Asset image upload"
                onRemove={() => {
                  if (selectedImageFile) {
                    setSelectedImageFile(null);
                    if (imageInputRef.current) {
                      imageInputRef.current.value = "";
                    }
                    return;
                  }
                  if (asset.imageStorageId) {
                    setClearImage(true);
                  }
                }}
              />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <FileUploadCard
                label="Receiving Form (Admin)"
                inputRef={receivingFormInputRef}
                accept=".pdf,image/*"
                onFileChange={(file) => {
                  setSelectedReceivingFormFile(file);
                  if (file) {
                    setClearReceivingForm(false);
                  }
                }}
                hasAttachment={Boolean(
                  selectedReceivingFormFile || (receivingFormStorageId && !clearReceivingForm),
                )}
                displayName={
                  selectedReceivingFormFile
                    ? selectedReceivingFormFile.name
                    : receivingFormStorageId && !clearReceivingForm
                      ? "Current receiving form"
                      : "Receiving form"
                }
                helperText={
                  selectedReceivingFormFile
                    ? "New file selected. Save to replace the current receiving form."
                    : receivingFormStorageId && !clearReceivingForm
                      ? "A receiving form is already attached."
                      : "No receiving form attached."
                }
                badge="PDF"
                ariaLabel="Receiving form upload"
                onRemove={() => {
                  if (selectedReceivingFormFile) {
                    setSelectedReceivingFormFile(null);
                    if (receivingFormInputRef.current) {
                      receivingFormInputRef.current.value = "";
                    }
                    return;
                  }
                  if (receivingFormStorageId) {
                    setClearReceivingForm(true);
                  }
                }}
              />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <FileUploadCard
                label="Signed Turnover/Acknowledgment Form"
                inputRef={turnoverFormInputRef}
                accept=".pdf,image/*"
                onFileChange={(file) => {
                  setSelectedTurnoverFormFile(file);
                  if (file) {
                    setClearTurnoverForm(false);
                    setForm((prev) => ({ ...prev, status: "Assigned" }));
                  }
                }}
                hasAttachment={Boolean(
                  selectedTurnoverFormFile || (asset.turnoverFormStorageId && !clearTurnoverForm),
                )}
                displayName={
                  selectedTurnoverFormFile
                    ? selectedTurnoverFormFile.name
                    : asset.turnoverFormStorageId && !clearTurnoverForm
                      ? "Current signed turnover form"
                      : "Signed turnover form"
                }
                helperText={
                  selectedTurnoverFormFile
                    ? "New file selected. Save to replace the current turnover form."
                    : asset.turnoverFormStorageId && !clearTurnoverForm
                      ? "A signed turnover form is already attached."
                      : "No signed turnover form attached."
                }
                badge="PDF"
                ariaLabel="Signed turnover form upload"
                onRemove={() => {
                  if (selectedTurnoverFormFile) {
                    setSelectedTurnoverFormFile(null);
                    if (turnoverFormInputRef.current) {
                      turnoverFormInputRef.current.value = "";
                    }
                    return;
                  }
                  if (asset.turnoverFormStorageId) {
                    setClearTurnoverForm(true);
                  }
                }}
              />
            </div>
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
