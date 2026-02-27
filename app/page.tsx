import Link from "next/link";

export default function Home() {
  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>
        IT Inventory System
      </h1>
      <Link
        href="/dashboard"
        style={{
          display: "inline-block",
          padding: "10px 14px",
          border: "1px solid #1d4ed8",
          borderRadius: 8,
          background: "#2563eb",
          color: "#fff",
          textDecoration: "none",
        }}
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
