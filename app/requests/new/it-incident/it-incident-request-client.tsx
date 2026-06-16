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
  MONITORING_TICKET_CATEGORIES,
} from "@/lib/monitoring";

const REQUEST_SOURCE = "Requests Portal";

const IT_SUPPORT_CATEGORY_EXAMPLES: Record<string, string> = {
  "Network & Connectivity": "No internet, slow connection, Wi-Fi issue, VPN problem.",
  "Accounts & Access": "Forgot password, cannot log in, locked account, access suddenly stopped.",
  "Microsoft 365": "Outlook, Teams, OneDrive, SharePoint, or Microsoft app issue.",
  "Hardware & Peripherals": "PC, laptop, monitor, printer, mouse, keyboard, or headset issue.",
  "Software & Applications": "Application error, app not opening, installation problem, system bug.",
  "Procurement & Replacement": "Broken device that may need replacement or purchase review.",
  "Security & Sensitive Access": "Suspicious email, possible malware, sensitive access issue.",
  Other: "Use this when the issue does not match the listed categories.",
};

const WORK_STATUS_OPTIONS = [
  "I can still work",
  "Work is slowed",
  "I cannot do my work",
  "A team or operation is blocked",
] as const;

function resolveUrgencyFromWorkStatus(workStatus: string) {
  switch (workStatus) {
    case "I cannot do my work":
      return "Same Day";
    case "A team or operation is blocked":
      return "Immediate";
    case "Work is slowed":
    case "I can still work":
    default:
      return "Can Wait";
  }
}

export default function ItIncidentRequestClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const createTicket = useMutation(api.monitoring.createTicket);
  const generateUploadUrl = useMutation(api.monitoring.generateUploadUrl);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [requesterName, setRequesterName] = useState(currentUser?.displayName ?? "");
  const department = currentUser?.department ?? "";
  const [section, setSection] = useState(currentUser?.section ?? "");
  const [category, setCategory] = useState("Hardware & Peripherals");
  const [impact, setImpact] = useState("Single User");
  const [workStatus, setWorkStatus] = useState<(typeof WORK_STATUS_OPTIONS)[number]>("I can still work");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const categoryExamples = IT_SUPPORT_CATEGORY_EXAMPLES[category];
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
      const trimmedDetails = details.trim();
      const actorName = currentUser?.displayName ?? trimmedRequesterName;

      if (!trimmedRequesterName) {
        throw new Error("Requester name is required.");
      }
      if (!trimmedDepartment) {
        throw new Error("Team is required.");
      }
      if (!trimmedTitle) {
        throw new Error("Issue title is required.");
      }
      if (!trimmedDetails) {
        throw new Error("Issue details are required.");
      }

      setSubmitting(true);

      const urgency = resolveUrgencyFromWorkStatus(workStatus);
      const attachmentStorageId = await uploadAttachment();
      const requestDetails = [
        trimmedDetails,
        `Work status: ${workStatus}`,
        "Workflow: New -> Triage -> In Progress -> Resolved",
        trimmedSection ? `Section: ${trimmedSection}` : "",
      ].filter(Boolean).join("\n");
      const requestSnapshot = [
        "Request type: IT Support",
        `Requester: ${trimmedRequesterName}`,
        `Team: ${trimmedDepartment}`,
        trimmedSection ? `Section: ${trimmedSection}` : "",
        `Category: ${category}`,
        `Impact: ${impact}`,
        `Work status: ${workStatus}`,
        `Triage urgency: ${urgency}`,
        "Workflow: New -> Triage -> In Progress -> Resolved",
      ].filter(Boolean).join("\n");

      await createTicket({
        workType: "Incident",
        workflowType: "incident",
        category,
        title: trimmedTitle,
        requestDetails,
        requestSnapshot,
        requestSource: REQUEST_SOURCE,
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
      setFormError(error instanceof Error ? error.message : "IT support request submission failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="request-page">
      <section className="panel request-page-panel">
        <div className="request-page-head">
          <div>
            <h1 className="request-page-title">IT Support</h1>
            <p className="request-page-subtitle">
              Use this when something is broken, blocked, or not working normally.
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
                <option
                  key={option}
                  value={option}
                  title={IT_SUPPORT_CATEGORY_EXAMPLES[option]}
                >
                  {option}
                </option>
              ))}
            </select>
            {categoryExamples ? (
              <small className="request-form-help">Examples: {categoryExamples}</small>
            ) : null}
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
            <span>How affected are you?</span>
            <select
              className="input-base"
              value={workStatus}
              onChange={(event) =>
                setWorkStatus(event.target.value as (typeof WORK_STATUS_OPTIONS)[number])
              }
            >
              {WORK_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <small className="request-form-help">
              IT will use this during triage to set the final urgency.
            </small>
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
          <button type="button" className="btn-primary" disabled={submitting || missingDepartment} onClick={() => void handleSubmit()}>
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
          <span>This will create a support ticket for IT staff.</span>
        </div>
      </section>
    </div>
  );
}
