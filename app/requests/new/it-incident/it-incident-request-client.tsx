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
  MONITORING_URGENCY_OPTIONS,
} from "@/lib/monitoring";

export default function ItIncidentRequestClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const createTicket = useMutation(api.monitoring.createTicket);
  const generateUploadUrl = useMutation(api.monitoring.generateUploadUrl);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [requesterName, setRequesterName] = useState(currentUser?.displayName ?? "");
  const [department, setDepartment] = useState("");
  const [section, setSection] = useState("");
  const [category, setCategory] = useState("Hardware & Peripherals");
  const [impact, setImpact] = useState("Single User");
  const [urgency, setUrgency] = useState("Can Wait");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      const trimmedDetails = details.trim();
      const actorName = currentUser?.displayName ?? trimmedRequesterName;

      if (!trimmedRequesterName) {
        throw new Error("Requester name is required.");
      }
      if (!trimmedDepartment) {
        throw new Error("Department is required.");
      }
      if (!trimmedTitle) {
        throw new Error("Issue title is required.");
      }
      if (!trimmedDetails) {
        throw new Error("Issue details are required.");
      }

      setSubmitting(true);

      const attachmentStorageId = await uploadAttachment();
      const requestDetails = [
        trimmedDetails,
        trimmedSection ? `Section: ${trimmedSection}` : "",
      ].filter(Boolean).join("\n");
      const requestSnapshot = [
        "Request type: IT Incident",
        `Requester: ${trimmedRequesterName}`,
        `Department: ${trimmedDepartment}`,
        trimmedSection ? `Section: ${trimmedSection}` : "",
        `Category: ${category}`,
        `Impact: ${impact}`,
        `Urgency: ${urgency}`,
      ].filter(Boolean).join("\n");

      await createTicket({
        workType: "Incident",
        workflowType: "incident",
        category,
        title: trimmedTitle,
        requestDetails,
        requestSnapshot,
        requestSource: MONITORING_REQUEST_SOURCE,
        requesterName: trimmedRequesterName,
        requesterDepartment: trimmedDepartment,
        requesterSection: trimmedSection || undefined,
        impact,
        urgency,
        attachments: attachmentStorageId
          ? [
              {
                kind: "Screenshot",
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
      setFormError(error instanceof Error ? error.message : "Incident request submission failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="request-page">
      <section className="panel request-page-panel">
        <div className="request-page-head">
          <div>
            <h1 className="request-page-title">IT Incident</h1>
            <p className="request-page-subtitle">Report an issue that needs IT help.</p>
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
              onChange={(event) => setRequesterName(event.target.value)}
              placeholder="Enter requester name"
            />
          </label>

          <label className="request-form-field">
            <span>Department</span>
            <input
              className="input-base"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              placeholder="Enter department"
            />
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
            <span>Impact</span>
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

          <label className="request-form-field">
            <span>Urgency</span>
            <select
              className="input-base"
              value={urgency}
              onChange={(event) => setUrgency(event.target.value)}
            >
              {MONITORING_URGENCY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Issue Title</span>
            <input
              className="input-base"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Short summary of the issue"
            />
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Issue Details</span>
            <textarea
              className="input-base request-form-textarea"
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Describe what happened, when it started, and what is affected."
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
              helperText="Optional screenshot or supporting file."
              badge="FILE"
              ariaLabel="Upload supporting file"
              onRemove={() => setAttachmentFile(null)}
            />
          </div>
        </div>

        {formError ? <div className="request-form-error">{formError}</div> : null}

        <div className="request-form-actions">
          <button type="button" className="btn-primary" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
          <span>This will create an incident ticket for IT staff.</span>
        </div>
      </section>
    </div>
  );
}
