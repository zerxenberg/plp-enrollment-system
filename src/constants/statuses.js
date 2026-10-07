export const ENROLLMENT_STATUS = Object.freeze({
  NOT_ELIGIBLE: "NOT_ELIGIBLE",
  ELIGIBLE: "ELIGIBLE",
  IN_PROGRESS: "IN_PROGRESS",
  SUBMITTED: "SUBMITTED",
  FOR_VALIDATION: "FOR_VALIDATION",
  NEEDS_ACADEMIC_REVIEW: "NEEDS_ACADEMIC_REVIEW",
  REQUIRES_CORRECTION: "REQUIRES_CORRECTION",
  VALIDATED: "VALIDATED",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED",
});

export const STATUS_LABELS = Object.freeze({
  NOT_ELIGIBLE: "Not Eligible",
  ELIGIBLE: "Eligible",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  FOR_VALIDATION: "For Validation",
  NEEDS_ACADEMIC_REVIEW: "Needs Academic Review",
  REQUIRES_CORRECTION: "Requires Correction",
  VALIDATED: "Validated",
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  GRADUATED: "Graduated",
  REGULAR: "Regular",
  IRREGULAR: "Irregular",
  ELIGIBLE_NORMAL: "Eligible for Normal Progression",
  ELIGIBLE_WITH_DEFICIENCIES: "Eligible with Deficiencies",
  LIMITED_PROGRESSION: "Limited Progression",
  TEMPORARILY_RESTRICTED: "Temporarily Restricted",
  PASSED: "Passed",
  FAILED: "Failed",
  RESTRICTED: "Restricted",
  REQUIRES_REVIEW: "Requires Review",
  COMPLETED: "Completed",
  CREDITED: "Credited",
  INCOMPLETE: "Incomplete",
});

export function getStatusLabel(value) {
  return STATUS_LABELS[value] || value?.replaceAll("_", " ") || "Unknown";
}
