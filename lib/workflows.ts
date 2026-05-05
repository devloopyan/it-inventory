export type WorkflowStep = {
  id: string;
  label: string;
  description: string;
  targetPath: string;
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
    description: "Walk through removing access for a departing employee.",
    steps: [
      {
        id: "recover-hardware",
        label: "Recover hardware",
        description: "Mark assigned assets as returned.",
        targetPath: "/hardware-inventory",
      },
      {
        id: "revoke-digital",
        label: "Revoke digital accounts",
        description: "Disable email, licenses, and system access.",
        targetPath: "/digital-inventory",
      },
      {
        id: "close-tickets",
        label: "Close open tickets",
        description: "Resolve anything assigned to the employee.",
        targetPath: "/monitoring",
      },
      {
        id: "archive-user",
        label: "Archive user",
        description: "Deactivate the account.",
        targetPath: "/users",
      },
    ],
  },
];

export function getWorkflowById(workflowId: string): Workflow | undefined {
  return WORKFLOWS.find((workflow) => workflow.id === workflowId);
}
