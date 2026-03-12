"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import FileUploadCard from "./file-upload-card";
import { HARDWARE_STATUSES, type HardwareStatus } from "@/lib/hardwareStatuses";
import { HARDWARE_ASSET_TYPES, buildNextHardwareAssetTag } from "@/lib/hardwareAssetTypes";
import { HARDWARE_DEPARTMENTS } from "@/lib/hardwareDepartments";

const statuses = HARDWARE_STATUSES;
const assetTypeOptions = HARDWARE_ASSET_TYPES;
const departmentOptions = HARDWARE_DEPARTMENTS;
const locationOptions = ["MAIN", "MAIN STORAGE", "FOODLAND", "WAREHOUSE", "HYBRID"] as const;
const workstationTypes = ["Laptop", "Desktop/PC"] as const;
const specsTierOptions = ["LOW", "MID", "HIGH-END"] as const;
const componentTypeOptions = ["Monitor", "Headset", "Keyboard", "Mouse", "Speaker", "AVR", "Other"] as const;
const hardwareInventoryPendingToastKey = "hardware-inventory:pending-toast";

type RegisterMode = "general" | "workstation" | "droneKit";
type WorkstationType = (typeof workstationTypes)[number];
type SpecsTier = (typeof specsTierOptions)[number];
type ExtraComponent = {
  assetTag: string;
  componentType: string;
  specifications: string;
};

type DroneKitFormState = {
  receivedBy: string;
  receivedDate: string;
  droneUnitSerialNumber: string;
  droneUnitSpecs: string;
  batterySerialNumber: string;
  batterySpecs: string;
  propellerSpecs: string;
  chargerSerialNumber: string;
  chargerSpecs: string;
  controllerSerialNumber: string;
  controllerSpecs: string;
};

type DroneKitComponentImageFiles = {
  battery: File | null;
  propeller: File | null;
  charger: File | null;
  controller: File | null;
};

type DesktopFormState = {
  monitorAssetTag: string;
  monitorSerialNumber: string;
  monitorSpecs: string;
  monitorConsumables: string;
  systemUnitAssetTag: string;
  systemUnitSpecs: string;
  systemUnitMotherboard: string;
  systemUnitCpu: string;
  systemUnitRam: string;
  systemUnitHdd: string;
  systemUnitSsd: string;
  systemUnitGraphicsCard: string;
  systemUnitPsu: string;
  systemUnitCase: string;
  mouseAssetTag: string;
  mouseSerialNumber: string;
  mouseSpecs: string;
  keyboardAssetTag: string;
  keyboardSerialNumber: string;
  keyboardSpecs: string;
  extraComponents: ExtraComponent[];
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
  | "borrowerEmail"
  | "returnDueDate"
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
  borrower: string;
  borrowerEmail: string;
  returnDueDate: string;
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
  borrower: "",
  borrowerEmail: "",
  returnDueDate: "",
  assignedDate: "",
  purchaseDate: "",
  warranty: "",
  remarks: "",
};

const defaultDesktopForm: DesktopFormState = {
  monitorAssetTag: "",
  monitorSerialNumber: "",
  monitorSpecs: "",
  monitorConsumables: "",
  systemUnitAssetTag: "",
  systemUnitSpecs: "",
  systemUnitMotherboard: "",
  systemUnitCpu: "",
  systemUnitRam: "",
  systemUnitHdd: "",
  systemUnitSsd: "",
  systemUnitGraphicsCard: "",
  systemUnitPsu: "",
  systemUnitCase: "",
  mouseAssetTag: "",
  mouseSerialNumber: "",
  mouseSpecs: "",
  keyboardAssetTag: "",
  keyboardSerialNumber: "",
  keyboardSpecs: "",
  extraComponents: [],
};

const defaultDroneKitForm: DroneKitFormState = {
  receivedBy: "",
  receivedDate: "",
  droneUnitSerialNumber: "",
  droneUnitSpecs: "",
  batterySerialNumber: "",
  batterySpecs: "",
  propellerSpecs: "",
  chargerSerialNumber: "",
  chargerSpecs: "",
  controllerSerialNumber: "",
  controllerSpecs: "",
};

const defaultDroneKitComponentImageFiles: DroneKitComponentImageFiles = {
  battery: null,
  propeller: null,
  charger: null,
  controller: null,
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

const DRONE_KIT_DEFAULT_DEPARTMENT = "IT OPERATIONS";

function formatValue(value?: string) {
  if (!value) return "-";
  return value;
}

function buildDesktopSpecificationsSummary(args: {
  specsTier?: string;
  monitorAssetTag?: string;
  monitorSerialNumber?: string;
  monitorSpecs?: string;
  monitorConsumables?: string;
  systemUnitAssetTag?: string;
  systemUnitSpecs?: string;
  mouseAssetTag?: string;
  mouseSerialNumber?: string;
  mouseSpecs?: string;
  keyboardAssetTag?: string;
  keyboardSerialNumber?: string;
  keyboardSpecs?: string;
  extraComponents: ExtraComponent[];
}) {
  const summaryParts = [
    args.specsTier ? `Specs Tier: ${args.specsTier}` : "",
    args.systemUnitSpecs
      ? `System Unit${args.systemUnitAssetTag ? ` (${args.systemUnitAssetTag})` : ""}: ${args.systemUnitSpecs}`
      : "",
    args.monitorSpecs
      ? `Monitor${args.monitorAssetTag ? ` (${args.monitorAssetTag})` : ""}: ${args.monitorSpecs}`
      : "",
    args.monitorSerialNumber ? `Monitor Serial Number: ${args.monitorSerialNumber}` : "",
    args.monitorConsumables ? `Monitor Consumables: ${args.monitorConsumables}` : "",
    args.mouseSpecs
      ? `Mouse${args.mouseAssetTag ? ` (${args.mouseAssetTag})` : ""}: ${args.mouseSpecs}`
      : "",
    args.mouseSerialNumber ? `Mouse Serial Number: ${args.mouseSerialNumber}` : "",
    args.keyboardSpecs
      ? `Keyboard${args.keyboardAssetTag ? ` (${args.keyboardAssetTag})` : ""}: ${args.keyboardSpecs}`
      : "",
    args.keyboardSerialNumber ? `Keyboard Serial Number: ${args.keyboardSerialNumber}` : "",
    args.extraComponents.length
      ? `Extra Components: ${args.extraComponents
          .map((component) => `${component.componentType} (${component.assetTag})`)
          .join(", ")}`
      : "",
  ].filter(Boolean);

  return summaryParts.join(" | ");
}

function buildSystemUnitSpecs(args: Pick<
  DesktopFormState,
  | "systemUnitSpecs"
  | "systemUnitMotherboard"
  | "systemUnitCpu"
  | "systemUnitRam"
  | "systemUnitHdd"
  | "systemUnitSsd"
  | "systemUnitGraphicsCard"
  | "systemUnitPsu"
  | "systemUnitCase"
>) {
  if (args.systemUnitSpecs.trim()) {
    return args.systemUnitSpecs.trim();
  }

  const specParts = [
    `MOTHERBOARD: ${args.systemUnitMotherboard.trim()}`,
    `CPU: ${args.systemUnitCpu.trim()}`,
    `RAM: ${args.systemUnitRam.trim()}`,
    `HDD: ${args.systemUnitHdd.trim()}`,
    `SSD: ${args.systemUnitSsd.trim()}`,
    `GRAPHICS CARD: ${args.systemUnitGraphicsCard.trim()}`,
    `PSU: ${args.systemUnitPsu.trim()}`,
    `CASE: ${args.systemUnitCase.trim()}`,
  ];

  return specParts.join(" | ");
}

function resolveExtraComponentAssetType(componentType?: string) {
  switch (componentType) {
    case "Monitor":
      return "Monitor";
    case "Headset":
      return "Headset";
    case "Keyboard":
      return "Keyboard";
    case "Mouse":
      return "Mouse";
    case "Speaker":
      return "Speaker";
    case "AVR":
      return "Audio Visual Equipment";
    case "Other":
    default:
      return "Other IT Asset";
  }
}

function collectReservedAssetTags(
  rows: Array<{
    assetTag?: string;
    desktopMonitorAssetTag?: string;
    desktopSystemUnitAssetTag?: string;
    desktopMouseAssetTag?: string;
    desktopKeyboardAssetTag?: string;
    workstationComponents?: { assetTag?: string }[];
  }>,
) {
  const tags: string[] = [];

  for (const row of rows) {
    const rowTags = [
      row.assetTag,
      row.desktopMonitorAssetTag,
      row.desktopSystemUnitAssetTag,
      row.desktopMouseAssetTag,
      row.desktopKeyboardAssetTag,
      ...(row.workstationComponents?.map((component) => component.assetTag) ?? []),
    ];

    for (const tag of rowTags) {
      const next = tag?.trim();
      if (next) {
        tags.push(next);
      }
    }
  }

  return tags;
}

function buildDesktopGeneratedTags(existingTags: string[], extraComponents: ExtraComponent[]) {
  const reservedTags = [...existingTags];
  const nextTag = (assetType: string) => {
    const tag = buildNextHardwareAssetTag(assetType, reservedTags);
    if (tag) {
      reservedTags.push(tag);
    }
    return tag;
  };

  const systemUnitAssetTag = nextTag("Desktop/PC");
  const monitorAssetTag = nextTag("Monitor");
  const mouseAssetTag = nextTag("Mouse");
  const keyboardAssetTag = nextTag("Keyboard");
  const mainAssetTag = systemUnitAssetTag ? `${systemUnitAssetTag}-SET` : "";
  const extraComponentsWithTags = extraComponents.map((component) => ({
    ...component,
    assetTag: nextTag(resolveExtraComponentAssetType(component.componentType)),
  }));

  return {
    mainAssetTag,
    monitorAssetTag,
    systemUnitAssetTag,
    mouseAssetTag,
    keyboardAssetTag,
    extraComponents: extraComponentsWithTags,
  };
}

function buildDroneKitGeneratedTags(existingTags: string[]) {
  const reservedTags = [...existingTags];
  const nextTag = (assetType: string) => {
    const tag = buildNextHardwareAssetTag(assetType, reservedTags);
    if (tag) {
      reservedTags.push(tag);
    }
    return tag;
  };

  const droneUnitAssetTag = nextTag("Drone");
  const batteryAssetTag = nextTag("Drone Battery");
  const propellerAssetTag = nextTag("Drone Propeller");
  const chargerAssetTag = nextTag("Drone Charger");
  const controllerAssetTag = nextTag("Drone Controller");
  const kitAssetTag = droneUnitAssetTag ? `${droneUnitAssetTag}-KIT` : "";

  return {
    kitAssetTag,
    droneUnitAssetTag,
    batteryAssetTag,
    propellerAssetTag,
    chargerAssetTag,
    controllerAssetTag,
  };
}

function buildDroneKitSpecificationsSummary(args: {
  droneUnitAssetTag?: string;
  droneUnitSpecs?: string;
  batteryAssetTag?: string;
  batterySpecs?: string;
  batterySerialNumber?: string;
  propellerAssetTag?: string;
  propellerSpecs?: string;
  chargerAssetTag?: string;
  chargerSpecs?: string;
  chargerSerialNumber?: string;
  controllerAssetTag?: string;
  controllerSpecs?: string;
  controllerSerialNumber?: string;
}) {
  const summaryParts = [
    args.droneUnitSpecs
      ? `Drone Unit${args.droneUnitAssetTag ? ` (${args.droneUnitAssetTag})` : ""}: ${args.droneUnitSpecs}`
      : "",
    args.batterySpecs
      ? `Battery${args.batteryAssetTag ? ` (${args.batteryAssetTag})` : ""}: ${args.batterySpecs}`
      : "",
    args.batterySerialNumber ? `Battery Serial Number: ${args.batterySerialNumber}` : "",
    args.propellerSpecs
      ? `Propeller${args.propellerAssetTag ? ` (${args.propellerAssetTag})` : ""}: ${args.propellerSpecs}`
      : "",
    args.chargerSpecs
      ? `Charger${args.chargerAssetTag ? ` (${args.chargerAssetTag})` : ""}: ${args.chargerSpecs}`
      : "",
    args.chargerSerialNumber ? `Charger Serial Number: ${args.chargerSerialNumber}` : "",
    args.controllerSpecs
      ? `Controller${args.controllerAssetTag ? ` (${args.controllerAssetTag})` : ""}: ${args.controllerSpecs}`
      : "",
    args.controllerSerialNumber ? `Controller Serial Number: ${args.controllerSerialNumber}` : "",
  ].filter(Boolean);

  return summaryParts.join(" | ");
}

export default function HardwareInventoryPage() {
  const router = useRouter();
  const [registerMode, setRegisterMode] = useState<RegisterMode>("general");
  const [workstationType, setWorkstationType] = useState<WorkstationType>("Laptop");
  const [specTier, setSpecTier] = useState<SpecsTier | "">("");
  const [desktopForm, setDesktopForm] = useState(defaultDesktopForm);
  const [droneKitForm, setDroneKitForm] = useState(defaultDroneKitForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState<{ id: number; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [droneKitComponentImageFiles, setDroneKitComponentImageFiles] = useState(
    defaultDroneKitComponentImageFiles,
  );
  const [selectedReceivingFormFile, setSelectedReceivingFormFile] = useState<File | null>(null);
  const [selectedTurnoverFormFile, setSelectedTurnoverFormFile] = useState<File | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("assetTag");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [inlineEdits, setInlineEdits] = useState<
    Record<string, { status: HardwareStatus; borrower: string; borrowerEmail: string; returnDueDate: string }>
  >({});
  const [inlineSavingId, setInlineSavingId] = useState<string>("");

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
  const assetTagSeedResult = useQuery(api.hardwareInventory.list, {
    sortKey: "assetTag",
    sortDir: "asc",
    page: 1,
    pageSize: 5000,
  });

  const createAsset = useMutation(api.hardwareInventory.create);
  const updateAsset = useMutation(api.hardwareInventory.update);
  const migrateLegacy = useMutation(api.hardwareInventory.migrateLegacy);
  const generateUploadUrl = useMutation(api.hardwareInventory.generateUploadUrl);

  const migrationRan = useRef(false);
  const formSectionRef = useRef<HTMLElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const batteryImageInputRef = useRef<HTMLInputElement | null>(null);
  const propellerImageInputRef = useRef<HTMLInputElement | null>(null);
  const chargerImageInputRef = useRef<HTMLInputElement | null>(null);
  const controllerImageInputRef = useRef<HTMLInputElement | null>(null);
  const receivingFormInputRef = useRef<HTMLInputElement | null>(null);
  const turnoverFormInputRef = useRef<HTMLInputElement | null>(null);
  const isDesktopWorkstation = registerMode === "workstation" && workstationType === "Desktop/PC";
  const isDroneKitMode = registerMode === "droneKit";

  useEffect(() => {
    if (migrationRan.current) return;
    if (!result?.items?.length) return;
    const needsMigration = result.items.some(
      (row) => {
        const legacyRow = row as Record<string, unknown>;
        const hasLegacyMonitorSlot =
          typeof legacyRow.desktopMonitorSlot === "string" && legacyRow.desktopMonitorSlot.trim().length > 0;
        const hasMonitorSerialNumber =
          typeof legacyRow.desktopMonitorSerialNumber === "string" &&
          legacyRow.desktopMonitorSerialNumber.trim().length > 0;
        return (
        !row.assetType ||
        !row.assetNameDescription ||
        !row.specifications ||
        !row.locationPersonAssigned ||
        !row.department ||
        !row.turnoverTo ||
        !row.warranty ||
        (hasLegacyMonitorSlot && !hasMonitorSerialNumber)
        );
      },
    );
    if (!needsMigration) return;

    migrationRan.current = true;
    void migrateLegacy();
  }, [result?.items, migrateLegacy]);
  useEffect(() => {
    if (!formSuccess) return;

    const timeout = window.setTimeout(() => {
      setFormSuccess(null);
    }, 3000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [formSuccess]);
  useEffect(() => {
    const pendingMessage = window.sessionStorage.getItem(hardwareInventoryPendingToastKey);
    if (!pendingMessage) return;

    window.sessionStorage.removeItem(hardwareInventoryPendingToastKey);
    setFormSuccess({ id: Date.now(), message: pendingMessage });
  }, []);

  const tableRows = result?.items ?? [];
  const knownAssetTags = collectReservedAssetTags(assetTagSeedResult?.items ?? []);
  const assetTypeForCreate =
    registerMode === "workstation" ? workstationType : isDroneKitMode ? "Drone" : form.assetType;
  const desktopGeneratedTags =
    assetTagSeedResult && isDesktopWorkstation
      ? buildDesktopGeneratedTags(knownAssetTags, desktopForm.extraComponents)
      : null;
  const droneKitGeneratedTags =
    assetTagSeedResult && isDroneKitMode
      ? buildDroneKitGeneratedTags(knownAssetTags)
      : null;
  const autoAssetTag = assetTagSeedResult
    ? isDesktopWorkstation
      ? desktopGeneratedTags?.mainAssetTag ?? ""
      : isDroneKitMode
        ? droneKitGeneratedTags?.kitAssetTag ?? ""
      : buildNextHardwareAssetTag(assetTypeForCreate, knownAssetTags)
    : "";

  const headerConfig: { label: string; key: SortKey | null }[] = [
    { label: "Asset Tag", key: "assetTag" },
    { label: "Asset Type", key: "assetType" },
    { label: "Asset Name / Specs", key: "assetNameDescription" },
    { label: "Location", key: "locationPersonAssigned" },
    { label: "Turnover to", key: "turnoverTo" },
    { label: "Status", key: "status" },
    { label: "Borrower", key: "borrower" },
    { label: "Microsoft Email", key: "borrowerEmail" },
    { label: "Return Due", key: "returnDueDate" },
  ];

  const totalPages = result?.totalPages ?? 1;
  const hasPreviousPage = page > 1;
  const hasNextPage = page < totalPages;

  function resolveRowStatus(row: (typeof tableRows)[number]) {
    const current = row.status as HardwareStatus;
    return statuses.includes(current) ? current : "Available";
  }

  function resolveRowBorrower(row: (typeof tableRows)[number]) {
    return ((row as Record<string, unknown>).borrower as string | undefined) ?? "";
  }

  function resolveRowBorrowerEmail(row: (typeof tableRows)[number]) {
    return ((row as Record<string, unknown>).borrowerEmail as string | undefined) ?? "";
  }

  function resolveRowReturnDueDate(row: (typeof tableRows)[number]) {
    return ((row as Record<string, unknown>).returnDueDate as string | undefined) ?? "";
  }

  function getInlineRowState(row: (typeof tableRows)[number]) {
    const key = String(row._id);
    const baseStatus = resolveRowStatus(row);
    const baseBorrower = resolveRowBorrower(row);
    const baseBorrowerEmail = resolveRowBorrowerEmail(row);
    const baseReturnDueDate = resolveRowReturnDueDate(row);
    return inlineEdits[key] ?? {
      status: baseStatus,
      borrower: baseBorrower,
      borrowerEmail: baseBorrowerEmail,
      returnDueDate: baseReturnDueDate,
    };
  }

  async function persistInlineUpdate(
    row: (typeof tableRows)[number],
    nextStatus: HardwareStatus,
    nextBorrower: string,
    nextBorrowerEmail: string,
    nextReturnDueDate: string,
  ) {
    const rowId = String(row._id);
    const locationPersonAssigned = row.locationPersonAssigned ?? row.location ?? "";
    const turnoverTo = row.assignedTo ?? row.turnoverTo ?? "Unassigned";
    const assetType = row.assetType ?? "";
    const assetNameDescription = row.assetNameDescription ?? "";
    const specifications = row.specifications ?? "";
    const department = row.department ?? "";
    const warranty = row.warranty ?? "";
    const serialNumber = row.serialNumber ?? "";

    if (
      !row.assetTag ||
      !assetType ||
      !assetNameDescription ||
      !specifications ||
      !serialNumber ||
      !locationPersonAssigned ||
      !department ||
      !warranty
    ) {
      setFormError("This row has incomplete data. Open Asset Details to complete required fields first.");
      return;
    }

    try {
      setInlineSavingId(rowId);
      setFormError("");
      await updateAsset({
        inventoryId: row._id,
        assetTag: row.assetTag,
        assetType,
        assetNameDescription,
        specifications,
        serialNumber,
        locationPersonAssigned,
        department,
        status: nextStatus,
        turnoverTo,
        borrower: nextStatus === "Borrowed" ? nextBorrower.trim() || undefined : undefined,
        borrowerEmail:
          nextStatus === "Borrowed" ? nextBorrowerEmail.trim() || undefined : undefined,
        returnDueDate: nextStatus === "Borrowed" ? nextReturnDueDate || undefined : undefined,
        personAssigned: row.assignedTo || undefined,
        assignedDate: row.assignedDate || undefined,
        turnoverDate: row.turnoverDate || undefined,
        purchaseDate: row.purchaseDate || undefined,
        warranty,
        remarks: row.remarks || undefined,
      });
      setFormSuccess({ id: Date.now(), message: `${row.assetTag} updated successfully.` });
    } catch (error) {
      setInlineEdits((prev) => ({
        ...prev,
        [rowId]: {
          status: resolveRowStatus(row),
          borrower: resolveRowBorrower(row),
          borrowerEmail: resolveRowBorrowerEmail(row),
          returnDueDate: resolveRowReturnDueDate(row),
        },
      }));
      setFormError(error instanceof Error ? error.message : "Unable to update asset row.");
    } finally {
      setInlineSavingId((current) => (current === rowId ? "" : current));
    }
  }

  async function handleInlineBorrowerCommit(row: (typeof tableRows)[number]) {
    const editState = getInlineRowState(row);
    const baseStatus = resolveRowStatus(row);
    const baseBorrower = resolveRowBorrower(row).trim();
    const baseBorrowerEmail = resolveRowBorrowerEmail(row).trim();
    const baseReturnDueDate = resolveRowReturnDueDate(row);

    if (editState.status !== "Borrowed") return;
    if (
      editState.status === baseStatus &&
      editState.borrower.trim() === baseBorrower &&
      editState.borrowerEmail.trim() === baseBorrowerEmail &&
      editState.returnDueDate === baseReturnDueDate
    ) {
      return;
    }
    await persistInlineUpdate(
      row,
      editState.status,
      editState.borrower,
      editState.borrowerEmail,
      editState.returnDueDate,
    );
  }

  const handleSort = (key: SortKey | null) => {
    if (!key) return;
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  async function uploadFileToStorage(file: File | null, failureMessage: string) {
    if (!file) {
      return undefined;
    }

    const uploadUrl = await generateUploadUrl();
    const uploadResult = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
    if (!uploadResult.ok) {
      throw new Error(failureMessage);
    }

    const uploadData = (await uploadResult.json()) as { storageId?: Id<"_storage"> };
    if (!uploadData.storageId) {
      throw new Error(failureMessage);
    }

    return uploadData.storageId;
  }

  async function handleCreate() {
    setFormError("");
    setFormSuccess(null);
    if (!assetTagSeedResult) {
      setFormError("Asset tags are still loading. Please wait a moment and try again.");
      return;
    }

    const systemUnitSpecsToSave = isDesktopWorkstation ? buildSystemUnitSpecs(desktopForm) : "";
    const assetTagToSave = autoAssetTag;
    const desktopExtraComponentsToSave = desktopGeneratedTags?.extraComponents ?? [];
    const assetTypeToSave =
      registerMode === "workstation" ? workstationType : isDroneKitMode ? "Drone" : form.assetType;
    const assetNameDescriptionToSave = isDesktopWorkstation
      ? "Desktop/PC Workstation"
      : isDroneKitMode
        ? "Drone Kit"
      : form.assetNameDescription;
    const droneKitSpecificationsToSave = isDroneKitMode
      ? buildDroneKitSpecificationsSummary({
          droneUnitAssetTag: droneKitGeneratedTags?.droneUnitAssetTag,
          droneUnitSpecs: droneKitForm.droneUnitSpecs,
          batteryAssetTag: droneKitGeneratedTags?.batteryAssetTag,
          batterySpecs: droneKitForm.batterySpecs,
          batterySerialNumber: droneKitForm.batterySerialNumber,
          propellerAssetTag: droneKitGeneratedTags?.propellerAssetTag,
          propellerSpecs: droneKitForm.propellerSpecs,
          chargerAssetTag: droneKitGeneratedTags?.chargerAssetTag,
          chargerSpecs: droneKitForm.chargerSpecs,
          chargerSerialNumber: droneKitForm.chargerSerialNumber,
          controllerAssetTag: droneKitGeneratedTags?.controllerAssetTag,
          controllerSpecs: droneKitForm.controllerSpecs,
          controllerSerialNumber: droneKitForm.controllerSerialNumber,
        })
      : "";
    const specificationsToSave = isDesktopWorkstation
      ? buildDesktopSpecificationsSummary({
          specsTier: specTier,
          monitorAssetTag: desktopGeneratedTags?.monitorAssetTag,
          monitorSerialNumber: desktopForm.monitorSerialNumber,
          monitorSpecs: desktopForm.monitorSpecs,
          monitorConsumables: desktopForm.monitorConsumables,
          systemUnitAssetTag: desktopGeneratedTags?.systemUnitAssetTag,
          systemUnitSpecs: systemUnitSpecsToSave,
          mouseAssetTag: desktopGeneratedTags?.mouseAssetTag,
          mouseSerialNumber: desktopForm.mouseSerialNumber,
          mouseSpecs: desktopForm.mouseSpecs,
          keyboardAssetTag: desktopGeneratedTags?.keyboardAssetTag,
          keyboardSerialNumber: desktopForm.keyboardSerialNumber,
          keyboardSpecs: desktopForm.keyboardSpecs,
          extraComponents: desktopExtraComponentsToSave,
        })
      : isDroneKitMode
        ? droneKitSpecificationsToSave
      : registerMode === "workstation" && specTier
        ? `[${specTier}] ${form.specifications}`
        : form.specifications;
    const serialNumberToSave = isDesktopWorkstation
      ? `${assetTagToSave}-SERIAL`
      : isDroneKitMode
        ? droneKitForm.droneUnitSerialNumber
        : form.serialNumber;
    const departmentToSave = isDroneKitMode ? DRONE_KIT_DEFAULT_DEPARTMENT : form.department;
    const personAssignedToSave = isDroneKitMode ? droneKitForm.receivedBy : form.personAssigned;
    const assignedDateToSave = isDroneKitMode
      ? droneKitForm.receivedDate
      : isDesktopWorkstation
        ? ""
        : form.assignedDate;
    const turnoverDateToSave = isDesktopWorkstation ? form.assignedDate || undefined : undefined;
    if (
      !assetTagToSave ||
      !assetTypeToSave ||
      !assetNameDescriptionToSave ||
      !specificationsToSave ||
      !serialNumberToSave ||
      !form.locationPersonAssigned ||
      !departmentToSave ||
      !form.status ||
      !form.warranty
    ) {
      const optionalHelpText = isDroneKitMode
        ? "Purchase Date, Remarks, and Received by are optional. Received Date is required."
        : `${isDesktopWorkstation ? "Turnover Date" : "Assigned Date"}, Purchase Date, and Remarks are optional.`;
      setFormError(
        `Required fields are missing. ${optionalHelpText}`,
      );
      return;
    }
    if (registerMode === "workstation" && !specTier) {
      setFormError("Specs Tier is required for workstation entries.");
      return;
    }
    if (isDroneKitMode) {
      if (
        !droneKitGeneratedTags?.droneUnitAssetTag ||
        !droneKitGeneratedTags?.batteryAssetTag ||
        !droneKitGeneratedTags?.propellerAssetTag ||
        !droneKitGeneratedTags?.chargerAssetTag ||
        !droneKitGeneratedTags?.controllerAssetTag
      ) {
        setFormError("Drone kit component asset tags are still generating. Please try again.");
        return;
      }
      if (
        !droneKitForm.receivedDate.trim() ||
        !droneKitForm.droneUnitSerialNumber.trim() ||
        !droneKitForm.droneUnitSpecs.trim() ||
        !droneKitForm.batterySpecs.trim() ||
        !droneKitForm.propellerSpecs.trim() ||
        !droneKitForm.chargerSpecs.trim() ||
        !droneKitForm.controllerSpecs.trim()
      ) {
        setFormError(
          "Drone kit requires Received Date, Drone Unit Serial Number, and specs for Drone Unit, Battery, Propeller, Charger, and Controller.",
        );
        return;
      }
      const missingDroneImageSections = [
        !selectedImageFile ? "Drone Unit" : "",
        !droneKitComponentImageFiles.battery ? "Battery" : "",
        !droneKitComponentImageFiles.propeller ? "Propeller" : "",
        !droneKitComponentImageFiles.charger ? "Charger" : "",
        !droneKitComponentImageFiles.controller ? "Controller" : "",
      ].filter(Boolean);
      if (missingDroneImageSections.length) {
        setFormError(
          `Drone kit requires asset images for ${missingDroneImageSections.join(", ")}.`,
        );
        return;
      }
    }
    if (isDesktopWorkstation) {
      if (
        !desktopGeneratedTags?.monitorAssetTag ||
        !desktopForm.monitorSerialNumber ||
        !desktopForm.monitorSpecs ||
        !desktopGeneratedTags?.systemUnitAssetTag ||
        !systemUnitSpecsToSave
      ) {
        setFormError(
          "Desktop/PC entries require monitor and system unit details.",
        );
        return;
      }
      if (!desktopGeneratedTags?.mouseAssetTag || !desktopGeneratedTags?.keyboardAssetTag) {
        setFormError("Mouse and Keyboard asset tags are still generating. Please try again.");
        return;
      }
      if (!desktopForm.mouseSpecs.trim() || !desktopForm.keyboardSpecs.trim()) {
        setFormError("Mouse and Keyboard specs are required for Desktop/PC entries.");
        return;
      }
      const invalidComponent = desktopExtraComponentsToSave.some(
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
    if (form.status === "Borrowed") {
      if (!form.borrower.trim()) {
        setFormError("Borrower Name is required when status is Borrowed.");
        return;
      }
      if (!form.borrowerEmail.trim()) {
        setFormError("Borrower email is required when status is Borrowed.");
        return;
      }
      if (!form.returnDueDate) {
        setFormError("Return Due Date is required when status is Borrowed.");
        return;
      }
    }

    try {
      setIsSaving(true);
      const imageStorageId = await uploadFileToStorage(selectedImageFile, "Image upload failed.");
      const batteryImageStorageId = isDroneKitMode
        ? await uploadFileToStorage(
            droneKitComponentImageFiles.battery,
            "Battery image upload failed.",
          )
        : undefined;
      const propellerImageStorageId = isDroneKitMode
        ? await uploadFileToStorage(
            droneKitComponentImageFiles.propeller,
            "Propeller image upload failed.",
          )
        : undefined;
      const chargerImageStorageId = isDroneKitMode
        ? await uploadFileToStorage(
            droneKitComponentImageFiles.charger,
            "Charger image upload failed.",
          )
        : undefined;
      const controllerImageStorageId = isDroneKitMode
        ? await uploadFileToStorage(
            droneKitComponentImageFiles.controller,
            "Controller image upload failed.",
          )
        : undefined;
      const receivingFormStorageId = await uploadFileToStorage(
        selectedReceivingFormFile,
        "Receiving form upload failed.",
      );
      const turnoverFormStorageId = await uploadFileToStorage(
        selectedTurnoverFormFile,
        "Signed turnover form upload failed.",
      );

      await createAsset({
        assetTag: assetTagToSave,
        assetType: assetTypeToSave,
        assetNameDescription: assetNameDescriptionToSave,
        specifications: specificationsToSave,
        serialNumber: serialNumberToSave,
        locationPersonAssigned: form.locationPersonAssigned,
        personAssigned: personAssignedToSave.trim() ? personAssignedToSave : undefined,
        department: departmentToSave,
        status: form.status,
        borrower: form.status === "Borrowed" ? form.borrower || undefined : undefined,
        borrowerEmail: form.status === "Borrowed" ? form.borrowerEmail || undefined : undefined,
        returnDueDate: form.status === "Borrowed" ? form.returnDueDate || undefined : undefined,
        assignedDate: assignedDateToSave || undefined,
        turnoverDate: turnoverDateToSave,
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
          ? desktopGeneratedTags?.monitorAssetTag || undefined
          : undefined,
        desktopMonitorSerialNumber: isDesktopWorkstation
          ? desktopForm.monitorSerialNumber || undefined
          : undefined,
        desktopMonitorSpecs: isDesktopWorkstation
          ? desktopForm.monitorSpecs || undefined
          : undefined,
        desktopMonitorConsumables: isDesktopWorkstation
          ? desktopForm.monitorConsumables || undefined
          : undefined,
        desktopSystemUnitAssetTag: isDesktopWorkstation
          ? desktopGeneratedTags?.systemUnitAssetTag || undefined
          : undefined,
        desktopSystemUnitSpecs: isDesktopWorkstation
          ? systemUnitSpecsToSave || undefined
          : undefined,
        desktopMouseAssetTag:
          isDesktopWorkstation ? desktopGeneratedTags?.mouseAssetTag || undefined : undefined,
        desktopMouseSerialNumber: isDesktopWorkstation
          ? desktopForm.mouseSerialNumber || undefined
          : undefined,
        desktopMouseSpecs: isDesktopWorkstation ? desktopForm.mouseSpecs || undefined : undefined,
        desktopKeyboardAssetTag: isDesktopWorkstation
          ? desktopGeneratedTags?.keyboardAssetTag || undefined
          : undefined,
        desktopKeyboardSerialNumber: isDesktopWorkstation
          ? desktopForm.keyboardSerialNumber || undefined
          : undefined,
        desktopKeyboardSpecs: isDesktopWorkstation
          ? desktopForm.keyboardSpecs || undefined
          : undefined,
        workstationComponents: isDesktopWorkstation
          ? desktopExtraComponentsToSave.map((component) => ({
              assetTag: component.assetTag.trim(),
              componentType: component.componentType.trim(),
              specifications: component.specifications.trim(),
            }))
          : isDroneKitMode
            ? [
                {
                  assetTag: droneKitGeneratedTags?.batteryAssetTag ?? "",
                  componentType: "Drone Battery",
                  specifications: droneKitForm.batterySerialNumber.trim()
                    ? `${droneKitForm.batterySpecs.trim()} | Serial: ${droneKitForm.batterySerialNumber.trim()}`
                    : droneKitForm.batterySpecs.trim(),
                  imageStorageId: batteryImageStorageId,
                },
                {
                  assetTag: droneKitGeneratedTags?.propellerAssetTag ?? "",
                  componentType: "Drone Propeller",
                  specifications: droneKitForm.propellerSpecs.trim(),
                  imageStorageId: propellerImageStorageId,
                },
                {
                  assetTag: droneKitGeneratedTags?.chargerAssetTag ?? "",
                  componentType: "Drone Charger",
                  specifications: droneKitForm.chargerSerialNumber.trim()
                    ? `${droneKitForm.chargerSpecs.trim()} | Serial: ${droneKitForm.chargerSerialNumber.trim()}`
                    : droneKitForm.chargerSpecs.trim(),
                  imageStorageId: chargerImageStorageId,
                },
                {
                  assetTag: droneKitGeneratedTags?.controllerAssetTag ?? "",
                  componentType: "Drone Controller",
                  specifications: droneKitForm.controllerSerialNumber.trim()
                    ? `${droneKitForm.controllerSpecs.trim()} | Serial: ${droneKitForm.controllerSerialNumber.trim()}`
                    : droneKitForm.controllerSpecs.trim(),
                  imageStorageId: controllerImageStorageId,
                },
              ]
          : undefined,
      });
      setForm(defaultForm);
      setDesktopForm(defaultDesktopForm);
      setDroneKitForm(defaultDroneKitForm);
      setSpecTier("");
      setSelectedImageFile(null);
      setDroneKitComponentImageFiles(defaultDroneKitComponentImageFiles);
      setSelectedReceivingFormFile(null);
      setSelectedTurnoverFormFile(null);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
      if (batteryImageInputRef.current) {
        batteryImageInputRef.current.value = "";
      }
      if (propellerImageInputRef.current) {
        propellerImageInputRef.current.value = "";
      }
      if (chargerImageInputRef.current) {
        chargerImageInputRef.current.value = "";
      }
      if (controllerImageInputRef.current) {
        controllerImageInputRef.current.value = "";
      }
      if (receivingFormInputRef.current) {
        receivingFormInputRef.current.value = "";
      }
      if (turnoverFormInputRef.current) {
        turnoverFormInputRef.current.value = "";
      }
      setPage(1);
      setFormSuccess({
        id: Date.now(),
        message: `Asset ${
          isDesktopWorkstation
            ? desktopGeneratedTags?.systemUnitAssetTag ?? assetTagToSave
            : isDroneKitMode
              ? droneKitGeneratedTags?.droneUnitAssetTag ?? assetTagToSave
              : assetTagToSave
        } created successfully.`,
      });
    } catch (error) {
      setFormSuccess(null);
      setFormError(error instanceof Error ? error.message : "Unable to save asset.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleEdit(inventoryId: Id<"hardwareInventory">) {
    router.push(`/hardware-inventory/${inventoryId}`);
  }

  return (
    <div>
      {formSuccess ? (
        <div className="floating-toast floating-toast-success" role="status" aria-live="polite">
          {formSuccess.message}
        </div>
      ) : null}
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
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>
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
            <button
              type="button"
              className={`register-pill-tab ${registerMode === "droneKit" ? "active" : ""}`}
              onClick={() => {
                setRegisterMode("droneKit");
                setSpecTier("");
                setForm((prev) => ({ ...prev, assetType: "Drone" }));
              }}
            >
              Add Drone Kit
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
          className="register-fields-grid"
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
              className="input-base input-readonly-tone"
              placeholder={
                assetTypeForCreate
                  ? assetTagSeedResult
                    ? "Generating asset tag"
                    : "Loading next asset tag"
                  : "Select asset type first"
              }
              value={autoAssetTag}
              readOnly
              aria-label={isDesktopWorkstation ? "Auto-generated main asset tag" : "Auto-generated asset tag"}
              style={{
                color: autoAssetTag ? "var(--foreground)" : "var(--muted)",
                fontWeight: autoAssetTag ? 700 : 500,
              }}
            />
            <div className="register-field-note">
              Generated automatically as IT-[TYPE]-0000.
            </div>
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Asset Type <span style={{ color: "#dc2626" }}>*</span>
            </label>
            {registerMode === "workstation" || isDroneKitMode ? (
              <input
                className="input-base input-readonly-tone"
                value={isDroneKitMode ? "Drone" : workstationType}
                readOnly
                aria-label={isDroneKitMode ? "Drone kit type" : "Workstation type"}
                style={{ color: "var(--foreground)", fontWeight: 600 }}
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
          {!isDesktopWorkstation && !isDroneKitMode ? (
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
          {!isDesktopWorkstation && !isDroneKitMode ? (
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
          {!isDesktopWorkstation && !isDroneKitMode ? (
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
          {!isDroneKitMode ? (
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
                  }))
                }
              />
            </div>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                Received by
              </label>
              <input
                className="input-base"
                placeholder="IT staff name"
                value={droneKitForm.receivedBy}
                onChange={(e) =>
                  setDroneKitForm((prev) => ({
                    ...prev,
                    receivedBy: e.target.value,
                  }))
                }
              />
            </div>
          )}
          {!isDroneKitMode ? (
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
          ) : null}
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Status <span style={{ color: "#dc2626" }}>*</span>
            </label>
              <select
                className="input-base status-select"
                style={{
                  background: statusStyles[form.status]?.background ?? "#ffffff",
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
          {!isDroneKitMode ? (
            <>
              <div style={{ display: "grid", gap: 4 }}>
                <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                  Borrower Name {form.status === "Borrowed" ? <span style={{ color: "#dc2626" }}>*</span> : null}
                </label>
                <input
                  className="input-base"
                  placeholder={form.status === "Borrowed" ? "Borrower Name" : "Available when status is Borrowed"}
                  value={form.status === "Borrowed" ? form.borrower : ""}
                  disabled={form.status !== "Borrowed"}
                  style={
                    form.status === "Borrowed"
                      ? undefined
                      : { background: "#f8fafc", color: "#94a3b8", cursor: "not-allowed" }
                  }
                  onChange={(e) => setForm((prev) => ({ ...prev, borrower: e.target.value }))}
                />
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                  Borrower Microsoft Email {form.status === "Borrowed" ? <span style={{ color: "#dc2626" }}>*</span> : null}
                </label>
                <input
                  className="input-base"
                  type="email"
                  placeholder={form.status === "Borrowed" ? "name@company.com" : "Available when status is Borrowed"}
                  value={form.status === "Borrowed" ? form.borrowerEmail : ""}
                  disabled={form.status !== "Borrowed"}
                  style={
                    form.status === "Borrowed"
                      ? undefined
                      : { background: "#f8fafc", color: "#94a3b8", cursor: "not-allowed" }
                  }
                  onChange={(e) => setForm((prev) => ({ ...prev, borrowerEmail: e.target.value }))}
                />
              </div>
              <div style={{ display: "grid", gap: 4 }}>
                <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                  Return Due Date {form.status === "Borrowed" ? <span style={{ color: "#dc2626" }}>*</span> : null}
                </label>
                <input
                  className="input-base"
                  type="date"
                  value={form.status === "Borrowed" ? form.returnDueDate : ""}
                  disabled={form.status !== "Borrowed"}
                  style={
                    form.status === "Borrowed"
                      ? undefined
                      : { background: "#f8fafc", color: "#94a3b8", cursor: "not-allowed" }
                  }
                  onChange={(e) => setForm((prev) => ({ ...prev, returnDueDate: e.target.value }))}
                />
              </div>
            </>
          ) : null}
          {isDroneKitMode ? (
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                Received Date <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                className="input-base"
                type="date"
                value={droneKitForm.receivedDate}
                onChange={(e) =>
                  setDroneKitForm((prev) => ({
                    ...prev,
                    receivedDate: e.target.value,
                  }))
                }
              />
            </div>
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                {isDesktopWorkstation ? "Turnover Date (optional)" : "Assigned Date (optional)"}
              </label>
              <input
                className="input-base"
                type="date"
                value={form.assignedDate}
                onChange={(e) => setForm((prev) => ({ ...prev, assignedDate: e.target.value }))}
              />
            </div>
          )}
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Purchase Date (optional)
            </label>
            <input
              className="input-base"
              type="date"
              value={form.purchaseDate}
              onChange={(e) => setForm((prev) => ({ ...prev, purchaseDate: e.target.value }))}
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
                className="register-fields-grid"
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
                    className="input-base input-readonly-tone"
                    placeholder={assetTagSeedResult ? "Generating asset tag" : "Loading next asset tag"}
                    value={desktopGeneratedTags?.monitorAssetTag ?? ""}
                    readOnly
                    aria-label="Auto-generated monitor asset tag"
                    style={{ color: "var(--foreground)", fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Monitor Serial Number <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="Monitor Serial Number"
                    value={desktopForm.monitorSerialNumber}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({
                        ...prev,
                        monitorSerialNumber: e.target.value,
                      }))
                    }
                  />
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
                className="register-fields-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Mouse Asset Tag <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base input-readonly-tone"
                    placeholder={assetTagSeedResult ? "Generating asset tag" : "Loading next asset tag"}
                    value={desktopGeneratedTags?.mouseAssetTag ?? ""}
                    readOnly
                    aria-label="Auto-generated mouse asset tag"
                    style={{ color: "var(--foreground)", fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Mouse Serial Number
                  </label>
                  <input
                    className="input-base"
                    placeholder="Mouse Serial Number"
                    value={desktopForm.mouseSerialNumber ?? ""}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({
                        ...prev,
                        mouseSerialNumber: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Mouse Specs <span style={{ color: "#dc2626" }}>*</span>
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
                className="register-fields-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Keyboard Asset Tag <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base input-readonly-tone"
                    placeholder={assetTagSeedResult ? "Generating asset tag" : "Loading next asset tag"}
                    value={desktopGeneratedTags?.keyboardAssetTag ?? ""}
                    readOnly
                    aria-label="Auto-generated keyboard asset tag"
                    style={{ color: "var(--foreground)", fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Keyboard Serial Number
                  </label>
                  <input
                    className="input-base"
                    placeholder="Keyboard Serial Number"
                    value={desktopForm.keyboardSerialNumber ?? ""}
                    onChange={(e) =>
                      setDesktopForm((prev) => ({
                        ...prev,
                        keyboardSerialNumber: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Keyboard Specs <span style={{ color: "#dc2626" }}>*</span>
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
                className="register-fields-grid"
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
                    className="input-base input-readonly-tone"
                    placeholder={assetTagSeedResult ? "Generating asset tag" : "Loading next asset tag"}
                    value={desktopGeneratedTags?.systemUnitAssetTag ?? ""}
                    readOnly
                    aria-label="Auto-generated system unit asset tag"
                    style={{ color: "var(--foreground)", fontWeight: 700 }}
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
                      className="register-fields-grid"
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
                          className="input-base input-readonly-tone"
                          placeholder={
                            assetTagSeedResult ? "Generating asset tag" : "Loading next asset tag"
                          }
                          value={desktopGeneratedTags?.extraComponents[index]?.assetTag ?? ""}
                          readOnly
                          aria-label={`Auto-generated asset tag for component ${index + 1}`}
                          style={{ color: "var(--foreground)", fontWeight: 700 }}
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
        {isDroneKitMode ? (
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
              <div style={{ fontSize: 14, fontWeight: 700 }}>Drone Unit</div>
              <div
                className="register-fields-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Drone Unit Asset Tag <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base input-readonly-tone"
                    placeholder={assetTagSeedResult ? "Generating asset tag" : "Loading next asset tag"}
                    value={droneKitGeneratedTags?.droneUnitAssetTag ?? ""}
                    readOnly
                    aria-label="Auto-generated drone unit asset tag"
                    style={{ color: "var(--foreground)", fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Drone Unit Serial Number <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="Drone Unit Serial Number"
                    value={droneKitForm.droneUnitSerialNumber}
                    onChange={(e) =>
                      setDroneKitForm((prev) => ({
                        ...prev,
                        droneUnitSerialNumber: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Drone Unit Specs <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="Drone Unit Specs"
                    value={droneKitForm.droneUnitSpecs}
                    onChange={(e) =>
                      setDroneKitForm((prev) => ({
                        ...prev,
                        droneUnitSpecs: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div style={{ maxWidth: 420 }}>
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
                  displayName={selectedImageFile ? selectedImageFile.name : "Drone unit asset image"}
                  helperText={
                    selectedImageFile
                      ? "Ready to save with this drone unit image attached."
                      : "Attach the drone unit asset image."
                  }
                  badge="IMG"
                  ariaLabel="Drone unit asset image upload"
                  title="Upload drone unit asset image"
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
              <div style={{ fontSize: 14, fontWeight: 700 }}>Battery</div>
              <div
                className="register-fields-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Battery Asset Tag <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base input-readonly-tone"
                    placeholder={assetTagSeedResult ? "Generating asset tag" : "Loading next asset tag"}
                    value={droneKitGeneratedTags?.batteryAssetTag ?? ""}
                    readOnly
                    aria-label="Auto-generated drone battery asset tag"
                    style={{ color: "var(--foreground)", fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Battery Serial Number
                  </label>
                  <input
                    className="input-base"
                    placeholder="Battery Serial Number"
                    value={droneKitForm.batterySerialNumber}
                    onChange={(e) =>
                      setDroneKitForm((prev) => ({
                        ...prev,
                        batterySerialNumber: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Battery Specs <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="Battery Specs"
                    value={droneKitForm.batterySpecs}
                    onChange={(e) =>
                      setDroneKitForm((prev) => ({
                        ...prev,
                        batterySpecs: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div style={{ maxWidth: 420 }}>
                <FileUploadCard
                  label={
                    <>
                      Asset Image <span style={{ color: "#dc2626" }}>*</span>
                    </>
                  }
                  inputRef={batteryImageInputRef}
                  accept="image/*"
                  onFileChange={(file) =>
                    setDroneKitComponentImageFiles((prev) => ({ ...prev, battery: file }))
                  }
                  hasAttachment={Boolean(droneKitComponentImageFiles.battery)}
                  displayName={
                    droneKitComponentImageFiles.battery
                      ? droneKitComponentImageFiles.battery.name
                      : "Battery asset image"
                  }
                  helperText={
                    droneKitComponentImageFiles.battery
                      ? "Ready to save with this battery image attached."
                      : "Attach the battery asset image."
                  }
                  badge="IMG"
                  ariaLabel="Battery asset image upload"
                  title="Upload battery asset image"
                  onRemove={
                    droneKitComponentImageFiles.battery
                      ? () => {
                          setDroneKitComponentImageFiles((prev) => ({ ...prev, battery: null }));
                          if (batteryImageInputRef.current) {
                            batteryImageInputRef.current.value = "";
                          }
                        }
                      : undefined
                  }
                />
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
              <div style={{ fontSize: 14, fontWeight: 700 }}>Propeller</div>
              <div
                className="register-fields-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Propeller Asset Tag <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base input-readonly-tone"
                    placeholder={assetTagSeedResult ? "Generating asset tag" : "Loading next asset tag"}
                    value={droneKitGeneratedTags?.propellerAssetTag ?? ""}
                    readOnly
                    aria-label="Auto-generated drone propeller asset tag"
                    style={{ color: "var(--foreground)", fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Propeller Specs <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="Propeller Specs"
                    value={droneKitForm.propellerSpecs}
                    onChange={(e) =>
                      setDroneKitForm((prev) => ({
                        ...prev,
                        propellerSpecs: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div style={{ maxWidth: 420 }}>
                <FileUploadCard
                  label={
                    <>
                      Asset Image <span style={{ color: "#dc2626" }}>*</span>
                    </>
                  }
                  inputRef={propellerImageInputRef}
                  accept="image/*"
                  onFileChange={(file) =>
                    setDroneKitComponentImageFiles((prev) => ({ ...prev, propeller: file }))
                  }
                  hasAttachment={Boolean(droneKitComponentImageFiles.propeller)}
                  displayName={
                    droneKitComponentImageFiles.propeller
                      ? droneKitComponentImageFiles.propeller.name
                      : "Propeller asset image"
                  }
                  helperText={
                    droneKitComponentImageFiles.propeller
                      ? "Ready to save with this propeller image attached."
                      : "Attach the propeller asset image."
                  }
                  badge="IMG"
                  ariaLabel="Propeller asset image upload"
                  title="Upload propeller asset image"
                  onRemove={
                    droneKitComponentImageFiles.propeller
                      ? () => {
                          setDroneKitComponentImageFiles((prev) => ({ ...prev, propeller: null }));
                          if (propellerImageInputRef.current) {
                            propellerImageInputRef.current.value = "";
                          }
                        }
                      : undefined
                  }
                />
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
              <div style={{ fontSize: 14, fontWeight: 700 }}>Charger</div>
              <div
                className="register-fields-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Charger Asset Tag <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base input-readonly-tone"
                    placeholder={assetTagSeedResult ? "Generating asset tag" : "Loading next asset tag"}
                    value={droneKitGeneratedTags?.chargerAssetTag ?? ""}
                    readOnly
                    aria-label="Auto-generated drone charger asset tag"
                    style={{ color: "var(--foreground)", fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Charger Serial Number
                  </label>
                  <input
                    className="input-base"
                    placeholder="Charger Serial Number"
                    value={droneKitForm.chargerSerialNumber}
                    onChange={(e) =>
                      setDroneKitForm((prev) => ({
                        ...prev,
                        chargerSerialNumber: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Charger Specs <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="Charger Specs"
                    value={droneKitForm.chargerSpecs}
                    onChange={(e) =>
                      setDroneKitForm((prev) => ({
                        ...prev,
                        chargerSpecs: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div style={{ maxWidth: 420 }}>
                <FileUploadCard
                  label={
                    <>
                      Asset Image <span style={{ color: "#dc2626" }}>*</span>
                    </>
                  }
                  inputRef={chargerImageInputRef}
                  accept="image/*"
                  onFileChange={(file) =>
                    setDroneKitComponentImageFiles((prev) => ({ ...prev, charger: file }))
                  }
                  hasAttachment={Boolean(droneKitComponentImageFiles.charger)}
                  displayName={
                    droneKitComponentImageFiles.charger
                      ? droneKitComponentImageFiles.charger.name
                      : "Charger asset image"
                  }
                  helperText={
                    droneKitComponentImageFiles.charger
                      ? "Ready to save with this charger image attached."
                      : "Attach the charger asset image."
                  }
                  badge="IMG"
                  ariaLabel="Charger asset image upload"
                  title="Upload charger asset image"
                  onRemove={
                    droneKitComponentImageFiles.charger
                      ? () => {
                          setDroneKitComponentImageFiles((prev) => ({ ...prev, charger: null }));
                          if (chargerImageInputRef.current) {
                            chargerImageInputRef.current.value = "";
                          }
                        }
                      : undefined
                  }
                />
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
              <div style={{ fontSize: 14, fontWeight: 700 }}>Controller</div>
              <div
                className="register-fields-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Controller Asset Tag <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base input-readonly-tone"
                    placeholder={assetTagSeedResult ? "Generating asset tag" : "Loading next asset tag"}
                    value={droneKitGeneratedTags?.controllerAssetTag ?? ""}
                    readOnly
                    aria-label="Auto-generated drone controller asset tag"
                    style={{ color: "var(--foreground)", fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Controller Serial Number
                  </label>
                  <input
                    className="input-base"
                    placeholder="Controller Serial Number"
                    value={droneKitForm.controllerSerialNumber}
                    onChange={(e) =>
                      setDroneKitForm((prev) => ({
                        ...prev,
                        controllerSerialNumber: e.target.value,
                      }))
                    }
                  />
                </div>
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                    Controller Specs <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    className="input-base"
                    placeholder="Controller Specs"
                    value={droneKitForm.controllerSpecs}
                    onChange={(e) =>
                      setDroneKitForm((prev) => ({
                        ...prev,
                        controllerSpecs: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
              <div style={{ maxWidth: 420 }}>
                <FileUploadCard
                  label={
                    <>
                      Asset Image <span style={{ color: "#dc2626" }}>*</span>
                    </>
                  }
                  inputRef={controllerImageInputRef}
                  accept="image/*"
                  onFileChange={(file) =>
                    setDroneKitComponentImageFiles((prev) => ({ ...prev, controller: file }))
                  }
                  hasAttachment={Boolean(droneKitComponentImageFiles.controller)}
                  displayName={
                    droneKitComponentImageFiles.controller
                      ? droneKitComponentImageFiles.controller.name
                      : "Controller asset image"
                  }
                  helperText={
                    droneKitComponentImageFiles.controller
                      ? "Ready to save with this controller image attached."
                      : "Attach the controller asset image."
                  }
                  badge="IMG"
                  ariaLabel="Controller asset image upload"
                  title="Upload controller asset image"
                  onRemove={
                    droneKitComponentImageFiles.controller
                      ? () => {
                          setDroneKitComponentImageFiles((prev) => ({ ...prev, controller: null }));
                          if (controllerImageInputRef.current) {
                            controllerImageInputRef.current.value = "";
                          }
                        }
                      : undefined
                  }
                />
              </div>
            </div>
          </div>
        ) : null}
        <div className="upload-action-grid" style={{ marginTop: 12 }}>
          {!isDroneKitMode ? (
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
          ) : null}
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
                    background:
                      statusStyles[statusFilter as HardwareStatus]?.background ?? "#ffffff",
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
          <table className="saas-table hardware-master-table" style={{ minWidth: 1300 }}>
            <colgroup>
              <col style={{ width: 104 }} />
              <col style={{ width: 116 }} />
              <col style={{ width: 420 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 190 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 170 }} />
            </colgroup>
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
                    if (target.closest("button, a, input, select, textarea")) return;
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
                    {formatValue(row.location ?? row.locationPersonAssigned ?? "")}
                  </td>
                  <td>
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.4,
                        color: "var(--foreground)",
                      }}
                      title="Open asset details to edit Turnover To"
                      aria-label={`Turnover to ${formatValue(row.assignedTo ?? row.turnoverTo ?? "Unassigned")}`}
                    >
                      {formatValue(row.assignedTo ?? row.turnoverTo ?? "Unassigned")}
                    </div>
                  </td>
                  <td>
                    {(() => {
                      const editState = getInlineRowState(row);
                      const isSaving = inlineSavingId === String(row._id);
                      return (
                        <select
                          className="input-base status-select"
                          style={{
                            minHeight: 36,
                            minWidth: 120,
                            background: statusStyles[editState.status]?.background ?? "#ffffff",
                            color: statusStyles[editState.status]?.color ?? "var(--foreground)",
                            borderColor: statusStyles[editState.status]?.borderColor ?? "#e8eff9",
                          }}
                          value={editState.status}
                          disabled={isSaving}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            const nextStatus = event.target.value as HardwareStatus;
                            const rowId = String(row._id);
                            const nextBorrower =
                              nextStatus === "Borrowed" ? editState.borrower : "";
                            const nextBorrowerEmail =
                              nextStatus === "Borrowed" ? editState.borrowerEmail : "";
                            const nextReturnDueDate =
                              nextStatus === "Borrowed" ? editState.returnDueDate : "";

                            setInlineEdits((prev) => ({
                              ...prev,
                              [rowId]: {
                                status: nextStatus,
                                borrower: nextBorrower,
                                borrowerEmail: nextBorrowerEmail,
                                returnDueDate: nextReturnDueDate,
                              },
                            }));

                            if (nextStatus !== "Borrowed") {
                              void persistInlineUpdate(
                                row,
                                nextStatus,
                                nextBorrower,
                                nextBorrowerEmail,
                                nextReturnDueDate,
                              );
                            }
                          }}
                        >
                          {statuses.map((status) => (
                            <option
                              key={status}
                              value={status}
                              style={{
                                background: "#ffffff",
                                color: statusStyles[status]?.color ?? "var(--foreground)",
                              }}
                            >
                              {status}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const editState = getInlineRowState(row);
                      const isBorrowed = editState.status === "Borrowed";
                      const isSaving = inlineSavingId === String(row._id);
                      return (
                        <input
                          className="input-base"
                          style={{ minHeight: 36 }}
                          value={isBorrowed ? editState.borrower : "none"}
                          placeholder={isBorrowed ? "Borrower name" : "none"}
                          disabled={!isBorrowed || isSaving}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            const nextBorrower = event.target.value;
                            const rowId = String(row._id);
                            setInlineEdits((prev) => ({
                              ...prev,
                              [rowId]: {
                                status: editState.status,
                                borrower: nextBorrower,
                                borrowerEmail: editState.borrowerEmail,
                                returnDueDate: editState.returnDueDate,
                              },
                            }));
                          }}
                          onBlur={() => {
                            void handleInlineBorrowerCommit(row);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              (event.currentTarget as HTMLInputElement).blur();
                            }
                          }}
                        />
                      );
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const editState = getInlineRowState(row);
                      const isBorrowed = editState.status === "Borrowed";
                      const isSaving = inlineSavingId === String(row._id);
                      return (
                        <input
                          className="input-base"
                          type="email"
                          style={{ minHeight: 36 }}
                          value={isBorrowed ? editState.borrowerEmail : "none"}
                          placeholder={isBorrowed ? "name@company.com" : "none"}
                          disabled={!isBorrowed || isSaving}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            const nextBorrowerEmail = event.target.value;
                            const rowId = String(row._id);
                            setInlineEdits((prev) => ({
                              ...prev,
                              [rowId]: {
                                status: editState.status,
                                borrower: editState.borrower,
                                borrowerEmail: nextBorrowerEmail,
                                returnDueDate: editState.returnDueDate,
                              },
                            }));
                          }}
                          onBlur={() => {
                            void handleInlineBorrowerCommit(row);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              (event.currentTarget as HTMLInputElement).blur();
                            }
                          }}
                        />
                      );
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const editState = getInlineRowState(row);
                      const isBorrowed = editState.status === "Borrowed";
                      const isSaving = inlineSavingId === String(row._id);
                      return (
                        <input
                          className="input-base"
                          type="date"
                          style={{ minHeight: 36 }}
                          value={isBorrowed ? editState.returnDueDate : ""}
                          disabled={!isBorrowed || isSaving}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            const nextReturnDueDate = event.target.value;
                            const rowId = String(row._id);
                            setInlineEdits((prev) => ({
                              ...prev,
                              [rowId]: {
                                status: editState.status,
                                borrower: editState.borrower,
                                borrowerEmail: editState.borrowerEmail,
                                returnDueDate: nextReturnDueDate,
                              },
                            }));
                          }}
                          onBlur={() => {
                            void handleInlineBorrowerCommit(row);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              (event.currentTarget as HTMLInputElement).blur();
                            }
                          }}
                        />
                      );
                    })()}
                  </td>
                </tr>
              ))}
              {!tableRows.length ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center", color: "#6b7280", padding: 16 }}>
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
              disabled={!hasPreviousPage}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Prev
            </button>
            <span style={{ alignSelf: "center", fontSize: 13 }}>
              Page {page} / {totalPages}
            </span>
            <button
              className="btn-primary"
              disabled={!hasNextPage}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>

      </section>
    </div>
  );
}

