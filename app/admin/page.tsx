import HubSectionPage from "../hub-section-page";

export default function AdminPage() {
  return (
    <HubSectionPage
      title="Admin"
      description="Administration will later contain user control, role management, and system settings for the IT Operations Hub."
      metrics={[
        { label: "Status", value: "Planned", helper: "Admin follows once the hub structure is stable.", tone: "#f59e0b" },
        { label: "Focus", value: "Control", helper: "Users, permissions, and system-level settings live here.", tone: "#4f6cf7" },
        { label: "Scope", value: "Hub", helper: "This is the control layer for all internal IT workspaces.", tone: "#6480ff" },
      ]}
      cards={[
        {
          title: "Users",
          description: "Manage who can access the hub and which workspaces each team member should see.",
        },
        {
          title: "Roles and Permissions",
          description: "Define admin, operator, and viewer access once multiple people begin using the platform.",
        },
        {
          title: "System Settings",
          description: "Store global configuration, future notification rules, and environment-wide preferences.",
        },
      ]}
      quickLinks={[
        { href: "/dashboard", label: "Dashboard", description: "Return to the primary IT Hub entry point." },
        { href: "/operations", label: "Operations", description: "Review the process work that will later need permissions." },
      ]}
      note="Administration is intentionally separate from operations so governance stays clear as the hub grows."
    />
  );
}
