import { getLiveSession } from "@/lib/auth/live-auth";
import { loadCoordinatorProjectAcademicReviewRows } from "./coordinator-project-audit-actions";

// Academic reviews are individual scoped records. A single enrollment may
// legitimately have more than one review, so never collapse them by enrollment ID.
export function toAcademicReviewCase(review, registrarEnrollments = [], studentRecords = []) {
  const enrollment = review.enrollments;
  if (!enrollment) return null;
  const snapshot = registrarEnrollments.find((item) => item.id === enrollment.id);
  const student = studentRecords.find((item) => item.id === enrollment.student_id);
  const code = review.subject_code || "";
  return {
    id: enrollment.id,
    reviewId: review.id,
    reference: enrollment.reference,
    status: enrollment.status,
    studentNumber: snapshot?.studentNumber || student?.studentNumber || "Restricted student reference",
    program: enrollment.program_code,
    term: enrollment.term_id,
    curriculum: enrollment.curriculum_code,
    yearLevel: student?.yearLevel || "",
    submittedDate: enrollment.submitted_at || review.created_at,
    subjects: snapshot?.subjects || (code ? [{ code }] : []),
    academicReviewSubjectCode: code,
    academicReviewDecision: review.review_status,
    academicReviewStatus: review.review_status,
    academicReviewDate: review.decided_at || review.applied_at,
    academicReviewReason: review.decision_reason || "",
    academicReviewCoordinator: review.coordinator_user_id ? "Academic Coordinator" : "",
    academicReviewCategory: review.exception_type || "Defined Academic Exception",
    academicIssue: review.requested_reason || review.academic_reason || "",
    failedAcademicRule: review.failed_rule_code || "",
    correctionReason: enrollment.current_correction_reason || "",
    academicReviewScope: {
      studentReference: snapshot?.studentNumber || student?.studentNumber || "Restricted student reference",
      enrollmentReference: enrollment.reference,
      subjectCode: code || null,
      rule: review.failed_rule_code || review.exception_type || "",
    },
    academicReviewSupportingReference: review.supporting_reference || "",
  };
}

export async function loadAuthorizedAcademicReviewCases(registrarEnrollments = [], studentRecords = []) {
  const current = await getLiveSession();
  if (current?.role !== "academic-coordinator") {
    throw new Error("Academic Coordinator authentication is required.");
  }
  // Read only reviews whose enrollments belong to the authenticated
  // PROJECT_ONLY cohort. Direct browser SELECT can include older institutional
  // reviews in the same term, so restrict membership at the server boundary.
  const reviews = await loadCoordinatorProjectAcademicReviewRows();
  const pendingByEnrollment = new Map();
  for (const review of reviews) {
    if (review.review_status === "PENDING") {
      pendingByEnrollment.set(review.enrollment_id,
        (pendingByEnrollment.get(review.enrollment_id) || 0) + 1);
    }
  }
  return reviews.map((review) => {
    const record = toAcademicReviewCase(review, registrarEnrollments, studentRecords);
    if (!record) return null;
    return {
      ...record,
      // Existing decision RPC accepts an enrollment reference, not a review ID.
      // Multiple pending cases cannot be selected safely through that contract.
      academicReviewActionBlocked: (pendingByEnrollment.get(review.enrollment_id) || 0) > 1,
    };
  }).filter(Boolean);
}
