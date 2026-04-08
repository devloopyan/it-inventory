export const HARDWARE_BORROW_CONDITION_OPTIONS = [
  "Good Condition",
  "With Existing Issue",
  "Damaged",
  "Needs Inspection",
] as const;

export type HardwareBorrowCondition = (typeof HARDWARE_BORROW_CONDITION_OPTIONS)[number];

export function isHardwareBorrowCondition(value?: string | null): value is HardwareBorrowCondition {
  return (HARDWARE_BORROW_CONDITION_OPTIONS as readonly string[]).includes(value ?? "");
}
