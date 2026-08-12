import { isCredentialStorageConfigured } from "@/lib/credentialCrypto";
import DigitalInventoryClient from "./digital-inventory-client";

export default function DigitalInventoryPage() {
  return <DigitalInventoryClient credentialStorageConfigured={isCredentialStorageConfigured()} />;
}
