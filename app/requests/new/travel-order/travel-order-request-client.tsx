"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/app/current-user-context";
import FileUploadCard from "@/app/hardware-inventory/file-upload-card";

const TRAVEL_ORDER_CATEGORY = "Travel Order";
const REQUEST_SOURCE = "Requests Portal";

function toTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export default function TravelOrderRequestClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const createTicket = useMutation(api.monitoring.createTicket);
  const generateUploadUrl = useMutation(api.monitoring.generateUploadUrl);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const [requesterName, setRequesterName] = useState(currentUser?.displayName ?? "");
  const department = currentUser?.department ?? "";
  const [section, setSection] = useState(currentUser?.section ?? "");
  const [destination, setDestination] = useState("");
  const [travelPurpose, setTravelPurpose] = useState("");
  const [departureAt, setDepartureAt] = useState("");
  const [returnAt, setReturnAt] = useState("");
  const [transportationDetails, setTransportationDetails] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const missingDepartment = !department.trim();

  useEffect(() => {
    if (!requesterName.trim() && currentUser?.displayName) {
      setRequesterName(currentUser.displayName);
    }
  }, [currentUser?.displayName, requesterName]);

  useEffect(() => {
    if (!section.trim() && currentUser?.section) {
      setSection(currentUser.section);
    }
  }, [currentUser?.section, section]);

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
      const trimmedSection = section.trim();
      const trimmedDestination = destination.trim();
      const trimmedTravelPurpose = travelPurpose.trim();
      const trimmedTransportationDetails = transportationDetails.trim();
      const trimmedAdditionalNotes = additionalNotes.trim();
      const actorName = currentUser?.displayName ?? trimmedRequesterName;

      if (!trimmedRequesterName) {
        throw new Error("Requester name is required.");
      }
      if (!trimmedDepartment) {
        throw new Error("Department is required.");
      }
      if (!trimmedDestination) {
        throw new Error("Destination is required.");
      }
      if (!trimmedTravelPurpose) {
        throw new Error("Purpose of travel is required.");
      }
      if (!departureAt) {
        throw new Error("Departure date and time is required.");
      }
      if (!returnAt) {
        throw new Error("Return date and time is required.");
      }

      const departureTimestamp = toTimestamp(departureAt);
      const returnTimestamp = toTimestamp(returnAt);
      if (!departureTimestamp) {
        throw new Error("Departure date and time is invalid.");
      }
      if (!returnTimestamp) {
        throw new Error("Return date and time is invalid.");
      }
      if (returnTimestamp < departureTimestamp) {
        throw new Error("Return date and time must be after departure.");
      }

      setSubmitting(true);

      const departureText = new Date(departureTimestamp).toLocaleString();
      const returnText = new Date(returnTimestamp).toLocaleString();
      const attachmentStorageId = await uploadAttachment();
      const requestDetails = [
        `Destination: ${trimmedDestination}`,
        `Purpose of travel: ${trimmedTravelPurpose}`,
        `Departure: ${departureText}`,
        `Return: ${returnText}`,
        trimmedTransportationDetails ? `Transportation details: ${trimmedTransportationDetails}` : "",
        trimmedAdditionalNotes ? `Additional notes: ${trimmedAdditionalNotes}` : "",
        trimmedSection ? `Section: ${trimmedSection}` : "",
      ].filter(Boolean).join("\n");
      const requestSnapshot = [
        "Request type: Travel Order",
        `Requester: ${trimmedRequesterName}`,
        `Department: ${trimmedDepartment}`,
        trimmedSection ? `Section: ${trimmedSection}` : "",
        `Destination: ${trimmedDestination}`,
        `Departure: ${departureText}`,
        `Return: ${returnText}`,
      ].filter(Boolean).join("\n");

      await createTicket({
        workType: "Service Request",
        workflowType: "serviceRequest",
        category: TRAVEL_ORDER_CATEGORY,
        title: `${TRAVEL_ORDER_CATEGORY} - ${trimmedDestination}`,
        requestDetails,
        requestSnapshot,
        requestSource: REQUEST_SOURCE,
        requesterName: trimmedRequesterName,
        requesterDepartment: trimmedDepartment,
        requesterSection: trimmedSection || undefined,
        impact: "Single User",
        urgency: "Can Wait",
        attachments: attachmentStorageId
          ? [
              {
                kind: "Reference",
                label: "Supporting file",
                fileName: attachmentFile?.name ?? "Attachment",
                contentType: attachmentFile?.type || undefined,
                storageId: attachmentStorageId,
                uploadedBy: actorName,
              },
            ]
          : undefined,
        createdBy: actorName,
      });

      router.push("/requests/my");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Travel order submission failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="request-page">
      <section className="panel request-page-panel">
        <div className="request-page-head">
          <div>
            <h1 className="request-page-title">Travel Order</h1>
            <p className="request-page-subtitle">Submit travel details for HR/Admin processing.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={handleBack}>
            Back
          </button>
        </div>

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
                Department is missing from your account. Please contact HR/Admin.
              </small>
            ) : null}
          </label>

          <label className="request-form-field">
            <span>Section</span>
            <input
              className="input-base"
              value={section}
              onChange={(event) => setSection(event.target.value)}
              placeholder="Enter section"
            />
          </label>

          <label className="request-form-field">
            <span>Destination</span>
            <input
              className="input-base"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="City, branch, client site, or location"
            />
          </label>

          <label className="request-form-field">
            <span>Departure Date / Time</span>
            <input
              className="input-base"
              type="datetime-local"
              value={departureAt}
              onChange={(event) => setDepartureAt(event.target.value)}
            />
          </label>

          <label className="request-form-field">
            <span>Return Date / Time</span>
            <input
              className="input-base"
              type="datetime-local"
              value={returnAt}
              onChange={(event) => setReturnAt(event.target.value)}
            />
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Purpose of Travel</span>
            <textarea
              className="input-base request-form-textarea"
              value={travelPurpose}
              onChange={(event) => setTravelPurpose(event.target.value)}
              placeholder="Explain the official purpose of the travel."
            />
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Transportation Details</span>
            <textarea
              className="input-base request-form-textarea"
              value={transportationDetails}
              onChange={(event) => setTransportationDetails(event.target.value)}
              placeholder="Add vehicle, route, driver, booking, or reimbursement details if known."
            />
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Additional Notes</span>
            <textarea
              className="input-base request-form-textarea"
              value={additionalNotes}
              onChange={(event) => setAdditionalNotes(event.target.value)}
              placeholder="Add schedule notes, contact person, reference number, or special instructions."
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
              helperText="Optional invitation, itinerary, approval, or supporting document."
              badge="FILE"
              ariaLabel="Upload supporting file"
              onRemove={() => setAttachmentFile(null)}
            />
          </div>
        </div>

        {formError ? <div className="request-form-error">{formError}</div> : null}

        <div className="request-form-actions">
          <button
            type="button"
            className="btn-primary"
            disabled={submitting || missingDepartment}
            onClick={() => void handleSubmit()}
          >
            {submitting ? "Submitting..." : "Submit Travel Order"}
          </button>
          <span>This will create a travel order request for HR/Admin.</span>
        </div>
      </section>
    </div>
  );
}
