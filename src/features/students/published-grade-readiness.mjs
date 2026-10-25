/**
 * This policy consumes confirmed prior enrollment attempts and Registrar-published
 * outcomes only. Generated project history must never be passed as publishedRows.
 */
export function evaluateAcademicReadiness({
  studentType,
  requiredSubjectCodes = [],
  publishedRows = [],
  approvedCredits = [],
  maximumFailedRequirements = 3,
} = {}) {
  if (studentType === "NEW_STUDENT") {
    return { ready: true, classification: "REGULAR", missing: [], failed: [], reason: null };
  }
  if (studentType === "TRANSFEREE") {
    if (!approvedCredits.length) {
      return { ready: false, classification: "PENDING_EVALUATION", missing: [],
        failed: [], reason: "A completed transfer credit evaluation is required." };
    }
    return { ready: true, classification: "PENDING_EVALUATION", missing: [], failed: [],
      reason: null };
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
  const missing = required.filter((code) => !published.has(code) ||
    published.get(code) === "INCOMPLETE");
  if (missing.length) {
    return { ready: false, classification: "PENDING_EVALUATION", missing,
      failed: [], reason: `Published final grades are still required for ${missing.length} previous semester subject(s).` };
  }
  const failed = required.filter((code) => published.get(code) === "FAILED");
  if (failed.length > maximumFailedRequirements) {
    return { ready: false, classification: "IRREGULAR", missing: [], failed,
      reason: `The project enrollment policy permits at most ${maximumFailedRequirements} unresolved failed subject requirements.` };
  }
  return { ready: true, classification: failed.length ? "IRREGULAR" : "REGULAR",
    missing: [], failed, reason: null };
}
