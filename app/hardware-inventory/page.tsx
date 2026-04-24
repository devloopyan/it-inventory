"use client";

import { useEffect, useRef, useState, type RefObject, type UIEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import FileUploadCard from "./file-upload-card";
import ChecklistSelect, { type ChecklistSelectOption } from "./checklist-select";
import {
  HARDWARE_STATUSES,
  normalizeHardwareStatusValue,
  type HardwareStatus,
} from "@/lib/hardwareStatuses";
import {
  HARDWARE_ASSET_TYPE_EXAMPLES,
  HARDWARE_ASSET_TYPES,
  buildNextHardwareAssetTag,
} from "@/lib/hardwareAssetTypes";
import { HARDWARE_DEPARTMENTS } from "@/lib/hardwareDepartments";

const statuses = HARDWARE_STATUSES;
const assetTypeOptions = HARDWARE_ASSET_TYPES;
const departmentOptions = HARDWARE_DEPARTMENTS;
const locationOptions = ["MAIN", "MAIN STORAGE", "FOODLAND", "WAREHOUSE", "HYBRID"] as const;
const workstationTypes = ["Laptop", "Desktop/PC"] as const;
const specsTierOptions = ["LOW", "MID", "HIGH-END"] as const;
const componentTypeOptions = ["Monitor", "Headset", "Keyboard", "Mouse", "Speaker", "AVR", "Other"] as const;
const INITIAL_VISIBLE_TABLE_ROWS = 20;
const assetTypeSelectOptions: ReadonlyArray<ChecklistSelectOption> = assetTypeOptions.map((assetType) => ({
  value: assetType,
  label: assetType,
  description: HARDWARE_ASSET_TYPE_EXAMPLES[assetType],
}));
const assetTypeFilterSelectOptions: ReadonlyArray<ChecklistSelectOption> = assetTypeSelectOptions;
const departmentSelectOptions: ReadonlyArray<ChecklistSelectOption> = departmentOptions.map((department) => ({
  value: department,
  label: department,
}));
const locationSelectOptions: ReadonlyArray<ChecklistSelectOption> = locationOptions.map((location) => ({
  value: location,
  label: location,
}));
const specsTierSelectOptions: ReadonlyArray<ChecklistSelectOption> = specsTierOptions.map((tier) => ({
  value: tier,
  label: tier,
}));
const componentTypeSelectOptions: ReadonlyArray<ChecklistSelectOption> = componentTypeOptions.map((option) => ({
  value: option,
  label: option,
}));
const hardwareInventoryPendingToastKey = "hardware-inventory:pending-toast";

type RegisterMode = "general" | "workstation" | "droneKit";
type MasterTableView = "master" | "workstation" | "storage";
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

const assetMasterStatusStyles: Record<
  HardwareStatus,
  { background: string; color: string; borderColor: string }
> = {
  Available: { background: "#dcfce7", color: "#15803d", borderColor: "#dcfce7" },
  Working: { background: "#dbeafe", color: "#2563eb", borderColor: "#dbeafe" },
  Borrowed: { background: "#ffedd5", color: "#ea580c", borderColor: "#ffedd5" },
  Assigned: { background: "#e0f2fe", color: "#0284c7", borderColor: "#e0f2fe" },
  "For Repair": { background: "#fee2e2", color: "#dc2626", borderColor: "#fee2e2" },
  Retired: { background: "#e5e7eb", color: "#4b5563", borderColor: "#e5e7eb" },
  NEW: { background: "#dbeafe", color: "#2563eb", borderColor: "#dbeafe" },
  "Pre-owned": { background: "#fef3c7", color: "#b45309", borderColor: "#fef3c7" },
};

function buildStatusSelectOptions(styleMap: Record<HardwareStatus, { background: string; color: string; borderColor: string }>) {
  return statuses.map((status) => ({
    value: status,
    label: status,
    markerVariant: "dot" as const,
    markerColor: styleMap[status]?.color ?? "#64748b",
    triggerStyle: {
      backgroundColor: styleMap[status]?.background ?? "#ffffff",
      color: styleMap[status]?.color ?? "var(--foreground)",
      borderColor: styleMap[status]?.borderColor ?? "var(--border)",
      fontWeight: 600,
    },
  }));
}

const assetStatusSelectOptions: ReadonlyArray<ChecklistSelectOption> = buildStatusSelectOptions(statusStyles);
const assetMasterStatusSelectOptions: ReadonlyArray<ChecklistSelectOption> = buildStatusSelectOptions(assetMasterStatusStyles);
const assetStatusFilterOptions: ReadonlyArray<ChecklistSelectOption> = [
  { value: "", label: "All Statuses" },
  ...assetStatusSelectOptions,
];
const locationFilterSelectOptions: ReadonlyArray<ChecklistSelectOption> = [
  { value: "", label: "All Locations" },
  ...locationSelectOptions,
];

const DRONE_KIT_DEFAULT_DEPARTMENT = "IT OPERATIONS";
const masterTableViews: Array<{ key: Exclude<MasterTableView, "master">; label: string }> = [
  { key: "workstation", label: "Workstation" },
  { key: "storage", label: "Storage" },
];

const masterToolbarViews: Array<{ key: MasterTableView; label: string }> = [
  { key: "master", label: "All" },
  ...masterTableViews,
];

function formatValue(value?: string) {
  if (!value) return "-";
  return value;
}

function isAssetMasterWorkstationRecord(row: {
  assetType?: string;
  registerMode?: string;
  workstationType?: string;
  turnoverTo?: string;
  turnoverFormStorageId?: string;
}) {
  if (row.registerMode === "workstation") return true;
  if (row.workstationType === "Laptop" || row.workstationType === "Desktop/PC") return true;
  if (row.assetType === "Laptop" || row.assetType === "Desktop/PC") {
    const turnoverTo = row.turnoverTo?.trim();
    return Boolean(
      row.turnoverFormStorageId &&
        turnoverTo &&
        turnoverTo.toLowerCase() !== "unassigned",
    );
  }
  return false;
}

function isMainStorageRecord(row: { location?: string; locationPersonAssigned?: string }) {
  return (row.locationPersonAssigned ?? row.location ?? "") === "MAIN STORAGE";
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
  const [isRegisterCollapsed, setIsRegisterCollapsed] = useState(true);
  const [workstationType, setWorkstationType] = useState<WorkstationType>("Laptop");
  const [specTier, setSpecTier] = useState<SpecsTier | "">("");
  const [desktopForm, setDesktopForm] = useState(defaultDesktopForm);
  const [droneKitForm, setDroneKitForm] = useState(defaultDroneKitForm);
  const [search, setSearch] = useState("");
  const [masterTableView, setMasterTableView] = useState<MasterTableView>("master");
  const [assetTypeFilter, setAssetTypeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [visibleTableRows, setVisibleTableRows] = useState(INITIAL_VISIBLE_TABLE_ROWS);
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
    Record<string, { status: HardwareStatus; borrower: string }>
  >({});
  const [inlineSavingId, setInlineSavingId] = useState<string>("");

  const hasActiveMasterFilters = Boolean(
    search.trim() || assetTypeFilter.length || statusFilter || locationFilter,
  );

  const result = useQuery(api.hardwareInventory.list, {
    search: search || undefined,
    status: statusFilter || undefined,
    location: locationFilter || undefined,
    sortKey,
    sortDir,
    page: 1,
    pageSize: 5000,
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
  const masterPanelRef = useRef<HTMLElement | null>(null);
  const masterTableWrapRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const batteryImageInputRef = useRef<HTMLInputElement | null>(null);
  const propellerImageInputRef = useRef<HTMLInputElement | null>(null);
  const chargerImageInputRef = useRef<HTMLInputElement | null>(null);
  const controllerImageInputRef = useRef<HTMLInputElement | null>(null);
  const receivingFormInputRef = useRef<HTMLInputElement | null>(null);
  const turnoverFormInputRef = useRef<HTMLInputElement | null>(null);
  const isDesktopWorkstation = registerMode === "workstation" && workstationType === "Desktop/PC";
  const isDroneKitMode = registerMode === "droneKit";

  function scrollToSection(sectionRef: RefObject<HTMLElement | null>) {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openRegisterForm() {
    setIsRegisterCollapsed(false);
    scrollToSection(formSectionRef);
  }

  function minimizeRegisterForm() {
    setIsRegisterCollapsed(true);
    scrollToSection(masterPanelRef);
  }

  function toggleRegisterAccordion() {
    if (isRegisterCollapsed) {
      openRegisterForm();
      return;
    }
    setIsRegisterCollapsed(true);
  }

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

  const allTableRows = (result?.items ?? []).filter((row) => {
    if (assetTypeFilter.length && !assetTypeFilter.includes(String(row.assetType ?? ""))) {
      return false;
    }
    if (masterTableView === "workstation") {
      return isAssetMasterWorkstationRecord(row);
    }
    if (masterTableView === "storage") {
      return isMainStorageRecord(row);
    }
    return true;
  });
  const tableRows = allTableRows.slice(0, visibleTableRows);
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
  const droneKitCards = [
    {
      key: "droneUnit",
      title: "Drone Unit",
      fields: (
        <>
          <div className="drone-kit-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Asset Tag <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base input-readonly-tone"
              placeholder=""
              value={droneKitGeneratedTags?.droneUnitAssetTag ?? ""}
              readOnly
              aria-label="Auto-generated drone unit asset tag"
              style={{ color: "var(--foreground)", fontWeight: 600 }}
            />
          </div>
          <div className="drone-kit-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Serial Number <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base"
              placeholder=""
              value={droneKitForm.droneUnitSerialNumber}
              onChange={(e) =>
                setDroneKitForm((prev) => ({
                  ...prev,
                  droneUnitSerialNumber: e.target.value,
                }))
              }
            />
          </div>
          <div className="drone-kit-card-field drone-kit-card-field--wide">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Specifications <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base"
              placeholder=""
              value={droneKitForm.droneUnitSpecs}
              onChange={(e) =>
                setDroneKitForm((prev) => ({
                  ...prev,
                  droneUnitSpecs: e.target.value,
                }))
              }
            />
          </div>
        </>
      ),
      upload: (
        <FileUploadCard
          compact
          label={
            <>
              Asset Image <span style={{ color: "#dc2626" }}>*</span>
            </>
          }
          inputRef={imageInputRef}
          accept="image/*"
          onFileChange={(file) => setSelectedImageFile(file)}
          file={selectedImageFile}
          hasAttachment={Boolean(selectedImageFile)}
          displayName={selectedImageFile ? selectedImageFile.name : "Drone unit image"}
          helperText=""
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
      ),
    },
    {
      key: "battery",
      title: "Battery",
      fields: (
        <>
          <div className="drone-kit-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Asset Tag <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base input-readonly-tone"
              placeholder=""
              value={droneKitGeneratedTags?.batteryAssetTag ?? ""}
              readOnly
              aria-label="Auto-generated drone battery asset tag"
              style={{ color: "var(--foreground)", fontWeight: 600 }}
            />
          </div>
          <div className="drone-kit-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Serial Number
            </label>
            <input
              className="input-base"
              placeholder=""
              value={droneKitForm.batterySerialNumber}
              onChange={(e) =>
                setDroneKitForm((prev) => ({
                  ...prev,
                  batterySerialNumber: e.target.value,
                }))
              }
            />
          </div>
          <div className="drone-kit-card-field drone-kit-card-field--wide">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Specifications <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base"
              placeholder=""
              value={droneKitForm.batterySpecs}
              onChange={(e) =>
                setDroneKitForm((prev) => ({
                  ...prev,
                  batterySpecs: e.target.value,
                }))
              }
            />
          </div>
        </>
      ),
      upload: (
        <FileUploadCard
          compact
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
          file={droneKitComponentImageFiles.battery}
          hasAttachment={Boolean(droneKitComponentImageFiles.battery)}
          displayName={
            droneKitComponentImageFiles.battery
              ? droneKitComponentImageFiles.battery.name
              : "Battery image"
          }
          helperText=""
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
      ),
    },
    {
      key: "propeller",
      title: "Propeller",
      fields: (
        <>
          <div className="drone-kit-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Asset Tag <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base input-readonly-tone"
              placeholder=""
              value={droneKitGeneratedTags?.propellerAssetTag ?? ""}
              readOnly
              aria-label="Auto-generated drone propeller asset tag"
              style={{ color: "var(--foreground)", fontWeight: 600 }}
            />
          </div>
          <div className="drone-kit-card-field drone-kit-card-field--wide">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Specifications <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base"
              placeholder=""
              value={droneKitForm.propellerSpecs}
              onChange={(e) =>
                setDroneKitForm((prev) => ({
                  ...prev,
                  propellerSpecs: e.target.value,
                }))
              }
            />
          </div>
        </>
      ),
      upload: (
        <FileUploadCard
          compact
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
          file={droneKitComponentImageFiles.propeller}
          hasAttachment={Boolean(droneKitComponentImageFiles.propeller)}
          displayName={
            droneKitComponentImageFiles.propeller
              ? droneKitComponentImageFiles.propeller.name
              : "Propeller image"
          }
          helperText=""
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
      ),
    },
    {
      key: "charger",
      title: "Charger",
      fields: (
        <>
          <div className="drone-kit-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Asset Tag <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base input-readonly-tone"
              placeholder=""
              value={droneKitGeneratedTags?.chargerAssetTag ?? ""}
              readOnly
              aria-label="Auto-generated drone charger asset tag"
              style={{ color: "var(--foreground)", fontWeight: 600 }}
            />
          </div>
          <div className="drone-kit-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Serial Number
            </label>
            <input
              className="input-base"
              placeholder=""
              value={droneKitForm.chargerSerialNumber}
              onChange={(e) =>
                setDroneKitForm((prev) => ({
                  ...prev,
                  chargerSerialNumber: e.target.value,
                }))
              }
            />
          </div>
          <div className="drone-kit-card-field drone-kit-card-field--wide">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Specifications <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base"
              placeholder=""
              value={droneKitForm.chargerSpecs}
              onChange={(e) =>
                setDroneKitForm((prev) => ({
                  ...prev,
                  chargerSpecs: e.target.value,
                }))
              }
            />
          </div>
        </>
      ),
      upload: (
        <FileUploadCard
          compact
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
          file={droneKitComponentImageFiles.charger}
          hasAttachment={Boolean(droneKitComponentImageFiles.charger)}
          displayName={
            droneKitComponentImageFiles.charger
              ? droneKitComponentImageFiles.charger.name
              : "Charger image"
          }
          helperText=""
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
      ),
    },
    {
      key: "controller",
      title: "Controller",
      fields: (
        <>
          <div className="drone-kit-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Asset Tag <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base input-readonly-tone"
              placeholder=""
              value={droneKitGeneratedTags?.controllerAssetTag ?? ""}
              readOnly
              aria-label="Auto-generated drone controller asset tag"
              style={{ color: "var(--foreground)", fontWeight: 600 }}
            />
          </div>
          <div className="drone-kit-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Serial Number
            </label>
            <input
              className="input-base"
              placeholder=""
              value={droneKitForm.controllerSerialNumber}
              onChange={(e) =>
                setDroneKitForm((prev) => ({
                  ...prev,
                  controllerSerialNumber: e.target.value,
                }))
              }
            />
          </div>
          <div className="drone-kit-card-field drone-kit-card-field--wide">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Specifications <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base"
              placeholder=""
              value={droneKitForm.controllerSpecs}
              onChange={(e) =>
                setDroneKitForm((prev) => ({
                  ...prev,
                  controllerSpecs: e.target.value,
                }))
              }
            />
          </div>
        </>
      ),
      upload: (
        <FileUploadCard
          compact
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
          file={droneKitComponentImageFiles.controller}
          hasAttachment={Boolean(droneKitComponentImageFiles.controller)}
          displayName={
            droneKitComponentImageFiles.controller
              ? droneKitComponentImageFiles.controller.name
              : "Controller image"
          }
          helperText=""
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
      ),
    },
  ];
  const desktopWorkstationCards = [
    {
      key: "monitor",
      title: "Monitor",
      wide: true,
      fields: (
        <>
          <div className="workstation-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Asset Tag <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base input-readonly-tone"
              placeholder=""
              value={desktopGeneratedTags?.monitorAssetTag ?? ""}
              readOnly
              aria-label="Auto-generated monitor asset tag"
              style={{ color: "var(--foreground)", fontWeight: 600 }}
            />
          </div>
          <div className="workstation-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Serial Number <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base"
              placeholder=""
              value={desktopForm.monitorSerialNumber}
              onChange={(e) =>
                setDesktopForm((prev) => ({
                  ...prev,
                  monitorSerialNumber: e.target.value,
                }))
              }
            />
          </div>
          <div className="workstation-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Specifications <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base"
              placeholder=""
              value={desktopForm.monitorSpecs}
              onChange={(e) =>
                setDesktopForm((prev) => ({ ...prev, monitorSpecs: e.target.value }))
              }
            />
          </div>
          <div className="workstation-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Consumables
            </label>
            <input
              className="input-base"
              placeholder=""
              value={desktopForm.monitorConsumables}
              onChange={(e) =>
                setDesktopForm((prev) => ({
                  ...prev,
                  monitorConsumables: e.target.value,
                }))
              }
            />
          </div>
        </>
      ),
    },
    {
      key: "mouse",
      title: "Mouse",
      fields: (
        <>
          <div className="workstation-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Asset Tag <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base input-readonly-tone"
              placeholder=""
              value={desktopGeneratedTags?.mouseAssetTag ?? ""}
              readOnly
              aria-label="Auto-generated mouse asset tag"
              style={{ color: "var(--foreground)", fontWeight: 600 }}
            />
          </div>
          <div className="workstation-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Serial Number
            </label>
            <input
              className="input-base"
              placeholder=""
              value={desktopForm.mouseSerialNumber ?? ""}
              onChange={(e) =>
                setDesktopForm((prev) => ({
                  ...prev,
                  mouseSerialNumber: e.target.value,
                }))
              }
            />
          </div>
          <div className="workstation-card-field workstation-card-field--wide">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Specifications <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base"
              placeholder=""
              value={desktopForm.mouseSpecs}
              onChange={(e) =>
                setDesktopForm((prev) => ({
                  ...prev,
                  mouseSpecs: e.target.value,
                }))
              }
            />
          </div>
        </>
      ),
    },
    {
      key: "keyboard",
      title: "Keyboard",
      fields: (
        <>
          <div className="workstation-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Asset Tag <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base input-readonly-tone"
              placeholder=""
              value={desktopGeneratedTags?.keyboardAssetTag ?? ""}
              readOnly
              aria-label="Auto-generated keyboard asset tag"
              style={{ color: "var(--foreground)", fontWeight: 600 }}
            />
          </div>
          <div className="workstation-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Serial Number
            </label>
            <input
              className="input-base"
              placeholder=""
              value={desktopForm.keyboardSerialNumber ?? ""}
              onChange={(e) =>
                setDesktopForm((prev) => ({
                  ...prev,
                  keyboardSerialNumber: e.target.value,
                }))
              }
            />
          </div>
          <div className="workstation-card-field workstation-card-field--wide">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Specifications <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base"
              placeholder=""
              value={desktopForm.keyboardSpecs}
              onChange={(e) =>
                setDesktopForm((prev) => ({
                  ...prev,
                  keyboardSpecs: e.target.value,
                }))
              }
            />
          </div>
        </>
      ),
    },
    {
      key: "systemUnit",
      title: "System Unit",
      fields: (
        <>
          <div className="workstation-card-field">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Asset Tag <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base input-readonly-tone"
              placeholder=""
              value={desktopGeneratedTags?.systemUnitAssetTag ?? ""}
              readOnly
              aria-label="Auto-generated system unit asset tag"
              style={{ color: "var(--foreground)", fontWeight: 600 }}
            />
          </div>
          <div className="workstation-card-field workstation-card-field--wide">
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Specifications <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input
              className="input-base"
              placeholder=""
              value={desktopForm.systemUnitSpecs}
              onChange={(e) =>
                setDesktopForm((prev) => ({
                  ...prev,
                  systemUnitSpecs: e.target.value,
                }))
              }
            />
          </div>
        </>
      ),
    },
  ];

  const headerConfig: { label: string; key: SortKey | null }[] = [
    { label: "Asset Tag", key: "assetTag" },
    { label: "Asset Type", key: "assetType" },
    { label: "Asset Name / Specs", key: "assetNameDescription" },
    { label: "Location", key: "locationPersonAssigned" },
    { label: "Turnover to", key: "turnoverTo" },
    { label: "Status", key: "status" },
    { label: "Borrower", key: "borrower" },
  ];

  const hasMoreTableRows = tableRows.length < allTableRows.length;

  useEffect(() => {
    setVisibleTableRows(INITIAL_VISIBLE_TABLE_ROWS);
    if (masterTableWrapRef.current) {
      masterTableWrapRef.current.scrollTop = 0;
    }
  }, [search, assetTypeFilter, statusFilter, locationFilter, masterTableView, sortKey, sortDir]);

  function handleMasterTableScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining > 120 || !hasMoreTableRows) return;
    setVisibleTableRows((current) =>
      Math.min(current + INITIAL_VISIBLE_TABLE_ROWS, allTableRows.length),
    );
  }

  function resolveRowStatus(row: (typeof tableRows)[number]) {
    return normalizeHardwareStatusValue(row.status) ?? "Available";
  }

  function resolveRowBorrower(row: (typeof tableRows)[number]) {
    return ((row as Record<string, unknown>).borrower as string | undefined) ?? "";
  }

  function getInlineRowState(row: (typeof tableRows)[number]) {
    const key = String(row._id);
    const baseStatus = resolveRowStatus(row);
    const baseBorrower = resolveRowBorrower(row);
    return inlineEdits[key] ?? {
      status: baseStatus,
      borrower: baseBorrower,
    };
  }

  async function persistInlineUpdate(
    row: (typeof tableRows)[number],
    nextStatus: HardwareStatus,
    nextBorrower: string,
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

    if (editState.status !== "Borrowed") return;
    if (
      editState.status === baseStatus &&
      editState.borrower.trim() === baseBorrower
    ) {
      return;
    }
    await persistInlineUpdate(row, editState.status, editState.borrower);
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

  function resetMasterFilters() {
    setSearch("");
    setAssetTypeFilter([]);
    setStatusFilter("");
    setLocationFilter("");
    setVisibleTableRows(INITIAL_VISIBLE_TABLE_ROWS);
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
      setVisibleTableRows(INITIAL_VISIBLE_TABLE_ROWS);
      setIsRegisterCollapsed(true);
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
      scrollToSection(masterPanelRef);
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
    <div className="asset-page">
      {formSuccess ? (
        <div className="floating-toast floating-toast-success" role="status" aria-live="polite">
          {formSuccess.message}
        </div>
      ) : null}
      <section
        className={`panel hardware-register-panel operations-reference-shell${isRegisterCollapsed ? " is-collapsed" : ""}`}
        ref={formSectionRef}
      >
        <div className="operations-reference-topbar hardware-register-topbar">
          <div className="operations-reference-title-group hardware-register-header">
            <div className="hardware-register-header-row">
              <div className="operations-reference-title-row">
                <h1 className="operations-reference-title hardware-register-title">Hardware Asset Register</h1>
              </div>
              <p className="hardware-register-copy">
                Minimize this form while reviewing the master table, then expand it whenever you need to register a new
                asset.
              </p>
            </div>
            <button
              type="button"
              className="hardware-register-accordion hardware-register-accordion-toggle"
              onClick={toggleRegisterAccordion}
              aria-expanded={!isRegisterCollapsed}
              aria-controls="hardware-register-form-panel"
            >
              <span className="hardware-register-accordion-side">
                <span className="hardware-register-accordion-state">
                  {isRegisterCollapsed ? "Expand form" : "Collapse form"}
                </span>
                <span
                  className={`hardware-register-accordion-icon${isRegisterCollapsed ? "" : " is-open"}`}
                  aria-hidden="true"
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                    <path
                      d="M5 7.5L10 12.5L15 7.5"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </span>
            </button>
          </div>
        </div>
        {!isRegisterCollapsed ? (
          <div id="hardware-register-form-panel" className="hardware-register-body">
            <div className="register-tab-stack hardware-register-tab-stack">
              <div className="operations-reference-tabs register-pill-tabs">
                <button
                  type="button"
                  className={`operations-reference-tab register-pill-tab ${registerMode === "general" ? "is-active active" : ""}`}
                  onClick={() => {
                    setRegisterMode("general");
                    setSpecTier("");
                  }}
                >
                  <span className="register-pill-tab-inner">
                    <span>General Asset</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`operations-reference-tab register-pill-tab ${registerMode === "workstation" ? "is-active active" : ""}`}
                  onClick={() => {
                    setRegisterMode("workstation");
                    setForm((prev) => ({ ...prev, assetType: workstationType }));
                  }}
                >
                  <span className="register-pill-tab-inner">
                    <span>Add Workstation</span>
                  </span>
                </button>
                <button
                  type="button"
                  className={`operations-reference-tab register-pill-tab ${registerMode === "droneKit" ? "is-active active" : ""}`}
                  onClick={() => {
                    setRegisterMode("droneKit");
                    setSpecTier("");
                    setForm((prev) => ({ ...prev, assetType: "Drone" }));
                  }}
                >
                  <span className="register-pill-tab-inner">
                    <span>Add Drone Kit</span>
                  </span>
                </button>
              </div>
              {registerMode === "workstation" ? (
                <div className="operations-reference-view-switch register-subtabs">
                  {workstationTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`operations-reference-view-btn register-subtab ${workstationType === type ? "is-active active" : ""}`}
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
              className={`register-fields-grid${isDroneKitMode ? " drone-kit-overview-grid" : registerMode === "workstation" ? " workstation-overview-grid" : ""}`}
              style={{
                display: "grid",
                gridTemplateColumns: isDroneKitMode || registerMode === "workstation"
                  ? "repeat(auto-fit, minmax(180px, 1fr))"
                  : "repeat(auto-fit, minmax(220px, 1fr))",
                gap: isDroneKitMode || registerMode === "workstation" ? 8 : 10,
              }}
            >
          {!isDesktopWorkstation ? (
            <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Asset Tag <span style={{ color: "#dc2626" }}>*</span>
            </label>
              <input
              className="input-base input-readonly-tone"
              placeholder=""
              value={autoAssetTag}
              readOnly
              aria-label={isDesktopWorkstation ? "Auto-generated main asset tag" : "Auto-generated asset tag"}
              style={{
                color: autoAssetTag ? "var(--foreground)" : "var(--muted)",
                fontWeight: autoAssetTag ? 700 : 500,
              }}
            />
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
              <ChecklistSelect
                value={form.assetType}
                options={assetTypeSelectOptions}
                placeholder=""
                ariaLabel="Asset type"
                onChange={(value) => setForm((prev) => ({ ...prev, assetType: value }))}
              />
            )}
          </div>
          {!isDesktopWorkstation && !isDroneKitMode ? (
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                Asset Name or Description <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                className="input-base"
                placeholder=""
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
                placeholder=""
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
              <ChecklistSelect
                value={specTier}
                options={specsTierSelectOptions}
                placeholder=""
                ariaLabel="Specs tier"
                onChange={(value) => setSpecTier(value as SpecsTier | "")}
              />
            </div>
          ) : null}
          {!isDesktopWorkstation && !isDroneKitMode ? (
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                Serial Number <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                className="input-base"
                placeholder=""
                value={form.serialNumber}
                onChange={(e) => setForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
              />
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Location <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <ChecklistSelect
              value={form.locationPersonAssigned}
              options={locationSelectOptions}
              placeholder=""
              ariaLabel="Location"
              onChange={(value) => setForm((prev) => ({ ...prev, locationPersonAssigned: value }))}
            />
          </div>
          {!isDroneKitMode ? (
            <div style={{ display: "grid", gap: 4 }}>
              <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                Turnover To (optional)
              </label>
              <input
                className="input-base"
                placeholder=""
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
                placeholder=""
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
              <ChecklistSelect
                value={form.department}
                options={departmentSelectOptions}
                placeholder=""
                ariaLabel="Department"
                onChange={(value) => setForm((prev) => ({ ...prev, department: value }))}
              />
            </div>
          ) : null}
          <div style={{ display: "grid", gap: 4 }}>
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Status <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <ChecklistSelect
              value={form.status}
              options={assetStatusSelectOptions}
              placeholder=""
              ariaLabel="Status"
              onChange={(value) => setForm((prev) => ({ ...prev, status: value as FormState["status"] }))}
            />
          </div>
          {!isDroneKitMode ? (
            <>
              <div style={{ display: "grid", gap: 4 }}>
                <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                  Borrower Name {form.status === "Borrowed" ? <span style={{ color: "#dc2626" }}>*</span> : null}
                </label>
                <input
                  className="input-base"
                  placeholder=""
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
              placeholder=""
              value={form.warranty}
              onChange={(e) => setForm((prev) => ({ ...prev, warranty: e.target.value }))}
            />
          </div>
          <div
            style={
              isDroneKitMode || registerMode === "workstation"
                ? { display: "grid", gap: 4, gridColumn: "1 / -1" }
                : { display: "grid", gap: 4 }
            }
          >
            <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
              Remarks (optional)
            </label>
            <input
              className="input-base"
              placeholder=""
              value={form.remarks}
              onChange={(e) => setForm((prev) => ({ ...prev, remarks: e.target.value }))}
            />
          </div>
        </div>
        {isDesktopWorkstation ? (
          <div className="workstation-sections">
            <div className="workstation-sections-grid">
              {desktopWorkstationCards.map((card) => (
                <div
                  key={card.key}
                  className={`panel workstation-component-card${card.wide ? " workstation-component-card--wide" : ""}`}
                >
                  <div className="workstation-component-title">{card.title}</div>
                  <div className="workstation-component-fields">{card.fields}</div>
                </div>
              ))}
            </div>
            <div className="panel workstation-extra-components-card">
              <div className="workstation-extra-components-head">
                <div>
                  <div className="workstation-component-title">Extra Components</div>
                  <div className="workstation-extra-components-copy">
                    Add tagged peripherals.
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
                <div className="workstation-extra-components-list">
                  {desktopForm.extraComponents.map((component, index) => (
                    <div
                      key={`${index}-${component.assetTag}`}
                      className="workstation-extra-component-row"
                    >
                      <div className="workstation-card-field">
                        <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                          Asset Tag <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <input
                          className="input-base input-readonly-tone"
                          placeholder=""
                          value={desktopGeneratedTags?.extraComponents[index]?.assetTag ?? ""}
                          readOnly
                          aria-label={`Auto-generated asset tag for component ${index + 1}`}
                          style={{ color: "var(--foreground)", fontWeight: 600 }}
                        />
                      </div>
                      <div className="workstation-card-field">
                        <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                          Component Type <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <ChecklistSelect
                          value={component.componentType}
                          options={componentTypeSelectOptions}
                          placeholder=""
                          ariaLabel={`Component type for extra component ${index + 1}`}
                          onChange={(value) =>
                            setDesktopForm((prev) => ({
                              ...prev,
                              extraComponents: prev.extraComponents.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, componentType: value }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </div>
                      <div className="workstation-card-field">
                        <label style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>
                          Specs <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <input
                          className="input-base"
                          placeholder=""
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
          <div className="drone-kit-sections">
            {droneKitCards.map((card) => (
              <div key={card.key} className="panel drone-kit-component-card">
                <div className="drone-kit-component-title">{card.title}</div>
                <div className="drone-kit-component-layout">
                  <div className="drone-kit-component-fields">{card.fields}</div>
                  <div className="drone-kit-component-upload">{card.upload}</div>
                </div>
              </div>
            ))}
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
              file={selectedImageFile}
              hasAttachment={Boolean(selectedImageFile)}
              displayName={selectedImageFile ? selectedImageFile.name : "Asset image"}
              helperText=""
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
            file={selectedReceivingFormFile}
            hasAttachment={Boolean(selectedReceivingFormFile)}
            displayName={selectedReceivingFormFile ? selectedReceivingFormFile.name : "Receiving form"}
            helperText=""
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
            file={selectedTurnoverFormFile}
            hasAttachment={Boolean(selectedTurnoverFormFile)}
            displayName={selectedTurnoverFormFile ? selectedTurnoverFormFile.name : "Turnover form"}
            helperText=""
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
            </div>
            <div className="form-action-field" style={{ marginTop: 12 }}>
              <button
                className="btn-primary form-action-button"
                onClick={handleCreate}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Create Asset"}
              </button>
            </div>
            {formError ? (
              <p style={{ color: "#b91c1c", marginTop: 8, fontSize: "var(--type-body-sm)" }}>{formError}</p>
            ) : null}
          </div>
        ) : null}
      </section>

      <section
        className="panel hardware-master-panel hardware-master-panel-layout"
        ref={masterPanelRef}
      >
        <div className="hardware-section-head">
          <div>
            <h1 className="operations-reference-title hardware-section-title">Asset Master Table</h1>
            <div className="type-section-copy">
              Search and filter all hardware assets.
            </div>
          </div>
        </div>
        <div className="hardware-master-toolbar hardware-master-toolbar-controls asset-master-toolbar-row">
          <div className="asset-master-toolbar-left">
            <div className="search-field hardware-toolbar-search asset-master-toolbar-search">
              <span className="search-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
                  <path d="M20 20L16.5 16.5" stroke="currentColor" strokeWidth="2" />
                </svg>
              </span>
              <input
                className="input-base"
                placeholder="Search asset, serial, assignee"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setVisibleTableRows(INITIAL_VISIBLE_TABLE_ROWS);
                }}
              />
            </div>
            <div className="asset-master-toolbar-filter asset-master-toolbar-filter-type">
              <ChecklistSelect
                values={assetTypeFilter}
                options={assetTypeFilterSelectOptions}
                placeholder="Type"
                ariaLabel="Filter by asset type"
                compact
                minMenuWidth={172}
                multiple
                multipleSummaryLabel="Type"
                multipleSummaryStyle="badge"
                onValuesChange={(values) => {
                  setAssetTypeFilter(values);
                  setVisibleTableRows(INITIAL_VISIBLE_TABLE_ROWS);
                }}
              />
            </div>
            <div className="asset-master-toolbar-filter asset-master-toolbar-filter-status">
              <ChecklistSelect
                value={statusFilter}
                options={assetStatusFilterOptions}
                placeholder="All Statuses"
                ariaLabel="Filter by status"
                compact
                minMenuWidth={156}
                onChange={(value) => {
                  setStatusFilter(value);
                  setVisibleTableRows(INITIAL_VISIBLE_TABLE_ROWS);
                }}
              />
            </div>
            <div className="asset-master-toolbar-filter asset-master-toolbar-filter-location">
              <ChecklistSelect
                value={locationFilter}
                options={locationFilterSelectOptions}
                placeholder="All Locations"
                ariaLabel="Filter by location"
                compact
                minMenuWidth={156}
                onChange={(value) => {
                  setLocationFilter(value);
                  setVisibleTableRows(INITIAL_VISIBLE_TABLE_ROWS);
                }}
              />
            </div>
            <button
              type="button"
              className={`asset-master-clear-btn${hasActiveMasterFilters ? "" : " is-hidden"}`}
              onClick={resetMasterFilters}
            >
              <span aria-hidden="true">×</span>
              <span>Clear filters</span>
            </button>
          </div>
          <div className="asset-master-toolbar-right">
            <div className="asset-master-view-filters" aria-label="Asset master quick filters">
              {masterToolbarViews.map((view) => {
                const active = masterTableView === view.key;
                return (
                  <button
                    key={view.key}
                    type="button"
                    aria-pressed={active}
                    className={`asset-master-view-filter${active ? " active" : ""}`}
                    onClick={() => {
                      setMasterTableView(view.key);
                      setVisibleTableRows(INITIAL_VISIBLE_TABLE_ROWS);
                    }}
                  >
                    {view.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div
          ref={masterTableWrapRef}
          className="saas-table-wrap hardware-master-table-wrap"
          onScroll={handleMasterTableScroll}
        >
          <table className="saas-table hardware-master-table" style={{ minWidth: 1080 }}>
            <colgroup>
              <col style={{ width: 92 }} />
              <col style={{ width: 98 }} />
              <col style={{ width: 330 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 120 }} />
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
                      <div className="hardware-master-spec-cell">
                        <div>{formatValue(row.assetNameDescription ?? "")}</div>
                        <div className="hardware-master-spec-copy">
                          {formatValue(row.specifications ?? "")}
                        </div>
                      </div>
                  </td>
                  <td>
                    {formatValue(row.location ?? row.locationPersonAssigned ?? "")}
                  </td>
                    <td>
                      <div
                        className="hardware-master-turnover-cell"
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
                        <div className="hardware-master-status-select">
                          <ChecklistSelect
                            value={editState.status}
                            options={assetMasterStatusSelectOptions}
                            placeholder="Select status"
                            ariaLabel={`Status for asset ${row.assetTag}`}
                            disabled={isSaving}
                            compact
                            minMenuWidth={140}
                            triggerStyle={{ minHeight: 28 }}
                            onChange={(value) => {
                              const nextStatus = value as HardwareStatus;
                              const rowId = String(row._id);
                              const nextBorrower = nextStatus === "Borrowed" ? editState.borrower : "";

                              setInlineEdits((prev) => ({
                                ...prev,
                                [rowId]: {
                                  status: nextStatus,
                                  borrower: nextBorrower,
                                },
                              }));

                              if (nextStatus !== "Borrowed") {
                                void persistInlineUpdate(row, nextStatus, nextBorrower);
                              }
                            }}
                          />
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const editState = getInlineRowState(row);
                      const isBorrowed = editState.status === "Borrowed";
                      const isSaving = inlineSavingId === String(row._id);
                      return (
                        <div className="hardware-master-borrower-cell">
                          <input
                            className="input-base"
                            style={{ minHeight: 30 }}
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
                        </div>
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

        <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "#4b5563" }}>
            Showing {tableRows.length} of {allTableRows.length}
          </div>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            {hasMoreTableRows ? "Scroll to load more" : "All rows loaded"}
          </div>
        </div>

      </section>
    </div>
  );
}


