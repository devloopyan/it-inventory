"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/app/current-user-context";
import FileUploadCard from "@/app/hardware-inventory/file-upload-card";
import {
  MONITORING_MEETING_MODES,
  MONITORING_MEETING_REQUEST_CATEGORY,
} from "@/lib/monitoring";

const REQUEST_SOURCE = "Requests Portal";
const CONFERENCE_ROOM = "Main conference room";
const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const TIME_SLOTS = [8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

function toTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatDateTime(value: number) {
  return new Date(value).toLocaleString();
}

function hourLabel(h: number) {
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

function toInputValue(day: Date, hour: number) {
  const d = new Date(day);
  d.setHours(hour, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`;
}

function slotOverlaps(
  bookings: Array<{ meetingStartAt: number; meetingEndAt: number }>,
  day: Date,
  hour: number,
) {
  const s = new Date(day); s.setHours(hour, 0, 0, 0);
  const e = new Date(day); e.setHours(hour + 1, 0, 0, 0);
  return bookings.some((b) => b.meetingStartAt < e.getTime() && b.meetingEndAt > s.getTime());
}

export default function MeetingRequestClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const createTicket = useMutation(api.monitoring.createTicket);
  const generateUploadUrl = useMutation(api.monitoring.generateUploadUrl);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const attendeeLookupRef = useRef<HTMLDivElement | null>(null);
  const systemUsers = useQuery(api.users.list, {});

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
  const [taggedAttendees, setTaggedAttendees] = useState<string[]>([]);
  const [attendeeInput, setAttendeeInput] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingStart, setPendingStart] = useState<{ dayIdx: number; hour: number } | null>(null);
  const missingDepartment = !department.trim();
  const meetingStartTs = toTimestamp(meetingStart);
  const meetingEndTs = toTimestamp(meetingEnd);
  const showRoomPanel = meetingMode === "Onsite" || meetingMode === "Hybrid";

  const refDate = meetingStartTs ? new Date(meetingStartTs) : new Date();
  const refDay = refDate.getDay();
  const weekMonday = new Date(refDate);
  weekMonday.setDate(refDate.getDate() + (refDay === 0 ? -6 : 1 - refDay));
  weekMonday.setHours(0, 0, 0, 0);
  const weekDays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekMonday);
    d.setDate(weekMonday.getDate() + i);
    return d;
  });
  const calStart = new Date(weekDays[0]); calStart.setHours(8, 0, 0, 0);
  const calEnd = new Date(weekDays[4]); calEnd.setHours(17, 0, 0, 0);
  const roomBookings = useQuery(
    api.monitoring.listRoomBookings,
    showRoomPanel
      ? { rangeStart: calStart.getTime(), rangeEnd: calEnd.getTime() }
      : "skip",
  );
  const confBookings = (roomBookings ?? []).filter((b) => b.meetingLocation === CONFERENCE_ROOM);

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

  const [attendeeLookupOpen, setAttendeeLookupOpen] = useState(false);

  useEffect(() => {
    if (!attendeeLookupOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!attendeeLookupRef.current?.contains(event.target as Node)) {
        setAttendeeLookupOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [attendeeLookupOpen]);

  const attendeeSuggestions = (systemUsers ?? []).filter(
    (u) =>
      u.active !== false &&
      u.displayName !== requesterName &&
      !taggedAttendees.includes(u.displayName) &&
      u.displayName.toLowerCase().includes(attendeeInput.toLowerCase()),
  );

  function handleSelectAttendee(displayName: string) {
    setTaggedAttendees((prev) => [...prev, displayName]);
    setAttendeeInput("");
    setAttendeeLookupOpen(false);
  }

  function handleRemoveAttendee(name: string) {
    setTaggedAttendees((prev) => prev.filter((a) => a !== name));
  }

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
        taggedAttendees.length ? `Tagged attendees: ${taggedAttendees.join(", ")}.` : "",
        `Support needed: ${trimmedSupportNeeded}.`,
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
        taggedAttendees.length ? `Tagged attendees: ${taggedAttendees.join(", ")}` : "",
        `Support needed: ${trimmedSupportNeeded}`,
        "Approval required: Yes (Data Hub / OSMD)",
        "Workflow: New (submitted) → Reserved (Data Hub approves) → Ready (IT assigns assets) → Done",
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

          {showRoomPanel ? (
            <div className="request-form-field request-form-field-wide" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                Main Conference Room — Weekly Availability
              </span>
              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "grid", gridTemplateColumns: "44px repeat(5, 1fr)", gap: 3, minWidth: 380 }}>
                  {/* Header row */}
                  <div />
                  {weekDays.map((day, i) => (
                    <div key={i} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--muted-strong, #64748b)", paddingBottom: 4 }}>
                      {WEEK_LABELS[i]}<br />
                      <span style={{ fontSize: 10, fontWeight: 400 }}>{day.getMonth() + 1}/{day.getDate()}</span>
                    </div>
                  ))}

                  {/* Time slot rows */}
                  {TIME_SLOTS.map((hour) => (
                    <React.Fragment key={hour}>
                      <div style={{ fontSize: 10, color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 4, height: 28 }}>
                        {hourLabel(hour)}
                      </div>
                      {weekDays.map((day, di) => {
                        const busy = slotOverlaps(confBookings, day, hour);
                        const isPendingStart = pendingStart?.dayIdx === di && pendingStart.hour === hour;
                        const isConfirmed = Boolean(meetingStartTs) && slotOverlaps(
                          [{ meetingStartAt: meetingStartTs!, meetingEndAt: meetingEndTs ?? meetingStartTs! + 3600000 }],
                          day, hour,
                        );
                        return (
                          <button
                            key={`slot-${hour}-${di}`}
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (busy) return;
                              if (!pendingStart) {
                                setPendingStart({ dayIdx: di, hour });
                                setMeetingStart("");
                                setMeetingEnd("");
                                setMeetingLocation("");
                              } else if (pendingStart.dayIdx === di && pendingStart.hour === hour) {
                                setPendingStart(null);
                              } else if (pendingStart.dayIdx === di && hour > pendingStart.hour) {
                                setMeetingStart(toInputValue(day, pendingStart.hour));
                                setMeetingEnd(toInputValue(day, hour + 1));
                                setMeetingLocation(CONFERENCE_ROOM);
                                setPendingStart(null);
                              } else {
                                setPendingStart({ dayIdx: di, hour });
                                setMeetingStart("");
                                setMeetingEnd("");
                                setMeetingLocation("");
                              }
                            }}
                            title={
                              busy ? "Occupied" :
                              isPendingStart ? "Start selected — click a later slot on the same day to set end time" :
                              isConfirmed ? "Confirmed booking" :
                              pendingStart?.dayIdx === di && hour > pendingStart.hour
                                ? `Set end to ${hourLabel(hour + 1)}`
                                : `Book from ${hourLabel(hour)}`
                            }
                            style={{
                              height: 28,
                              borderRadius: 4,
                              border: isPendingStart || isConfirmed ? "2px solid #4f46e5" : "1.5px solid transparent",
                              background: isPendingStart ? "#eef2ff" : isConfirmed ? "#c7d2fe" : busy ? "#fee2e2" : "#dcfce7",
                              color: isPendingStart ? "#4338ca" : isConfirmed ? "#3730a3" : busy ? "#dc2626" : "#16a34a",
                              cursor: busy ? "not-allowed" : "pointer",
                              fontSize: 9,
                              fontWeight: 600,
                            }}
                          >
                            {busy ? "Busy" : isConfirmed ? "✓" : isPendingStart ? "●" : ""}
                          </button>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <small className="request-form-help">
                {pendingStart
                  ? "Start selected (●). Now click an end slot on the same day to confirm the range."
                  : meetingStartTs && meetingLocation === CONFERENCE_ROOM
                    ? "Time set via calendar. Click any slot to start over."
                    : "1st click = start time · 2nd click (same day, later slot) = end time."}
              </small>
            </div>
          ) : null}

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

          <div className="request-form-field request-form-field-wide">
            <span>Tag Attendees</span>
            <div ref={attendeeLookupRef} style={{ position: "relative" }}>
              <input
                className="input-base"
                value={attendeeInput}
                onChange={(event) => {
                  setAttendeeInput(event.target.value);
                  setAttendeeLookupOpen(true);
                }}
                onFocus={() => setAttendeeLookupOpen(true)}
                placeholder="Search for a person in the system…"
                autoComplete="off"
              />
              {attendeeLookupOpen && attendeeInput.trim() && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    left: 0,
                    right: 0,
                    background: "var(--dropdown-menu-bg)",
                    border: "1px solid var(--dropdown-menu-border)",
                    borderRadius: 10,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
                    zIndex: 50,
                    maxHeight: 200,
                    overflowY: "auto",
                  }}
                >
                  {attendeeSuggestions.length === 0 ? (
                    <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--muted)" }}>
                      No matching users found.
                    </div>
                  ) : (
                    attendeeSuggestions.map((user) => (
                      <button
                        key={String(user._id)}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); handleSelectAttendee(user.displayName); }}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "9px 14px",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 13,
                          color: "var(--foreground)",
                          display: "flex",
                          flexDirection: "column",
                          gap: 1,
                        }}
                        className="attendee-suggestion-row"
                      >
                        <span style={{ fontWeight: 600 }}>{user.displayName}</span>
                        {user.department ? (
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>{user.department}{user.section ? ` · ${user.section}` : ""}</span>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {taggedAttendees.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {taggedAttendees.map((name) => (
                  <span
                    key={name}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "3px 8px 3px 12px",
                      borderRadius: 999,
                      fontSize: 13,
                      fontWeight: 500,
                      background: "rgba(var(--brand-900-rgb), 0.08)",
                      color: "var(--foreground)",
                      border: "1px solid rgba(var(--brand-900-rgb), 0.15)",
                    }}
                  >
                    {name}
                    <button
                      type="button"
                      onClick={() => handleRemoveAttendee(name)}
                      aria-label={`Remove ${name}`}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", lineHeight: 1, color: "var(--muted-strong)", fontSize: 16, display: "flex", alignItems: "center" }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <small className="request-form-help">Optional. Tag people in the system who will attend this meeting.</small>
          </div>

          <label className="request-form-field request-form-field-wide">
            <span>Support Needed</span>
            <textarea
              className="input-base request-form-textarea"
              value={supportNeeded}
              onChange={(event) => setSupportNeeded(event.target.value)}
              placeholder="Room setup, projector, Teams support, recording, laptop, speaker, or other needs."
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
