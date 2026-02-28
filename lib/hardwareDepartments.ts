export const HARDWARE_DEPARTMENTS = [
  "Corporate Services Dept. (CSD)",
  "HR",
  "SALES AND MARKETING",
  "RESEARCH AND DEVELOPMENT (RND)",
  "OPERATIONS AND SYSTEMS MANAGEMENT DEPT. (OSMD)",
  "ENVIRONMENTAL SERVICES DEPT. (ESD)",
] as const;

export type HardwareDepartment = (typeof HARDWARE_DEPARTMENTS)[number];
