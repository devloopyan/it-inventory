import Link from "next/link";

type HubMetric = {
  label: string;
  value: string;
  helper: string;
  tone?: string;
};

type HubCard = {
  title: string;
  description: string;
};

type HubLink = {
  href: string;
  label: string;
  description: string;
};

type HubSectionPageProps = {
  eyebrow?: string;
  title: string;
  description: string;
  metrics: readonly HubMetric[];
  cards: readonly HubCard[];
  quickLinks?: readonly HubLink[];
  note?: string;
};

export default function HubSectionPage({
  eyebrow = "IT Operations Hub",
  title,
  description,
  metrics,
  cards,
  quickLinks,
  note,
}: HubSectionPageProps) {
  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div className="dashboard-heading">
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            {eyebrow}
          </div>
          <h1 className="dashboard-title">{title}</h1>
          <p className="dashboard-subtitle">{description}</p>
        </div>
      </div>

      <div className="metric-strip">
        {metrics.map((metric) => (
          <div key={metric.label} className="metric-item">
            <div className="metric-head">
              <span
                className="metric-icon"
                style={{ background: metric.tone ?? "var(--brand-900)" }}
                aria-hidden="true"
              />
              {metric.label}
            </div>
            <div className="metric-value">
              <strong>{metric.value}</strong>
            </div>
            <div className="dashboard-subtitle">{metric.helper}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        }}
      >
        {cards.map((card) => (
          <section key={card.title} className="saas-card" style={{ padding: 18, display: "grid", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{card.title}</h2>
            <p className="dashboard-subtitle">{card.description}</p>
          </section>
        ))}
      </div>

      {quickLinks?.length ? (
        <section className="saas-card" style={{ padding: 18, display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gap: 4 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Quick Links</h2>
            <p className="dashboard-subtitle">Jump to the current workspace or the next module in the rollout.</p>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="saas-card saas-card-hover"
                style={{ padding: 16, display: "grid", gap: 6 }}
              >
                <div style={{ fontSize: 14, fontWeight: 700 }}>{link.label}</div>
                <div className="dashboard-subtitle">{link.description}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {note ? (
        <section className="saas-card" style={{ padding: 18, display: "grid", gap: 6 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Implementation Note
          </div>
          <p className="dashboard-subtitle">{note}</p>
        </section>
      ) : null}
    </div>
  );
}
