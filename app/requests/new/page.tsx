import Link from "next/link";
import { REQUEST_TYPES } from "@/lib/requestTypes";

export default function NewRequestPage() {
  return (
    <div className="request-page">
      <section className="panel request-page-panel">
        <div className="request-page-head">
          <div>
            <h1 className="request-page-title">New Request</h1>
            <p className="request-page-subtitle">Choose the request you need to submit.</p>
          </div>
        </div>

        <div className="request-type-grid">
          {REQUEST_TYPES.map((requestType) =>
            requestType.enabled && requestType.href ? (
              <Link key={requestType.id} href={requestType.href} className="request-type-card">
                <span className="request-type-service">{requestType.serviceGroup}</span>
                <span className="request-type-title">{requestType.label}</span>
                <span className="request-type-copy">{requestType.description}</span>
                <span className="request-type-examples">
                  {requestType.examples.join(" / ")}
                </span>
              </Link>
            ) : (
              <button key={requestType.id} type="button" className="request-type-card is-disabled" disabled>
                <span className="request-type-card-meta">
                  <span className="request-type-service">{requestType.serviceGroup}</span>
                  <span className="request-type-status">Coming soon</span>
                </span>
                <span className="request-type-title">{requestType.label}</span>
                <span className="request-type-copy">{requestType.description}</span>
                <span className="request-type-examples">
                  {requestType.examples.join(" / ")}
                </span>
              </button>
            ),
          )}
        </div>
      </section>
    </div>
  );
}
