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
  MONITORING_IT_EXEMPTION_CATEGORY,
} from "@/lib/monitoring";

const REQUEST_SOURCE = "Requests Portal";
const EXEMPTION_TYPES = [
  "Temporary policy exception",
  "Access exception",
  "Device / software exception",
  "Security control exception",
  "Other",
] as const;

export default function ItExemptionRequestClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const createTicket = useMutation(api.monitoring.createTicket);
  const generateUploadUrl = useMutation(api.monitoring.generateUploadUrl);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const [requesterName, setRequesterName] = useState(currentUser?.displayName ?? "");
  const department = currentUser?.department ?? "";
  const [section, setSection] = useState(currentUser?.section ?? "");
  const [exemptionType, setExemptionType] = useState<(typeof EXEMPTION_TYPES)[number]>(EXEMPTION_TYPES[0]);
  const [title, setTitle] = useState("");
  const [policyOrSystem, setPolicyOrSystem] = useState("");
  const [reason, setReason] = useState("");
  const [businessJustification, setBusinessJustification] = useState("");
  const [requestedDuration, setRequestedDuration] = useState("");
  const [riskControls, setRiskControls] = useState("");
  const [impact, setImpact] = useState("Single User");
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
      const trimmedTitle = title.trim();
      const trimmedPolicyOrSystem = policyOrSystem.trim();
      const trimmedReason = reason.trim();
      const trimmedBusinessJustification = businessJustification.trim();
      const trimmedRequestedDuration = requestedDuration.trim();
      const trimmedRiskControls = riskControls.trim();
      const actorName = currentUser?.displayName ?? trimmedRequesterName;

      if (!trimmedRequesterName) {
        throw new Error("Requester name is required.");
      }
      if (!trimmedDepartment) {
        throw new Error("Team is required.");
      }
      if (!trimmedTitle) {
        throw new Error("Exemption title is required.");
      }
      if (!trimmedPolicyOrSystem) {
        throw new Error("Policy, system, or control is required.");
      }
      if (!trimmedReason) {
        throw new Error("Exception reason is required.");
      }
      if (!trimmedBusinessJustification) {
        throw new Error("Business justification is required.");
      }
      if (!trimmedRequestedDuration) {
        throw new Error("Requested duration is required.");
      }
      if (!trimmedRiskControls) {
        throw new Error("Risk controls are required.");
      }

      setSubmitting(true);

      const attachmentStorageId = await uploadAttachment();
      const requestDetails = [
        `Exemption type: ${exemptionType}`,
        `Policy / system / control: ${trimmedPolicyOrSystem}`,
        `Reason: ${trimmedReason}`,
        `Business justification: ${trimmedBusinessJustification}`,
        `Requested duration: ${trimmedRequestedDuration}`,
        `Risk controls: ${trimmedRiskControls}`,
        trimmedSection ? `Section: ${trimmedSection}` : "",
      ].filter(Boolean).join("\n");
      const requestSnapshot = [
        "Request type: IT Exemption Form",
        `Requester: ${trimmedRequesterName}`,
        `Team: ${trimmedDepartment}`,
        trimmedSection ? `Section: ${trimmedSection}` : "",
        `Exemption type: ${exemptionType}`,
        `Scope: ${impact}`,
        `Policy / system / control: ${trimmedPolicyOrSystem}`,
        `Requested duration: ${trimmedRequestedDuration}`,
        "Approval path: IT Team Leader -> OSMD Manager",
      ].filter(Boolean).join("\n");

      await createTicket({
        workType: "Service Request",
        workflowType: "serviceRequest",
        category: MONITORING_IT_EXEMPTION_CATEGORY,
        title: trimmedTitle,
        requestDetails,
        requestSnapshot,
        requestSource: REQUEST_SOURCE,
        requesterName: trimmedRequesterName,
        requesterDepartment: trimmedDepartment,
        requesterSection: trimmedSection || undefined,
        impact,
        urgency: "Can Wait",
        requiresSensitiveAccess: true,
        attachments: attachmentStorageId
          ? [
              {
                kind: "Approval Proof",
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
      setFormError(error instanceof Error ? error.message : "IT exemption submission failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="request-page">
      <section className="panel request-page-panel">
        <div className="request-page-head">
          <div>
            <h1 className="request-page-title">IT Exemption Form</h1>
            <p className="request-page-subtitle">Request approval for an exception from a normal IT rule or control.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={handleBack}>
            Back
          </button>
        </div>

        <div className="request-form-grid">
          <label className="request-form-field">
            <span>Requester</span>
            <input className="input-base" value={requesterName} readOnly placeholder="Enter requester name" />
          </label>

          <label className="request-form-field">
            <span>Team</span>
            <input className="input-base" value={department} readOnly placeholder="Enter team" />
            {missingDepartment ? (
              <small className="request-form-help is-warning">
                Team is missing from your account. Please contact IT/admin.
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
            <span>Exemption Type</span>
            <select
              className="input-base"
              value={exemptionType}
              onChange={(event) => setExemptionType(event.target.value as (typeof EXEMPTION_TYPES)[number])}
            >
              {EXEMPTION_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Exemption Title</span>
            <input
              className="input-base"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Short summary of the requested exception"
            />
          </label>

          <label className="request-form-field">
            <span>Policy / System / Control</span>
            <input
              className="input-base"
              value={policyOrSystem}
              onChange={(event) => setPolicyOrSystem(event.target.value)}
              placeholder="Policy, system, app, device, or access control"
            />
          </label>

          <label className="request-form-field">
            <span>Scope</span>
            <select className="input-base" value={impact} onChange={(event) => setImpact(event.target.value)}>
              {MONITORING_IMPACT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Exception Reason</span>
            <textarea
              className="input-base request-form-textarea"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Explain what normal rule or process cannot be followed."
            />
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Business Justification</span>
            <textarea
              className="input-base request-form-textarea"
              value={businessJustification}
              onChange={(event) => setBusinessJustification(event.target.value)}
              placeholder="Explain why the exception is needed for work."
            />
          </label>

          <label className="request-form-field">
            <span>Requested Duration</span>
            <input
              className="input-base"
              value={requestedDuration}
              onChange={(event) => setRequestedDuration(event.target.value)}
              placeholder="Example: Until May 31, 2026"
            />
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Risk Controls</span>
            <textarea
              className="input-base request-form-textarea"
              value={riskControls}
              onChange={(event) => setRiskControls(event.target.value)}
              placeholder="Explain how risk will be reduced while the exception is active."
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
              helperText="Optional approval, email, screenshot, or supporting document."
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
            {submitting ? "Submitting..." : "Submit Exemption"}
          </button>
          <span>This will create an IT approval request for IT Team Leader and OSMD Manager review.</span>
        </div>
      </section>
    </div>
  );
}
