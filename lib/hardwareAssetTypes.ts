export const HARDWARE_ASSET_TYPES = [
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
] as const;

export type HardwareAssetType = (typeof HARDWARE_ASSET_TYPES)[number];
