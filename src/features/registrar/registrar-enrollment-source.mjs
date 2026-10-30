// View-only adapter. The Admissions demonstration ledger is independent of
// the original fictional project cohort and official enrollment records.
export const PROJECT_COHORT_SOURCE = "PROJECT_COHORT";
export const ADMISSIONS_DEMO_SOURCE = "ADMISSIONS_DEMO";

export function isAdmissionsDemoCase(row) {
  return row?.enrollment_source === ADMISSIONS_DEMO_SOURCE;
}

export function combineRegistrarProjectCases(project = [], admissions = []) {
  const originals = project.map((row) => ({
    ...row,
    enrollment_source: PROJECT_COHORT_SOURCE,
  }));
  const transferred = admissions
    .filter((row) => row?.id && row.student_id && row.block_id &&
      row.source_kind === "ADMISSIONS_PHASE8_DEMONSTRATION" &&
      row.simulation_only === true && row.is_official === false)
    .map((row) => ({
      ...row,
      id: `admissions:${row.id}`,
      admissions_ledger_id: row.id,
      enrollment_source: ADMISSIONS_DEMO_SOURCE,
      student_number: row.studentNumber,
      full_name: row.studentName,
      program_code: row.programCode,
      home_block_id: row.block_id,
      home_block: row.blockCode,
      current_term_id: row.term_id,
      project_simulation_id: null,
      confirmedAtLabel: row.confirmed_at ? new Intl.DateTimeFormat("en-PH", {
        year: "numeric", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila",
      }).format(new Date(row.confirmed_at)) : "Not available",
    }));
  return [...originals, ...transferred];
}

export function registrarEnrollmentSourceLabel(row) {
  return isAdmissionsDemoCase(row) ? "Admissions Demonstration" : "Original Project Cohort";
}
