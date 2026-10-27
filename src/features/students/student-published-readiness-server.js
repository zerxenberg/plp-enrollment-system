import "server-only";

import {
  evaluateAcademicReadiness,
  summarizeProjectTransferDecisions,
  validateProjectTransferDecisions,
} from "./published-grade-readiness.mjs";

const PROJECT_COHORT = "PLP_PROJECT_600_2026_1";
const PROJECT_PREVIOUS_TERM = "TERM-2025-2";
const PROJECT_CURRENT_TERM = "TERM-2026-1";

/**
 * Read the fictional project transfer decisions through the previously
 * authenticated student's own placement, curriculum and cohort. Decisions
 * do not confer official institutional transfer credit.
 */
export async function loadValidatedProjectTransferDecisions(admin, studentId, curriculumCode) {
  const [placementQuery, decisionsQuery, curriculumQuery] = await Promise.all([
    admin.from("project_student_academic_placements")
      .select("student_id,term_id,curriculum_code,project_cohort_id,source_metadata")
      .eq("student_id", studentId).eq("term_id", PROJECT_CURRENT_TERM).maybeSingle(),
    admin.from("project_simulated_transfer_credits")
      .select("student_id,curriculum_code,target_subject_code,source_course_name,source_institution,credited_units,decision_status,source_key,source_metadata")
      .eq("student_id", studentId).eq("curriculum_code", curriculumCode),
    admin.from("curriculum_subjects").select("subject_code")
      .eq("curriculum_code", curriculumCode),
  ]);
  const placement = placementQuery.data;
  const source = placement?.source_metadata;
  if (placementQuery.error || decisionsQuery.error || curriculumQuery.error ||
      !curriculumQuery.data?.length || !placement ||
      placement.student_id !== studentId ||
      placement.term_id !== PROJECT_CURRENT_TERM ||
      placement.curriculum_code !== curriculumCode ||
      placement.project_cohort_id !== PROJECT_COHORT ||
      source?.origin !== "GENERATED_PROJECT" ||
      source?.cohort_key !== PROJECT_COHORT ||
      source?.institutional_verified !== false ||
      source?.verified_institutionally !== false ||
      source?.official_academic_record !== false) {
    throw new Error("Project transfer records cannot currently be verified.");
  }
  return validateProjectTransferDecisions(decisionsQuery.data, {
    studentId, curriculumCode, cohortId: PROJECT_COHORT,
    allowedSubjectCodes: new Set(curriculumQuery.data.map((item) => item.subject_code)),
  });
}

/**
 * Read only explicitly accepted project results. The ledger alone
 * grants project acceptance; no raw simulated result may enter this list.
 * Student identity and assigned curriculum must be server verified by callers.
 */
export async function loadAcceptedProjectGradeResults(admin, studentId, curriculumCode) {
  const { data: acceptances, error: acceptanceError } = await admin
    .from("project_grade_result_acceptances")
    .select("result_id,student_id,term_id,curriculum_code,subject_code,accepted_at,source_kind,batch_id")
    .eq("student_id", studentId)
    .eq("curriculum_code", curriculumCode);
  if (acceptanceError) {
    // Allows deployment before the additive project-only ledger is installed.
    // Missing ledger means zero accepted results, never trusted seed grades.
    if (["42P01", "PGRST205"].includes(acceptanceError.code)) return [];
    throw new Error("Accepted project academic evidence cannot be verified.");
  }
  if (!acceptances?.length) return [];

  const ids = [...new Set(acceptances.map((item) => item.result_id).filter(Boolean))];
  if (ids.length !== acceptances.length) {
    throw new Error("Accepted project academic evidence contains duplicate or missing references.");
  }
  const { data: canonical, error: canonicalError } = await admin
    .from("project_simulated_academic_results")
    .select("id,student_id,term_id,curriculum_code,subject_code,grade_value,result_status,academic_units,source_metadata")
    .eq("student_id", studentId)
    .eq("curriculum_code", curriculumCode)
    .in("id", ids);
  if (canonicalError || canonical?.length !== ids.length) {
    throw new Error("Accepted project academic evidence could not be reconciled.");
  }
  const byId = new Map(canonical.map((row) => [row.id, row]));
  const seenSubjects = new Set();
  return acceptances.map((acceptance) => {
    const row = byId.get(acceptance.result_id);
    const metadata = row?.source_metadata;
    const key = `${acceptance.term_id}:${acceptance.subject_code}`;
    if (!row || acceptance.student_id !== studentId ||
        acceptance.curriculum_code !== curriculumCode ||
        acceptance.term_id !== row.term_id || acceptance.subject_code !== row.subject_code ||
        !acceptance.accepted_at || !acceptance.source_kind?.trim() ||
        seenSubjects.has(key) ||
        !["COMPLETED", "FAILED", "INCOMPLETE"].includes(row.result_status) ||
        metadata?.origin !== "GENERATED_PROJECT" ||
        metadata?.cohort_key !== PROJECT_COHORT ||
        metadata?.official_academic_record !== false ||
        metadata?.verified_institutionally !== false) {
      throw new Error("Accepted project academic provenance does not match its source.");
    }
    seenSubjects.add(key);
    return {
      subject_code: row.subject_code,
      term_id: row.term_id,
      units: row.academic_units,
      result_status: row.result_status,
      grade: row.grade_value,
      source_kind: acceptance.source_kind,
      accepted_at: acceptance.accepted_at,
      source: "ACCEPTED_PROJECT",
    };
  });
}

/**
 * Read only authenticated student evidence. Never take identities from client
 * input or treat project_simulated_academic_results as Registrar publications.
 */
export async function loadStudentPublishedReadiness(context, currentTermId, curriculumCode, termSubjectCodes) {
  const admin = context.admin;
  const studentId = context.studentId;
  const [priorEnrollments, publishedResultQuery, transferCreditQuery, prerequisiteQuery,
    previousProjectQuery, policyQuery, acceptedProjectResults, projectTransferDecisions] =
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
      admin.from("project_simulated_academic_results")
        .select("subject_code")
        .eq("student_id", studentId)
        .eq("curriculum_code", curriculumCode)
        .eq("term_id", PROJECT_PREVIOUS_TERM),
      admin.from("project_enrollment_academic_policy")
        .select("maximum_unresolved_failed_subjects")
        .eq("project_cohort_id", PROJECT_COHORT).maybeSingle(),
      loadAcceptedProjectGradeResults(admin, studentId, curriculumCode),
      context.studentType === "TRANSFEREE"
        ? loadValidatedProjectTransferDecisions(admin, studentId, curriculumCode)
        : Promise.resolve([]),
    ]);
  if (priorEnrollments.error || publishedResultQuery.error ||
      transferCreditQuery.error || prerequisiteQuery.error ||
      previousProjectQuery.error || policyQuery.error ||
      !Number.isInteger(policyQuery.data?.maximum_unresolved_failed_subjects)) {
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
  const projectCredits = projectTransferDecisions
    .filter((row) => row.decision_status === "PROJECT_CREDITED");
  const projectRequiredSubjectCodes = [...new Set((previousProjectQuery.data || [])
    .map((row) => row.subject_code).filter(Boolean))];
  // Previous project simulation identifies expected subjects only. Its grades
  // become evidence exclusively after individual ledger acceptance.
  const useProjectHistory = context.studentType === "CONTINUING_STUDENT" &&
    !prior && currentTermId === "TERM-2026-1";
  const readiness = evaluateAcademicReadiness({
    studentType: context.studentType,
    requiredSubjectCodes,
    publishedRows: prior ? published.filter((row) => row.term_id === prior.term_id) : [],
    approvedCredits: credits,
    projectTransferDecisions: context.studentType === "TRANSFEREE"
      ? projectTransferDecisions : null,
    maximumFailedRequirements: policyQuery.data.maximum_unresolved_failed_subjects,
    projectRequiredSubjectCodes: useProjectHistory ? projectRequiredSubjectCodes : null,
    acceptedProjectRows: useProjectHistory ? acceptedProjectResults
      .filter((row) => row.term_id === PROJECT_PREVIOUS_TERM) : [],
  });
  // An accepted prerequisite must come from a published pass or a decided
  // credited evaluation, never a generated project grade.
  const publishedPasses = published
    .filter((row) => row.result_status === "COMPLETED")
    .map((row) => row.subject_code);
  const projectPasses = acceptedProjectResults
    .filter((row) => row.result_status === "COMPLETED")
    .map((row) => row.subject_code);
  const completed = new Set([...publishedPasses, ...projectPasses]);
  const officialCredited = new Set(credits.map((row) => row.target_subject_code));
  const projectCredited = new Set(projectCredits.map((row) => row.target_subject));
  const credited = new Set([...officialCredited, ...projectCredited]);
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
      reason = projectCredited.has(code) && !officialCredited.has(code) && !completed.has(code)
        ? "Credited only in the fictional project transfer assessment."
        : "Previously completed or institutionally credited.";
    } else if ((prerequisites.get(code) || [])
      .some((required) => !completed.has(required) && !credited.has(required))) {
      eligibility = "RESTRICTED";
      reason = "An accepted passing result, evaluated project credit, or approved institutional credit for a prerequisite is required.";
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
  return { readiness, subjectDecisions, previousResults, transferCredits,
    acceptedProjectResults,
    projectTransferDecisions,
    projectTransferSummary: summarizeProjectTransferDecisions(projectTransferDecisions) };
}
