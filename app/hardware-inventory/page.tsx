"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import FileUploadCard from "./file-upload-card";
import { HARDWARE_STATUSES, type HardwareStatus } from "@/lib/hardwareStatuses";
import { HARDWARE_ASSET_TYPES } from "@/lib/hardwareAssetTypes";
import { HARDWARE_DEPARTMENTS } from "@/lib/hardwareDepartments";

const statuses = HARDWARE_STATUSES;
const assetTypeOptions = HARDWARE_ASSET_TYPES;
const departmentOptions = HARDWARE_DEPARTMENTS;
const locationOptions = ["MAIN", "MAIN STORAGE", "FOODLAND", "WAREHOUSE", "HYBRID"] as const;
const workstationTypes = ["Laptop", "Desktop/PC"] as const;
const specsTierOptions = ["LOW", "MID", "HIGH-END"] as const;
const monitorSlotOptions = ["Monitor 1", "Monitor 2"] as const;
const componentTypeOptions = ["Monitor", "Headset", "Keyboard", "Mouse", "Speaker", "Other"] as const;

type RegisterMode = "general" | "workstation";
type WorkstationType = (typeof workstationTypes)[number];
type SpecsTier = (typeof specsTierOptions)[number];
type MonitorSlot = (typeof monitorSlotOptions)[number];
type ExtraComponent = {
  assetTag: string;
  componentType: string;
  specifications: string;
};

type SortKey =
  | "assetTag"
  | "assetType"
  | "assetNameDescription"
  | "specifications"
  | "serialNumber"
  | "locationPersonAssigned"
  | "personAssigned"
  | "department"
  | "status"
  | "turnoverTo"
  | "borrower"
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
  personAssigned: string;
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
  personAssigned: "",
  department: "",
  status: "Available",
  assignedDate: "",
  purchaseDate: "",
  warranty: "",
  remarks: "",
};

const defaultDesktopForm: {
  monitorAssetTag: string;
  monitorSlot: MonitorSlot | "";
  monitorSpecs: string;
  monitorConsumables: string;
  systemUnitAssetTag: string;
  systemUnitSpecs: string;
  caseBrand: string;
  mouseAssetTag: string;
  mouseSpecs: string;
  keyboardAssetTag: string;
  keyboardSpecs: string;
  extraComponents: ExtraComponent[];
} = {
  monitorAssetTag: "",
  monitorSlot: "Monitor 1",
  monitorSpecs: "",
  monitorConsumables: "",
  systemUnitAssetTag: "",
  systemUnitSpecs: "",
  caseBrand: "",
  mouseAssetTag: "",
  mouseSpecs: "",
  keyboardAssetTag: "",
  keyboardSpecs: "",
  extraComponents: [],
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
  NEW: { background: "#ede9fe", color: "#6d28d9", borderColor: "#c4b5fd" },
  "Pre-owned": { background: "#fef3c7", color: "#b45309", borderColor: "#fcd34d" },
};

function formatValue(value?: string) {
  if (!value) return "-";
  return value;
}

function buildDesktopSpecificationsSummary(args: {
  specsTier?: string;
  monitorAssetTag?: string;
  monitorSlot?: string;
  monitorSpecs?: string;
  monitorConsumables?: string;
  systemUnitAssetTag?: string;
  systemUnitSpecs?: string;
  caseBrand?: string;
  mouseAssetTag?: string;
  mouseSpecs?: string;
  keyboardAssetTag?: string;
  keyboardSpecs?: string;
  extraComponents: ExtraComponent[];
}) {
  const summaryParts = [
    args.specsTier ? `Specs Tier: ${args.specsTier}` : "",
    args.systemUnitSpecs
      ? `System Unit${args.systemUnitAssetTag ? ` (${args.systemUnitAssetTag})` : ""}: ${args.systemUnitSpecs}`
      : "",
    args.caseBrand ? `Case Brand: ${args.caseBrand}` : "",
    args.monitorSlot && args.monitorSpecs
      ? `${args.monitorSlot}${args.monitorAssetTag ? ` (${args.monitorAssetTag})` : ""}: ${args.monitorSpecs}`
      : "",
    args.monitorConsumables ? `Monitor Consumables: ${args.monitorConsumables}` : "",
    args.mouseSpecs
      ? `Mouse${args.mouseAssetTag ? ` (${args.mouseAssetTag})` : ""}: ${args.mouseSpecs}`
      : "",
    args.keyboardSpecs
      ? `Keyboard${args.keyboardAssetTag ? ` (${args.keyboardAssetTag})` : ""}: ${args.keyboardSpecs}`
      : "",
    args.extraComponents.length
      ? `Extra Components: ${args.extraComponents
          .map((component) => `${component.componentType} (${component.assetTag})`)
          .join(", ")}`
      : "",
  ].filter(Boolean);

  return summaryParts.join(" | ");
}

export default function HardwareInventoryPage() {
  const router = useRouter();
  const [registerMode, setRegisterMode] = useState<RegisterMode>("general");
  const [workstationType, setWorkstationType] = useState<WorkstationType>("Laptop");
  const [specTier, setSpecTier] = useState<SpecsTier | "">("");
  const [desktopForm, setDesktopForm] = useState(defaultDesktopForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedReceivingFormFile, setSelectedReceivingFormFile] = useState<File | null>(null);
  const [selectedTurnoverFormFile, setSelectedTurnoverFormFile] = useState<File | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("assetTag");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [inlineEdits, setInlineEdits] = useState<
    Record<
      string,
      Partial<FormState> & {
        turnoverTo?: string;
        borrower?: string;
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
  const receivingFormInputRef = useRef<HTMLInputElement | null>(null);
  const turnoverFormInputRef = useRef<HTMLInputElement | null>(null);
  const inlineSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const isDesktopWorkstation = registerMode === "workstation" && workstationType === "Desktop/PC";

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
        !row.warranty,
    );
    if (!needsMigration) return;

    migrationRan.current = true;
    void migrateLegacy();
  }, [result?.items, migrateLegacy]);
  useEffect(() => {
    const inlineSaveTimers = inlineSaveTimersRef.current;
    return () => {
      Object.values(inlineSaveTimers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const tableRows = result?.items ?? [];

  const headerConfig: { label: string; key: SortKey | null }[] = [
    { label: "Asset Tag", key: "assetTag" },
    { label: "Asset Type", key: "assetType" },
    { label: "Asset Name / Specs", key: "assetNameDescription" },
    { label: "Location", key: "locationPersonAssigned" },
    { label: "Turnover to", key: "turnoverTo" },
    { label: "Status", key: "status" },
    { label: "Borrower", key: "borrower" },
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
    const desktopBaseAssetTag = desktopForm.systemUnitAssetTag.trim();
    const assetTagToSave = isDesktopWorkstation
      ? `${desktopBaseAssetTag}-SET`
      : form.assetTag.trim();
    const assetTypeToSave = registerMode === "workstation" ? workstationType : form.assetType;
    const assetNameDescriptionToSave = isDesktopWorkstation
      ? "Desktop/PC Workstation"
      : form.assetNameDescription;
    const specificationsToSave = isDesktopWorkstation
      ? buildDesktopSpecificationsSummary({
          specsTier: specTier,
          monitorAssetTag: desktopForm.monitorAssetTag,
          monitorSlot: desktopForm.monitorSlot,
          monitorSpecs: desktopForm.monitorSpecs,
          monitorConsumables: desktopForm.monitorConsumables,
          systemUnitAssetTag: desktopForm.systemUnitAssetTag,
          systemUnitSpecs: desktopForm.systemUnitSpecs,
          caseBrand: desktopForm.caseBrand,
          mouseAssetTag: desktopForm.mouseAssetTag,
          mouseSpecs: desktopForm.mouseSpecs,
          keyboardAssetTag: desktopForm.keyboardAssetTag,
          keyboardSpecs: desktopForm.keyboardSpecs,
          extraComponents: desktopForm.extraComponents,
        })
      : registerMode === "workstation" && specTier
        ? `[${specTier}] ${form.specifications}`
        : form.specifications;
    const serialNumberToSave = isDesktopWorkstation
      ? `${assetTagToSave}-SERIAL`
      : form.serialNumber;
    if (
      !assetTagToSave ||
      !assetTypeToSave ||
      !assetNameDescriptionToSave ||
      !specificationsToSave ||
      !serialNumberToSave ||
      !form.locationPersonAssigned ||
      !form.department ||
      !form.status ||
      !form.warranty
    ) {
      setFormError(
        `Required fields are missing. ${
          isDesktopWorkstation ? "Turnover Date" : "Assigned Date"
        }, Purchase Date, and Remarks are optional.`,
      );
      return;
    }
    if (registerMode === "workstation" && !specTier) {
      setFormError("Specs Tier is required for workstation entries.");
      return;
    }
    if (isDesktopWorkstation) {
      if (
        !desktopForm.monitorAssetTag ||
        !desktopForm.monitorSlot ||
        !desktopForm.monitorSpecs ||
        !desktopForm.systemUnitAssetTag ||
        !desktopForm.systemUnitSpecs ||
        !desktopForm.caseBrand
      ) {
        setFormError(
          "Desktop/PC entries require monitor and system unit asset tags plus complete details.",
        );
        return;
      }
      const hasMouseFields = Boolean(desktopForm.mouseAssetTag || desktopForm.mouseSpecs);
      if (hasMouseFields && (!desktopForm.mouseAssetTag.trim() || !desktopForm.mouseSpecs.trim())) {
        setFormError("Mouse Asset Tag and Mouse Specs must both be filled in.");
        return;
      }
      const hasKeyboardFields = Boolean(
        desktopForm.keyboardAssetTag || desktopForm.keyboardSpecs,
      );
      if (
        hasKeyboardFields &&
        (!desktopForm.keyboardAssetTag.trim() || !desktopForm.keyboardSpecs.trim())
      ) {
        setFormError("Keyboard Asset Tag and Keyboard Specs must both be filled in.");
        return;
      }
      const invalidComponent = desktopForm.extraComponents.some(
        (component) =>
          !component.assetTag.trim() ||
          !component.componentType.trim() ||
          !component.specifications.trim(),
      );
      if (invalidComponent) {
        setFormError("Each extra component needs its own Asset Tag, Type, and Specs.");
        return;
      }
    }
    if (!selectedImageFile) {
      setFormError("Asset image is required.");
      return;
    }

    try {
      setIsSaving(true);
      let imageStorageId: Id<"_storage"> | undefined;
      let receivingFormStorageId: Id<"_storage"> | undefined;
      let turnoverFormStorageId: Id<"_storage"> | undefined;

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
        receivingFormStorageId = uploadData.storageId;
      }
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

      await createAsset({
        assetTag: assetTagToSave,
        assetType: assetTypeToSave,
        assetNameDescription: assetNameDescriptionToSave,
        specifications: specificationsToSave,
        serialNumber: serialNumberToSave,
        locationPersonAssigned: form.locationPersonAssigned,
        personAssigned: form.personAssigned || undefined,
        department: form.department,
        status: form.status,
        assignedDate: isDesktopWorkstation ? undefined : form.assignedDate,
        turnoverDate: isDesktopWorkstation ? form.assignedDate || undefined : undefined,
        purchaseDate: form.purchaseDate,
        warranty: form.warranty,
        remarks: form.remarks || undefined,
        imageStorageId,
        receivingFormStorageId,
        turnoverFormStorageId,
        registerMode,
        workstationType: registerMode === "workstation" ? workstationType : undefined,
        specsTier: registerMode === "workstation" ? specTier || undefined : undefined,
        desktopMonitorAssetTag: isDesktopWorkstation
          ? desktopForm.monitorAssetTag || undefined
          : undefined,
        desktopMonitorSlot: isDesktopWorkstation ? desktopForm.monitorSlot || undefined : undefined,
        desktopMonitorSpecs: isDesktopWorkstation
          ? desktopForm.monitorSpecs || undefined
          : undefined,
        desktopMonitorConsumables: isDesktopWorkstation
          ? desktopForm.monitorConsumables || undefined
          : undefined,
        desktopSystemUnitAssetTag: isDesktopWorkstation
          ? desktopForm.systemUnitAssetTag || undefined
          : undefined,
        desktopSystemUnitSpecs: isDesktopWorkstation
          ? desktopForm.systemUnitSpecs || undefined
          : undefined,
        desktopCaseBrand: isDesktopWorkstation ? desktopForm.caseBrand || undefined : undefined,
        desktopMouseAssetTag: isDesktopWorkstation ? desktopForm.mouseAssetTag || undefined : undefined,
        desktopMouseSpecs: isDesktopWorkstation ? desktopForm.mouseSpecs || undefined : undefined,
        desktopKeyboardAssetTag: isDesktopWorkstation
          ? desktopForm.keyboardAssetTag || undefined
          : undefined,
        desktopKeyboardSpecs: isDesktopWorkstation
          ? desktopForm.keyboardSpecs || undefined
          : undefined,
        workstationComponents: isDesktopWorkstation
          ? desktopForm.extraComponents.map((component) => ({
              assetTag: component.assetTag.trim(),
              componentType: component.componentType.trim(),
              specifications: component.specifications.trim(),
            }))
          : undefined,
      });
      setForm(defaultForm);
      setDesktopForm(defaultDesktopForm);
      setSpecTier("");
      setSelectedImageFile(null);
      setSelectedReceivingFormFile(null);
      setSelectedTurnoverFormFile(null);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
      if (receivingFormInputRef.current) {
        receivingFormInputRef.current.value = "";
      }
      if (turnoverFormInputRef.current) {
        turnoverFormInputRef.current.value = "";
      }
      setPage(1);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to save asset.");
    } finally {
      setIsSaving(false);
    }
  }

  function queueInlineSave(
    rowId: Id<"hardwareInventory">,
    value: Partial<FormState> & { turnoverTo?: string; borrower?: string; personAssigned?: string },
  ) {
    setInlineEdits((prev) => {
      const merged = { ...prev[rowId], ...value };
      if (value.personAssigned !== undefined) {
        merged.turnoverTo = value.personAssigned.trim() ? value.personAssigned : "Unassigned";
      }
      const timerKey = String(rowId);
      if (inlineSaveTimersRef.current[timerKey]) {
        clearTimeout(inlineSaveTimersRef.current[timerKey]);
      }
      inlineSaveTimersRef.current[timerKey] = setTimeout(() => {
        void saveInline(rowId, merged);
      }, 250);
      return {
        ...prev,
        [rowId]: merged,
      };
    });
  }

  async function saveInline(
    rowId: Id<"hardwareInventory">,
    editsOverride?: Partial<FormState> & {
      turnoverTo?: string;
      borrower?: string;
      personAssigned?: string;
      status?: FormState["status"];
    },
  ) {
    const row = tableRows.find((item) => item._id === rowId);
    if (!row) return;

    const edits = editsOverride ?? inlineEdits[rowId];
    if (!edits) return;

    const next = {
      assetTag: row.assetTag,
      assetType: row.assetType ?? "",
      assetNameDescription: row.assetNameDescription ?? "",
      specifications: row.specifications ?? "",
      serialNumber: row.serialNumber,
      locationPersonAssigned: row.location ?? row.locationPersonAssigned ?? "",
      personAssigned: row.assignedTo ?? "",
      department: row.department ?? "",
      status: row.status,
      turnoverTo: row.turnoverTo ?? "Unassigned",
      borrower: (row as Record<string, unknown>).borrower?.toString() ?? "",
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
        personAssigned: next.personAssigned || undefined,
        department: next.department,
        status: next.status,
        turnoverTo: next.turnoverTo,
        borrower: next.borrower || undefined,
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
      const timerKey = String(rowId);
      if (inlineSaveTimersRef.current[timerKey]) {
        clearTimeout(inlineSaveTimersRef.current[timerKey]);
        delete inlineSaveTimersRef.current[timerKey];
      }
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

      <section className="panel" style={{ padding: 18 }} ref={formSectionRef}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 10,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Hardware Asset Register</h2>
          <div style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700 }}>
            Fields marked <span style={{ color: "#dc2626" }}>*</span> are required
          </div>
        </div>
        <div className="register-tab-stack" style={{ marginBottom: 10 }}>
          <div className="register-pill-tabs">
            <button
              type="button"
              className={`register-pill-tab ${registerMode === "general" ? "active" : ""}`}
              onClick={() => {
                setRegisterMode("general");
                setSpecTier("");
              }}
            >
              General Asset
            </button>
            <button
              type="button"
              className={`register-pill-tab ${registerMode === "workstation" ? "active" : ""}`}
              onClick={() => {
                setRegisterMode("workstation");
                setForm((prev) => ({ ...prev, assetType: workstationType }));
              }}
            >
              Add Workstation
            </button>
          </div>
          {registerMode === "workstation" ? (
            <div className="register-subtabs">
              {workstationTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`register-subtab ${workstationType === type ? "active" : ""}`}
                  onClick={() => {
                    setWorkstationType(type);
                    setForm((prev) => ({ ...prev, assetType: type }));
                  }}
                >
                  {type}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
          }}
        >
          {!isDesktopWorkstation ? (
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                Asset Tag <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                className="input-base"
                placeholder="Asset Tag"
                value={form.assetTag}
                onChange={(e) => setForm((prev) => ({ ...prev, assetTag: e.target.value }))}
              />
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Asset Type <span style={{ color: "#dc2626" }}>*</span>
            </label>
            {registerMode === "workstation" ? (
              <input
                className="input-base"
                value={workstationType}
                readOnly
                aria-label="Workstation type"
                style={{ background: "#f8fafc", color: "var(--foreground)" }}
              />
            ) : (
              <select
                className="input-base"
                value={form.assetType}
                onChange={(e) => setForm((prev) => ({ ...prev, assetType: e.target.value }))}
              >
                <option value="">Select asset type</option>
                {assetTypeOptions.map((assetType) => (
                  <option key={assetType} value={assetType}>
                    {assetType}
                  </option>
                ))}
              </select>
            )}
          </div>
          {!isDesktopWorkstation ? (
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                Asset Name or Description <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                className="input-base"
                placeholder="Asset Name or Description"
                value={form.assetNameDescription}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, assetNameDescription: e.target.value }))
                }
              />
            </div>
          ) : null}
          {!isDesktopWorkstation ? (
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                Specifications <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                className="input-base"
                placeholder="Specifications"
                value={form.specifications}
                onChange={(e) => setForm((prev) => ({ ...prev, specifications: e.target.value }))}
              />
            </div>
          ) : null}
          {registerMode === "workstation" ? (
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                Specs Tier <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <select
                className="input-base"
                value={specTier}
                onChange={(e) => setSpecTier(e.target.value as SpecsTier | "")}
              >
                <option value="">Select specs tier</option>
                {specsTierOptions.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {!isDesktopWorkstation ? (
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                Serial Number <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                className="input-base"
                placeholder="Serial Number"
                value={form.serialNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
              />
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Location <span style={{ color: "#dc2626" }}>*</span>
            </label>
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
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Turnover To (optional)
            </label>
            <input
              className="input-base"
              placeholder="Turnover To"
              value={form.personAssigned}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  personAssigned: e.target.value,
                  turnoverTo: e.target.value.trim() ? e.target.value : "Unassigned",
                }))
              }
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Department <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <select
              className="input-base"
              value={form.department}
              onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
            >
              <option value="">Select department</option>
              {departmentOptions.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Status <span style={{ color: "#dc2626" }}>*</span>
            </label>
              <select
                className="input-base status-select"
                style={{
                  color: statusStyles[form.status]?.color ?? "var(--foreground)",
                  borderColor: statusStyles[form.status]?.borderColor ?? "#e8eff9",
                  fontWeight: 600,
                }}
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, status: e.target.value as FormState["status"] }))
                }
              >
                {statuses.map((status) => (
                  <option
                    key={status}
                    value={status}
                    style={{
                      backgroundColor: "#ffffff",
                      color: statusStyles[status]?.color ?? "var(--foreground)",
                    }}
                  >
                    {status}
                  </option>
                ))}
              </select>
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              {isDesktopWorkstation ? "Turnover Date (optional)" : "Assigned Date (optional)"}
            </label>
            <input
              className="input-base"
              type="text"
              placeholder={isDesktopWorkstation ? "Turnover Date" : "Assigned Date"}
              value={form.assignedDate}
              onChange={(e) => setForm((prev) => ({ ...prev, assignedDate: e.target.value }))}
              onFocus={(e) => {
                e.currentTarget.type = "date";
              }}
              onBlur={(e) => {
                if (!e.currentTarget.value) e.currentTarget.type = "text";
              }}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Purchase Date (optional)
            </label>
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
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Warranty <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base"
              placeholder="Warranty"
              value={form.warranty}
              onChange={(e) => setForm((prev) => ({ ...prev, warranty: e.target.value }))}
            />
          </div>
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Remarks (optional)
            </label>
            <input
              className="input-base"
              placeholder="Remarks (optional)"
              value={form.remarks}
              onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
            />
          </div>
        </div>
        {isDesktopWorkstation ? (
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            <div
              className="panel"
              style={{
                padding: 12,
                display: "grid",
                gap: 8,
                borderRadius: 16,
                boxShadow: "none",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>Monitor</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Monitor Asset Tag <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="Monitor Asset Tag"
                    value={desktopForm.monitorAssetTag}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({
                        ...prev,
                        monitorAssetTag: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Monitor Slot <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <select
                    className="input-base"
                    value={desktopForm.monitorSlot}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({
                        ...prev,
                        monitorSlot: e.target.value as MonitorSlot | "",
                      }))
                    }
                  >
                    <option value="">Select monitor slot</option>
                    {monitorSlotOptions.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Monitor Specs <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="Monitor Specs"
                    value={desktopForm.monitorSpecs}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({ ...prev, monitorSpecs: e.target.value }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Monitor Consumables (wires)
                  </label>
                  <input
                    className="input-base"
                    placeholder="Wires / cables"
                    value={desktopForm.monitorConsumables}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({
                        ...prev,
                        monitorConsumables: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div
              className="panel"
              style={{
                padding: 12,
                display: "grid",
                gap: 8,
                borderRadius: 16,
                boxShadow: "none",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>Mouse</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Mouse Asset Tag
                  </label>
                  <input
                    className="input-base"
                    placeholder="Mouse Asset Tag"
                    value={desktopForm.mouseAssetTag}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({
                        ...prev,
                        mouseAssetTag: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Mouse Specs
                  </label>
                  <input
                    className="input-base"
                    placeholder="Mouse Specs"
                    value={desktopForm.mouseSpecs}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({
                        ...prev,
                        mouseSpecs: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div
              className="panel"
              style={{
                padding: 12,
                display: "grid",
                gap: 8,
                borderRadius: 16,
                boxShadow: "none",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>Keyboard</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Keyboard Asset Tag
                  </label>
                  <input
                    className="input-base"
                    placeholder="Keyboard Asset Tag"
                    value={desktopForm.keyboardAssetTag}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({
                        ...prev,
                        keyboardAssetTag: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Keyboard Specs
                  </label>
                  <input
                    className="input-base"
                    placeholder="Keyboard Specs"
                    value={desktopForm.keyboardSpecs}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({
                        ...prev,
                        keyboardSpecs: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div
              className="panel"
              style={{
                padding: 12,
                display: "grid",
                gap: 8,
                borderRadius: 16,
                boxShadow: "none",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>System Unit</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    System Unit Asset Tag <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="System Unit Asset Tag"
                    value={desktopForm.systemUnitAssetTag}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({
                        ...prev,
                        systemUnitAssetTag: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Specs <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="System Unit Specs"
                    value={desktopForm.systemUnitSpecs}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({
                        ...prev,
                        systemUnitSpecs: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Case Brand <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="Case Brand"
                    value={desktopForm.caseBrand}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({ ...prev, caseBrand: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>

            <div
              className="panel"
              style={{
                padding: 12,
                display: "grid",
                gap: 8,
                borderRadius: 16,
                boxShadow: "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>Extra Components</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Add separately tagged peripherals like another monitor or a headset.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setDesktopForm((prev) => ({
                      ...prev,
                      extraComponents: [
                        ...prev.extraComponents,
                        { assetTag: "", componentType: "Monitor", specifications: "" },
                      ],
                    }))
                  }
                >
                  Add Component
                </button>
              </div>
              {desktopForm.extraComponents.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {desktopForm.extraComponents.map((component, index) => (
                    <div
                      key={`${index}-${component.assetTag}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr)) auto",
                        gap: 8,
                        alignItems: "end",
                        padding: 10,
                        border: "1px solid var(--border)",
                        borderRadius: 14,
                      }}
                    >
                      <div style={{ display: "grid", gap: 4 }}>
                        <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                          Asset Tag <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <input
                          className="input-base"
                          placeholder="Component Asset Tag"
                          value={component.assetTag}
                          onChange={(e) =>
                            setDesktopForm((prev) => ({
                              ...prev,
                              extraComponents: prev.extraComponents.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, assetTag: e.target.value }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div style={{ display: "grid", gap: 4 }}>
                        <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                          Component Type <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <select
                          className="input-base"
                          value={component.componentType}
                          onChange={(e) =>
                            setDesktopForm((prev) => ({
                              ...prev,
                              extraComponents: prev.extraComponents.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, componentType: e.target.value }
                                  : item,
                              ),
                            }))
                          }
                        >
                          {componentTypeOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: "grid", gap: 4 }}>
                        <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                          Specs <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <input
                          className="input-base"
                          placeholder="Component Specs"
                          value={component.specifications}
                          onChange={(e) =>
                            setDesktopForm((prev) => ({
                              ...prev,
                              extraComponents: prev.extraComponents.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, specifications: e.target.value }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() =>
                          setDesktopForm((prev) => ({
                            ...prev,
                            extraComponents: prev.extraComponents.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  No extra components added.
                </div>
              )}
            </div>
          </div>
        ) : null}
        <div className="upload-action-grid" style={{ marginTop: 12 }}>
          <FileUploadCard
            label={
              <>
                Asset Image <span style={{ color: "#dc2626" }}>*</span>
              </>
            }
            inputRef={imageInputRef}
            accept="image/*"
            onFileChange={(file) => setSelectedImageFile(file)}
            hasAttachment={Boolean(selectedImageFile)}
            displayName={selectedImageFile ? selectedImageFile.name : "Asset image"}
            helperText={
              selectedImageFile
                ? "Ready to save with this image attached."
                : "Attach an image before creating the asset."
            }
            badge="IMG"
            ariaLabel="Asset image upload"
            title="Upload asset image"
            onRemove={
              selectedImageFile
                ? () => {
                    setSelectedImageFile(null);
                    if (imageInputRef.current) {
                      imageInputRef.current.value = "";
                    }
                  }
                : undefined
            }
          />
          <FileUploadCard
            label="Receiving Form (optional)"
            inputRef={receivingFormInputRef}
            accept=".pdf,image/*"
            onFileChange={(file) => setSelectedReceivingFormFile(file)}
            hasAttachment={Boolean(selectedReceivingFormFile)}
            displayName={selectedReceivingFormFile ? selectedReceivingFormFile.name : "Receiving form"}
            helperText={
              selectedReceivingFormFile
                ? "Ready to save with this receiving form attached."
                : "Optional admin receipt form."
            }
            badge="PDF"
            ariaLabel="Receiving form upload"
            title="Upload receiving form"
            onRemove={
              selectedReceivingFormFile
                ? () => {
                    setSelectedReceivingFormFile(null);
                    if (receivingFormInputRef.current) {
                      receivingFormInputRef.current.value = "";
                    }
                  }
                : undefined
            }
          />
          <FileUploadCard
            label="Turnover Form (optional)"
            inputRef={turnoverFormInputRef}
            accept=".pdf,image/*"
            onFileChange={(file) => {
              setSelectedTurnoverFormFile(file);
              if (file) {
                setForm((prev) => ({ ...prev, status: "Assigned" }));
              }
            }}
            hasAttachment={Boolean(selectedTurnoverFormFile)}
            displayName={selectedTurnoverFormFile ? selectedTurnoverFormFile.name : "Turnover form"}
            helperText={
              selectedTurnoverFormFile
                ? "Ready to save with this signed turnover form attached."
                : "Optional signed turnover document."
            }
            badge="PDF"
            ariaLabel="Signed turnover form upload"
            title="Upload signed turnover form"
            onRemove={
              selectedTurnoverFormFile
                ? () => {
                    setSelectedTurnoverFormFile(null);
                    if (turnoverFormInputRef.current) {
                      turnoverFormInputRef.current.value = "";
                    }
                  }
                : undefined
            }
          />
          <div className="form-action-field">
            <label className="form-action-label">Action</label>
            <button
              className="btn-primary form-action-button"
              onClick={handleCreate}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Create Asset"}
            </button>
            <div className="form-action-helper">Create and save this asset record</div>
          </div>
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
                placeholder="Search asset, serial, assignee..."
                value={search}
                onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            className="input-base status-select"
            style={
              statusFilter
                ? {
                    color:
                      statusStyles[statusFilter as HardwareStatus]?.color ?? "var(--foreground)",
                    borderColor:
                      statusStyles[statusFilter as HardwareStatus]?.borderColor ?? "#e8eff9",
                    fontWeight: 600,
                  }
                : undefined
            }
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="" style={{ backgroundColor: "#ffffff", color: "var(--foreground)" }}>
              All Statuses
            </option>
            {statuses.map((status) => (
              <option
                key={status}
                value={status}
                style={{
                  backgroundColor: "#ffffff",
                  color: statusStyles[status]?.color ?? "var(--foreground)",
                }}
              >
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
                        row.location ??
                        row.locationPersonAssigned ??
                        ""
                      }
                      onChange={(e) =>
                        queueInlineSave(row._id, { locationPersonAssigned: e.target.value })
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
                    <input
                      className="input-base"
                      style={smallInput}
                      value={
                        inlineEdits[row._id]?.personAssigned ??
                        inlineEdits[row._id]?.turnoverTo ??
                        row.assignedTo ??
                        row.turnoverTo ??
                        ""
                      }
                      onChange={(e) => queueInlineSave(row._id, { personAssigned: e.target.value })}
                      onBlur={() => saveInline(row._id)}
                      placeholder="Turnover to"
                    />
                  </td>
                  <td>
                    <select
                      className="input-base status-select"
                      style={{
                        ...smallInput,
                        background: "#ffffff",
                        color:
                          statusStyles[
                            (inlineEdits[row._id]?.status ?? row.status) as HardwareStatus
                          ]?.color ?? "var(--foreground)",
                        borderColor:
                          statusStyles[
                            (inlineEdits[row._id]?.status ?? row.status) as HardwareStatus
                          ]?.borderColor ?? "#e8eff9",
                        fontWeight: 600,
                      }}
                      value={(inlineEdits[row._id]?.status ?? row.status) as FormState["status"]}
                      onChange={(e) =>
                        queueInlineSave(row._id, {
                          status: e.target.value as FormState["status"],
                        })
                      }
                      onBlur={() => saveInline(row._id)}
                    >
                      {statuses.map((status) => (
                        <option
                          key={status}
                          value={status}
                          style={{
                            backgroundColor: "#ffffff",
                            color: statusStyles[status]?.color ?? "var(--foreground)",
                          }}
                        >
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {(() => {
                      const currentStatus = (inlineEdits[row._id]?.status ?? row.status) as HardwareStatus;
                      const isBorrowed = currentStatus === "Borrowed";
                      return (
                        <input
                          className="input-base"
                          style={{
                            ...smallInput,
                            ...(isBorrowed
                              ? {}
                              : { background: "#f8fafc", color: "#94a3b8", cursor: "not-allowed" }),
                          }}
                          value={
                            isBorrowed
                              ? (inlineEdits[row._id]?.borrower ??
                                (row as Record<string, unknown>).borrower?.toString() ??
                                "")
                              : "none"
                          }
                          placeholder={isBorrowed ? "Enter borrower" : "Set status to Borrowed first"}
                          disabled={!isBorrowed}
                          onChange={(e) => queueInlineSave(row._id, { borrower: e.target.value })}
                          onBlur={() => saveInline(row._id)}
                        />
                      );
                    })()}
                  </td>
                </tr>
              ))}
              {!tableRows.length ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "#6b7280", padding: 16 }}>
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

