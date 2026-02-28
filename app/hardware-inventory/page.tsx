"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { HARDWARE_STATUSES, type HardwareStatus } from "@/lib/hardwareStatuses";

const statuses = HARDWARE_STATUSES;
const locationOptions = ["MAIN", "MAIN STORAGE", "FOODLAND", "WAREHOUSE", "HYBRID"] as const;

type SortKey =
  | "assetTag"
  | "assetType"
  | "assetNameDescription"
  | "specifications"
  | "serialNumber"
  | "locationPersonAssigned"
  | "department"
  | "status"
  | "turnoverTo"
  | "assignedDate"
  | "purchaseDate"
  | "warranty"
  | "remarks";

type FormState = {
  assetTag: string;
  assetType: string;
  assetNameDescription: string;
  specifications: string;
  serialNumber: string;
  locationPersonAssigned: string;
  department: string;
  status: HardwareStatus;
  assignedDate: string;
  purchaseDate: string;
  warranty: string;
  remarks: string;
};

const defaultForm: FormState = {
  assetTag: "",
  assetType: "",
  assetNameDescription: "",
  specifications: "",
  serialNumber: "",
  locationPersonAssigned: "",
  department: "",
  status: "Available",
  assignedDate: "",
  purchaseDate: "",
  warranty: "",
  remarks: "",
};

const statusStyles: Record<
  HardwareStatus,
  { background: string; color: string; borderColor: string }
> = {
  Available: { background: "#dcfce7", color: "#166534", borderColor: "#86efac" },
  Working: { background: "#dbeafe", color: "#1d4ed8", borderColor: "#93c5fd" },
  Borrowed: { background: "#ffedd5", color: "#c2410c", borderColor: "#fdba74" },
  Assigned: { background: "#e0f2fe", color: "#0369a1", borderColor: "#7dd3fc" },
  "For Repair": { background: "#fee2e2", color: "#b91c1c", borderColor: "#fca5a5" },
  Retired: { background: "#e5e7eb", color: "#374151", borderColor: "#d1d5db" },
};

function formatValue(value?: string) {
  if (!value) return "-";
  return value;
}

export default function HardwareInventoryPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("assetTag");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [inlineEdits, setInlineEdits] = useState<
    Record<
      string,
      Partial<FormState> & {
        turnoverTo?: string;
        status?: FormState["status"];
      }
    >
  >({});
  const [inlineStatus, setInlineStatus] = useState<Record<string, string>>({});

  const pageSize = 10;
  const result = useQuery(api.hardwareInventory.list, {
    search: search || undefined,
    status: statusFilter || undefined,
    location: locationFilter || undefined,
    sortKey,
    sortDir,
    page,
    pageSize,
  });

  const createAsset = useMutation(api.hardwareInventory.create);
  const updateAsset = useMutation(api.hardwareInventory.update);
  const migrateLegacy = useMutation(api.hardwareInventory.migrateLegacy);
  const generateUploadUrl = useMutation(api.hardwareInventory.generateUploadUrl);

  const migrationRan = useRef(false);
  const formSectionRef = useRef<HTMLElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (migrationRan.current) return;
    if (!result?.items?.length) return;
    const needsMigration = result.items.some(
      (row) =>
        !row.assetType ||
        !row.assetNameDescription ||
        !row.specifications ||
        !row.locationPersonAssigned ||
        !row.department ||
        !row.turnoverTo ||
        !row.assignedDate ||
        !row.purchaseDate ||
        !row.warranty,
    );
    if (!needsMigration) return;

    migrationRan.current = true;
    void migrateLegacy();
  }, [result?.items, migrateLegacy]);

  const tableRows = result?.items ?? [];

  const headerConfig: { label: string; key: SortKey | null }[] = [
    { label: "Asset Tag", key: "assetTag" },
    { label: "Asset Type", key: "assetType" },
    { label: "Asset Name / Specs", key: "assetNameDescription" },
    { label: "Location", key: "locationPersonAssigned" },
    { label: "Status", key: "status" },
    { label: "Turnover to", key: "turnoverTo" },
  ];

  const totalPages = result?.totalPages ?? 1;

  const handleSort = (key: SortKey | null) => {
    if (!key) return;
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  async function handleCreate() {
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
      !form.assignedDate ||
      !form.purchaseDate ||
      !form.warranty
    ) {
      setFormError("All fields are required except Remarks.");
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
          throw new Error("Image upload failed.");
        }

        const uploadData = (await uploadResult.json()) as { storageId?: Id<"_storage"> };
        if (!uploadData.storageId) {
          throw new Error("Image upload failed.");
        }
        imageStorageId = uploadData.storageId;
      }

      await createAsset({
        assetTag: form.assetTag,
        assetType: form.assetType,
        assetNameDescription: form.assetNameDescription,
        specifications: form.specifications,
        serialNumber: form.serialNumber,
        locationPersonAssigned: form.locationPersonAssigned,
        department: form.department,
        status: form.status,
        assignedDate: form.assignedDate,
        purchaseDate: form.purchaseDate,
        warranty: form.warranty,
        remarks: form.remarks || undefined,
        imageStorageId,
      });
      setForm(defaultForm);
      setSelectedImageFile(null);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
      setPage(1);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save asset.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateInlineField(rowId: string, value: Partial<FormState> & { turnoverTo?: string }) {
    setInlineEdits((prev) => ({
      ...prev,
      [rowId]: { ...prev[rowId], ...value },
    }));
  }

  async function saveInline(rowId: Id<"hardwareInventory">) {
    const row = tableRows.find((item) => item._id === rowId);
    if (!row) return;

    const edits = inlineEdits[rowId];
    if (!edits) return;

    const next = {
      assetTag: row.assetTag,
      assetType: row.assetType ?? "",
      assetNameDescription: row.assetNameDescription ?? "",
      specifications: row.specifications ?? "",
      serialNumber: row.serialNumber,
      locationPersonAssigned: row.locationPersonAssigned ?? "",
      department: row.department ?? "",
      status: row.status,
      turnoverTo: row.turnoverTo ?? "",
      assignedDate: row.assignedDate ?? "",
      purchaseDate: row.purchaseDate ?? "",
      warranty: row.warranty ?? "",
      remarks: row.remarks ?? "",
      ...edits,
    };

    const hasChanges = Object.keys(edits).some((key) => {
      const nextValue = (next as Record<string, unknown>)[key] ?? "";
      const rowValue = (row as Record<string, unknown>)[key] ?? "";
      return String(nextValue) !== String(rowValue);
    });
    if (!hasChanges) return;

    try {
      await updateAsset({
        inventoryId: rowId,
        assetTag: next.assetTag,
        assetType: next.assetType,
        assetNameDescription: next.assetNameDescription,
        specifications: next.specifications,
        serialNumber: next.serialNumber,
        locationPersonAssigned: next.locationPersonAssigned,
        department: next.department,
        status: next.status,
        turnoverTo: next.turnoverTo,
        assignedDate: next.assignedDate,
        purchaseDate: next.purchaseDate,
        warranty: next.warranty,
        remarks: next.remarks || undefined,
      });
      setInlineEdits((prev) => {
        const nextState = { ...prev };
        delete nextState[rowId];
        return nextState;
      });
      setInlineStatus((prev) => ({ ...prev, [rowId]: "" }));
    } catch (error) {
      setInlineStatus((prev) => ({
        ...prev,
        [rowId]: error instanceof Error ? error.message : "Save failed.",
      }));
    }
  }

  const smallInput = {
    height: 32,
    padding: "0 8px",
    fontSize: 13,
  } as const;

  function handleEdit(inventoryId: Id<"hardwareInventory">) {
    router.push(`/hardware-inventory/${inventoryId}`);
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Hardware Inventory</h1>
      <p style={{ color: "var(--muted)", marginBottom: 16 }}>
        Track lifecycle, ownership, and location for all hardware assets.
      </p>

      <section className="panel" style={{ padding: 14 }} ref={formSectionRef}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>Add New Hardware Asset</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          <input
            className="input-base"
            placeholder="Asset Tag"
            value={form.assetTag}
            onChange={(e) => setForm((prev) => ({ ...prev, assetTag: e.target.value }))}
          />
          <input
            className="input-base"
            placeholder="Asset Type"
            value={form.assetType}
            onChange={(e) => setForm((prev) => ({ ...prev, assetType: e.target.value }))}
          />
          <input
            className="input-base"
            placeholder="Asset Name or Description"
            value={form.assetNameDescription}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, assetNameDescription: e.target.value }))
            }
          />
          <input
            className="input-base"
            placeholder="Specifications"
            value={form.specifications}
            onChange={(e) => setForm((prev) => ({ ...prev, specifications: e.target.value }))}
          />
          <input
            className="input-base"
            placeholder="Serial Number"
            value={form.serialNumber}
            onChange={(e) => setForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
          />
          <select
            className="input-base"
            value={form.locationPersonAssigned}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, locationPersonAssigned: e.target.value }))
            }
          >
            <option value="">Select location</option>
            {locationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
          <input
            className="input-base"
            placeholder="Department"
            value={form.department}
            onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
          />
          <select
            className="input-base"
            value={form.status}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, status: e.target.value as FormState["status"] }))
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
            type="text"
            placeholder="Assigned Date"
            value={form.assignedDate}
            onChange={(e) => setForm((prev) => ({ ...prev, assignedDate: e.target.value }))}
            onFocus={(e) => {
              e.currentTarget.type = "date";
            }}
            onBlur={(e) => {
              if (!e.currentTarget.value) e.currentTarget.type = "text";
            }}
          />
          <input
            className="input-base"
            type="text"
            placeholder="Purchase Date"
            value={form.purchaseDate}
            onChange={(e) => setForm((prev) => ({ ...prev, purchaseDate: e.target.value }))}
            onFocus={(e) => {
              e.currentTarget.type = "date";
            }}
            onBlur={(e) => {
              if (!e.currentTarget.value) e.currentTarget.type = "text";
            }}
          />
          <input
            className="input-base"
            placeholder="Warranty"
            value={form.warranty}
            onChange={(e) => setForm((prev) => ({ ...prev, warranty: e.target.value }))}
          />
          <input
            className="input-base"
            placeholder="Remarks (optional)"
            value={form.remarks}
            onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
          />
          <div style={{ display: "grid", gap: 4 }}>
            <input
              ref={imageInputRef}
              className="input-base"
              type="file"
              accept="image/*"
              onChange={(e) => setSelectedImageFile(e.target.files?.[0] ?? null)}
              aria-label="Asset image upload"
              title="Upload asset image"
              style={{ padding: "6px 10px", height: "auto" }}
            />
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {selectedImageFile ? `Selected: ${selectedImageFile.name}` : "No image selected"}
            </div>
          </div>
          <button className="btn-primary" onClick={handleCreate} disabled={isSaving}>
            {isSaving ? "Saving..." : "Create Asset"}
          </button>
        </div>
        {formError ? (
          <p style={{ color: "#b91c1c", marginTop: 8, fontSize: 13 }}>{formError}</p>
        ) : null}
      </section>

      <section className="panel" style={{ marginTop: 16, padding: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr repeat(2, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          <div className="search-field">
            <span className="search-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" />
              </svg>
            </span>
            <input
              className="input-base"
              placeholder="Search: Asset Tag, Serial Number, Asset Name, Turnover to"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="input-base"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            className="input-base"
            value={locationFilter}
            onChange={(e) => {
              setLocationFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Locations</option>
            {locationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>

        <div className="saas-table-wrap" style={{ marginTop: 12 }}>
          <table className="saas-table">
            <thead>
              <tr>
                {headerConfig.map((header) => (
                  <th
                    key={header.label}
                    onClick={() => handleSort(header.key)}
                    style={{ cursor: header.key ? "pointer" : "default" }}
                  >
                    {header.label}
                    {header.key && sortKey === header.key ? (sortDir === "asc" ? " ^" : " v") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr
                  key={row._id}
                  className="table-row-hover"
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("button, input, select, a, textarea")) return;
                    handleEdit(row._id);
                  }}
                >
                  <td>{formatValue(row.assetTag)}</td>
                  <td>{formatValue(row.assetType ?? "")}</td>
                  <td>
                    <div style={{ display: "grid", gap: 4 }}>
                      <div>{formatValue(row.assetNameDescription ?? "")}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {formatValue(row.specifications ?? "")}
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      className="input-base"
                      style={smallInput}
                      value={
                        (inlineEdits[row._id]?.locationPersonAssigned as string | undefined) ??
                        row.locationPersonAssigned ??
                        ""
                      }
                      onChange={(e) =>
                        updateInlineField(row._id, { locationPersonAssigned: e.target.value })
                      }
                      onBlur={() => saveInline(row._id)}
                    >
                      <option value="">Select location</option>
                      {locationOptions.map((location) => (
                        <option key={location} value={location}>
                          {location}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      className="input-base"
                      style={{
                        ...smallInput,
                        ...(statusStyles[
                          (inlineEdits[row._id]?.status ?? row.status) as HardwareStatus
                        ] ?? statusStyles.Available),
                        fontWeight: 600,
                      }}
                      value={(inlineEdits[row._id]?.status ?? row.status) as FormState["status"]}
                      onChange={(e) =>
                        updateInlineField(row._id, {
                          status: e.target.value as FormState["status"],
                        })
                      }
                      onBlur={() => saveInline(row._id)}
                    >
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      className="input-base"
                      style={smallInput}
                      value={inlineEdits[row._id]?.turnoverTo ?? row.turnoverTo ?? ""}
                      onChange={(e) => updateInlineField(row._id, { turnoverTo: e.target.value })}
                      onBlur={() => saveInline(row._id)}
                    />
                  </td>
                </tr>
              ))}
              {!tableRows.length ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "#6b7280", padding: 16 }}>
                    No hardware assets found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13, color: "#4b5563" }}>
            Showing {(result?.items?.length ?? 0)} of {result?.total ?? 0}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-secondary"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Prev
            </button>
            <span style={{ alignSelf: "center", fontSize: 13 }}>
              Page {page} / {totalPages}
            </span>
            <button
              className="btn-primary"
              disabled={page >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>

        {Object.values(inlineStatus).some(Boolean) ? (
          <p style={{ color: "#b91c1c", marginTop: 8, fontSize: 13 }}>
            {Object.values(inlineStatus).find((value) => value) ?? "Inline save failed."}
          </p>
        ) : null}
      </section>
    </div>
  );
}

