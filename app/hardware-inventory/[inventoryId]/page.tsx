"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
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
const hardwareInventoryPendingToastKey = "hardware-inventory:pending-toast";

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
  borrowerEmail: string;
  returnDueDate: string;
  assignedDate: string;
  purchaseDate: string;
  warranty: string;
  remarks: string;
};

type WorkstationComponent = {
  assetTag?: string;
  componentType?: string;
  specifications?: string;
  imageStorageId?: Id<"_storage">;
};

type ActivityTone = "blue" | "green" | "amber" | "red" | "slate";

type HardwareActivityRecord = {
  _id: string;
  inventoryId?: string;
  assetTag: string;
  assetNameDescription?: string;
  eventType: string;
  message: string;
  relatedPerson?: string;
  location?: string;
  status?: string;
  createdAt: number;
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

function formatActivityTime(value: number) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActivityMeta(eventType: string): {
  label: string;
  tone: ActivityTone;
  urgent?: boolean;
} {
  switch (eventType) {
    case "asset_created":
      return { label: "Created", tone: "blue" };
    case "asset_updated":
      return { label: "Updated", tone: "slate" };
    case "status_changed":
      return { label: "Status Change", tone: "slate" };
    case "asset_assigned":
      return { label: "Assigned", tone: "blue" };
    case "asset_borrowed":
      return { label: "Borrowed", tone: "amber", urgent: true };
    case "asset_returned":
      return { label: "Returned", tone: "green" };
    case "asset_for_repair":
      return { label: "For Repair", tone: "red", urgent: true };
    case "asset_retired":
      return { label: "Retired", tone: "slate" };
    case "reservation_created":
      return { label: "Reserved", tone: "blue" };
    case "reservation_claimed":
      return { label: "Claimed", tone: "green" };
    case "reservation_cancelled":
      return { label: "Reservation Cancelled", tone: "amber" };
    case "receiving_form_uploaded":
      return { label: "Receiving Form", tone: "green" };
    case "turnover_form_uploaded":
      return { label: "Turnover Form", tone: "blue" };
    case "drone_flight_report_uploaded":
      return { label: "Flight Report", tone: "blue" };
    case "return_reminder_sent":
      return { label: "Reminder Sent", tone: "amber" };
    case "asset_deleted":
      return { label: "Deleted", tone: "red", urgent: true };
    default:
      return { label: "Activity", tone: "slate" };
  }
}

function renderActivityIcon(eventType: string) {
  switch (eventType) {
    case "reservation_created":
    case "reservation_claimed":
    case "reservation_cancelled":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 4H17V8H7V4Z" stroke="currentColor" strokeWidth="2" />
          <path d="M7 12H17V20H7V12Z" stroke="currentColor" strokeWidth="2" />
          <path d="M9 8V12" stroke="currentColor" strokeWidth="2" />
          <path d="M15 8V12" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "asset_borrowed":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 5L19 12L12 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "asset_returned":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M19 12H5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 19L5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "asset_for_repair":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M14 6L18 10L10 18H6V14L14 6Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "receiving_form_uploaded":
    case "turnover_form_uploaded":
    case "drone_flight_report_uploaded":
    case "return_reminder_sent":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 3H16L20 7V21H4V3H8Z" stroke="currentColor" strokeWidth="2" />
          <path d="M16 3V7H20" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
  }
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

function WorkstationComponentCard({ component }: { component: WorkstationComponent }) {
  const componentImageUrl = useQuery(
    api.hardwareInventory.getImageUrl,
    component.imageStorageId ? { storageId: component.imageStorageId } : "skip",
  );

  return (
    <div className="saas-card" style={{ padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
          {formatText(component.componentType)}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{formatText(component.assetTag)}</div>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--muted-strong)", whiteSpace: "pre-wrap" }}>
        {formatText(component.specifications)}
      </div>
      {component.imageStorageId ? (
        componentImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={componentImageUrl}
            alt={`${component.assetTag ?? component.componentType ?? "Component"} asset image`}
            style={{
              width: "100%",
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
    </div>
  );
}

function EditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div className="form-action-label">{label}</div>
      {children}
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
  const returnDronePackage = useMutation(
    (api.hardwareInventory as Record<string, unknown>)["returnDronePackage"] as never,
  ) as unknown as (args: {
    inventoryIds: never[];
    reportTargetInventoryId: never;
    droneFlightReportStorageId: never;
  }) => Promise<unknown>;
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
  const droneFlightReportStorageId = (row as Record<string, unknown> | undefined)
    ?.droneFlightReportStorageId as Id<"_storage"> | undefined;
  const receivingFormUrl = useQuery(
    api.hardwareInventory.getImageUrl,
    row && receivingFormStorageId ? { storageId: receivingFormStorageId } : "skip",
  );
  const droneFlightReportUrl = useQuery(
    api.hardwareInventory.getImageUrl,
    row && droneFlightReportStorageId ? { storageId: droneFlightReportStorageId } : "skip",
  );
  const assetActivity = useQuery(
    (api.hardwareInventory as Record<string, unknown>)["listRecentActivity"] as never,
    row ? ({ limit: 20, inventoryId } as never) : "skip",
  ) as unknown as HardwareActivityRecord[] | undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReturningDrone, setIsReturningDrone] = useState(false);
  const [returnDroneError, setReturnDroneError] = useState("");
  const [actionToast, setActionToast] = useState<{ id: number; message: string } | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [clearImage, setClearImage] = useState(false);
  const [selectedReceivingFormFile, setSelectedReceivingFormFile] = useState<File | null>(null);
  const [clearReceivingForm, setClearReceivingForm] = useState(false);
  const [selectedTurnoverFormFile, setSelectedTurnoverFormFile] = useState<File | null>(null);
  const [clearTurnoverForm, setClearTurnoverForm] = useState(false);
  const [selectedDroneFlightReportFile, setSelectedDroneFlightReportFile] = useState<File | null>(null);
  const [clearDroneFlightReport, setClearDroneFlightReport] = useState(false);
  const [selectedReturnDroneFlightReportFile, setSelectedReturnDroneFlightReportFile] = useState<File | null>(
    null,
  );
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const receivingFormInputRef = useRef<HTMLInputElement | null>(null);
  const turnoverFormInputRef = useRef<HTMLInputElement | null>(null);
  const droneFlightReportInputRef = useRef<HTMLInputElement | null>(null);
  const returnDroneFlightReportInputRef = useRef<HTMLInputElement | null>(null);
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
    borrowerEmail: "",
    returnDueDate: "",
    assignedDate: "",
    purchaseDate: "",
    warranty: "",
    remarks: "",
  });

  useEffect(() => {
    if (!actionToast) return;

    const timeout = window.setTimeout(() => {
      setActionToast(null);
    }, 3000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [actionToast]);

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
  const isDroneAsset = asset.assetType === "Drone";
  const workstationComponents =
    (((asset as Record<string, unknown>).workstationComponents as WorkstationComponent[] | undefined) ?? []).filter(
      (component) => component.assetTag || component.componentType || component.specifications,
    );

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
      borrowerEmail: ((asset as Record<string, unknown>).borrowerEmail as string | undefined) ?? "",
      returnDueDate: ((asset as Record<string, unknown>).returnDueDate as string | undefined) ?? "",
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
    setSelectedDroneFlightReportFile(null);
    setClearDroneFlightReport(false);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    if (receivingFormInputRef.current) {
      receivingFormInputRef.current.value = "";
    }
    if (turnoverFormInputRef.current) {
      turnoverFormInputRef.current.value = "";
    }
    if (droneFlightReportInputRef.current) {
      droneFlightReportInputRef.current.value = "";
    }
    setIsEditing(true);
  }

  function showActionToast(message: string, persistForNextPage = false) {
    if (persistForNextPage) {
      try {
        window.sessionStorage.setItem(hardwareInventoryPendingToastKey, message);
      } catch {
        // If storage is unavailable, let the action continue without cross-page toast handoff.
      }
      return;
    }

    setActionToast({ id: Date.now(), message });
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

    const isDroneEdit = form.assetType.trim().toLowerCase() === "drone";
    const isReturningBorrowedDrone = isDroneEdit && assetStatus === "Borrowed" && form.status !== "Borrowed";
    const hasCurrentDroneFlightReport = Boolean(droneFlightReportStorageId && !clearDroneFlightReport);
    if (form.status === "Borrowed") {
      if (!form.borrower.trim()) {
        setFormError("Borrower Name is required when status is Borrowed.");
        return;
      }
      if (!form.borrowerEmail.trim()) {
        setFormError("Borrower Microsoft email is required when status is Borrowed.");
        return;
      }
      if (!form.returnDueDate) {
        setFormError("Return Due Date is required when status is Borrowed.");
        return;
      }
    }
    if (isReturningBorrowedDrone && !selectedDroneFlightReportFile && !hasCurrentDroneFlightReport) {
      setFormError("Drone flight report is required when returning a borrowed drone.");
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
      let droneFlightReportStorageIdToSave: Id<"_storage"> | undefined;
      if (selectedDroneFlightReportFile) {
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: "POST",
          headers: {
            "Content-Type": selectedDroneFlightReportFile.type || "application/octet-stream",
          },
          body: selectedDroneFlightReportFile,
        });
        if (!uploadResult.ok) {
          throw new Error("Drone flight report upload failed.");
        }

        const uploadData = (await uploadResult.json()) as { storageId?: Id<"_storage"> };
        if (!uploadData.storageId) {
          throw new Error("Drone flight report upload failed.");
        }
        droneFlightReportStorageIdToSave = uploadData.storageId;
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
        borrower: form.status === "Borrowed" ? form.borrower || undefined : undefined,
        borrowerEmail: form.status === "Borrowed" ? form.borrowerEmail || undefined : undefined,
        returnDueDate: form.status === "Borrowed" ? form.returnDueDate || undefined : undefined,
        assignedDate: isDesktopAsset ? undefined : form.assignedDate,
        turnoverDate: isDesktopAsset ? form.assignedDate || undefined : undefined,
        purchaseDate: form.purchaseDate,
        warranty: form.warranty,
        remarks: form.remarks || undefined,
        imageStorageId,
        receivingFormStorageId: receivingFormStorageIdToSave,
        turnoverFormStorageId,
        droneFlightReportStorageId: droneFlightReportStorageIdToSave,
        clearImage,
        clearReceivingForm,
        clearTurnoverForm,
        clearDroneFlightReport,
      });
      setSelectedImageFile(null);
      setClearImage(false);
      setSelectedReceivingFormFile(null);
      setClearReceivingForm(false);
      setSelectedTurnoverFormFile(null);
      setClearTurnoverForm(false);
      setSelectedDroneFlightReportFile(null);
      setClearDroneFlightReport(false);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
      if (receivingFormInputRef.current) {
        receivingFormInputRef.current.value = "";
      }
      if (turnoverFormInputRef.current) {
        turnoverFormInputRef.current.value = "";
      }
      if (droneFlightReportInputRef.current) {
        droneFlightReportInputRef.current.value = "";
      }
      setIsEditing(false);
      showActionToast("Asset details updated successfully.");
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
      showActionToast(`Asset ${asset.assetTag} deleted successfully.`, true);
      router.push("/hardware-inventory");
    } catch (error) {
      console.error(error);
      window.alert("Delete failed. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleReturnDroneKit() {
    if (!isDroneAsset || assetStatus !== "Borrowed") {
      return;
    }
    if (!selectedReturnDroneFlightReportFile) {
      setReturnDroneError("Flight report is required before returning this drone kit.");
      return;
    }

    try {
      setIsReturningDrone(true);
      setReturnDroneError("");

      const uploadUrl = await generateUploadUrl();
      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": selectedReturnDroneFlightReportFile.type || "application/octet-stream",
        },
        body: selectedReturnDroneFlightReportFile,
      });
      if (!uploadResult.ok) {
        throw new Error("Drone flight report upload failed.");
      }

      const uploadData = (await uploadResult.json()) as { storageId?: Id<"_storage"> };
      if (!uploadData.storageId) {
        throw new Error("Drone flight report upload failed.");
      }

      await returnDronePackage({
        inventoryIds: [inventoryId as never],
        reportTargetInventoryId: inventoryId as never,
        droneFlightReportStorageId: uploadData.storageId as never,
      });

      setSelectedReturnDroneFlightReportFile(null);
      setReturnDroneError("");
      if (returnDroneFlightReportInputRef.current) {
        returnDroneFlightReportInputRef.current.value = "";
      }
      showActionToast("Drone kit returned and flight report uploaded successfully.");
      router.refresh();
    } catch (error) {
      setReturnDroneError(
        error instanceof Error ? error.message : "Unable to return drone kit right now.",
      );
    } finally {
      setIsReturningDrone(false);
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
  const isDroneAssetSelected = form.assetType.trim().toLowerCase() === "drone";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {actionToast ? (
        <div className="floating-toast floating-toast-success" role="status" aria-live="polite">
          {actionToast.message}
        </div>
      ) : null}
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
          {isDroneAsset && workstationComponents.length ? (
            <section className="panel" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>Drone Kit Components</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 10,
                }}
              >
                {workstationComponents.map((component, index) => (
                  <WorkstationComponentCard
                    key={`${component.assetTag ?? component.componentType ?? "component"}-${index}`}
                    component={component}
                  />
                ))}
              </div>
            </section>
          ) : null}
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
          {isDroneAsset ? (
            <section className="panel" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>
                Drone Flight Report
              </div>
              {droneFlightReportStorageId ? (
                droneFlightReportUrl ? (
                  <a
                    href={droneFlightReportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary"
                    style={{ display: "inline-block", textDecoration: "none" }}
                  >
                    Open Drone Flight Report
                  </a>
                ) : (
                  <div style={{ color: "var(--muted)" }}>Loading report...</div>
                )
              ) : (
                <div style={{ color: "var(--muted)" }}>
                  No drone flight report attached yet.
                </div>
              )}
            </section>
          ) : null}
          {isDroneAsset ? (
            <section className="panel" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>
                Drone Kit Borrowing
              </div>
              <div className="drone-package-card">
                <div className="drone-package-row">
                  <div className="drone-package-topline">
                    <div style={{ minWidth: 0 }}>
                      <div className="drone-package-borrower">
                        {formatText(asset.borrower ?? asset.turnoverTo)}
                      </div>
                      <div className="drone-package-meta">
                        <span>{asset.assetTag}</span>
                        <span>{formatText(asset.department)}</span>
                        <span>{assetStatus}</span>
                      </div>
                    </div>
                    <span
                      className={`drone-package-state ${
                        assetStatus === "Borrowed"
                          ? "drone-package-state-warning"
                          : "drone-package-state-complete"
                      }`}
                    >
                      {assetStatus === "Borrowed"
                        ? "Flight report required on return"
                        : "Ready for next borrowing"}
                    </span>
                  </div>
                  <div className="drone-package-meta-grid">
                    <div className="drone-package-meta-item">
                      <div className="drone-package-meta-label">Borrower</div>
                      <div className="drone-package-meta-value">
                        {formatText(asset.borrower ?? asset.turnoverTo)}
                      </div>
                    </div>
                    <div className="drone-package-meta-item">
                      <div className="drone-package-meta-label">Assigned Date</div>
                      <div className="drone-package-meta-value">{formatText(asset.assignedDate)}</div>
                    </div>
                    <div className="drone-package-meta-item">
                      <div className="drone-package-meta-label">Current Location</div>
                      <div className="drone-package-meta-value">
                        {formatText(asset.location ?? asset.locationPersonAssigned)}
                      </div>
                    </div>
                  </div>
                  {workstationComponents.length ? (
                    <div className="drone-package-parts">
                      {workstationComponents.map((component, index) => (
                        <span
                          key={`${component.assetTag ?? component.componentType ?? "drone-part"}-${index}`}
                          className="drone-package-part"
                        >
                          {formatText(component.componentType)}: {formatText(component.assetTag)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {assetStatus === "Borrowed" ? (
                    <div className="drone-return-form">
                      <FileUploadCard
                        label="Flight Report for Return"
                        inputRef={returnDroneFlightReportInputRef}
                        accept=".pdf,image/*"
                        onFileChange={(file) => {
                          setSelectedReturnDroneFlightReportFile(file);
                          if (file) {
                            setReturnDroneError("");
                          }
                        }}
                        hasAttachment={Boolean(selectedReturnDroneFlightReportFile)}
                        displayName={
                          selectedReturnDroneFlightReportFile
                            ? selectedReturnDroneFlightReportFile.name
                            : "Drone flight report"
                        }
                        helperText={
                          selectedReturnDroneFlightReportFile
                            ? "Flight report selected. Submit return to move the kit back to main storage."
                            : "Required before IT can return this drone kit."
                        }
                        badge="PDF"
                        ariaLabel="Drone return flight report upload"
                        onRemove={() => {
                          setSelectedReturnDroneFlightReportFile(null);
                          setReturnDroneError("");
                          if (returnDroneFlightReportInputRef.current) {
                            returnDroneFlightReportInputRef.current.value = "";
                          }
                        }}
                      />
                      {returnDroneError ? (
                        <div className="reservation-error">{returnDroneError}</div>
                      ) : null}
                      <div className="drone-return-actions">
                        <button
                          className="btn-primary"
                          type="button"
                          onClick={() => void handleReturnDroneKit()}
                          disabled={isReturningDrone}
                        >
                          {isReturningDrone ? "Returning..." : "Upload Flight Report & Return"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

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
              label="Borrower Microsoft Email"
              value={(asset as Record<string, unknown>).borrowerEmail as string | undefined}
            />
            <DetailItem
              label="Return Due Date"
              value={(asset as Record<string, unknown>).returnDueDate as string | undefined}
            />
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
          <section className="panel" style={{ padding: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 14 }}>Activity Log</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {assetActivity?.length ?? 0} event{assetActivity?.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="activity-feed">
              {(assetActivity ?? []).map((event) => {
                const meta = getActivityMeta(event.eventType);
                return (
                  <div key={event._id} className={`activity-feed-card${meta.urgent ? " urgent" : ""}`}>
                    <div className="activity-feed-main">
                      <div className={`activity-feed-icon tone-${meta.tone}`}>
                        {renderActivityIcon(event.eventType)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="activity-feed-topline">
                          <span className={`activity-feed-chip tone-${meta.tone}`}>{meta.label}</span>
                          <span className="activity-feed-time">{formatActivityTime(event.createdAt)}</span>
                        </div>
                        <div className="activity-feed-title">
                          {event.assetTag}
                          {event.assetNameDescription ? ` - ${event.assetNameDescription}` : ""}
                        </div>
                        <div className="activity-feed-message">{event.message}</div>
                        <div className="activity-feed-meta">
                          <span>{event.relatedPerson || "No person linked"}</span>
                          <span>{event.location || "-"}</span>
                          <span>{event.status || "-"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {!(assetActivity ?? []).length ? (
                <div className="activity-feed-empty">
                  No activity has been logged for this asset yet.
                </div>
              ) : null}
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
            <EditField label="Asset Tag">
              <input
                className="input-base input-readonly-tone"
                value={form.assetTag}
                placeholder="Asset Tag"
                readOnly
                aria-label="Asset tag (read only)"
              />
            </EditField>
            <EditField label="Asset Type">
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
            </EditField>
            <EditField label="Asset Name / Description">
              <input
                className="input-base"
                value={form.assetNameDescription}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, assetNameDescription: e.target.value }))
                }
                placeholder="Asset Name or Description"
              />
            </EditField>
            <EditField label="Specifications">
              <input
                className="input-base"
                value={form.specifications}
                onChange={(e) => setForm((prev) => ({ ...prev, specifications: e.target.value }))}
                placeholder="Specifications"
              />
            </EditField>
            <EditField label="Serial Number">
              <input
                className="input-base"
                value={form.serialNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
                placeholder="Serial Number"
              />
            </EditField>
            <EditField label="Location">
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
            </EditField>
            <EditField label="Turnover To">
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
            </EditField>
            <EditField label="Department">
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
            </EditField>
            <EditField label="Status">
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
            </EditField>
            <EditField label="Borrower">
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
            </EditField>
            <EditField label="Borrower Microsoft Email">
              <input
                className="input-base"
                type="email"
                value={canEditBorrower ? form.borrowerEmail : "none"}
                onChange={(e) => setForm((prev) => ({ ...prev, borrowerEmail: e.target.value }))}
                placeholder="name@company.com"
                disabled={!canEditBorrower}
                style={
                  canEditBorrower
                    ? undefined
                    : { background: "#f8fafc", color: "#94a3b8", cursor: "not-allowed" }
                }
              />
            </EditField>
            <EditField label="Return Due Date">
              <input
                className="input-base"
                type="date"
                value={canEditBorrower ? form.returnDueDate : ""}
                onChange={(e) => setForm((prev) => ({ ...prev, returnDueDate: e.target.value }))}
                disabled={!canEditBorrower}
                style={
                  canEditBorrower
                    ? undefined
                    : { background: "#f8fafc", color: "#94a3b8", cursor: "not-allowed" }
                }
              />
            </EditField>
            <EditField label={isDesktopAsset ? "Turnover Date" : "Assigned Date"}>
              <input
                className="input-base"
                type="date"
                value={form.assignedDate}
                onChange={(e) => setForm((prev) => ({ ...prev, assignedDate: e.target.value }))}
                placeholder={isDesktopAsset ? "Turnover Date (optional)" : "Assigned Date (optional)"}
              />
            </EditField>
            <EditField label="Purchase Date">
              <input
                className="input-base"
                type="date"
                value={form.purchaseDate}
                onChange={(e) => setForm((prev) => ({ ...prev, purchaseDate: e.target.value }))}
                placeholder="Purchase Date"
              />
            </EditField>
            <EditField label="Warranty">
              <input
                className="input-base"
                value={form.warranty}
                onChange={(e) => setForm((prev) => ({ ...prev, warranty: e.target.value }))}
                placeholder="Warranty"
              />
            </EditField>
            <EditField label="Remarks">
              <input
                className="input-base"
                value={form.remarks}
                onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
                placeholder="Remarks (optional)"
              />
            </EditField>
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
            {isDroneAssetSelected ? (
              <div style={{ display: "grid", gap: 6 }}>
                <FileUploadCard
                  label="Drone Flight Report"
                  inputRef={droneFlightReportInputRef}
                  accept=".pdf,image/*"
                  onFileChange={(file) => {
                    setSelectedDroneFlightReportFile(file);
                    if (file) {
                      setClearDroneFlightReport(false);
                    }
                  }}
                  hasAttachment={Boolean(
                    selectedDroneFlightReportFile ||
                      (droneFlightReportStorageId && !clearDroneFlightReport),
                  )}
                  displayName={
                    selectedDroneFlightReportFile
                      ? selectedDroneFlightReportFile.name
                      : droneFlightReportStorageId && !clearDroneFlightReport
                        ? "Current drone flight report"
                        : "Drone flight report"
                  }
                  helperText={
                    selectedDroneFlightReportFile
                      ? "New report selected. Save to replace the current report."
                      : droneFlightReportStorageId && !clearDroneFlightReport
                        ? "A drone flight report is already attached."
                        : "Required when returning a borrowed drone."
                  }
                  badge="PDF"
                  ariaLabel="Drone flight report upload"
                  onRemove={() => {
                    if (selectedDroneFlightReportFile) {
                      setSelectedDroneFlightReportFile(null);
                      if (droneFlightReportInputRef.current) {
                        droneFlightReportInputRef.current.value = "";
                      }
                      return;
                    }
                    if (droneFlightReportStorageId) {
                      setClearDroneFlightReport(true);
                    }
                  }}
                />
              </div>
            ) : null}
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
