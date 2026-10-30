/**
 * Institutional readiness consumes confirmed prior enrollment attempts and
 * Registrar-published outcomes. Project readiness separately requires grades
 * with explicit acceptance evidence; generated grades never enter publishedRows.
 */
export function validateProjectTransferDecisions(rows, {
  studentId, curriculumCode, cohortId, allowedSubjectCodes,
}) {
  if (!Array.isArray(rows) || !studentId || !curriculumCode || !cohortId ||
      !(allowedSubjectCodes instanceof Set) || !allowedSubjectCodes.size) {
    throw new Error("The project transfer source is incomplete.");
  }
  const subjects = new Set();
  return rows.map((row) => {
    const source = row?.source_metadata;
    const units = Number(row?.credited_units);
    if (!row || row.student_id !== studentId ||
        row.curriculum_code !== curriculumCode ||
        !row.target_subject_code || !allowedSubjectCodes.has(row.target_subject_code) ||
        subjects.has(row.target_subject_code) ||
        !["PROJECT_CREDITED", "PROJECT_PENDING"].includes(row.decision_status) ||
        !row.source_course_name?.trim() || !row.source_institution?.trim() ||
        !row.source_key || !Number.isFinite(units) || units <= 0 ||
        source?.origin !== "GENERATED_PROJECT" ||
        source?.cohort_key !== cohortId ||
        source?.source_key !== row.source_key ||
        source?.project_only_simulated_decision !== row.decision_status ||
        source?.institutional_verified !== false ||
        source?.verified_institutionally !== false ||
        source?.official_academic_record !== false ||
        source?.institutional_credit_not_confirmed !== true ||
        source?.reviewed_by_registrar !== false) {
      throw new Error("The project transfer source failed provenance validation.");
    }
    subjects.add(row.target_subject_code);
    return {
      target_subject: row.target_subject_code,
      source_course: row.source_course_name,
      source_institution: row.source_institution,
      potential_units: units,
      credited_units: row.decision_status === "PROJECT_CREDITED" ? units : null,
      decision_status: row.decision_status,
      source: "GENERATED_PROJECT",
    };
  });
}

export function summarizeProjectTransferDecisions(rows = []) {
  const credited = rows.filter((row) => row.decision_status === "PROJECT_CREDITED").length;
  const pending = rows.filter((row) => row.decision_status === "PROJECT_PENDING").length;
  return { total: rows.length, projectCredited: credited, projectPending: pending };
}

export function evaluateAcademicReadiness({
  studentType,
  requiredSubjectCodes = [],
  publishedRows = [],
  approvedCredits = [],
  projectTransferDecisions = null,
  maximumFailedRequirements = 3,
  projectRequiredSubjectCodes = null,
  acceptedProjectRows = [],
} = {}) {
  if (studentType === "NEW_STUDENT") {
    return { ready: true, classification: "REGULAR", missing: [], failed: [], reason: null };
  }
  if (studentType === "TRANSFEREE") {
    if (projectTransferDecisions !== null) {
      const summary = summarizeProjectTransferDecisions(projectTransferDecisions);
      if (!summary.projectCredited && !approvedCredits.length) {
        return { ready: false, classification: "PENDING_EVALUATION", missing: [],
          failed: [], reason: "A recorded transfer credit decision is required for project enrollment.",
          projectTransferSummary: summary };
      }
      // Pending fictional equivalencies remain subject-level deficiencies.
      // They do not invalidate separate credited project equivalencies.
      return { ready: true, classification: summary.projectPending ? "IRREGULAR" : "REGULAR",
        missing: [], failed: [], reason: null, projectTransferSummary: summary };
    }
    if (!approvedCredits.length) {
      return { ready: false, classification: "PENDING_EVALUATION", missing: [],
        failed: [], reason: "A completed transfer credit evaluation is required." };
    }
    return { ready: true, classification: "PENDING_EVALUATION", missing: [], failed: [],
      reason: null };
  }
  // A PROJECT_ONLY accepted grade is a distinct academic source. The
  // generated prior attempts determine what needs publication; only matching
  // ledger-accepted rows may satisfy those requirements. Never merge the two
  // sources when evaluating the same previous semester.
  if (studentType === "CONTINUING_STUDENT" && projectRequiredSubjectCodes !== null) {
    if (!projectRequiredSubjectCodes.length) {
      return { ready: false, classification: "PENDING_EVALUATION", missing: [], failed: [],
        reason: "Previous project semester subject attempts could not be established." };
    }
    const required = [...new Set(projectRequiredSubjectCodes)];
    const accepted = new Map();
    for (const row of acceptedProjectRows) {
      if (!required.includes(row.subject_code)) continue;
      if (!['COMPLETED', 'FAILED', 'INCOMPLETE'].includes(row.result_status) ||
          accepted.has(row.subject_code)) {
        return { ready: false, classification: "PENDING_EVALUATION", missing: required,
          failed: [], reason: "Accepted project grade records require Registrar review." };
      }
      accepted.set(row.subject_code, row.result_status);
    }
    // An explicitly accepted INCOMPLETE is a recorded deficiency, not a
    // missing Registrar publication. Its dependent subjects remain restricted
    // because only COMPLETED results satisfy prerequisites.
    const missing = required.filter((code) => !accepted.has(code));
    if (missing.length) {
      return { ready: false, classification: "PENDING_EVALUATION", missing, failed: [],
        reason: `Accepted project final grades are still required for ${missing.length} previous semester subject(s).` };
    }
    const failed = required.filter((code) => accepted.get(code) === "FAILED");
    const incomplete = required.filter((code) => accepted.get(code) === "INCOMPLETE");
    if (failed.length > maximumFailedRequirements) {
      return { ready: false, classification: "IRREGULAR", missing: [], failed, incomplete,
        reason: `The configured project enrollment policy permits at most ${maximumFailedRequirements} unresolved failed subject requirements.` };
    }
    return { ready: true, classification: failed.length || incomplete.length ? "IRREGULAR" : "REGULAR",
      missing: [], failed, incomplete, reason: null };
  }
  if (studentType !== "CONTINUING_STUDENT" || !requiredSubjectCodes.length) {
    return { ready: false, classification: "PENDING_EVALUATION", missing: [],
      failed: [], reason: "Confirmed previous semester subject attempts are required before academic evaluation." };
  }
  const required = [...new Set(requiredSubjectCodes)];
  const published = new Map();
  for (const row of publishedRows) {
    if (!required.includes(row.subject_code)) continue;
    if (!["COMPLETED", "FAILED", "INCOMPLETE"].includes(row.result_status)) continue;
    published.set(row.subject_code, row.result_status);
  }
  const missing = required.filter((code) => !published.has(code));
  if (missing.length) {
    return { ready: false, classification: "PENDING_EVALUATION", missing,
      failed: [], reason: `Published final grades are still required for ${missing.length} previous semester subject(s).` };
  }
  const failed = required.filter((code) => published.get(code) === "FAILED");
  const incomplete = required.filter((code) => published.get(code) === "INCOMPLETE");
  if (failed.length > maximumFailedRequirements) {
    return { ready: false, classification: "IRREGULAR", missing: [], failed, incomplete,
      reason: `The project enrollment policy permits at most ${maximumFailedRequirements} unresolved failed subject requirements.` };
  }
  return { ready: true, classification: failed.length || incomplete.length ? "IRREGULAR" : "REGULAR",
    missing: [], failed, incomplete, reason: null };
}
