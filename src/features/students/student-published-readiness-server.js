import "server-only";

import { evaluateAcademicReadiness } from "./published-grade-readiness.mjs";

/**
 * Read only authenticated student evidence. Never take identities from client
 * input or treat project_simulated_academic_results as Registrar publications.
 */
export async function loadStudentPublishedReadiness(context, currentTermId, curriculumCode, termSubjectCodes) {
  const admin = context.admin;
  const studentId = context.studentId;
  const [priorEnrollments, publishedResultQuery, transferCreditQuery, prerequisiteQuery] =
    await Promise.all([
      admin.from("enrollments").select("id,term_id,confirmed_at")
        .eq("student_id", studentId).eq("status", "CONFIRMED")
        .neq("term_id", currentTermId).order("confirmed_at", { ascending: false }).limit(1),
      admin.from("academic_results")
        .select("subject_code,term_id,units,result_status,official_grade_value,published_grade_import_row_id")
        .eq("student_id", studentId).eq("source_name", "REGISTRAR_VERIFIED_IMPORT")
        .not("published_grade_import_row_id", "is", null),
      admin.from("transfer_credit_evaluations")
        .select("target_subject_code,source_course_name,credited_units,decision_status,evaluator_user_id,decided_at")
        .eq("student_id", studentId).eq("target_curriculum_code", curriculumCode)
        .eq("decision_status", "CREDITED").not("evaluator_user_id", "is", null)
        .not("decided_at", "is", null),
      admin.from("subject_prerequisites")
        .select("subject_code,prerequisite_subject_code")
        .eq("curriculum_code", curriculumCode).eq("is_active", true)
        .in("subject_code", [...termSubjectCodes]),
    ]);
  if (priorEnrollments.error || publishedResultQuery.error ||
      transferCreditQuery.error || prerequisiteQuery.error) {
    throw new Error("Academic publication records cannot currently be verified.");
  }
  const prior = priorEnrollments.data?.[0] || null;
  let requiredSubjectCodes = [];
  if (prior) {
    const requirements = await admin.from("enrollment_subjects")
      .select("subject_code").eq("enrollment_id", prior.id)
      .eq("registration_status", "CONFIRMED");
    if (requirements.error) throw new Error("The previous registered subjects could not be verified.");
    requiredSubjectCodes = (requirements.data || []).map((row) => row.subject_code);
  }
  const published = (publishedResultQuery.data || [])
    .filter((row) => row.published_grade_import_row_id);
  const credits = (transferCreditQuery.data || [])
    .filter((row) => row.evaluator_user_id && row.decided_at);
  const readiness = evaluateAcademicReadiness({
    studentType: context.studentType,
    requiredSubjectCodes,
    publishedRows: prior ? published.filter((row) => row.term_id === prior.term_id) : [],
    approvedCredits: credits,
  });
  // An accepted prerequisite must come from a published pass or a decided
  // credited evaluation, never a generated project grade.
  const completed = new Set(published
    .filter((row) => row.result_status === "COMPLETED")
    .map((row) => row.subject_code));
  const credited = new Set(credits.map((row) => row.target_subject_code));
  const failed = new Set(readiness.failed);
  const prerequisites = new Map();
  for (const row of prerequisiteQuery.data || []) {
    const list = prerequisites.get(row.subject_code) || [];
    list.push(row.prerequisite_subject_code);
    prerequisites.set(row.subject_code, list);
  }
  const subjectDecisions = new Map();
  for (const code of termSubjectCodes) {
    let eligibility = "ELIGIBLE";
    let reason = null;
    if (!readiness.ready) {
      eligibility = "PENDING_EVALUATION";
      reason = readiness.reason;
    } else if (completed.has(code) || credited.has(code)) {
      eligibility = "RESTRICTED";
      reason = "Previously completed or credited.";
    } else if ((prerequisites.get(code) || [])
      .some((required) => !completed.has(required) && !credited.has(required))) {
      eligibility = "RESTRICTED";
      reason = "A published passing result or approved credit for a prerequisite is required.";
    } else if (failed.has(code)) {
      eligibility = "RETAKE";
    }
    subjectDecisions.set(code, { eligibility, reason });
  }
  const previousResults = published.map((row) => ({
    term: row.term_id, subject_code: row.subject_code,
    units: row.units, grade: row.official_grade_value, result: row.result_status,
  }));
  const transferCredits = credits.map((row) => ({
    target_subject: row.target_subject_code, source_course: row.source_course_name,
    credited_units: row.credited_units, decision_status: row.decision_status,
  }));
  return { readiness, subjectDecisions, previousResults, transferCredits };
}
