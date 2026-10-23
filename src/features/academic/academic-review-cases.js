import { supabase } from "@/lib/supabase/client";
import { getLiveSession } from "@/lib/auth/live-auth";

// Academic reviews are individual scoped records. A single enrollment may
// legitimately have more than one review, so never collapse them by enrollment ID.
const PAGE_SIZE = 500;
const MAX_ROWS = 10000;
const COLUMNS = [
  "id", "enrollment_id", "review_status", "exception_type", "academic_reason",
  "subject_code", "failed_rule_code", "requested_reason", "decision_reason",
  "supporting_reference", "created_at", "decided_at", "applied_at",
  "coordinator_user_id",
  "enrollments!inner(id,reference,student_id,program_code,term_id,curriculum_code,status,submitted_at,current_correction_reason)",
].join(",");

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
  const reviews = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from("academic_reviews")
      .select(COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error("Unable to load authorized academic review cases.");
    reviews.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
    if (offset + PAGE_SIZE >= MAX_ROWS) {
      throw new Error("The academic review queue exceeds the supported result limit.");
    }
  }
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
