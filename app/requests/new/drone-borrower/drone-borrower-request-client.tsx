"use client";

import { useRouter } from "next/navigation";
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

function isAvailableDroneKit(row: {
  assetType?: string;
  locationPersonAssigned?: string;
  registerMode?: string;
  reservationStatus?: string;
  status: string;
}) {
  return (
    row.locationPersonAssigned === "MAIN STORAGE" &&
    row.registerMode === "droneKit" &&
    (row.status === "Available" || row.status === "Working") &&
    !isReserved(row)
  );
}

function formatDroneKitSummary(asset: {
  assetTag: string;
  assetType?: string;
  assetNameDescription?: string;
}) {
  return [asset.assetTag, asset.assetType ?? "Drone Kit"].filter(Boolean).join(" - ");
}

function getDroneThumbnailLabel(assetType?: string) {
  const words = assetType?.trim().split(/\s+/).filter(Boolean) ?? [];
  const initials = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");

  return initials || "DR";
}

function DroneThumbnail({
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
        <span>{getDroneThumbnailLabel(assetType)}</span>
      )}
    </div>
  );
}

export default function DroneBorrowerRequestClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
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
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [droneSearch, setDroneSearch] = useState("");
  const [selectedDroneId, setSelectedDroneId] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const missingDepartment = !department.trim();

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
  const droneSearchTerm = droneSearch.trim();
  const availableDroneKitBaseOptions = useMemo(
    () =>
      (assets ?? [])
        .filter((asset) => isAvailableDroneKit(asset))
        .filter((asset) => !openBorrowingAssetIds.has(String(asset._id)))
        .sort((left, right) => left.assetTag.localeCompare(right.assetTag)),
    [assets, openBorrowingAssetIds],
  );
  const availableDroneKits = useMemo(
    () => {
      const search = droneSearchTerm.toLowerCase();

      return availableDroneKitBaseOptions.filter((asset) => {
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
    [availableDroneKitBaseOptions, droneSearchTerm],
  );
  const selectedDroneKit = useMemo(
    () => availableDroneKits.find((asset) => String(asset._id) === selectedDroneId),
    [availableDroneKits, selectedDroneId],
  );

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

      if (!selectedDroneKit) {
        throw new Error("Select one available drone kit.");
      }
      if (!trimmedRequesterName) {
        throw new Error("Requester name is required.");
      }
      if (!trimmedDepartment) {
        throw new Error("Team is required.");
      }
      if (!requestedDate) {
        throw new Error("Requested date is required.");
      }
      if (!expectedReturnAt) {
        throw new Error("Expected return is required.");
      }
      if (!trimmedPurpose) {
        throw new Error("Purpose / site activity is required.");
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

      const assetLine = `- ${selectedDroneKit.assetTag} | ${
        selectedDroneKit.assetNameDescription ?? selectedDroneKit.assetType ?? "Drone Kit"
      } | Release condition: ${MONITORING_BORROW_CONDITION_OPTIONS[0]}`;
      const requestDetails = [
        "Drone borrowing request.",
        trimmedPurpose,
        `Requested date: ${new Date(requestedBorrowTimestamp).toLocaleDateString()}.`,
        `Expected return: ${new Date(expectedReturnTimestamp).toLocaleString()}.`,
        "Return requirement: Flight report required before the drone kit can be returned.",
        "Requested drone kit:",
        assetLine,
      ].join("\n");
      const requestSnapshot = [
        "Request type: Drone Borrower",
        `Requester: ${trimmedRequesterName}`,
        `Team: ${trimmedDepartment}`,
        `Requested date: ${new Date(requestedBorrowTimestamp).toLocaleDateString()}`,
        `Expected return: ${new Date(expectedReturnTimestamp).toLocaleString()}`,
        "Workflow: Requested -> Reserved -> Released -> Returned with flight report",
        "Return requirement: Flight report required",
        "Selected drone kit:",
        assetLine,
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
        borrowingItems: [
          {
            assetId: selectedDroneKit._id as Id<"hardwareInventory">,
            releaseCondition: MONITORING_BORROW_CONDITION_OPTIONS[0],
          },
        ],
        attachments: attachmentStorageId
          ? [
              {
                kind: "Reference",
                label: "Drone borrowing support file",
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
      setFormError(error instanceof Error ? error.message : "Drone request submission failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="request-page">
      <section className="panel request-page-panel">
        <div className="request-page-head">
          <div>
            <h1 className="request-page-title">Drone Borrower</h1>
            <p className="request-page-subtitle">Prepare a request for an available drone kit.</p>
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
                <span>Team</span>
                <input
                  className="input-base"
                  value={department}
                  readOnly
                  placeholder="Enter team"
                />
                {missingDepartment ? (
                  <small className="request-form-help is-warning">
                    Team is missing from your account. Please contact IT/admin.
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
                <span>Purpose / Site Activity</span>
                <textarea
                  className="input-base request-form-textarea"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                  placeholder="Describe where and why the drone kit is needed."
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
                  helperText="Optional flight plan, site schedule, permit, or supporting document."
                  badge="FILE"
                  ariaLabel="Upload drone borrowing support file"
                  onRemove={() => setAttachmentFile(null)}
                />
              </div>
            </div>

            <div className="request-empty-state request-drone-note">
              <div className="request-empty-title">Flight report is required on return.</div>
              <div className="request-empty-copy">
                This request only asks to borrow the drone kit. The return workflow will handle the flight report.
              </div>
            </div>

            {formError ? <div className="request-form-error">{formError}</div> : null}

            <div className="request-form-actions">
              <button type="button" className="btn-primary" disabled={submitting || missingDepartment} onClick={() => void handleSubmit()}>
                {submitting ? "Submitting..." : "Submit Request"}
              </button>
              <span>This will create a drone borrowing ticket for IT to reserve, release, and receive back with a flight report.</span>
            </div>
          </div>

          <aside className="request-equipment-side-card">
            <section className="request-selected-assets">
              <div className="request-selected-assets-head">
                <h2>Available Drone Kits</h2>
                <span className="request-type-status is-ready">{availableDroneKits.length}</span>
              </div>

              <input
                className="input-base request-equipment-search"
                type="search"
                value={droneSearch}
                onChange={(event) => setDroneSearch(event.target.value)}
                placeholder="Search drone kits..."
                aria-label="Search available drone kits"
              />

              {assets === undefined || openRequests === undefined ? (
                <div className="request-empty-state">
                  <div className="request-empty-title">Loading drone kits...</div>
                </div>
              ) : availableDroneKits.length ? (
                <div className="request-drone-list">
                  {availableDroneKits.map((asset) => {
                    const selected = selectedDroneId === String(asset._id);

                    return (
                      <button
                        key={String(asset._id)}
                        type="button"
                        className={`request-drone-option${selected ? " is-selected" : ""}`}
                        onClick={() => setSelectedDroneId(String(asset._id))}
                      >
                        <DroneThumbnail
                          storageId={asset.imageStorageId}
                          assetType={asset.assetType}
                          label={asset.assetNameDescription || asset.assetTag}
                        />
                        <span className="request-drone-option-main">
                          <strong className="request-drone-option-title">{asset.assetNameDescription || asset.assetTag}</strong>
                          <small className="request-drone-option-meta">{formatDroneKitSummary(asset)}</small>
                        </span>
                        <span className="request-drone-option-status">{selected ? "Selected" : "Select"}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="request-empty-state">
                  <div className="request-empty-title">
                    {droneSearchTerm && availableDroneKitBaseOptions.length
                      ? "No drone kits match your search."
                      : "No drone kits are available right now."}
                  </div>
                  <div className="request-empty-copy">
                    {droneSearchTerm && availableDroneKitBaseOptions.length
                      ? "Try another asset tag, name, type, or specification."
                      : "Reserved, borrowed, or already requested drone kits are not shown here."}
                  </div>
                </div>
              )}
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}
