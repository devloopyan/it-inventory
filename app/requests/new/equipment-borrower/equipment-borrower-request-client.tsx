"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/app/current-user-context";
import FileUploadCard from "@/app/hardware-inventory/file-upload-card";
import {
  MONITORING_BORROWING_REQUEST_CATEGORY,
  MONITORING_BORROW_CONDITION_OPTIONS,
} from "@/lib/monitoring";

const REQUEST_SOURCE = "Requests Portal";

function toTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toStartOfDayTimestamp(value: string) {
  const timestamp = new Date(`${value}T00:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isReserved(row: { reservationStatus?: string }) {
  return row.reservationStatus === "Reserved";
}

function isBorrowableEquipment(row: {
  assetType?: string;
  locationPersonAssigned?: string;
  location?: string;
  registerMode?: string;
  reservationStatus?: string;
  status: string;
}) {
  const location = row.locationPersonAssigned ?? row.location ?? "";
  return (
    location === "MAIN STORAGE" &&
    row.registerMode !== "droneKit" &&
    (row.status === "Available" || row.status === "Working") &&
    !isReserved(row)
  );
}

function getEquipmentThumbnailLabel(assetType?: string) {
  const words = assetType?.trim().split(/\s+/).filter(Boolean) ?? [];
  const initials = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  return initials || "IT";
}

function EquipmentThumbnail({
  storageId,
  assetType,
  label,
}: {
  storageId?: Id<"_storage">;
  assetType?: string;
  label: string;
}) {
  const imageUrl = useQuery(
    api.hardwareInventory.getImageUrl,
    storageId ? { storageId } : "skip",
  );

  return (
    <div className="request-equipment-thumb" aria-hidden={!imageUrl}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={`${label} image`} />
      ) : (
        <span>{getEquipmentThumbnailLabel(assetType)}</span>
      )}
    </div>
  );
}

export default function EquipmentBorrowerRequestClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const searchParams = useSearchParams();
  const assets = useQuery(api.hardwareInventory.listAll, {});
  const openRequests = useQuery(api.monitoring.list, {
    view: "issues",
    showClosed: false,
  });
  const createTicket = useMutation(api.monitoring.createTicket);
  const generateUploadUrl = useMutation(api.monitoring.generateUploadUrl);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [requesterName, setRequesterName] = useState(currentUser?.displayName ?? "");
  const department = currentUser?.department ?? "";
  const [requestedDate, setRequestedDate] = useState("");
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const [purpose, setPurpose] = useState("");
  const [equipmentSearch, setEquipmentSearch] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const missingDepartment = !department.trim();
  const selectedAssetIdsFromUrl = useMemo(
    () =>
      (searchParams?.get("assets") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [searchParams],
  );
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const openBorrowingAssetIds = useMemo(
    () =>
      new Set(
        (openRequests ?? [])
          .filter((request) => request.category === MONITORING_BORROWING_REQUEST_CATEGORY)
          .flatMap((request) => request.borrowingItems ?? [])
          .map((item) => String(item.assetId)),
      ),
    [openRequests],
  );

  useEffect(() => {
    if (!selectedAssetIdsFromUrl.length) return;

    setSelectedAssetIds((current) => {
      const next = [...current];
      for (const assetId of selectedAssetIdsFromUrl) {
        if (!next.includes(assetId)) {
          next.push(assetId);
        }
      }
      return next.length === current.length ? current : next;
    });
  }, [selectedAssetIdsFromUrl]);

  const allSelectedAssets = useMemo(
    () =>
      selectedAssetIds
        .map((assetId) => assets?.find((asset) => String(asset._id) === assetId))
        .filter((asset): asset is NonNullable<typeof assets>[number] => Boolean(asset)),
    [assets, selectedAssetIds],
  );
  const selectedAssets = useMemo(
    () =>
      allSelectedAssets.filter(
        (asset) =>
          isBorrowableEquipment(asset) &&
          !openBorrowingAssetIds.has(String(asset._id)),
      ),
    [allSelectedAssets, openBorrowingAssetIds],
  );
  const unavailableSelectedAssets = useMemo(
    () =>
      allSelectedAssets.filter(
        (asset) =>
          !isBorrowableEquipment(asset) ||
          openBorrowingAssetIds.has(String(asset._id)),
      ),
    [allSelectedAssets, openBorrowingAssetIds],
  );
  const equipmentSearchTerm = equipmentSearch.trim();
  const availableEquipmentBaseOptions = useMemo(
    () =>
      (assets ?? [])
        .filter((asset) => isBorrowableEquipment(asset))
        .filter((asset) => !openBorrowingAssetIds.has(String(asset._id)))
        .filter((asset) => !selectedAssetIds.includes(String(asset._id)))
        .sort((left, right) => left.assetTag.localeCompare(right.assetTag)),
    [assets, openBorrowingAssetIds, selectedAssetIds],
  );
  const availableEquipmentOptions = useMemo(
    () => {
      const search = equipmentSearchTerm.toLowerCase();

      return availableEquipmentBaseOptions
        .filter((asset) => {
          if (!search) return true;

          return [
            asset.assetTag,
            asset.assetNameDescription,
            asset.assetType,
            asset.specifications,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(search));
        });
    },
    [availableEquipmentBaseOptions, equipmentSearchTerm],
  );
  const availabilityLoading = assets === undefined || openRequests === undefined;

  useEffect(() => {
    if (!requesterName.trim() && currentUser?.displayName) {
      setRequesterName(currentUser.displayName);
    }
  }, [currentUser?.displayName, requesterName]);

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/requests/new");
  }

  function handleAddEquipment(assetId: string) {
    setSelectedAssetIds((current) => (current.includes(assetId) ? current : [...current, assetId]));
  }

  function handleRemoveEquipment(assetId: string) {
    setSelectedAssetIds((current) => current.filter((currentAssetId) => currentAssetId !== assetId));
  }

  async function uploadAttachment() {
    if (!attachmentFile) return undefined;

    const uploadUrl = await generateUploadUrl();
    const uploadResult = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": attachmentFile.type || "application/octet-stream",
      },
      body: attachmentFile,
    });

    if (!uploadResult.ok) {
      throw new Error("Attachment upload failed.");
    }

    const uploadData = (await uploadResult.json()) as { storageId?: Id<"_storage"> };
    if (!uploadData.storageId) {
      throw new Error("Attachment upload failed.");
    }

    return uploadData.storageId;
  }

  async function handleSubmit() {
    setFormError("");

    try {
      const trimmedRequesterName = requesterName.trim();
      const trimmedDepartment = department.trim();
      const trimmedPurpose = purpose.trim();

      if (!trimmedRequesterName) {
        throw new Error("Requester name is required.");
      }
      if (!trimmedDepartment) {
        throw new Error("Department is required.");
      }
      if (!requestedDate) {
        throw new Error("Requested date is required.");
      }
      if (!expectedReturnAt) {
        throw new Error("Expected return is required.");
      }
      if (!trimmedPurpose) {
        throw new Error("Purpose is required.");
      }
      if (availabilityLoading) {
        throw new Error("Please wait while equipment availability is checked.");
      }
      if (unavailableSelectedAssets.length) {
        throw new Error("One or more selected equipment items are no longer available. Go back to Dashboard and choose another item.");
      }
      if (!selectedAssets.length) {
        throw new Error("Add at least one equipment item.");
      }

      const requestedBorrowTimestamp = toStartOfDayTimestamp(requestedDate);
      const expectedReturnTimestamp = toTimestamp(expectedReturnAt);
      if (!requestedBorrowTimestamp) {
        throw new Error("Requested date is invalid.");
      }
      if (!expectedReturnTimestamp) {
        throw new Error("Expected return date is invalid.");
      }
      if (expectedReturnTimestamp < requestedBorrowTimestamp) {
        throw new Error("Expected return must be after the requested date.");
      }

      setSubmitting(true);
      const attachmentStorageId = await uploadAttachment();

      const assetLines = selectedAssets.map(
        (asset) =>
          `- ${asset.assetTag} | ${asset.assetNameDescription ?? asset.assetType ?? "Asset"} | Release condition: ${MONITORING_BORROW_CONDITION_OPTIONS[0]}`,
      );
      const requestDetails = [
        trimmedPurpose,
        `Requested date: ${new Date(requestedBorrowTimestamp).toLocaleDateString()}.`,
        `Expected return: ${new Date(expectedReturnTimestamp).toLocaleString()}.`,
        ...assetLines,
      ].join("\n");
      const requestSnapshot = [
        `Requester: ${trimmedRequesterName}`,
        `Department: ${trimmedDepartment}`,
        `Requested date: ${new Date(requestedBorrowTimestamp).toLocaleDateString()}`,
        `Expected return: ${new Date(expectedReturnTimestamp).toLocaleString()}`,
        "Workflow: Requested -> Reserved -> Released -> Returned",
        "Selected equipment:",
        ...assetLines,
      ].join("\n");

      await createTicket({
        workType: "Service Request",
        workflowType: "serviceRequest",
        category: MONITORING_BORROWING_REQUEST_CATEGORY,
        requestDetails,
        requestSnapshot,
        requestSource: REQUEST_SOURCE,
        requesterName: trimmedRequesterName,
        requesterDepartment: trimmedDepartment,
        requestedBorrowDate: requestedBorrowTimestamp,
        expectedReturnAt: expectedReturnTimestamp,
        borrowingItems: selectedAssets.map((asset) => ({
          assetId: asset._id as Id<"hardwareInventory">,
          releaseCondition: MONITORING_BORROW_CONDITION_OPTIONS[0],
        })),
        attachments: attachmentStorageId
          ? [
              {
                kind: "Reference",
                label: "Borrowing support file",
                fileName: attachmentFile?.name ?? "Attachment",
                contentType: attachmentFile?.type || undefined,
                storageId: attachmentStorageId,
                uploadedBy: currentUser?.displayName ?? trimmedRequesterName,
              },
            ]
          : undefined,
        createdBy: currentUser?.displayName ?? trimmedRequesterName,
      });

      router.push("/requests/my");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Request submission failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="request-page">
      <section className="panel request-page-panel">
        <div className="request-page-head">
          <div>
            <h1 className="request-page-title">IT Equipment Borrower</h1>
            <p className="request-page-subtitle">Fill in the borrowing details before submitting to IT.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={handleBack}>
            Back
          </button>
        </div>

        <div className="request-borrower-layout">
          <div className="request-borrower-details">
            <div className="request-form-grid">
              <label className="request-form-field">
                <span>Requester</span>
                <input
                  className="input-base"
                  value={requesterName}
                  readOnly
                  placeholder="Enter requester name"
                />
              </label>

              <label className="request-form-field">
                <span>Department</span>
                <input
                  className="input-base"
                  value={department}
                  readOnly
                  placeholder="Enter department"
                />
                {missingDepartment ? (
                  <small className="request-form-help is-warning">
                    Department is missing from your account. Please contact IT/admin.
                  </small>
                ) : null}
              </label>

              <label className="request-form-field">
                <span>Requested Date</span>
                <input
                  className="input-base"
                  type="date"
                  value={requestedDate}
                  onChange={(event) => setRequestedDate(event.target.value)}
                />
              </label>

              <label className="request-form-field">
                <span>Expected Return</span>
                <input
                  className="input-base"
                  type="datetime-local"
                  value={expectedReturnAt}
                  onChange={(event) => setExpectedReturnAt(event.target.value)}
                />
              </label>

              <label className="request-form-field request-form-field-wide">
                <span>Purpose</span>
                <textarea
                  className="input-base request-form-textarea"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="Explain why the equipment is needed."
                />
              </label>

              <div className="request-form-field request-form-field-wide">
                <FileUploadCard
                  label="Supporting File"
                  inputRef={attachmentInputRef}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onFileChange={setAttachmentFile}
                  file={attachmentFile}
                  hasAttachment={Boolean(attachmentFile)}
                  displayName="No file selected"
                  helperText="Optional approval, event brief, schedule, or supporting document."
                  badge="FILE"
                  ariaLabel="Upload borrowing support file"
                  onRemove={() => setAttachmentFile(null)}
                />
              </div>
            </div>

            {formError ? <div className="request-form-error">{formError}</div> : null}

            <div className="request-form-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={submitting || missingDepartment || availabilityLoading || unavailableSelectedAssets.length > 0}
                onClick={() => void handleSubmit()}
              >
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
              <span>This will create a borrowing ticket for IT to reserve, release, and receive back.</span>
            </div>
          </div>

          <aside className="request-equipment-side-card">
            <section className="request-selected-assets">
              <div className="request-selected-assets-head">
                <h2>Selected Equipment</h2>
                <span className="request-type-status">{selectedAssets.length}</span>
              </div>

              {availabilityLoading ? (
                <div className="request-empty-state">
                  <div className="request-empty-title">Loading selected equipment...</div>
                </div>
              ) : selectedAssets.length ? (
                <div className="request-selected-asset-list">
                  {selectedAssets.map((asset) => (
                    <div key={String(asset._id)} className="request-selected-asset-row">
                      <EquipmentThumbnail
                        storageId={asset.imageStorageId}
                        assetType={asset.assetType}
                        label={asset.assetNameDescription || asset.assetTag}
                      />
                      <div>
                        <strong>{asset.assetNameDescription || asset.assetTag}</strong>
                        <span>{[asset.assetTag, asset.assetType, asset.specifications].filter(Boolean).join(" - ")}</span>
                      </div>
                      <button
                        type="button"
                        className="request-selected-asset-remove"
                        onClick={() => handleRemoveEquipment(String(asset._id))}
                        aria-label={`Remove ${asset.assetNameDescription || asset.assetTag}`}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="request-empty-state">
                  <div className="request-empty-title">No equipment selected yet.</div>
                  <div className="request-empty-copy">Add equipment from the available list below.</div>
                </div>
              )}
            </section>

            <section className="request-selected-assets">
              <div className="request-selected-assets-head">
                <h2>Available Equipment</h2>
                <span className="request-type-status is-ready">{availableEquipmentOptions.length}</span>
              </div>

              <input
                className="input-base request-equipment-search"
                type="search"
                value={equipmentSearch}
                onChange={(event) => setEquipmentSearch(event.target.value)}
                placeholder="Search equipment..."
                aria-label="Search available equipment"
              />

              {availabilityLoading ? (
                <div className="request-empty-state">
                  <div className="request-empty-title">Loading available equipment...</div>
                </div>
              ) : availableEquipmentOptions.length ? (
                <div className="request-equipment-picker-list">
                  {availableEquipmentOptions.map((asset) => (
                    <button
                      key={String(asset._id)}
                      type="button"
                      className="request-equipment-picker-option"
                      onClick={() => handleAddEquipment(String(asset._id))}
                    >
                      <EquipmentThumbnail
                        storageId={asset.imageStorageId}
                        assetType={asset.assetType}
                        label={asset.assetNameDescription || asset.assetTag}
                      />
                      <span className="request-equipment-picker-main">
                        <strong>{asset.assetNameDescription || asset.assetTag}</strong>
                        <small>{[asset.assetTag, asset.assetType, asset.specifications].filter(Boolean).join(" - ")}</small>
                      </span>
                      <span className="request-equipment-picker-status">Add</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="request-empty-state">
                  <div className="request-empty-title">
                    {equipmentSearchTerm && availableEquipmentBaseOptions.length
                      ? "No equipment matches your search."
                      : "No equipment is available right now."}
                  </div>
                  <div className="request-empty-copy">
                    {equipmentSearchTerm && availableEquipmentBaseOptions.length
                      ? "Try another asset tag, name, type, or specification."
                      : "Requested, reserved, borrowed, or non-main-storage items are not shown here."}
                  </div>
                </div>
              )}
            </section>

            {unavailableSelectedAssets.length ? (
              <section className="request-selected-assets">
                <div className="request-selected-assets-head">
                  <h2>No Longer Available</h2>
                  <span className="request-type-status">{unavailableSelectedAssets.length}</span>
                </div>
                <div className="request-form-help is-warning">
                  These items were removed from this request because they are reserved, borrowed, pending in another request, or no longer in MAIN STORAGE.
                </div>
                <div className="request-selected-asset-list">
                  {unavailableSelectedAssets.map((asset) => (
                    <div key={String(asset._id)} className="request-selected-asset-row">
                      <EquipmentThumbnail
                        storageId={asset.imageStorageId}
                        assetType={asset.assetType}
                        label={asset.assetNameDescription || asset.assetTag}
                      />
                      <div>
                        <strong>{asset.assetNameDescription || asset.assetTag}</strong>
                        <span>{[asset.assetTag, asset.assetType, asset.status].filter(Boolean).join(" - ")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}
