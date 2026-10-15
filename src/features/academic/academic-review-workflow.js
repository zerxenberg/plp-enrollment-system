// Canonical academic review state is separate from the enrollment transaction state.
export const ACADEMIC_REVIEW_STATUS = Object.freeze({
  PENDING: "PENDING",
  RETURNED_FOR_CLARIFICATION: "RETURNED_FOR_CLARIFICATION",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  APPLIED: "APPLIED",
});

export function isPendingAcademicReview(enrollment) {
  return enrollment?.status === "NEEDS_ACADEMIC_REVIEW" &&
    !["APPROVED", "REJECTED", "APPLIED"].includes(enrollment.academicReviewDecision);
}

export function canDecideAcademicReview(enrollment) {
  return isPendingAcademicReview(enrollment) &&
    (!enrollment.academicReviewDecision || enrollment.academicReviewDecision === "PENDING");
}

export function academicReviewOutcome(enrollment, decision, reason) {
  if (!canDecideAcademicReview(enrollment)) {
    return { ok: false, message: "This case is not actionable. A completed decision or outstanding clarification cannot be decided again." };
  }
  if (!["APPROVED", "REJECTED", "RETURNED_FOR_CLARIFICATION"].includes(decision)) {
    return { ok: false, message: "Select a valid academic decision." };
  }
  if (!String(reason || "").trim()) {
    return { ok: false, message: "An academic reason or decision note is required." };
  }
  return {
    ok: true,
    nextStatus: decision === "APPROVED" ? "FOR_VALIDATION" :
      decision === "REJECTED" ? "REQUIRES_CORRECTION" : "NEEDS_ACADEMIC_REVIEW",
  };
}

// The demo validator must consume a scoped approval on the next Registrar
// validation. It cannot return the same approved exception to the review queue.
export function demoValidationOutcome(enrollment) {
  if (enrollment.validationPreset === "pass") return "VALIDATED";
  if (enrollment.validationPreset === "review") {
    return ["APPROVED", "APPLIED"].includes(enrollment.academicReviewDecision)
      ? "VALIDATED" : "NEEDS_ACADEMIC_REVIEW";
  }
  return "REQUIRES_CORRECTION";
}
