import HubSectionPage from "./hub-section-page";

export default function Home() {
  return (
    <HubSectionPage
      title="IT Operations Hub"
      description="Internal workspace for the IT team covering asset control, monitoring, process management, reporting, and administration."
      metrics={[
        { label: "Mode", value: "Internal", helper: "This rollout is currently for the IT team only.", tone: "#4f6cf7" },
        { label: "Sections", value: "6", helper: "Dashboard, Monitoring, Assets, Operations, Reports, and Admin.", tone: "#6480ff" },
        { label: "Active Views", value: "3", helper: "Assets, Monitoring, and Operations are now working sections.", tone: "#16a34a" },
      ]}
      cards={[
        {
          title: "Operational Center",
          description: "Use this hub as the internal entry point for technical operations rather than limiting the product to inventory alone.",
        },
        {
          title: "Phased Rollout",
          description: "The hub structure is ready now, with Monitoring handling uptime, incidents, and meeting requests while operations, reporting, and admin continue to expand.",
        },
        {
          title: "Existing Foundation",
          description: "Your current hardware inventory and asset reservation workflows stay intact and now sit under the Assets workspace.",
        },
      ]}
      quickLinks={[
        { href: "/dashboard", label: "Dashboard", description: "Open the live IT asset operations dashboard." },
        { href: "/assets", label: "Assets", description: "Go to the workspace that contains the current inventory module." },
        { href: "/monitoring", label: "Monitoring", description: "Open system uptime, incident tracking, and operational visibility." },
      ]}
      note="This home page now acts as the overview of the new IT Operations Hub while the detailed modules are built incrementally."
    />
  );
}
