// Verified, source-specific enrollment state for Registrar roster presentation.
// Never confuse a classroom registration with an official university enrollment.
export const NO_DEMONSTRATION = "NOT_STARTED";
export const NO_OFFICIAL_ENROLLMENT = "NOT_CONFIRMED";

export function currentDemonstrationRecords(records, { source, termId = null } = {}) {
  const byStudentTerm = new Map();
  for (const row of Array.isArray(records) ? records : []) {
    if (!row?.student_id || !row.term_id || (termId && row.term_id !== termId)) continue;
    const isAdmissions = source === "ADMISSIONS";
    const validSource = isAdmissions
      ? row.source_kind === "ADMISSIONS_PHASE8_DEMONSTRATION" &&
        row.simulation_only === true && row.is_official === false
      : row.source_provenance === "GENERATED_PROJECT" &&
        row.verified_institutionally === false;
    if (!validSource) throw new Error("Registrar demonstration source provenance mismatch.");
    const key = `${row.student_id}|${row.term_id}`;
    if (byStudentTerm.has(key)) {
      throw new Error("Duplicate demonstration registrations for the selected student and term.");
    }
    byStudentTerm.set(key, row);
  }
  return byStudentTerm;
}

export function officialEnrollmentStatus(records, studentId, termId) {
  const relevant = (records || []).filter((row) =>
    row.student_id === studentId && row.term_id === termId);
  if (relevant.some((row) => row.status === "CONFIRMED" && row.confirmed_at)) return "CONFIRMED";
  return NO_OFFICIAL_ENROLLMENT;
}

export function rosterDemonstrationStatus(record) {
  return record?.status || NO_DEMONSTRATION;
}
