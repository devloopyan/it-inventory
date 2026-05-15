"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/app/current-user-context";
import FileUploadCard from "@/app/hardware-inventory/file-upload-card";
import {
  MONITORING_IMPACT_OPTIONS,
  MONITORING_REQUEST_SOURCE,
  MONITORING_TICKET_CATEGORIES,
} from "@/lib/monitoring";

const IT_REQUEST_TYPES = [
  "New service",
  "Access request",
  "Data / record request",
  "Recording request",
  "Setup",
  "Change",
] as const;

export default function ItRequestClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const createTicket = useMutation(api.monitoring.createTicket);
  const generateUploadUrl = useMutation(api.monitoring.generateUploadUrl);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [requesterName, setRequesterName] = useState(currentUser?.displayName ?? "");
  const department = currentUser?.department ?? "";
  const [section, setSection] = useState(currentUser?.section ?? "");
  const [requestType, setRequestType] = useState<(typeof IT_REQUEST_TYPES)[number]>("New service");
  const [category, setCategory] = useState("Software & Applications");
  const [impact, setImpact] = useState("Single User");
  const [title, setTitle] = useState("");
  const [systemResource, setSystemResource] = useState("");
  const [businessPurpose, setBusinessPurpose] = useState("");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [requiresPurchase, setRequiresPurchase] = useState(false);
  const [requiresReplacement, setRequiresReplacement] = useState(false);
  const [requiresSensitiveAccess, setRequiresSensitiveAccess] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const missingDepartment = !department.trim();

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
      const trimmedSection = section.trim();
      const trimmedTitle = title.trim();
      const trimmedSystemResource = systemResource.trim();
      const trimmedBusinessPurpose = businessPurpose.trim();
      const trimmedDesiredOutcome = desiredOutcome.trim();
      const trimmedAdditionalNotes = additionalNotes.trim();
      const actorName = currentUser?.displayName ?? trimmedRequesterName;

      if (!trimmedRequesterName) {
        throw new Error("Requester name is required.");
      }
      if (!trimmedDepartment) {
        throw new Error("Department is required.");
      }
      if (!trimmedTitle) {
        throw new Error("Request title is required.");
      }
      if (!trimmedSystemResource) {
        throw new Error("System or resource is required.");
      }
      if (!trimmedBusinessPurpose) {
        throw new Error("Business purpose is required.");
      }
      if (!trimmedDesiredOutcome) {
        throw new Error("Desired outcome is required.");
      }

      setSubmitting(true);

      const neededByText = neededBy ? new Date(neededBy).toLocaleString() : "";
      const approvalSignals = [
        requiresPurchase ? "Purchase needed" : "",
        requiresReplacement ? "Replacement needed" : "",
        requiresSensitiveAccess ? "Sensitive access involved" : "",
      ].filter(Boolean);
      const attachmentStorageId = await uploadAttachment();
      const requestDetails = [
        `Request type: ${requestType}`,
        `System / resource: ${trimmedSystemResource}`,
        `Business purpose: ${trimmedBusinessPurpose}`,
        `Desired outcome: ${trimmedDesiredOutcome}`,
        neededByText ? `Needed by: ${neededByText}` : "",
        approvalSignals.length ? `Approval signals: ${approvalSignals.join(", ")}` : "",
        trimmedAdditionalNotes ? `Additional notes: ${trimmedAdditionalNotes}` : "",
        trimmedSection ? `Section: ${trimmedSection}` : "",
      ].filter(Boolean).join("\n");
      const requestSnapshot = [
        "Request type: IT Request",
        `Request action: ${requestType}`,
        `Requester: ${trimmedRequesterName}`,
        `Department: ${trimmedDepartment}`,
        trimmedSection ? `Section: ${trimmedSection}` : "",
        `Category: ${category}`,
        `Scope: ${impact}`,
        `System / resource: ${trimmedSystemResource}`,
        "Nature: Planned / non-urgent",
        neededByText ? `Needed by: ${neededByText}` : "",
        approvalSignals.length ? `Approval signals: ${approvalSignals.join(", ")}` : "",
      ].filter(Boolean).join("\n");

      await createTicket({
        workType: "Service Request",
        workflowType: "serviceRequest",
        category,
        title: trimmedTitle,
        requestDetails,
        requestSnapshot,
        requestSource: MONITORING_REQUEST_SOURCE,
        requesterName: trimmedRequesterName,
        requesterDepartment: trimmedDepartment,
        requesterSection: trimmedSection || undefined,
        impact,
        urgency: "Can Wait",
        requiresPurchase,
        requiresReplacement,
        requiresSensitiveAccess,
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
      setFormError(error instanceof Error ? error.message : "IT request submission failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="request-page">
      <section className="panel request-page-panel">
        <div className="request-page-head">
          <div>
            <h1 className="request-page-title">IT Request</h1>
            <p className="request-page-subtitle">
              Use this when IT needs to create, change, retrieve, grant, or set up something.
            </p>
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
                Department is missing from your account. Please contact IT/admin.
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
            <span>Request Type</span>
            <select
              className="input-base"
              value={requestType}
              onChange={(event) =>
                setRequestType(event.target.value as (typeof IT_REQUEST_TYPES)[number])
              }
            >
              {IT_REQUEST_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="request-form-field">
            <span>Category</span>
            <select
              className="input-base"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {MONITORING_TICKET_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="request-form-field">
            <span>Scope</span>
            <select
              className="input-base"
              value={impact}
              onChange={(event) => setImpact(event.target.value)}
            >
              {MONITORING_IMPACT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Request Title</span>
            <input
              className="input-base"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Short summary of what you need"
            />
          </label>

          <label className="request-form-field">
            <span>System / Resource</span>
            <input
              className="input-base"
              value={systemResource}
              onChange={(event) => setSystemResource(event.target.value)}
              placeholder="System, app, account, hardware, or access"
            />
          </label>

          <label className="request-form-field">
            <span>Needed By</span>
            <input
              className="input-base"
              type="datetime-local"
              value={neededBy}
              onChange={(event) => setNeededBy(event.target.value)}
            />
          </label>

          <div className="request-form-field">
            <span>Approval Flags</span>
            <div className="request-form-checkboxes">
              <label>
                <input
                  type="checkbox"
                  checked={requiresPurchase}
                  onChange={(event) => setRequiresPurchase(event.target.checked)}
                />
                Purchase
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={requiresReplacement}
                  onChange={(event) => setRequiresReplacement(event.target.checked)}
                />
                Replacement
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={requiresSensitiveAccess}
                  onChange={(event) => setRequiresSensitiveAccess(event.target.checked)}
                />
                Sensitive access
              </label>
            </div>
          </div>

          <label className="request-form-field request-form-field-wide">
            <span>Business Purpose</span>
            <textarea
              className="input-base request-form-textarea"
              value={businessPurpose}
              onChange={(event) => setBusinessPurpose(event.target.value)}
              placeholder="Explain why the new service, access, setup, or change is needed."
            />
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Desired Outcome</span>
            <textarea
              className="input-base request-form-textarea"
              value={desiredOutcome}
              onChange={(event) => setDesiredOutcome(event.target.value)}
              placeholder="Describe what should be created, changed, configured, or granted."
            />
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Additional Notes</span>
            <textarea
              className="input-base request-form-textarea"
              value={additionalNotes}
              onChange={(event) => setAdditionalNotes(event.target.value)}
              placeholder="Add links, reference accounts, affected users, location, or schedule notes."
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
              helperText="Optional reference, approval, screenshot, or supporting file."
              badge="FILE"
              ariaLabel="Upload supporting file"
              onRemove={() => setAttachmentFile(null)}
            />
          </div>
        </div>

        {formError ? <div className="request-form-error">{formError}</div> : null}

        <div className="request-form-actions">
          <button type="button" className="btn-primary" disabled={submitting || missingDepartment} onClick={() => void handleSubmit()}>
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
          <span>This will create a planned service request ticket for IT staff.</span>
        </div>
      </section>
    </div>
  );
}
