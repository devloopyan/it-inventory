export type WorkflowStep = {
  id: string;
  label: string;
  description: string;
  targetPath?: string;
};

export type Workflow = {
  id: string;
  label: string;
  description: string;
  steps: WorkflowStep[];
};

export const WORKFLOWS: Workflow[] = [
  {
    id: "onboarding",
    label: "Onboarding",
    description: "Walk through setting up a new employee.",
    steps: [
      {
        id: "create-user",
        label: "Create user",
        description: "Add the new employee record.",
        targetPath: "/users",
      },
      {
        id: "assign-hardware",
        label: "Assign hardware",
        description: "Issue laptop, monitor, and peripherals.",
        targetPath: "/hardware-inventory",
      },
      {
        id: "provision-digital",
        label: "Provision digital accounts",
        description: "Email, software licenses, and system access.",
        targetPath: "/digital-inventory",
      },
      {
        id: "log-handover",
        label: "Log handover ticket",
        description: "Record the onboarding for audit.",
        targetPath: "/monitoring",
      },
    ],
  },
  {
    id: "offboarding",
    label: "Offboarding",
    description: "Walk through the IT clearance process for a departing employee.",
    steps: [
      {
        id: "issue-clearance-form",
        label: "Issue IT Clearance Form",
        description:
          "Create the IT Clearance Form for the departing employee. Ask them to organize company files for transfer and identify files to be deleted.",
        targetPath: "/operations/clearance-forms",
      },
      {
        id: "file-transfer",
        label: "File transfer / cleanup (manual)",
        description:
          "Coordinate with supervisor: transfer to external drive or leave on PC. For online files (Drive/OneDrive), transfer ownership to a designated account. Delete personal files. Verify completion and sign off.",
      },
      {
        id: "hardware-return",
        label: "Hardware return inspection",
        description:
          "Inspect all equipment listed under the resignee (system unit, monitor, keyboard, mouse, headset, accessories). Mark each as returned and note any damage.",
        targetPath: "/hardware-inventory",
      },
      {
        id: "revoke-digital",
        label: "Revoke digital accounts",
        description:
          "Disable Outlook, OneDrive, Teams/SharePoint, Google accounts, Admin Portals, and internal system access.",
        targetPath: "/digital-inventory",
      },
      {
        id: "building-access",
        label: "Remove building access (manual)",
        description:
          "Log in to WAM portal as IT Head. ENROLLMENT > DEACTIVATION. Enter employee credentials, submit. Update BIOMETRIX database, mark as Removed.",
      },
      {
        id: "system-access-audit",
        label: "System Access Audit Checklist (manual)",
        description:
          "Fill out the System Access Audit Checklist. Verify all access is revoked. Have the resignee sign as acknowledgment. If audit fails, address issues before continuing.",
      },
      {
        id: "archive-user",
        label: "Archive user",
        description: "Deactivate the employee's user account.",
        targetPath: "/users",
      },
      {
        id: "log-offboarding",
        label: "Review offboarding log",
        description:
          "Confirm the offboarding record will be saved to the audit log. Click Mark Done & Finish to complete and view the entry.",
        targetPath: "/operations?tab=log",
      },
    ],
  },
];

export function getWorkflowById(workflowId: string): Workflow | undefined {
  return WORKFLOWS.find((workflow) => workflow.id === workflowId);
}
