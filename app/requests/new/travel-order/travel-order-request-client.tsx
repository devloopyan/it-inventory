"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/app/current-user-context";
import FileUploadCard from "@/app/hardware-inventory/file-upload-card";
import { TRAVEL_ORDER_STOP_TYPES } from "@/lib/monitoring";

const TRAVEL_ORDER_CATEGORY = "Travel Order";
const REQUEST_SOURCE = "Requests Portal";

type PassengerEntry = {
  name: string;
  position: string;
};

type TravelStop = {
  order: number;
  type: "PICKUP" | "DROPOFF";
  location: string;
  scheduledTime: string;
  passengerNames: string;
};

function toTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatPassengersForTicket(passengerEntries: PassengerEntry[]) {
  return passengerEntries
    .map((passenger) => `${passenger.name} | ${passenger.position}`)
    .join("; ");
}

function formatStopsForTicket(stops: TravelStop[]) {
  return stops
    .map(
      (stop) =>
        `[${stop.type}] ${stop.location}${stop.scheduledTime ? ` @ ${new Date(stop.scheduledTime).toLocaleString()}` : ""}${stop.passengerNames ? ` — ${stop.passengerNames}` : ""}`,
    )
    .join("; ");
}

const defaultStop = (order: number): TravelStop => ({
  order,
  type: "PICKUP",
  location: "",
  scheduledTime: "",
  passengerNames: "",
});

export default function TravelOrderRequestClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const createTicket = useMutation(api.monitoring.createTicket);
  const generateUploadUrl = useMutation(api.monitoring.generateUploadUrl);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const [requesterName, setRequesterName] = useState(currentUser?.displayName ?? "");
  const department = currentUser?.department ?? "";
  const [useMultiStop, setUseMultiStop] = useState(false);

  // Single-stop (legacy) fields
  const [destination, setDestination] = useState("");
  const [departureAt, setDepartureAt] = useState("");
  const [returnAt, setReturnAt] = useState("");

  // Multi-stop fields
  const [travelStops, setTravelStops] = useState<TravelStop[]>([
    defaultStop(1),
    { ...defaultStop(2), type: "DROPOFF" },
  ]);

  // Passengers (only shown for PASSENGER_ONLY / BOTH modes)
  const [passengers, setPassengers] = useState<PassengerEntry[]>([
    { name: currentUser?.displayName ?? "", position: "" },
  ]);

  const [travelPurpose, setTravelPurpose] = useState("");
  const [projectName, setProjectName] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [notes, setNotes] = useState("");
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
    setPassengers((currentPassengers) => {
      if (currentPassengers.length !== 1) return currentPassengers;
      const [firstPassenger] = currentPassengers;
      const nextName = firstPassenger.name.trim() ? firstPassenger.name : currentUser?.displayName ?? "";
      if (nextName === firstPassenger.name) return currentPassengers;
      return [{ ...firstPassenger, name: nextName }];
    });
  }, [currentUser?.displayName]);

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/requests/new");
  }

  function updatePassenger(index: number, field: keyof PassengerEntry, value: string) {
    setPassengers((currentPassengers) =>
      currentPassengers.map((passenger, passengerIndex) =>
        passengerIndex === index ? { ...passenger, [field]: value } : passenger,
      ),
    );
  }

  function addPassenger() {
    setPassengers((currentPassengers) => [...currentPassengers, { name: "", position: "" }]);
  }

  function removePassenger(index: number) {
    setPassengers((currentPassengers) =>
      currentPassengers.length > 1
        ? currentPassengers.filter((_, passengerIndex) => passengerIndex !== index)
        : currentPassengers,
    );
  }

  function updateStop(index: number, field: keyof TravelStop, value: string) {
    setTravelStops((stops) =>
      stops.map((stop, i) => (i === index ? { ...stop, [field]: value } : stop)),
    );
  }

  function addStop() {
    setTravelStops((stops) => [...stops, defaultStop(stops.length + 1)]);
  }

  function removeStop(index: number) {
    setTravelStops((stops) =>
      stops.length > 2
        ? stops
            .filter((_, i) => i !== index)
            .map((stop, i) => ({ ...stop, order: i + 1 }))
        : stops,
    );
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
      const trimmedTravelPurpose = travelPurpose.trim();
      const trimmedProjectName = projectName.trim();
      const trimmedExpectedOutput = expectedOutput.trim();
      const trimmedNotes = notes.trim();
      const actorName = currentUser?.displayName ?? trimmedRequesterName;

      if (!trimmedRequesterName) throw new Error("Requester name is required.");
      if (!trimmedDepartment) throw new Error("Team is required.");
      if (!trimmedTravelPurpose) throw new Error("Purpose of travel is required.");
      if (!trimmedProjectName) throw new Error("Project name is required.");
      if (!trimmedExpectedOutput) throw new Error("Expected output is required.");

      // Validate passengers
      {
        const trimmedPassengers = passengers.map((passenger) => ({
          name: passenger.name.trim(),
          position: passenger.position.trim(),
        }));
        if (!trimmedPassengers.some((p) => p.name || p.position)) {
          throw new Error("At least one passenger is required.");
        }
        const incompletePassenger = trimmedPassengers.find((p) => !p.name || !p.position);
        if (incompletePassenger) {
          throw new Error("Each passenger needs a name and position.");
        }
      }

      let destinationText = "";
      let departureText = "";
      let returnText = "";
      let travelDepartAt: number | undefined;
      let singleStopReturnAt: number | undefined;
      if (useMultiStop) {
        // Validate multi-stop
        const filledStops = travelStops.filter((s) => s.location.trim());
        if (filledStops.length < 2) {
          throw new Error("At least 2 stops (one pickup and one drop-off) are required.");
        }
        const hasPickup = travelStops.some((s) => s.type === "PICKUP" && s.location.trim());
        const hasDropoff = travelStops.some((s) => s.type === "DROPOFF" && s.location.trim());
        if (!hasPickup) throw new Error("At least one PICKUP stop is required.");
        if (!hasDropoff) throw new Error("At least one DROP-OFF stop is required.");

        const firstPickup = travelStops.find((s) => s.type === "PICKUP" && s.location.trim());
        const lastDropoff = [...travelStops].reverse().find((s) => s.type === "DROPOFF" && s.location.trim());
        destinationText = lastDropoff?.location ?? firstPickup?.location ?? "";
        departureText = firstPickup?.scheduledTime
          ? new Date(firstPickup.scheduledTime).toLocaleString()
          : "See stops";
        returnText = lastDropoff?.scheduledTime
          ? new Date(lastDropoff.scheduledTime).toLocaleString()
          : "See stops";
        travelDepartAt = firstPickup?.scheduledTime ? toTimestamp(firstPickup.scheduledTime) ?? undefined : undefined;
        singleStopReturnAt = lastDropoff?.scheduledTime ? toTimestamp(lastDropoff.scheduledTime) ?? undefined : undefined;
      } else {
        // Single-stop validation
        const trimmedDestination = destination.trim();
        if (!trimmedDestination) throw new Error("Destination is required.");
        if (!departureAt) throw new Error("Departure date and time is required.");
        if (!returnAt) throw new Error("Return date and time is required.");

        const departureTimestamp = toTimestamp(departureAt);
        const returnTimestamp = toTimestamp(returnAt);
        if (!departureTimestamp) throw new Error("Departure date and time is invalid.");
        if (!returnTimestamp) throw new Error("Return date and time is invalid.");
        if (returnTimestamp < departureTimestamp) {
          throw new Error("Return date and time must be after departure.");
        }

        destinationText = trimmedDestination;
        departureText = new Date(departureTimestamp).toLocaleString();
        returnText = new Date(returnTimestamp).toLocaleString();
        travelDepartAt = departureTimestamp;
        singleStopReturnAt = returnTimestamp;
      }

      setSubmitting(true);

      const trimmedPassengers = passengers.map((p) => ({ name: p.name.trim(), position: p.position.trim() }));
      const passengersText = formatPassengersForTicket(trimmedPassengers);
      const stopsText = useMultiStop
        ? formatStopsForTicket(travelStops.filter((s) => s.location.trim()))
        : "";

      const attachmentStorageId = await uploadAttachment();

      const requestDetails = [
        `Destination: ${destinationText}`,
        `Passengers: ${passengersText}`,
        useMultiStop ? `Stops: ${stopsText}` : null,
        `Purpose of travel: ${trimmedTravelPurpose}`,
        `Project name: ${trimmedProjectName}`,
        `Expected output: ${trimmedExpectedOutput}`,
        `Departure: ${departureText}`,
        `Return: ${returnText}`,
        trimmedNotes ? `Additional / transportation notes: ${trimmedNotes}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const requestSnapshot = [
        "Request type: Travel Order",
        `Requester: ${trimmedRequesterName}`,
        `Team: ${trimmedDepartment}`,
        `Destination: ${destinationText}`,
        `Passengers: ${passengersText}`,
        `Project name: ${trimmedProjectName}`,
        `Expected output: ${trimmedExpectedOutput}`,
        `Departure: ${departureText}`,
        `Return: ${returnText}`,
      ]
        .filter(Boolean)
        .join("\n");

      await createTicket({
        workType: "Service Request",
        workflowType: "serviceRequest",
        category: TRAVEL_ORDER_CATEGORY,
        title: `${TRAVEL_ORDER_CATEGORY} - ${destinationText}`,
        requestDetails,
        requestSnapshot,
        requestSource: REQUEST_SOURCE,
        requesterName: trimmedRequesterName,
        requesterDepartment: trimmedDepartment,
        requesterUsername: currentUser?.username || undefined,
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
        travelDepartAt,
        travelReturnAt: singleStopReturnAt,
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
          {/* ── Requester info ── */}
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
                Team is missing from your account. Please contact HR/Admin.
              </small>
            ) : null}
          </label>

          {/* ── Multi-stop toggle ── */}
          <div className="request-form-field request-form-field-wide">
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={useMultiStop}
                onChange={(e) => setUseMultiStop(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                Use multiple pickup / drop-off stops
              </span>
            </label>
            <small className="request-form-help">
              Enable this for trips with more than one pickup or drop-off location.
            </small>
          </div>

          {/* ── Single-stop fields ── */}
          {!useMultiStop && (
            <>
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
            </>
          )}

          {/* ── Multi-stop builder ── */}
          {useMultiStop && (
            <div className="request-form-field request-form-field-wide">
              <span style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, display: "block" }}>
                Stops
              </span>
              <div style={{ display: "grid", gap: 12 }}>
                {travelStops.map((stop, index) => (
                  <div
                    key={index}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      padding: "12px 14px",
                      display: "grid",
                      gap: 10,
                      background: "var(--surface-secondary, #f9fafb)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                        Stop {stop.order}
                      </span>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: "2px 10px" }}
                        disabled={travelStops.length <= 2}
                        onClick={() => removeStop(index)}
                      >
                        Remove
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>Type</span>
                        <select
                          className="input-base"
                          value={stop.type}
                          onChange={(e) => updateStop(index, "type", e.target.value)}
                        >
                          {TRAVEL_ORDER_STOP_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t === "PICKUP" ? "Pickup" : "Drop-off"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>Scheduled Time</span>
                        <input
                          className="input-base"
                          type="datetime-local"
                          value={stop.scheduledTime}
                          onChange={(e) => updateStop(index, "scheduledTime", e.target.value)}
                        />
                      </label>
                    </div>
                    <label style={{ display: "grid", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>Location / Address</span>
                      <input
                        className="input-base"
                        value={stop.location}
                        onChange={(e) => updateStop(index, "location", e.target.value)}
                        placeholder="Enter address, place name, or landmark"
                      />
                    </label>
                    {(
                      <label style={{ display: "grid", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>
                          Passenger names at this stop (comma-separated, optional)
                        </span>
                        <input
                          className="input-base"
                          value={stop.passengerNames}
                          onChange={(e) => updateStop(index, "passengerNames", e.target.value)}
                          placeholder="e.g. Juan Dela Cruz, Maria Santos"
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: 10 }}
                onClick={addStop}
              >
                Add Stop
              </button>
            </div>
          )}

          {/* ── Passengers ── */}
          {(
            <label className="request-form-field request-form-field-wide">
              <span>Passengers</span>
              <div className="request-passenger-list">
                {passengers.map((passenger, index) => (
                  <div key={index} className="request-passenger-row">
                    <input
                      className="input-base"
                      value={passenger.name}
                      onChange={(event) => updatePassenger(index, "name", event.target.value)}
                      placeholder="Passenger name"
                      aria-label={`Passenger ${index + 1} name`}
                    />
                    <input
                      className="input-base"
                      value={passenger.position}
                      onChange={(event) => updatePassenger(index, "position", event.target.value)}
                      placeholder="Position"
                      aria-label={`Passenger ${index + 1} position`}
                    />
                    <button
                      type="button"
                      className="btn-secondary request-passenger-remove"
                      disabled={passengers.length === 1}
                      onClick={() => removePassenger(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn-secondary request-passenger-add" onClick={addPassenger}>
                Add Passenger
              </button>
              <small className="request-form-help">
                Add each passenger with their position. Driver and vehicle will be assigned by Fleet Manager later.
              </small>
            </label>
          )}

          {/* ── Details ── */}
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
            <span>Project Name</span>
            <input
              className="input-base"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="Enter the related project, client, site, or operation name."
            />
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Expected Output</span>
            <textarea
              className="input-base request-form-textarea"
              value={expectedOutput}
              onChange={(event) => setExpectedOutput(event.target.value)}
              placeholder="Describe the report, deliverable, completed work, or result expected from this travel."
            />
          </label>

          <label className="request-form-field request-form-field-wide">
            <span>Additional Notes / Transportation Notes</span>
            <textarea
              className="input-base request-form-textarea"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Add pickup point, preferred route, schedule constraints, reimbursement notes, contact person, reference number, or special instructions."
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
