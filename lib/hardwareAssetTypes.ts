export const HARDWARE_ASSET_TYPES = [
  "Laptop",
  "Desktop/PC",
  "Drone",
  "Drone Battery",
  "Drone Propeller",
  "Drone Charger",
  "Drone Controller",
  "Phone",
  "Tablet",
  "Monitor",
  "Keyboard",
  "Mouse",
  "Headset",
  "Speaker",
  "Printer",
  "Network Device",
  "Flashdrive/USB",
  "External Drive",
  "Audio Visual Equipment",
  "Other IT Asset",
] as const;

export type HardwareAssetType = (typeof HARDWARE_ASSET_TYPES)[number];

export const HARDWARE_ASSET_TAG_PREFIXES: Record<HardwareAssetType, string> = {
  Laptop: "IT-LAP",
  "Desktop/PC": "IT-PC",
  Drone: "IT-DRN",
  "Drone Battery": "IT-DBT",
  "Drone Propeller": "IT-DPR",
  "Drone Charger": "IT-DCH",
  "Drone Controller": "IT-DCT",
  Phone: "IT-PHN",
  Tablet: "IT-TAB",
  Monitor: "IT-MON",
  Keyboard: "IT-KEY",
  Mouse: "IT-MOU",
  Headset: "IT-HST",
  Speaker: "IT-SPK",
  Printer: "IT-PRN",
  "Network Device": "IT-NET",
  "Flashdrive/USB": "IT-USB",
  "External Drive": "IT-EXT",
  "Audio Visual Equipment": "IT-AV",
  "Other IT Asset": "IT-OTH",
};

function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveHardwareAssetTagPrefix(assetType?: string) {
  const next = assetType?.trim();
  if (!next) return "";

  switch (next) {
    case "Laptop":
    case "Desktop/PC":
    case "Drone":
    case "Drone Battery":
    case "Drone Propeller":
    case "Drone Charger":
    case "Drone Controller":
    case "Phone":
    case "Tablet":
    case "Monitor":
    case "Keyboard":
    case "Mouse":
    case "Headset":
    case "Speaker":
    case "Printer":
    case "Network Device":
    case "Flashdrive/USB":
    case "External Drive":
    case "Audio Visual Equipment":
    case "Other IT Asset":
      return HARDWARE_ASSET_TAG_PREFIXES[next];
    case "Mobile Device":
      return HARDWARE_ASSET_TAG_PREFIXES.Phone;
    case "Peripheral":
      return HARDWARE_ASSET_TAG_PREFIXES.Monitor;
    case "Storage Device":
      return HARDWARE_ASSET_TAG_PREFIXES["External Drive"];
    case "Battery":
      return HARDWARE_ASSET_TAG_PREFIXES["Drone Battery"];
    case "Propeller":
      return HARDWARE_ASSET_TAG_PREFIXES["Drone Propeller"];
    case "Charger":
      return HARDWARE_ASSET_TAG_PREFIXES["Drone Charger"];
    case "Controller":
      return HARDWARE_ASSET_TAG_PREFIXES["Drone Controller"];
    case "IT Consumables":
    case "Other IT Assets":
    case "Others":
    case "Other":
      return HARDWARE_ASSET_TAG_PREFIXES["Other IT Asset"];
    default:
      return "";
  }
}

export function buildNextHardwareAssetTag(assetType: string | undefined, existingTags: Iterable<string>) {
  const prefix = resolveHardwareAssetTagPrefix(assetType);
  if (!prefix) return "";

  const matcher = new RegExp(`^${escapeForRegExp(prefix)}-(\\d{4,})$`, "i");
  let maxSequence = 0;

  for (const tag of existingTags) {
    const match = tag.trim().match(matcher);
    if (!match) continue;

    const sequence = Number(match[1]);
    if (Number.isFinite(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  return `${prefix}-${String(maxSequence + 1).padStart(4, "0")}`;
}
