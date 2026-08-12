import { isCredentialStorageConfigured } from "@/lib/credentialCrypto";
import InventoryTabsClient from "./inventory-tabs-client";

export default function InventoryPage() {
  return <InventoryTabsClient credentialStorageConfigured={isCredentialStorageConfigured()} />;
}
