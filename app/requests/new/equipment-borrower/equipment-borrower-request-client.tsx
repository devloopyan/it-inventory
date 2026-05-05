"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentUser } from "@/app/current-user-context";
import {
  MONITORING_BORROWING_REQUEST_CATEGORY,
  MONITORING_BORROW_CONDITION_OPTIONS,
  MONITORING_REQUEST_SOURCE,
} from "@/lib/monitoring";

function toTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export default function EquipmentBorrowerRequestClient() {
  const router = useRouter();
  const currentUser = useCurrentUser();
  const searchParams = useSearchParams();
  const assets = useQuery(api.hardwareInventory.listAll, {});
  const createTicket = useMutation(api.monitoring.createTicket);
  const [requesterName, setRequesterName] = useState(currentUser?.displayName ?? "");
  const [department, setDepartment] = useState("");
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const [purpose, setPurpose] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selectedAssetIds = useMemo(
    () =>
      (searchParams?.get("assets") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    [searchParams],
  );
  const selectedAssets = useMemo(
    () =>
      selectedAssetIds
        .map((assetId) => assets?.find((asset) => String(asset._id) === assetId))
        .filter((asset): asset is NonNullable<typeof assets>[number] => Boolean(asset)),
    [assets, selectedAssetIds],
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
      if (!expectedReturnAt) {
        throw new Error("Expected return is required.");
      }
      if (!trimmedPurpose) {
        throw new Error("Purpose is required.");
      }
      if (!selectedAssets.length) {
        throw new Error("Add at least one equipment item.");
      }

      const expectedReturnTimestamp = toTimestamp(expectedReturnAt);
      if (!expectedReturnTimestamp) {
        throw new Error("Expected return date is invalid.");
      }

      setSubmitting(true);

      const assetLines = selectedAssets.map(
        (asset) =>
          `- ${asset.assetTag} | ${asset.assetNameDescription ?? asset.assetType ?? "Asset"} | Release condition: ${MONITORING_BORROW_CONDITION_OPTIONS[0]}`,
      );
      const requestDetails = [
        trimmedPurpose,
        `Expected return: ${new Date(expectedReturnTimestamp).toLocaleString()}.`,
        "Requested equipment:",
        ...assetLines,
      ].join("\n");
      const requestSnapshot = [
        `Requester: ${trimmedRequesterName}`,
        `Department: ${trimmedDepartment}`,
        `Expected return: ${new Date(expectedReturnTimestamp).toLocaleString()}`,
        "Selected equipment:",
        ...assetLines,
      ].join("\n");

      await createTicket({
        workType: "Service Request",
        workflowType: "serviceRequest",
        category: MONITORING_BORROWING_REQUEST_CATEGORY,
        requestDetails,
        requestSnapshot,
        requestSource: MONITORING_REQUEST_SOURCE,
        requesterName: trimmedRequesterName,
        requesterDepartment: trimmedDepartment,
        expectedReturnAt: expectedReturnTimestamp,
        borrowingItems: selectedAssets.map((asset) => ({
          assetId: asset._id as Id<"hardwareInventory">,
          releaseCondition: MONITORING_BORROW_CONDITION_OPTIONS[0],
        })),
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
        </div>

        <section className="request-selected-assets">
          <div className="request-selected-assets-head">
            <h2>Selected Equipment</h2>
            <span className="request-type-status">{selectedAssets.length}</span>
          </div>

          {assets === undefined ? (
            <div className="request-empty-state">
              <div className="request-empty-title">Loading selected equipment...</div>
            </div>
          ) : selectedAssets.length ? (
            <div className="request-selected-asset-list">
              {selectedAssets.map((asset) => (
                <div key={String(asset._id)} className="request-selected-asset-row">
                  <strong>{asset.assetNameDescription || asset.assetTag}</strong>
                  <span>{[asset.assetTag, asset.assetType, asset.specifications].filter(Boolean).join(" - ")}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="request-empty-state">
              <div className="request-empty-title">No equipment selected yet.</div>
              <div className="request-empty-copy">Go back to Dashboard to add equipment, or continue filling the request details.</div>
            </div>
          )}
        </section>

        {formError ? <div className="request-form-error">{formError}</div> : null}

        <div className="request-form-actions">
          <button type="button" className="btn-primary" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
          <span>This will create a borrowing ticket for IT staff.</span>
        </div>
      </section>
    </div>
  );
}
