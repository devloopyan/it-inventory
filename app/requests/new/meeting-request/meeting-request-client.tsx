"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/app/current-user-context";
import FileUploadCard from "@/app/hardware-inventory/file-upload-card";
import {
  MONITORING_MEETING_MODES,
  MONITORING_MEETING_REQUEST_CATEGORY,
} from "@/lib/monitoring";

const REQUEST_SOURCE = "Requests Portal";

function toTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatDateTime(value: number) {
  return new Date(value).toLocaleString();
}

export default function MeetingRequestClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const createTicket = useMutation(api.monitoring.createTicket);
  const generateUploadUrl = useMutation(api.monitoring.generateUploadUrl);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const [requesterName, setRequesterName] = useState(currentUser?.displayName ?? "");
  const department = currentUser?.department ?? "";
  const [section, setSection] = useState(currentUser?.section ?? "");
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingMode, setMeetingMode] = useState<(typeof MONITORING_MEETING_MODES)[number]>(
    MONITORING_MEETING_MODES[0],
  );
  const [meetingStart, setMeetingStart] = useState("");
  const [meetingEnd, setMeetingEnd] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [attendeeCount, setAttendeeCount] = useState("");
  const [supportNeeded, setSupportNeeded] = useState("");
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
      const trimmedMeetingTitle = meetingTitle.trim();
      const trimmedMeetingLocation = meetingLocation.trim();
      const trimmedAttendeeCount = attendeeCount.trim();
      const trimmedSupportNeeded = supportNeeded.trim();
      const trimmedAdditionalNotes = additionalNotes.trim();

      if (!trimmedRequesterName) {
        throw new Error("Requester name is required.");
      }
      if (!trimmedDepartment) {
        throw new Error("Department is required.");
      }
      if (!trimmedMeetingTitle) {
        throw new Error("Meeting title is required.");
      }
      if (!meetingStart) {
        throw new Error("Meeting start is required.");
      }
      if (!meetingEnd) {
        throw new Error("Meeting end is required.");
      }
      if (!trimmedMeetingLocation) {
        throw new Error("Location / platform is required.");
      }
      if (!trimmedAttendeeCount) {
        throw new Error("Expected attendees is required.");
      }
      if (!trimmedSupportNeeded) {
        throw new Error("Support needed is required.");
      }

      const meetingStartAt = toTimestamp(meetingStart);
      const meetingEndAt = toTimestamp(meetingEnd);
      if (!meetingStartAt) {
        throw new Error("Meeting start is invalid.");
      }
      if (!meetingEndAt) {
        throw new Error("Meeting end is invalid.");
      }
      if (meetingEndAt <= meetingStartAt) {
        throw new Error("Meeting end must be after the meeting start.");
      }

      setSubmitting(true);

      const scheduleText = `${formatDateTime(meetingStartAt)} to ${formatDateTime(meetingEndAt)}`;
      const attachmentStorageId = await uploadAttachment();
      const title = `Meeting Support - ${trimmedMeetingTitle}`;
      const requestDetails = [
        `Meeting support requested for "${trimmedMeetingTitle}".`,
        `Schedule: ${scheduleText}.`,
        `${meetingMode} meeting at ${trimmedMeetingLocation}.`,
        `Expected attendees: ${trimmedAttendeeCount}.`,
        `Support needed: ${trimmedSupportNeeded}.`,
        trimmedAdditionalNotes ? `Additional notes: ${trimmedAdditionalNotes}.` : "",
        trimmedSection ? `Section: ${trimmedSection}.` : "",
      ].filter(Boolean).join("\n");
      const requestSnapshot = [
        "Request type: Meeting Request",
        `Requester: ${trimmedRequesterName}`,
        `Department: ${trimmedDepartment}`,
        trimmedSection ? `Section: ${trimmedSection}` : "",
        `Meeting title: ${trimmedMeetingTitle}`,
        `Mode: ${meetingMode}`,
        `Schedule: ${scheduleText}`,
        `Location / platform: ${trimmedMeetingLocation}`,
        `Expected attendees: ${trimmedAttendeeCount}`,
        `Support needed: ${trimmedSupportNeeded}`,
        "Approval required: No",
        "Workflow: New -> Reserved -> Ready -> Done",
      ].filter(Boolean).join("\n");

      await createTicket({
        workType: "Service Request",
        workflowType: "serviceRequest",
        category: MONITORING_MEETING_REQUEST_CATEGORY,
        title,
        requestDetails,
        requestSnapshot,
        requestSource: REQUEST_SOURCE,
        requesterName: trimmedRequesterName,
        requesterDepartment: trimmedDepartment,
        requesterSection: trimmedSection || undefined,
        meetingMode,
        meetingLocation: trimmedMeetingLocation,
        meetingStartAt,
        meetingEndAt,
        meetingAttendeeCount: trimmedAttendeeCount,
        attachments: attachmentStorageId
          ? [
              {
                kind: "Reference",
                label: "Meeting support file",
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
      setFormError(error instanceof Error ? error.message : "Meeting request submission failed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="request-page">
      <section className="panel request-page-panel">
        <div className="request-page-head">
          <div>
            <h1 className="request-page-title">Meeting Request</h1>
            <p className="request-page-subtitle">Request meeting support, room setup, or equipment assistance.</p>
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
            <span>Department</span>
            <input className="input-base" value={department} readOnly placeholder="Enter department" />
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
            <span>Meeting Mode</span>
            <select
              className="input-base"
              value={meetingMode}
              onChange={(event) => setMeetingMode(event.target.value as (typeof MONITORING_MEETING_MODES)[number])}
            >
              {MONITORING_MEETING_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Meeting Title</span>
            <input
              className="input-base"
              value={meetingTitle}
              onChange={(event) => setMeetingTitle(event.target.value)}
              placeholder="Short meeting title or activity name"
            />
          </label>

          <label className="request-form-field">
            <span>Meeting Start</span>
            <input
              className="input-base"
              type="datetime-local"
              value={meetingStart}
              onChange={(event) => setMeetingStart(event.target.value)}
            />
          </label>

          <label className="request-form-field">
            <span>Meeting End</span>
            <input
              className="input-base"
              type="datetime-local"
              value={meetingEnd}
              onChange={(event) => setMeetingEnd(event.target.value)}
            />
          </label>

          <label className="request-form-field">
            <span>Location / Platform</span>
            <input
              className="input-base"
              value={meetingLocation}
              onChange={(event) => setMeetingLocation(event.target.value)}
              placeholder="Conference room, Teams, Zoom, client site"
            />
          </label>

          <label className="request-form-field">
            <span>Expected Attendees</span>
            <input
              className="input-base"
              value={attendeeCount}
              onChange={(event) => setAttendeeCount(event.target.value)}
              placeholder="Example: 12"
            />
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Support Needed</span>
            <textarea
              className="input-base request-form-textarea"
              value={supportNeeded}
              onChange={(event) => setSupportNeeded(event.target.value)}
              placeholder="Room setup, projector, Teams support, recording, laptop, speaker, or other needs."
            />
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Additional Notes</span>
            <textarea
              className="input-base request-form-textarea"
              value={additionalNotes}
              onChange={(event) => setAdditionalNotes(event.target.value)}
              placeholder="Add special instructions, contact person, agenda link, or timing notes."
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
              helperText="Optional agenda, invitation, layout, reservation screenshot, or setup reference."
              badge="FILE"
              ariaLabel="Upload meeting support file"
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
            {submitting ? "Submitting..." : "Submit Meeting Request"}
          </button>
          <span>This will create a meeting setup request with no approval step.</span>
        </div>
      </section>
    </div>
  );
}
